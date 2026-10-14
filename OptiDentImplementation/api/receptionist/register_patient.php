<?php
/**
 * OptiDent System - Receptionist Quick Patient Registration API
 * Task R-003: Patient Quick Registration & Walk-in Fast-Track
 * 
 * Allows front-desk receptionist to quickly register walk-in or new patients into MongoDB 'users'
 * and optionally fast-track them directly into Today's Live Waiting Queue in a single transaction.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';
require_once __DIR__ . '/../config/mailer.php';

// Verify authorized receptionist session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

// 1. Core Demographics
$fullName = trim($input['full_name'] ?? '');
$phone = trim($input['phone'] ?? '');
$rawEmail = strtolower(trim($input['email'] ?? ''));
$dob = trim($input['dob'] ?? '');
$age = !empty($input['age']) ? intval($input['age']) : null;
$gender = trim($input['gender'] ?? 'Not Specified');
$address = trim($input['address'] ?? '');

// 2. Clinical & Medical Safety Alerts
$bloodType = trim($input['blood_type'] ?? 'Unknown');
$allergies = trim($input['allergies'] ?? 'None recorded');

// 3. Emergency Contact
$emergencyName = trim($input['emergency_contact_name'] ?? '');
$emergencyPhone = trim($input['emergency_contact_phone'] ?? '');

// 4. Walk-in Queue & Appointment Scheduling Options
$addToQueue = !empty($input['add_to_queue']);
$doctorName = trim($input['doctor_name'] ?? 'First Available Doctor');
$serviceName = trim($input['service_name'] ?? 'Dental Consultation');
$operatoryChair = trim($input['operatory_chair'] ?? 'Operatory Chair 1');
$chiefComplaint = trim($input['chief_complaint'] ?? $input['notes'] ?? '');
$appointmentDate = trim($input['appointment_date'] ?? $input['date'] ?? '');
$timeSlot = trim($input['time_slot'] ?? $input['appointment_time'] ?? '');
$checkinNow = isset($input['checkin_now']) ? !empty($input['checkin_now']) : null;

// Validation
if (empty($fullName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient legal full name is required."]);
    exit;
}

if (empty($phone)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Primary contact phone number is required."]);
    exit;
}

// Auto-calculate age if DOB is provided and age not explicitly given
if (!empty($dob) && empty($age)) {
    try {
        $birthDate = new DateTime($dob);
        $today = new DateTime('today');
        $age = $birthDate->diff($today)->y;
    } catch (Exception $e) {
        $age = null;
    }
}

// Check duplicate email (if provided)
if (!empty($rawEmail)) {
    $existingEmail = $db->findOne('users', ['email' => $rawEmail]);
    if ($existingEmail && empty($input['force_register'])) {
        http_response_code(409);
        echo json_encode([
            "status" => "error",
            "message" => "A user with email {$rawEmail} already exists ({$existingEmail['full_name']}).",
            "existing_patient" => [
                "id" => (string) $existingEmail['_id'],
                "full_name" => $existingEmail['full_name'],
                "email" => $existingEmail['email'],
                "phone" => $existingEmail['phone'] ?? ''
            ]
        ]);
        exit;
    }
    $finalEmail = $rawEmail;
} else {
    // Generate unique local placeholder email for walk-in patients without email
    $finalEmail = 'walkin_' . time() . '_' . rand(1000, 9999) . '@clinic.local';
}

// Check duplicate phone (warn front desk if same phone belongs to another patient)
if (!empty($phone) && empty($input['force_register'])) {
    $existingPhone = $db->findOne('users', ['phone' => $phone, 'role' => 'patient']);
    if ($existingPhone) {
        http_response_code(409);
        echo json_encode([
            "status" => "error",
            "message" => "A patient with phone number {$phone} already exists: '{$existingPhone['full_name']}'. Please confirm if this is a repeat visit.",
            "existing_patient" => [
                "id" => (string) $existingPhone['_id'],
                "full_name" => $existingPhone['full_name'],
                "email" => $existingPhone['email'],
                "phone" => $existingPhone['phone'] ?? ''
            ]
        ]);
        exit;
    }
}

$currentTimestamp = date('Y-m-d H:i:s');
$registeredBy = $_SESSION['email'] ?? 'receptionist';

// Prepare Patient Document
$patientDoc = [
    "full_name" => $fullName,
    "email" => $finalEmail,
    "phone" => $phone,
    "role" => "patient",
    "status" => "active",
    "is_master" => false,
    "is_active" => true,
    "is_deleted" => false,
    "is_archived" => false,
    "dob" => $dob,
    "age" => $age,
    "gender" => $gender,
    "address" => $address,
    "blood_type" => $bloodType,
    "allergies" => $allergies,
    "medical_alerts" => $allergies,
    "emergency_contact_name" => $emergencyName,
    "emergency_contact_phone" => $emergencyPhone,
    "is_walkin" => true,
    "reward_points" => 0,
    "created_at" => $currentTimestamp,
    "registered_by" => $registeredBy
];

$insertedPatientId = $db->insertOne('users', $patientDoc);

// Generate Portal Invitation if valid patient email was provided
$inviteToken = null;
$inviteLink = null;
$invitationSent = false;
$invitationReason = '';

if (!empty($rawEmail) && filter_var($rawEmail, FILTER_VALIDATE_EMAIL)) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8080';
    $baseUrl = "{$protocol}://{$host}";

    $inviteToken = bin2hex(random_bytes(24));
    $inviteLink = "{$baseUrl}/accept_invite.html?token=" . $inviteToken;

    $invitationDoc = [
        "email" => $finalEmail,
        "role" => "patient",
        "full_name" => $fullName,
        "phone" => $phone,
        "patient_id" => (string) $insertedPatientId,
        "token" => $inviteToken,
        "status" => "pending",
        "created_at" => $currentTimestamp,
        "expires_at" => date('Y-m-d H:i:s', strtotime('+7 days')),
        "invited_by" => $registeredBy,
        "invite_link" => $inviteLink
    ];
    $db->insertOne('invitations', $invitationDoc);

    // Send real invitation email via PHPMailer
    $emailResult = sendPatientInvitationEmail($finalEmail, $fullName, $inviteLink);
    $invitationSent = !empty($emailResult['sent']);
    $invitationReason = $emailResult['reason'] ?? '';

    // Record invitation link & delivery state in patient user profile
    $db->updateOne('users', ['_id' => $insertedPatientId], [
        '$set' => [
            'invite_token' => $inviteToken,
            'invite_link' => $inviteLink,
            'invitation_sent_at' => $currentTimestamp,
            'invitation_delivery' => $invitationSent ? 'delivered' : 'pending_smtp'
        ]
    ]);

    AuditLogger::log(
        'PATIENT_INVITATION_SENT',
        "invitations:{$finalEmail}",
        [
            'patient_name' => $fullName,
            'email' => $finalEmail,
            'sent' => $invitationSent,
            'invited_by' => $registeredBy
        ]
    );
}

// Audit Log: Patient Registered
AuditLogger::log(
    'PATIENT_REGISTERED',
    "users:{$finalEmail}",
    [
        'patient_id' => (string) $insertedPatientId,
        'patient_name' => $fullName,
        'phone' => $phone,
        'is_walkin' => true,
        'portal_invited' => !empty($inviteToken),
        'registered_by' => $registeredBy
    ]
);

$appointmentResult = null;
$queueNumber = null;

// If requested, assign appointment slot and/or check patient into Today's Live Queue
if ($addToQueue) {
    $todayDate = date('Y-m-d');
    if (empty($appointmentDate)) {
        $appointmentDate = $todayDate;
    }

    $isToday = ($appointmentDate === $todayDate);
    $isImmediate = empty($timeSlot) || strtolower($timeSlot) === 'immediate queue' || strtolower($timeSlot) === 'immediate' || strtolower($timeSlot) === 'now';

    if ($isImmediate) {
        $finalTimeSlot = date('h:i A');
    } else {
        $finalTimeSlot = $timeSlot;
    }

    // Determine status:
    // If today and immediate, status is 'checked_in' (placed in lobby queue).
    // If today and checkinNow is checked, status is 'checked_in'.
    // Otherwise (future date or scheduled slot today not checked in), status is 'scheduled'.
    if ($isToday) {
        if ($checkinNow !== null) {
            $apptStatus = $checkinNow ? 'checked_in' : 'scheduled';
        } else {
            $apptStatus = $isImmediate ? 'checked_in' : 'scheduled';
        }
    } else {
        $apptStatus = 'scheduled';
    }

    // Calculate queue sequence number if for today
    $queueNumber = null;
    if ($isToday) {
        $todayAppts = $db->find('appointments', ['appointment_date' => $todayDate]);
        $queueCount = count($todayAppts) + 1;
        $queueNumber = sprintf("Q-%03d", $queueCount);
    }

    $appointmentDoc = [
        "patient_name" => $fullName,
        "patient_email" => $finalEmail,
        "patient_phone" => $phone,
        "patient_id" => (string) $insertedPatientId,
        "doctor_name" => $doctorName,
        "service_name" => $serviceName,
        "appointment_date" => $appointmentDate,
        "date" => $appointmentDate,
        "time_slot" => $finalTimeSlot,
        "appointment_time" => $finalTimeSlot,
        "operatory_chair" => $operatoryChair,
        "status" => $apptStatus,
        "is_walkin" => true,
        "queue_number" => $queueNumber,
        "notes" => $chiefComplaint ?: "Walk-in patient registered at front desk reception",
        "is_deleted" => false,
        "is_archived" => false,
        "created_at" => $currentTimestamp,
        "booked_by" => $registeredBy
    ];

    $insertedApptId = $db->insertOne('appointments', $appointmentDoc);

    AuditLogger::log(
        ($apptStatus === 'checked_in') ? 'WALKIN_CHECKED_IN' : 'APPOINTMENT_SCHEDULED',
        "appointments:{$insertedApptId}",
        [
            'queue_number' => $queueNumber,
            'patient_name' => $fullName,
            'doctor_name' => $doctorName,
            'service_name' => $serviceName,
            'appointment_date' => $appointmentDate,
            'time_slot' => $finalTimeSlot,
            'status' => $apptStatus,
            'chair' => $operatoryChair,
            'registered_by' => $registeredBy
        ]
    );

    $appointmentResult = [
        "appointment_id" => (string) $insertedApptId,
        "queue_number" => $queueNumber,
        "status" => $apptStatus,
        "appointment_date" => $appointmentDate,
        "date" => $appointmentDate,
        "doctor_name" => $doctorName,
        "service_name" => $serviceName,
        "operatory_chair" => $operatoryChair,
        "time_slot" => $finalTimeSlot
    ];
}

if ($addToQueue) {
    if ($apptStatus === 'checked_in') {
        $successMsg = "Patient {$fullName} registered and placed into today's queue as #{$queueNumber}!";
    } else {
        $formattedDate = date('M j, Y', strtotime($appointmentDate));
        $successMsg = "Patient {$fullName} registered and appointment assigned for {$formattedDate} at {$finalTimeSlot} with {$doctorName}!";
    }
} else {
    $successMsg = "Patient {$fullName} successfully registered in clinic directory.";
}

if ($inviteLink) {
    if ($invitationSent) {
        $successMsg .= " Online patient portal invitation emailed to {$finalEmail}.";
    } else {
        $successMsg .= " Online portal activation link generated.";
    }
}

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => $successMsg,
    "patient" => [
        "_id" => (string) $insertedPatientId,
        "full_name" => $fullName,
        "email" => $finalEmail,
        "phone" => $phone,
        "dob" => $dob,
        "age" => $age,
        "gender" => $gender,
        "address" => $address,
        "blood_type" => $bloodType,
        "medical_alerts" => $allergies
    ],
    "invitation" => $inviteLink ? [
        "sent" => $invitationSent,
        "email" => $finalEmail,
        "invite_link" => $inviteLink,
        "token" => $inviteToken,
        "reason" => $invitationReason
    ] : null,
    "queue" => $appointmentResult
]);

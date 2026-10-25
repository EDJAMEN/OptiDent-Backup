<?php
/**
 * OptiDent System - Client Book Appointment API
 * Task C-002: Client Self-Service Scheduling
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

require_once __DIR__ . '/../config/clinic_hours_helper.php';

// Verify authorized patient session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient / Client session required."]);
    exit;
}

// Check if patient online booking is enabled in system settings
try {
    $systemSettings = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);
    if ($systemSettings) {
        $integrations = !empty($systemSettings['integrations']) && is_array($systemSettings['integrations']) ? $systemSettings['integrations'] : [];
        $bookingEnabled = isset($integrations['patient_online_booking']) ? (bool)$integrations['patient_online_booking'] : true;
        if (!$bookingEnabled) {
            http_response_code(403);
            echo json_encode([
                "status" => "error",
                "message" => "Online appointment self-booking is currently paused by clinic administration. Please contact the front desk to schedule an appointment."
            ]);
            exit;
        }
    }
} catch (\Exception $e) {}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$userId = $_SESSION['user_id'] ?? '';
$userEmail = $_SESSION['email'] ?? '';

// Fetch patient's active record from users collection
$user = null;
if (!empty($userId)) {
    $user = $db->findOne('users', ['_id' => $userId]);
}
if (!$user && !empty($userEmail)) {
    $user = $db->findOne('users', ['email' => $userEmail]);
}

$userFullName = $user['full_name'] ?? $_SESSION['full_name'] ?? '';
$userPhone = $user['phone'] ?? '';
$userEmail = $user['email'] ?? $userEmail;

$doctorName = trim($input['doctor_name'] ?? 'First Available Doctor');
$serviceName = trim($input['service_name'] ?? 'Dental Consultation');
$appointmentDate = trim($input['appointment_date'] ?? $input['date'] ?? '');
$timeSlot = trim($input['time_slot'] ?? $input['time'] ?? '09:00 AM');
$notes = trim($input['notes'] ?? $input['chief_complaint'] ?? '');
$operatoryChair = trim($input['operatory_chair'] ?? 'Operatory Chair 1');

if (empty($appointmentDate)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment date is required."]);
    exit;
}

// Ensure appointment date is not in the past
$today = date('Y-m-d');
if ($appointmentDate < $today) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Cannot schedule appointments for past dates."]);
    exit;
}

// Standardize time format e.g. 9:00 AM -> 09:00 AM
$ts = strtotime("2026-01-01 " . $timeSlot);
if ($ts) {
    $timeSlot = date('h:i A', $ts);
}

// C-005: Prevent Past Time Slots on Current Date
if ($appointmentDate === $today) {
    $nowMinutes = ((int)date('H') * 60) + (int)date('i');
    $slotParts = explode(' ', $timeSlot);
    $meridiem = strtoupper($slotParts[1] ?? 'AM');
    $tp = explode(':', $slotParts[0] ?? '08:00');
    $sh = (int)($tp[0] ?? 8);
    $sm = (int)($tp[1] ?? 0);
    if ($meridiem === 'PM' && $sh !== 12) $sh += 12;
    if ($meridiem === 'AM' && $sh === 12) $sh = 0;
    $slotMinutes = ($sh * 60) + $sm;

    if ($slotMinutes <= $nowMinutes) {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "The time slot {$timeSlot} has already passed for today. Please select an upcoming slot."]);
        exit;
    }
}

$dateTimestamp = strtotime($appointmentDate);
$dayAbbr = date('D', $dateTimestamp);
$dayFullName = date('l', $dateTimestamp);

// Fetch all active doctors
$allUsers = $db->find('users', ['role' => 'doctor']);
$activeDoctors = [];
foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $activeDoctors[] = $u;
}

// Fetch all existing active bookings for this date and time
$allApts = $db->find('appointments', []);
$existingBookings = [];
foreach ($allApts as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;
    $aDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    $aTime = trim($apt['time_slot'] ?? $apt['appointment_time'] ?? '');
    if ($aDate === $appointmentDate && strcasecmp($aTime, $timeSlot) === 0) {
        $st = strtolower($apt['status'] ?? 'scheduled');
        if (in_array($st, ['pending', 'scheduled', 'checked_in', 'waiting', 'in_progress', 'completed'])) {
            $existingBookings[] = $apt;
        }
    }
}

$assignedDoctorName = $doctorName;

if (!empty($doctorName) && strcasecmp($doctorName, 'First Available Doctor') !== 0) {
    $matchedDoc = null;
    foreach ($activeDoctors as $d) {
        if (strcasecmp($d['full_name'] ?? '', $doctorName) === 0 || (string)($d['_id'] ?? '') === $doctorName) {
            $matchedDoc = $d;
            break;
        }
    }

    if ($matchedDoc) {
        $assignedDoctorName = $matchedDoc['full_name'];
        $sched = ClinicHoursHelper::resolveDoctorSchedule($matchedDoc);
        $onDuty = ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days']);

        if (!$onDuty) {
            http_response_code(409);
            echo json_encode([
                "status" => "error",
                "message" => "{$assignedDoctorName} is off duty on {$dayFullName}s. Working days: {$sched['working_days']}."
            ]);
            exit;
        }

        // Check if doctor is already booked at this time slot
        foreach ($existingBookings as $eb) {
            $ebDoc = $eb['doctor_name'] ?? '';
            if (strcasecmp($ebDoc, $assignedDoctorName) === 0 || strcasecmp($ebDoc, 'First Available Doctor') === 0) {
                http_response_code(409);
                echo json_encode([
                    "status" => "error",
                    "message" => "The {$timeSlot} slot with {$assignedDoctorName} is already booked. Please choose another available slot."
                ]);
                exit;
            }
        }
    }
} else {
    // "First Available Doctor" - Find an on-duty doctor who is free at this slot
    $availableDoc = null;
    foreach ($activeDoctors as $d) {
        $sched = ClinicHoursHelper::resolveDoctorSchedule($d);
        if (!ClinicHoursHelper::isDayInWorkingDays($dayAbbr, $sched['working_days'])) continue;

        // Check if slot in doctor schedule
        $hasSlot = false;
        foreach ($sched['time_slots'] as $s) {
            if (strcasecmp(trim($s), $timeSlot) === 0) {
                $hasSlot = true;
                break;
            }
        }
        if (!$hasSlot) continue;

        // Check if doctor has a booking at this slot
        $dBooked = false;
        foreach ($existingBookings as $eb) {
            $ebDoc = $eb['doctor_name'] ?? '';
            if (strcasecmp($ebDoc, $d['full_name'] ?? '') === 0 || strcasecmp($ebDoc, 'First Available Doctor') === 0) {
                $dBooked = true;
                break;
            }
        }

        if (!$dBooked) {
            $availableDoc = $d;
            break;
        }
    }

    if (!$availableDoc) {
        http_response_code(409);
        echo json_encode([
            "status" => "error",
            "message" => "All attending healthcare providers are booked at {$timeSlot} on {$appointmentDate}. Please select another slot."
        ]);
        exit;
    }

    $assignedDoctorName = $availableDoc['full_name'];
}

$appointmentDoc = [
    "patient_name" => $userFullName,
    "patient_email" => $userEmail,
    "patient_phone" => $userPhone,
    "patient_id" => (string)($user['_id'] ?? $userId),
    "doctor_name" => $doctorName,
    "service_name" => $serviceName,
    "appointment_date" => $appointmentDate,
    "date" => $appointmentDate,
    "time_slot" => $timeSlot,
    "appointment_time" => $timeSlot,
    "operatory_chair" => $operatoryChair,
    "status" => "pending",
    "approval_status" => "pending",
    "is_walkin" => false,
    "notes" => $notes ?: "Booked via Client Self-Service Portal",
    "is_deleted" => false,
    "is_archived" => false,
    "created_at" => date('Y-m-d H:i:s'),
    "booked_by" => $userEmail
];

$insertedId = $db->insertOne('appointments', $appointmentDoc);

if (!$insertedId) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to book appointment. Please try again."]);
    exit;
}

AuditLogger::log(
    'CLIENT_BOOKED_APPOINTMENT',
    "appointments:{$insertedId}",
    [
        'appointment_id' => (string)$insertedId,
        'patient_name' => $userFullName,
        'doctor_name' => $doctorName,
        'service_name' => $serviceName,
        'date' => $appointmentDate,
        'time_slot' => $timeSlot
    ]
);

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Appointment successfully booked for {$appointmentDate} at {$timeSlot}!",
    "appointment_id" => (string)$insertedId
]);

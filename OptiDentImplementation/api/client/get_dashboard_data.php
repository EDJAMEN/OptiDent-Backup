<?php
/**
 * OptiDent System - Client Dashboard Data API
 * Task C-002: Client Portal Overview
 * 
 * Fetches patient profile, visit statistics, upcoming & past appointments,
 * and available clinic doctors for self-scheduling.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

// Verify authorized patient / client session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient / Client session required."]);
    exit;
}

$userEmail = $_SESSION['email'] ?? '';
$userId = $_SESSION['user_id'] ?? '';

$user = null;
if (!empty($userId)) {
    $user = $db->findOne('users', ['_id' => $userId]);
}
if (!$user && !empty($userEmail)) {
    $user = $db->findOne('users', ['email' => $userEmail]);
}

if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Patient record not found."]);
    exit;
}

$patientName = $user['full_name'] ?? '';
$patientPhone = $user['phone'] ?? '';
$patientEmail = $user['email'] ?? '';
$todayDate = date('Y-m-d');

// 1. Fetch appointments for this patient
$allAppts = $db->find('appointments', []);
$myAppointments = [];
$upcoming = [];
$past = [];
$completedCount = 0;

foreach ($allAppts as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;

    $matches = false;
    if (!empty($apt['patient_id']) && (string)$apt['patient_id'] === (string)$user['_id']) {
        $matches = true;
    } elseif ($patientEmail && strcasecmp(trim($apt['patient_email'] ?? ''), $patientEmail) === 0) {
        $matches = true;
    } elseif ($patientPhone && trim($apt['patient_phone'] ?? '') === $patientPhone) {
        $matches = true;
    } elseif ($patientName && strcasecmp(trim($apt['patient_name'] ?? ''), $patientName) === 0) {
        $matches = true;
    }

    if (!$matches) continue;

    $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    $status = strtolower($apt['status'] ?? 'scheduled');

    $teethRaw = $apt['teeth_selected'] ?? [];
    $teethArray = is_array($teethRaw) ? $teethRaw : (!empty($teethRaw) ? explode(',', (string)$teethRaw) : []);
    $teethArray = array_values(array_map('trim', array_filter($teethArray)));

    $surfacesRaw = $apt['tooth_surfaces'] ?? [];
    $surfacesArray = is_array($surfacesRaw) ? $surfacesRaw : (!empty($surfacesRaw) ? explode(',', (string)$surfacesRaw) : []);
    $surfacesArray = array_values(array_map('trim', array_filter($surfacesArray)));

    $docName = $apt['attending_doctor'] ?? $apt['doctor_name'] ?? $apt['dentist_name'] ?? 'Assigned Doctor';
    $chairName = $apt['operatory_chair'] ?? $apt['chair_room'] ?? 'Operatory Chair 1';

    $item = [
        '_id' => (string)$apt['_id'],
        'date' => $aptDate,
        'time' => $apt['time_slot'] ?? $apt['appointment_time'] ?? '09:00 AM',
        'doctor_name' => $docName,
        'attending_doctor' => $docName,
        'service_name' => $apt['service_name'] ?? 'Dental Consultation',
        'treatment_category' => $apt['treatment_category'] ?? 'General Dentistry',
        'operatory_chair' => $chairName,
        'status' => $status,
        'queue_number' => $apt['queue_number'] ?? null,
        'is_walkin' => !empty($apt['is_walkin']),
        'notes' => $apt['procedure_notes'] ?? $apt['notes'] ?? '',
        'diagnosis' => $apt['diagnosis'] ?? $apt['chief_complaint'] ?? '',
        'teeth_selected' => $teethArray,
        'tooth_surfaces' => $surfacesArray,
        'vital_signs' => $apt['vital_signs'] ?? null,
        'anesthesia' => $apt['anesthesia'] ?? '',
        'procedure_notes' => $apt['procedure_notes'] ?? $apt['notes'] ?? '',
        'prescription' => $apt['prescription'] ?? '',
        'post_op_instructions' => $apt['post_op_instructions'] ?? '',
        'follow_up_date' => $apt['follow_up_date'] ?? '',
        'cancellation_reason' => $apt['cancellation_reason'] ?? $apt['decline_reason'] ?? '',
        'decline_reason' => $apt['decline_reason'] ?? $apt['cancellation_reason'] ?? '',
        'approval_status' => $apt['approval_status'] ?? '',
        'approved_by' => $apt['approved_by'] ?? '',
        'completed_at' => $apt['completed_at'] ?? '',
        'created_at' => $apt['created_at'] ?? ''
    ];

    $myAppointments[] = $item;

    if ($status === 'completed') {
        $completedCount++;
        $past[] = $item;
    } elseif ($aptDate >= $todayDate && !in_array($status, ['completed', 'cancelled'])) {
        $upcoming[] = $item;
    } else {
        $past[] = $item;
    }
}

// Aggregate treated teeth
$allTreatedTeeth = [];
foreach ($myAppointments as $ma) {
    foreach (($ma['teeth_selected'] ?? []) as $t) {
        if (!empty($t) && !in_array($t, $allTreatedTeeth)) {
            $allTreatedTeeth[] = $t;
        }
    }
}

// Sort upcoming ascending (nearest first)
usort($upcoming, function($a, $b) {
    return strcmp($a['date'] . ' ' . $a['time'], $b['date'] . ' ' . $b['time']);
});

// Sort past descending (most recent first)
usort($past, function($a, $b) {
    return strcmp($b['date'] . ' ' . $b['time'], $a['date'] . ' ' . $a['time']);
});

// 2. Fetch Active Clinic Doctors
$allUsers = $db->find('users', []);
$doctors = [];
foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    if (strtolower($u['role'] ?? '') === 'doctor' && ($u['status'] ?? 'active') === 'active') {
        $docSched = ClinicHoursHelper::resolveDoctorSchedule($u);
            
        $doctors[] = [
            'id' => (string)$u['_id'],
            'full_name' => $u['full_name'] ?? 'Doctor',
            'specialization' => $u['specialization'] ?? 'General Dentistry',
            'schedule_days' => $docSched['schedule_days'],
            'working_days' => $docSched['working_days'],
            'opening_time' => $docSched['opening_time'],
            'closing_time' => $docSched['closing_time'],
            'lunch_break' => $docSched['lunch_break'],
            'time_slots' => $docSched['time_slots'],
            'timezone' => $docSched['timezone']
        ];
    }
}

// 3. Available Dental Clinic Services
$services = [
    [
        'id' => 'consultation',
        'name' => 'Dental Consultation & Oral Examination',
        'duration' => '30 mins',
        'description' => 'Comprehensive dental health checkup, diagnostic inspection, and treatment planning.'
    ],
    [
        'id' => 'cleaning',
        'name' => 'Oral Prophylaxis (Cleaning)',
        'duration' => '45 mins',
        'description' => 'Ultrasonic scaling, tartar removal, plaque debridement, and enamel polish.'
    ],
    [
        'id' => 'filling',
        'name' => 'Tooth Restoration (Composite Filling)',
        'duration' => '45 mins',
        'description' => 'Cavity preparation and tooth-colored composite resin restoration.'
    ],
    [
        'id' => 'extraction',
        'name' => 'Simple / Urgent Tooth Extraction',
        'duration' => '40 mins',
        'description' => 'Safe removal of non-restorable, decayed, or painful teeth with local anesthesia.'
    ],
    [
        'id' => 'ortho_adjustment',
        'name' => 'Orthodontic Adjustment / Braces',
        'duration' => '30 mins',
        'description' => 'Routine bracket adjustment, archwire replacement, and orthodontic alignment review.'
    ],
    [
        'id' => 'emergency',
        'name' => 'Emergency Relief / Acute Toothache',
        'duration' => '30 mins',
        'description' => 'Immediate diagnosis and pain intervention for dental trauma or acute pulpitis.'
    ]
];

// Calculate age if not stored
$age = $user['age'] ?? null;
if (!empty($user['dob']) && empty($age)) {
    try {
        $b = new DateTime($user['dob']);
        $now = new DateTime('today');
        $age = $b->diff($now)->y;
    } catch (Exception $e) {
        $age = null;
    }
}

$alerts = $user['allergies'] ?? $user['medical_alerts'] ?? 'None recorded';

$clinicProfile = ClinicHoursHelper::getActiveClinicProfile($db);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "patient" => [
        "_id" => (string)$user['_id'],
        "full_name" => $user['full_name'] ?? '',
        "email" => $user['email'] ?? '',
        "phone" => $user['phone'] ?? '',
        "dob" => $user['dob'] ?? '',
        "age" => $age,
        "gender" => $user['gender'] ?? 'Not Specified',
        "blood_type" => $user['blood_type'] ?? 'Unknown',
        "address" => $user['address'] ?? '',
        "medical_alerts" => $alerts,
        "has_alert" => ($alerts !== 'None' && $alerts !== 'None recorded' && !empty($alerts)),
        "emergency_contact_name" => $user['emergency_contact_name'] ?? '',
        "emergency_contact_phone" => $user['emergency_contact_phone'] ?? '',
        "profile_picture" => $user['profile_picture'] ?? $user['avatar'] ?? '',
        "avatar_color" => $user['avatar_color'] ?? '#0eb1b1',
        "reward_points" => $user['reward_points'] ?? 0,
        "created_at" => $user['created_at'] ?? ''
    ],
    "metrics" => [
        "total_appointments" => count($myAppointments),
        "upcoming_appointments" => count($upcoming),
        "completed_visits" => $completedCount,
        "reward_points" => $user['reward_points'] ?? 0
    ],
    "upcoming_appointments" => $upcoming,
    "past_appointments" => $past,
    "treated_teeth_summary" => $allTreatedTeeth,
    "doctors" => $doctors,
    "services" => $services,
    "clinic_settings" => [
        "operating_days"  => $clinicProfile['operating_days'] ?? 'Mon - Sat',
        "opening_time"    => $clinicProfile['opening_time'] ?? '08:00 AM',
        "closing_time"    => $clinicProfile['closing_time'] ?? '05:00 PM',
        "lunch_break"     => $clinicProfile['lunch_break'] ?? true,
        "operating_hours" => $clinicProfile['operating_hours'] ?? 'Mon - Sat: 08:00 AM - 05:00 PM | Sun: Closed',
        "time_slots"      => $clinicProfile['time_slots'] ?? [],
        "timezone"        => $clinicProfile['timezone'] ?? 'Asia/Manila',
        "integrations"    => $clinicProfile['integrations'] ?? []
    ]
]);

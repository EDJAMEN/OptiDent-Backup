<?php
/**
 * OptiDent System - Doctor Dashboard & Clinical Queue API
 * Retrieves doctor profile, assigned appointments, patient roster, and clinical metrics
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

// Verify session authentication
$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Please log in as a Doctor."]);
    exit;
}

// 1. Fetch Doctor Profile
$doctor = $db->findOne('users', ['email' => $userEmail]);
if (!$doctor && in_array($userRole, ['super_admin', 'admin'])) {
    // If admin is viewing doctor dashboard, fallback to sample active doctor or admin profile
    $doctor = $db->findOne('users', ['role' => 'doctor', 'status' => 'active']) ?: [
        'full_name' => $_SESSION['full_name'] ?? 'Dr. Maria Santos',
        'email' => $userEmail,
        'role' => 'doctor',
        'specialization' => 'Orthodontics & General Dentistry',
        'professional_id' => 'PRC-DMD-0071829',
        'schedule_days' => 'Mon - Fri (9:00 AM - 5:00 PM)',
        'phone' => '+63 917 888 2345'
    ];
}

// 2. Fetch Appointments for this Doctor
$allAppts = $db->find('appointments', []);

$todayDate = date('Y-m-d');
$doctorAppts = [];
$todayList = [];
$upcomingList = [];
$completedList = [];
$patientsMap = [];

$todayCount = 0;
$inProgressCount = 0;
$waitingCount = 0;
$completedCount = 0;

foreach ($allAppts as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) {
        continue;
    }

    // Match appointments assigned to this doctor (or all if admin viewing)
    $isMatch = true;
    if ($userRole === 'doctor') {
        $aptDocEmail = strtolower($apt['dentist_email'] ?? '');
        $aptDocName = strtolower($apt['dentist_name'] ?? '');
        $currentDocName = strtolower($doctor['full_name'] ?? '');
        $currentDocEmail = strtolower($doctor['email'] ?? '');

        if (!empty($aptDocEmail) && $aptDocEmail !== $currentDocEmail) {
            $isMatch = false;
        }
    }

    if (!$isMatch) continue;

    $doctorAppts[] = $apt;

    $aptDate = $apt['appointment_date'] ?? '';
    $status = strtolower($apt['status'] ?? 'scheduled');

    // Categorization
    if ($status === 'completed') {
        $completedList[] = $apt;
        if ($aptDate === $todayDate) {
            $completedCount++;
            $todayCount++;
        }
    } else {
        if ($aptDate === $todayDate || $status === 'in_progress') {
            $todayList[] = $apt;
            $todayCount++;
            if ($status === 'in_progress') {
                $inProgressCount++;
            } else if ($status === 'scheduled') {
                $waitingCount++;
            }
        } else if ($aptDate > $todayDate) {
            $upcomingList[] = $apt;
        }
    }

    // Aggregate unique patient profiles
    $pEmail = strtolower($apt['patient_email'] ?? $apt['patient_name'] ?? '');
    if (!empty($pEmail)) {
        $aptTeeth = $apt['teeth_selected'] ?? [];
        if (!is_array($aptTeeth) && !empty($aptTeeth)) $aptTeeth = [$aptTeeth];

        if (!isset($patientsMap[$pEmail])) {
            $patientsMap[$pEmail] = [
                'name' => $apt['patient_name'] ?? 'Unknown Patient',
                'email' => $apt['patient_email'] ?? '',
                'phone' => $apt['patient_phone'] ?? '',
                'age' => $apt['patient_age'] ?? 'N/A',
                'gender' => $apt['patient_gender'] ?? 'N/A',
                'last_visit' => $aptDate,
                'last_service' => $apt['service_name'] ?? '',
                'total_visits' => 1,
                'treated_teeth' => $aptTeeth
            ];
        } else {
            $patientsMap[$pEmail]['total_visits']++;
            if (!empty($aptTeeth)) {
                $patientsMap[$pEmail]['treated_teeth'] = array_values(array_unique(array_merge($patientsMap[$pEmail]['treated_teeth'] ?? [], $aptTeeth)));
            }
            if ($aptDate > $patientsMap[$pEmail]['last_visit']) {
                $patientsMap[$pEmail]['last_visit'] = $aptDate;
                $patientsMap[$pEmail]['last_service'] = $apt['service_name'] ?? '';
            }
        }
    }
}

// Sort today list: in_progress first, then scheduled
usort($todayList, function($a, $b) {
    if (($a['status'] ?? '') === 'in_progress') return -1;
    if (($b['status'] ?? '') === 'in_progress') return 1;
    return strcmp($a['appointment_time'] ?? '', $b['appointment_time'] ?? '');
});

// Sort completed: most recent first
usort($completedList, function($a, $b) {
    return strcmp($b['appointment_date'] ?? '', $a['appointment_date'] ?? '');
});

$patientsList = array_values($patientsMap);

    $docSched = ClinicHoursHelper::resolveDoctorSchedule($doctor);

    echo json_encode([
        "status" => "success",
        "doctor" => [
            "id" => (string)($doctor['_id'] ?? ''),
            "full_name" => $doctor['full_name'] ?? 'Dr. Specialist',
            "email" => $doctor['email'] ?? '',
            "role" => "doctor",
            "specialization" => $doctor['specialization'] ?? 'General Dentistry',
            "professional_id" => $doctor['professional_id'] ?? 'PRC-VERIFIED',
            "schedule_days" => $docSched['schedule_days'],
            "working_days" => $docSched['working_days'],
            "opening_time" => $docSched['opening_time'],
            "closing_time" => $docSched['closing_time'],
            "lunch_break" => $docSched['lunch_break'],
            "time_slots" => $docSched['time_slots'],
            "timezone" => $docSched['timezone'],
            "phone" => $doctor['phone'] ?? '',
            "bio" => $doctor['bio'] ?? ''
        ],
    "metrics" => [
        "today_total" => $todayCount,
        "in_progress" => $inProgressCount,
        "waiting_queue" => $waitingCount,
        "completed_total" => count($completedList),
        "total_patients" => count($patientsList)
    ],
    "queue_today" => $todayList,
    "upcoming_appointments" => $upcomingList,
    "completed_procedures" => $completedList,
    "patients" => $patientsList
]);

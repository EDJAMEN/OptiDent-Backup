<?php
/**
 * OptiDent System - Receptionist Workspace Dashboard Data API
 * Provides Front-Desk metrics, today's appointment queue, patient list, and doctor schedules
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

// Session verification: receptionist, staff, or super_admin/admin allowed
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode([
        "status" => "error",
        "message" => "Access denied. Receptionist session required."
    ]);
    exit;
}

$userEmail = $_SESSION['email'] ?? '';
$userDoc = $db->findOne('users', ['email' => $userEmail]);

$today = date('Y-m-d');

// Fetch all active appointments
$rawAppointments = $db->find('appointments', []);
$appointments = array_filter($rawAppointments, function($a) {
    return empty($a['is_deleted']) && empty($a['is_archived']);
});

$queueToday = [];
$upcomingAppointments = [];
$completedToday = 0;
$checkedInCount = 0;
$inChairCount = 0;

foreach ($appointments as $apt) {
    $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    $status = strtolower($apt['status'] ?? 'scheduled');

    if ($aptDate === $today) {
        $queueToday[] = $apt;
        if (in_array($status, ['checked_in', 'waiting'])) {
            $checkedInCount++;
        } elseif ($status === 'in_progress') {
            $inChairCount++;
        } elseif ($status === 'completed') {
            $completedToday++;
        }
    } elseif ($aptDate > $today) {
        $upcomingAppointments[] = $apt;
    }
}

// Sort today's queue by appointment time
usort($queueToday, function($a, $b) {
    $tA = $a['time_slot'] ?? $a['appointment_time'] ?? '00:00';
    $tB = $b['time_slot'] ?? $b['appointment_time'] ?? '00:00';
    return strcmp($tA, $tB);
});

// Sort upcoming appointments
usort($upcomingAppointments, function($a, $b) {
    $dA = ($a['appointment_date'] ?? $a['date'] ?? '') . ' ' . ($a['time_slot'] ?? '');
    $dB = ($b['appointment_date'] ?? $b['date'] ?? '') . ' ' . ($b['time_slot'] ?? '');
    return strcmp($dA, $dB);
});

// Fetch active patients
$allUsers = $db->find('users', []);
$patients = [];
$doctors = [];

foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $uRole = strtolower($u['role'] ?? '');
    if ($uRole === 'patient') {
        $patients[] = [
            '_id' => (string) $u['_id'],
            'full_name' => $u['full_name'] ?? 'Unknown Patient',
            'email' => $u['email'] ?? '',
            'phone' => $u['phone'] ?? 'N/A',
            'dob' => $u['dob'] ?? '',
            'gender' => $u['gender'] ?? '',
            'blood_type' => $u['blood_type'] ?? 'N/A',
            'medical_alerts' => $u['allergies'] ?? $u['medical_alerts'] ?? 'None recorded',
            'emergency_contact' => $u['emergency_contact_name'] ?? $u['emergency_contact_phone'] ?? 'N/A',
            'created_at' => $u['created_at'] ?? ''
        ];
    } elseif ($uRole === 'doctor') {
        $doctors[] = [
            '_id' => (string) $u['_id'],
            'full_name' => $u['full_name'] ?? 'Doctor',
            'email' => $u['email'] ?? '',
            'phone' => $u['phone'] ?? '',
            'specialization' => $u['specialization'] ?? 'General Dentistry',
            'professional_id' => $u['professional_id'] ?? 'PRC-VERIFIED',
            'schedule_days' => $u['schedule_days'] ?? 'Mon - Fri (9:00 AM - 5:00 PM)'
        ];
    }
}

// Fetch available services
$rawServices = $db->find('services', []);
$services = array_values(array_filter($rawServices, function($s) {
    return empty($s['is_deleted']) && empty($s['is_archived']);
}));

$metrics = [
    'today_total' => count($queueToday),
    'checked_in' => $checkedInCount,
    'in_progress' => $inChairCount,
    'completed_today' => $completedToday,
    'total_patients' => count($patients),
    'active_doctors' => count($doctors)
];

$clinicProfile = ClinicHoursHelper::getActiveClinicProfile($db);

echo json_encode([
    "status" => "success",
    "receptionist" => [
        "id" => (string) ($userDoc['_id'] ?? $_SESSION['user_id'] ?? ''),
        "full_name" => $userDoc['full_name'] ?? $_SESSION['full_name'] ?? 'Front Desk Staff',
        "email" => $userEmail,
        "role" => $role,
        "position" => $userDoc['position'] ?? 'Front Desk Receptionist',
        "phone" => $userDoc['phone'] ?? ''
    ],
    "metrics" => $metrics,
    "queue_today" => array_values($queueToday),
    "upcoming_appointments" => array_values(array_slice($upcomingAppointments, 0, 20)),
    "patients" => array_values($patients),
    "doctors" => array_values($doctors),
    "services" => $services,
    "clinic_settings" => [
        "operating_days"  => $clinicProfile['operating_days'] ?? 'Mon - Sat',
        "opening_time"    => $clinicProfile['opening_time'] ?? '08:00 AM',
        "closing_time"    => $clinicProfile['closing_time'] ?? '05:00 PM',
        "lunch_break"     => $clinicProfile['lunch_break'] ?? true,
        "operating_hours" => $clinicProfile['operating_hours'] ?? 'Mon - Sat: 08:00 AM - 05:00 PM | Sun: Closed',
        "time_slots"      => $clinicProfile['time_slots'] ?? [],
        "timezone"        => $clinicProfile['timezone'] ?? 'Asia/Manila'
    ]
]);

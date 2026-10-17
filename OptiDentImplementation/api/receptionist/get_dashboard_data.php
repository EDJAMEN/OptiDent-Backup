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
        // Calculate waiting duration
        $waitMinutes = 0;
        if (in_array($status, ['checked_in', 'waiting'])) {
            $checkedInAt = $apt['checked_in_at'] ?? $apt['created_at'] ?? '';
            if (!empty($checkedInAt)) {
                $waitMinutes = max(0, round((time() - strtotime($checkedInAt)) / 60));
            }
            $checkedInCount++;
        } elseif ($status === 'in_progress') {
            $inChairCount++;
        } elseif ($status === 'completed') {
            $completedToday++;
        }

        $apt['elapsed_wait_minutes'] = $waitMinutes;
        $apt['queue_priority'] = strtolower($apt['queue_priority'] ?? 'normal');
        $queueToday[] = $apt;
    } elseif ($aptDate > $today) {
        $upcomingAppointments[] = $apt;
    }
}

// Sort today's queue by clinical workflow hierarchy & queue priority (R-006 Queue Management)
usort($queueToday, function($a, $b) {
    $statusOrder = [
        'in_progress' => 1,
        'checked_in'  => 2,
        'waiting'     => 2,
        'scheduled'   => 3,
        'completed'   => 4,
        'cancelled'   => 5,
        'no_show'     => 5
    ];

    $sA = $statusOrder[strtolower($a['status'] ?? 'scheduled')] ?? 9;
    $sB = $statusOrder[strtolower($b['status'] ?? 'scheduled')] ?? 9;

    if ($sA !== $sB) {
        return $sA - $sB;
    }

    // Within In-Progress / In-Chair: sort by called_to_chair_at or queue_number
    if ($sA === 1) {
        $tA = $a['in_chair_at'] ?? $a['called_to_chair_at'] ?? '';
        $tB = $b['in_chair_at'] ?? $b['called_to_chair_at'] ?? '';
        return strcmp($tA, $tB);
    }

    // Within Checked-In / Waiting Lobby: Sort by Priority, Queue Order, then Check-in time
    if ($sA === 2) {
        $priorityWeights = [
            'emergency' => 1,
            'urgent'    => 2,
            'senior'    => 3,
            'pwd'       => 3,
            'normal'    => 4
        ];
        $pA = $priorityWeights[strtolower($a['queue_priority'] ?? 'normal')] ?? 4;
        $pB = $priorityWeights[strtolower($b['queue_priority'] ?? 'normal')] ?? 4;
        if ($pA !== $pB) {
            return $pA - $pB;
        }

        // Check explicit queue_order
        $oA = isset($a['queue_order']) ? (int)$a['queue_order'] : 999;
        $oB = isset($b['queue_order']) ? (int)$b['queue_order'] : 999;
        if ($oA !== $oB) {
            return $oA - $oB;
        }

        $tA = $a['checked_in_at'] ?? $a['time_slot'] ?? $a['appointment_time'] ?? '';
        $tB = $b['checked_in_at'] ?? $b['time_slot'] ?? $b['appointment_time'] ?? '';
        return strcmp($tA, $tB);
    }

    // Within Scheduled: Sort by appointment time slot
    $tA = $a['time_slot'] ?? $a['appointment_time'] ?? '00:00';
    $tB = $b['time_slot'] ?? $b['appointment_time'] ?? '00:00';
    return strcmp($tA, $tB);
});

// Assign live queue position index for waiting patients (#1, #2, #3...)
$waitingRank = 1;
foreach ($queueToday as &$qItem) {
    $st = strtolower($qItem['status'] ?? '');
    if (in_array($st, ['checked_in', 'waiting'])) {
        $qItem['queue_position'] = $waitingRank++;
    } else {
        $qItem['queue_position'] = null;
    }
}
unset($qItem);

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
        $docSched = ClinicHoursHelper::resolveDoctorSchedule($u);
            
        $doctors[] = [
            '_id' => (string) $u['_id'],
            'full_name' => $u['full_name'] ?? 'Doctor',
            'email' => $u['email'] ?? '',
            'phone' => $u['phone'] ?? '',
            'specialization' => $u['specialization'] ?? 'General Dentistry',
            'professional_id' => $u['professional_id'] ?? 'PRC-VERIFIED',
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

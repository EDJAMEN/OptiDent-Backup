<?php
/**
 * OptiDent System - Receptionist Patient Search API
 * Task R-004: Patient Search & Returning Patient Assistance
 * 
 * Searches patient records across legal name, phone, email, address, and medical alerts.
 * Enriches results with visit statistics (total visits, last visit date, today's queue status).
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

// Verify authorized receptionist session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$query = trim($_GET['q'] ?? $_GET['query'] ?? $_GET['search'] ?? '');
$filter = strtolower(trim($_GET['filter'] ?? 'all')); // 'all', 'alerts', 'returning', 'walkin'

$todayDate = date('Y-m-d');

// 1. Fetch all appointments to calculate visit metrics
$rawAppts = $db->find('appointments', []);
$apptsByPatientName = [];
$apptsByPatientPhone = [];
$apptsByPatientEmail = [];

foreach ($rawAppts as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;

    $pName = strtolower(trim($apt['patient_name'] ?? ''));
    $pPhone = trim($apt['patient_phone'] ?? '');
    $pEmail = strtolower(trim($apt['patient_email'] ?? ''));

    if ($pName) $apptsByPatientName[$pName][] = $apt;
    if ($pPhone) $apptsByPatientPhone[$pPhone][] = $apt;
    if ($pEmail) $apptsByPatientEmail[$pEmail][] = $apt;
}

// 2. Fetch all patients from users collection
$allUsers = $db->find('users', []);
$results = [];

$countAll = 0;
$countAlerts = 0;
$countReturning = 0;
$countWalkin = 0;

$qLower = strtolower($query);

foreach ($allUsers as $u) {
    if (!empty($u['is_deleted']) || !empty($u['is_archived'])) continue;
    $uRole = strtolower($u['role'] ?? '');
    if ($uRole !== 'patient') continue;

    $name = $u['full_name'] ?? '';
    $phone = $u['phone'] ?? '';
    $email = $u['email'] ?? '';
    $address = $u['address'] ?? '';
    $alerts = $u['allergies'] ?? $u['medical_alerts'] ?? 'None recorded';
    $dob = $u['dob'] ?? '';
    $gender = $u['gender'] ?? 'Not Specified';
    $bloodType = $u['blood_type'] ?? 'Unknown';
    $isWalkin = !empty($u['is_walkin']);

    // Check search query match
    if (!empty($qLower)) {
        $matches = (
            stripos($name, $qLower) !== false ||
            stripos($phone, $qLower) !== false ||
            stripos($email, $qLower) !== false ||
            stripos($address, $qLower) !== false ||
            stripos($alerts, $qLower) !== false
        );
        if (!$matches) continue;
    }

    // Associate appointments
    $patientAppts = [];
    $lookupName = strtolower($name);
    if (isset($apptsByPatientName[$lookupName])) {
        $patientAppts = array_merge($patientAppts, $apptsByPatientName[$lookupName]);
    } elseif ($phone && isset($apptsByPatientPhone[$phone])) {
        $patientAppts = array_merge($patientAppts, $apptsByPatientPhone[$phone]);
    } elseif ($email && isset($apptsByPatientEmail[strtolower($email)])) {
        $patientAppts = array_merge($patientAppts, $apptsByPatientEmail[strtolower($email)]);
    }

    // Deduplicate appointments by _id
    $uniqueAppts = [];
    $seenIds = [];
    foreach ($patientAppts as $pa) {
        $idStr = (string)$pa['_id'];
        if (!isset($seenIds[$idStr])) {
            $seenIds[$idStr] = true;
            $uniqueAppts[] = $pa;
        }
    }

    // Sort unique appointments descending by date
    usort($uniqueAppts, function($a, $b) {
        $dA = ($a['appointment_date'] ?? $a['date'] ?? '') . ' ' . ($a['time_slot'] ?? '');
        $dB = ($b['appointment_date'] ?? $b['date'] ?? '') . ' ' . ($b['time_slot'] ?? '');
        return strcmp($dB, $dA);
    });

    $totalVisits = count($uniqueAppts);
    $lastVisit = $uniqueAppts[0] ?? null;
    $lastVisitDate = $lastVisit ? ($lastVisit['appointment_date'] ?? $lastVisit['date'] ?? '') : null;
    $lastService = $lastVisit ? ($lastVisit['service_name'] ?? '') : null;

    // Check if patient has an appointment or queue entry TODAY
    $todayAppt = null;
    foreach ($uniqueAppts as $ua) {
        $aptDate = substr($ua['appointment_date'] ?? $ua['date'] ?? '', 0, 10);
        if ($aptDate === $todayDate) {
            $todayAppt = $ua;
            break;
        }
    }

    $hasAlert = ($alerts !== 'None' && $alerts !== 'None recorded' && !empty($alerts));

    // Category counters matching query
    $countAll++;
    if ($hasAlert) $countAlerts++;
    if ($totalVisits >= 2) $countReturning++;
    if ($isWalkin) $countWalkin++;

    // Apply quick filters
    if ($filter === 'alerts' && !$hasAlert) continue;
    if ($filter === 'returning' && $totalVisits < 2) continue;
    if ($filter === 'walkin' && !$isWalkin) continue;

    // Auto-calculate age
    $age = $u['age'] ?? null;
    if (!empty($dob) && empty($age)) {
        try {
            $b = new DateTime($dob);
            $now = new DateTime('today');
            $age = $b->diff($now)->y;
        } catch (Exception $e) {
            $age = null;
        }
    }

    $results[] = [
        '_id' => (string)$u['_id'],
        'full_name' => $name,
        'phone' => $phone,
        'email' => (stripos($email, '@clinic.local') !== false) ? '' : $email,
        'raw_email' => $email,
        'dob' => $dob,
        'age' => $age,
        'gender' => $gender,
        'blood_type' => $bloodType,
        'address' => $address,
        'medical_alerts' => $alerts,
        'has_alert' => $hasAlert,
        'emergency_contact' => $u['emergency_contact_name'] ?? $u['emergency_contact_phone'] ?? 'N/A',
        'emergency_contact_name' => $u['emergency_contact_name'] ?? '',
        'emergency_contact_phone' => $u['emergency_contact_phone'] ?? '',
        'is_walkin' => $isWalkin,
        'total_visits' => $totalVisits,
        'is_returning' => ($totalVisits >= 1),
        'last_visit_date' => $lastVisitDate,
        'last_service' => $lastService,
        'today_appointment' => $todayAppt ? [
            'appointment_id' => (string)$todayAppt['_id'],
            'status' => $todayAppt['status'] ?? 'scheduled',
            'time_slot' => $todayAppt['time_slot'] ?? '',
            'doctor_name' => $todayAppt['doctor_name'] ?? '',
            'service_name' => $todayAppt['service_name'] ?? '',
            'operatory_chair' => $todayAppt['operatory_chair'] ?? '',
            'queue_number' => $todayAppt['queue_number'] ?? null,
            'is_walkin' => !empty($todayAppt['is_walkin'])
        ] : null,
        'created_at' => $u['created_at'] ?? ''
    ];
}

// Sort: returning patients with recent visits first, then alphabetically
usort($results, function($a, $b) {
    if ($a['total_visits'] !== $b['total_visits']) {
        return $b['total_visits'] - $a['total_visits'];
    }
    return strcasecmp($a['full_name'], $b['full_name']);
});

http_response_code(200);
echo json_encode([
    "status" => "success",
    "total" => count($results),
    "query" => $query,
    "filter" => $filter,
    "counts" => [
        "all" => $countAll,
        "alerts" => $countAlerts,
        "returning" => $countReturning,
        "walkin" => $countWalkin
    ],
    "patients" => $results
]);

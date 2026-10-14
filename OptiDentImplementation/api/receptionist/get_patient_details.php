<?php
/**
 * OptiDent System - Receptionist Get Patient Details & History API
 * Task R-004: Returning Patient History & Profile Inspection
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

// Verify receptionist session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$patientId = trim($_GET['id'] ?? $_GET['patient_id'] ?? '');
$patientEmail = trim($_GET['email'] ?? '');
$patientPhone = trim($_GET['phone'] ?? '');

$filter = [];
if (!empty($patientId)) {
    $filter['_id'] = $patientId;
} elseif (!empty($patientPhone)) {
    $filter['phone'] = $patientPhone;
    $filter['role'] = 'patient';
} elseif (!empty($patientEmail)) {
    $filter['email'] = $patientEmail;
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient identifier (id, phone, or email) is required."]);
    exit;
}

$patient = $db->findOne('users', $filter);
if (!$patient) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Patient record not found."]);
    exit;
}

$pName = $patient['full_name'] ?? '';
$pPhone = $patient['phone'] ?? '';
$pEmail = $patient['email'] ?? '';

// Fetch all appointment records for this patient
$allAppts = $db->find('appointments', []);
$history = [];
$completedCount = 0;
$upcomingCount = 0;
$todayDate = date('Y-m-d');

foreach ($allAppts as $apt) {
    if (!empty($apt['is_deleted']) || !empty($apt['is_archived'])) continue;

    $matches = false;
    if ($pName && strcasecmp(trim($apt['patient_name'] ?? ''), $pName) === 0) {
        $matches = true;
    } elseif ($pPhone && trim($apt['patient_phone'] ?? '') === $pPhone) {
        $matches = true;
    } elseif ($pEmail && strcasecmp(trim($apt['patient_email'] ?? ''), $pEmail) === 0) {
        $matches = true;
    }

    if (!$matches) continue;

    $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
    $status = strtolower($apt['status'] ?? 'scheduled');

    if ($status === 'completed') {
        $completedCount++;
    } elseif ($aptDate >= $todayDate && !in_array($status, ['completed', 'cancelled'])) {
        $upcomingCount++;
    }

    $history[] = [
        '_id' => (string)$apt['_id'],
        'date' => $aptDate,
        'time' => $apt['time_slot'] ?? $apt['appointment_time'] ?? '09:00 AM',
        'doctor_name' => $apt['doctor_name'] ?? 'Assigned Doctor',
        'service_name' => $apt['service_name'] ?? 'Dental Consultation',
        'operatory_chair' => $apt['operatory_chair'] ?? 'Operatory Chair 1',
        'status' => $status,
        'queue_number' => $apt['queue_number'] ?? null,
        'is_walkin' => !empty($apt['is_walkin']),
        'notes' => $apt['notes'] ?? '',
        'created_at' => $apt['created_at'] ?? ''
    ];
}

// Sort chronological history descending
usort($history, function($a, $b) {
    return strcmp($b['date'] . ' ' . $b['time'], $a['date'] . ' ' . $a['time']);
});

// Calculate Age
$age = $patient['age'] ?? null;
if (!empty($patient['dob']) && empty($age)) {
    try {
        $b = new DateTime($patient['dob']);
        $now = new DateTime('today');
        $age = $b->diff($now)->y;
    } catch (Exception $e) {
        $age = null;
    }
}

$alerts = $patient['allergies'] ?? $patient['medical_alerts'] ?? 'None recorded';
$hasAlert = ($alerts !== 'None' && $alerts !== 'None recorded' && !empty($alerts));

http_response_code(200);
echo json_encode([
    "status" => "success",
    "patient" => [
        "_id" => (string)$patient['_id'],
        "full_name" => $patient['full_name'] ?? '',
        "phone" => $patient['phone'] ?? '',
        "email" => (stripos($patient['email'] ?? '', '@clinic.local') !== false) ? '' : ($patient['email'] ?? ''),
        "raw_email" => $patient['email'] ?? '',
        "dob" => $patient['dob'] ?? '',
        "age" => $age,
        "gender" => $patient['gender'] ?? 'Not Specified',
        "blood_type" => $patient['blood_type'] ?? 'Unknown',
        "address" => $patient['address'] ?? '',
        "medical_alerts" => $alerts,
        "has_alert" => $hasAlert,
        "emergency_contact_name" => $patient['emergency_contact_name'] ?? '',
        "emergency_contact_phone" => $patient['emergency_contact_phone'] ?? '',
        "created_at" => $patient['created_at'] ?? '',
        "registered_by" => $patient['registered_by'] ?? 'receptionist'
    ],
    "stats" => [
        "total_appointments" => count($history),
        "total_visits" => count($history),
        "completed_visits" => $completedCount,
        "upcoming_appointments" => $upcomingCount,
        "upcoming_visits" => $upcomingCount,
        "is_returning_patient" => (count($history) >= 1)
    ],
    "history" => $history
]);

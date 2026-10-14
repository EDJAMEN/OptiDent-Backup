<?php
/**
 * OptiDent System - Receptionist Check-in Returning Patient API
 * Task R-004: Fast Check-in for Returning Patients into Today's Waiting Queue
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

// Verify receptionist session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$patientId = trim($input['patient_id'] ?? '');
$patientPhone = trim($input['patient_phone'] ?? $input['phone'] ?? '');
$doctorName = trim($input['doctor_name'] ?? 'First Available Doctor');
$serviceName = trim($input['service_name'] ?? 'Dental Consultation');
$operatoryChair = trim($input['operatory_chair'] ?? 'Operatory Chair 1');
$chiefComplaint = trim($input['chief_complaint'] ?? $input['notes'] ?? '');

$filter = [];
if (!empty($patientId)) {
    $filter['_id'] = $patientId;
} elseif (!empty($patientPhone)) {
    $filter['phone'] = $patientPhone;
    $filter['role'] = 'patient';
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Patient ID or Phone is required to check in returning patient."]);
    exit;
}

$patient = $db->findOne('users', $filter);
if (!$patient) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Patient record not found in system."]);
    exit;
}

$todayDate = date('Y-m-d');
$currentTimeSlot = date('h:i A');

// Check if patient already checked in today
$existingToday = $db->find('appointments', [
    'appointment_date' => $todayDate,
    'patient_name' => $patient['full_name']
]);

foreach ($existingToday as $ea) {
    if (in_array(strtolower($ea['status'] ?? ''), ['checked_in', 'waiting', 'in_progress'])) {
        http_response_code(409);
        echo json_encode([
            "status" => "error",
            "message" => "Patient {$patient['full_name']} is already checked in today (Queue #{$ea['queue_number']}) with status '{$ea['status']}'."
        ]);
        exit;
    }
}

// Compute daily queue number
$todayAppts = $db->find('appointments', ['appointment_date' => $todayDate]);
$queueNumber = sprintf("Q-%03d", count($todayAppts) + 1);

$appointmentDoc = [
    "patient_name" => $patient['full_name'],
    "patient_email" => $patient['email'] ?? '',
    "patient_phone" => $patient['phone'] ?? '',
    "patient_id" => (string)$patient['_id'],
    "doctor_name" => $doctorName,
    "service_name" => $serviceName,
    "appointment_date" => $todayDate,
    "date" => $todayDate,
    "time_slot" => $currentTimeSlot,
    "appointment_time" => $currentTimeSlot,
    "operatory_chair" => $operatoryChair,
    "status" => "checked_in",
    "is_walkin" => true,
    "queue_number" => $queueNumber,
    "notes" => $chiefComplaint ?: "Returning patient checked in at reception",
    "is_deleted" => false,
    "is_archived" => false,
    "created_at" => date('Y-m-d H:i:s'),
    "booked_by" => $_SESSION['email'] ?? 'receptionist'
];

$insertedApptId = $db->insertOne('appointments', $appointmentDoc);

AuditLogger::log(
    'RETURNING_PATIENT_CHECKED_IN',
    "appointments:{$insertedApptId}",
    [
        'queue_number' => $queueNumber,
        'patient_id' => (string)$patient['_id'],
        'patient_name' => $patient['full_name'],
        'doctor_name' => $doctorName,
        'service_name' => $serviceName,
        'checked_in_by' => $_SESSION['email'] ?? 'receptionist'
    ]
);

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Returning patient {$patient['full_name']} checked into queue as #{$queueNumber}!",
    "appointment" => [
        "id" => (string)$insertedApptId,
        "queue_number" => $queueNumber,
        "patient_name" => $patient['full_name'],
        "doctor_name" => $doctorName,
        "service_name" => $serviceName,
        "status" => "checked_in",
        "time_slot" => $currentTimeSlot
    ]
]);

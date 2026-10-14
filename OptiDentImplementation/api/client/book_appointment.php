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

// Verify authorized patient session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient / Client session required."]);
    exit;
}

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
    "status" => "scheduled",
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

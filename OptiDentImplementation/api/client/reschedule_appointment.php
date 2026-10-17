<?php
/**
 * OptiDent System - Client Reschedule Appointment API
 * Self-service appointment rescheduling for patients
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

$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$newDate = trim($input['appointment_date'] ?? $input['date'] ?? '');
$newTime = trim($input['time_slot'] ?? $input['time'] ?? '');
$doctorName = trim($input['doctor_name'] ?? '');
$reason = trim($input['reason'] ?? 'Patient self-service reschedule');

if (empty($appointmentId) || empty($newDate) || empty($newTime)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID, new date, and time slot are required."]);
    exit;
}

$today = date('Y-m-d');
if ($newDate < $today) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Cannot reschedule to a past date."]);
    exit;
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment not found."]);
    exit;
}

// Ensure patient owns this appointment
$sessionEmail = strtolower($_SESSION['email'] ?? '');
$sessionUserId = (string)($_SESSION['user_id'] ?? '');
$aptEmail = strtolower($apt['patient_email'] ?? '');
$aptPatientId = (string)($apt['patient_id'] ?? '');

if ($sessionEmail !== $aptEmail && $sessionUserId !== $aptPatientId) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Unauthorized. You may only reschedule your own appointments."]);
    exit;
}

$timestamp = date('Y-m-d H:i:s');
$finalDoctor = !empty($doctorName) ? $doctorName : ($apt['doctor_name'] ?? 'First Available Doctor');

$historyEntry = [
    'from_date' => $apt['appointment_date'] ?? $apt['date'] ?? '',
    'from_time' => $apt['time_slot'] ?? $apt['appointment_time'] ?? '',
    'to_date' => $newDate,
    'to_time' => $newTime,
    'from_doctor' => $apt['doctor_name'] ?? '',
    'to_doctor' => $finalDoctor,
    'reason' => $reason,
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $sessionEmail
];

$existingHistory = isset($apt['reschedule_history']) && is_array($apt['reschedule_history']) 
    ? $apt['reschedule_history'] 
    : [];
$existingHistory[] = $historyEntry;

$updateFields = [
    'appointment_date' => $newDate,
    'date' => $newDate,
    'time_slot' => $newTime,
    'appointment_time' => $newTime,
    'doctor_name' => $finalDoctor,
    'status' => 'scheduled',
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $sessionEmail,
    'reschedule_reason' => $reason,
    'reschedule_history' => $existingHistory,
    'updated_at' => $timestamp,
    'updated_by' => $sessionEmail
];

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

AuditLogger::log(
    'CLIENT_RESCHEDULED_APPOINTMENT',
    "appointments:{$appointmentId}",
    [
        'appointment_id' => $appointmentId,
        'patient_email' => $sessionEmail,
        'new_date' => $newDate,
        'new_time' => $newTime
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Your appointment has been successfully rescheduled to {$newDate} at {$newTime}."
]);

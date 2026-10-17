<?php
/**
 * OptiDent System - Client Cancel Appointment API
 * Self-service appointment cancellation for patients
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
$reason = trim($input['reason'] ?? $input['cancellation_reason'] ?? 'Cancelled by patient via portal');

if (empty($appointmentId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID is required."]);
    exit;
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment not found."]);
    exit;
}

$sessionEmail = strtolower($_SESSION['email'] ?? '');
$sessionUserId = (string)($_SESSION['user_id'] ?? '');
$aptEmail = strtolower($apt['patient_email'] ?? '');
$aptPatientId = (string)($apt['patient_id'] ?? '');

if ($sessionEmail !== $aptEmail && $sessionUserId !== $aptPatientId) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Unauthorized. You may only cancel your own appointments."]);
    exit;
}

$timestamp = date('Y-m-d H:i:s');
$updateFields = [
    'status' => 'cancelled',
    'cancellation_reason' => $reason,
    'cancelled_at' => $timestamp,
    'cancelled_by' => $sessionEmail,
    'updated_at' => $timestamp,
    'updated_by' => $sessionEmail
];

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

AuditLogger::log(
    'CLIENT_CANCELLED_APPOINTMENT',
    "appointments:{$appointmentId}",
    [
        'appointment_id' => $appointmentId,
        'patient_email' => $sessionEmail,
        'reason' => $reason
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Your appointment has been successfully cancelled."
]);

<?php
/**
 * OptiDent System - Receptionist Cancel Appointment API
 * Allows front-desk receptionist to cancel scheduled appointments with reason tracking.
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
require_once __DIR__ . '/../config/auth_guard.php';

// Verify authorized session: receptionist, staff, super_admin, admin, doctor
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin', 'doctor'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Front-desk session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$reason = trim($input['reason'] ?? $input['cancellation_reason'] ?? 'Cancelled by front desk receptionist');

if (empty($appointmentId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID is required."]);
    exit;
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment record not found."]);
    exit;
}

$currentTimestamp = date('Y-m-d H:i:s');
$cancelledBy = $_SESSION['email'] ?? 'receptionist';

$updateFields = [
    'status' => 'cancelled',
    'cancellation_reason' => $reason,
    'cancelled_at' => $currentTimestamp,
    'cancelled_by' => $cancelledBy,
    'updated_at' => $currentTimestamp,
    'updated_by' => $cancelledBy
];

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

// Log audit event
AuditLogger::log(
    'APPOINTMENT_CANCELLED',
    "appointments:{$appointmentId}",
    [
        'appointment_id' => $appointmentId,
        'patient_name' => $apt['patient_name'] ?? 'Patient',
        'doctor_name' => $apt['doctor_name'] ?? 'Doctor',
        'appointment_date' => $apt['appointment_date'] ?? $apt['date'] ?? '',
        'time_slot' => $apt['time_slot'] ?? $apt['appointment_time'] ?? '',
        'reason' => $reason,
        'cancelled_by' => $cancelledBy
    ]
);

echo json_encode([
    "status" => "success",
    "message" => "Appointment for " . ($apt['patient_name'] ?? 'patient') . " has been successfully cancelled.",
    "appointment" => [
        "_id" => $appointmentId,
        "patient_name" => $apt['patient_name'] ?? '',
        "status" => "cancelled",
        "cancellation_reason" => $reason,
        "cancelled_at" => $currentTimestamp
    ]
]);

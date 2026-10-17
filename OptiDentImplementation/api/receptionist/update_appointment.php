<?php
/**
 * OptiDent System - Receptionist Update Appointment Details API
 * Task R-007: Manage appointment details (procedure, doctor, chair, notes)
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

// Verify authorized session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin', 'doctor'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Authorized session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');

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

$updateFields = [
    'updated_at' => date('Y-m-d H:i:s'),
    'updated_by' => $_SESSION['email'] ?? 'receptionist'
];

if (isset($input['doctor_name']) && trim($input['doctor_name']) !== '') {
    $updateFields['doctor_name'] = trim($input['doctor_name']);
}
if (isset($input['service_name']) && trim($input['service_name']) !== '') {
    $updateFields['service_name'] = trim($input['service_name']);
}
if (isset($input['operatory_chair']) && trim($input['operatory_chair']) !== '') {
    $updateFields['operatory_chair'] = trim($input['operatory_chair']);
}
if (isset($input['notes'])) {
    $updateFields['notes'] = trim($input['notes']);
}
if (isset($input['patient_phone']) && trim($input['patient_phone']) !== '') {
    $updateFields['patient_phone'] = trim($input['patient_phone']);
}

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

AuditLogger::log(
    'APPOINTMENT_DETAILS_UPDATED',
    "appointments:{$appointmentId}",
    [
        'patient_name' => $apt['patient_name'] ?? 'Patient',
        'updated_fields' => array_keys($updateFields),
        'updated_by' => $_SESSION['email'] ?? 'receptionist'
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Appointment details updated successfully."
]);

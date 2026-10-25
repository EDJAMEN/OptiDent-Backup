<?php
/**
 * OptiDent System - Receptionist Delete Appointment API
 * Allows front-desk receptionist to delete or remove appointment records from the schedule.
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

$appointmentIds = $input['appointment_ids'] ?? [];
if (!empty($input['appointment_id'])) {
    $appointmentIds[] = trim($input['appointment_id']);
}
$appointmentIds = array_unique(array_filter(array_map('trim', (array)$appointmentIds)));

if (empty($appointmentIds)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "At least one appointment ID is required."]);
    exit;
}

$currentTimestamp = date('Y-m-d H:i:s');
$deletedBy = $_SESSION['email'] ?? 'receptionist';
$deletedCount = 0;

$updateFields = [
    'is_deleted' => true,
    'deleted_at' => $currentTimestamp,
    'deleted_by' => $deletedBy,
    'status' => 'cancelled',
    'updated_at' => $currentTimestamp,
    'updated_by' => $deletedBy
];

foreach ($appointmentIds as $appointmentId) {
    $filter = ['_id' => $appointmentId];
    $apt = $db->findOne('appointments', $filter);
    if (!$apt && class_exists('MongoDB\BSON\ObjectId')) {
        try {
            $oid = new MongoDB\BSON\ObjectId($appointmentId);
            $apt = $db->findOne('appointments', ['_id' => $oid]);
            if ($apt) $filter = ['_id' => $oid];
        } catch (\Exception $e) {}
    }
    if (!$apt) continue;

    $db->updateOne('appointments', $filter, ['$set' => $updateFields]);
    $deletedCount++;

    AuditLogger::log(
        'APPOINTMENT_DELETED',
        "appointments:{$appointmentId}",
        [
            'appointment_id' => $appointmentId,
            'patient_name' => $apt['patient_name'] ?? 'Patient',
            'doctor_name' => $apt['doctor_name'] ?? 'Doctor',
            'appointment_date' => $apt['appointment_date'] ?? $apt['date'] ?? '',
            'deleted_by' => $deletedBy
        ]
    );
}

echo json_encode([
    "status" => "success",
    "message" => "{$deletedCount} appointment record(s) have been successfully deleted.",
    "deleted_count" => $deletedCount
]);
exit;

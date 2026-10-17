<?php
/**
 * OptiDent System - Receptionist Appointment Status Update API
 * Allows front-desk receptionist to check in patients, update waiting status, etc.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$newStatus = trim($input['status'] ?? '');

$allowedStatuses = ['scheduled', 'checked_in', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'];
if (empty($appointmentId) || !in_array($newStatus, $allowedStatuses)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid appointment ID or status value."]);
    exit;
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment not found."]);
    exit;
}

$todayDate = date('Y-m-d');
$updateFields = [
    'status' => $newStatus,
    'updated_at' => date('Y-m-d H:i:s'),
    'updated_by' => $_SESSION['email'] ?? 'receptionist'
];

if (!empty($input['operatory_chair'])) {
    $updateFields['operatory_chair'] = trim($input['operatory_chair']);
}
if (!empty($input['doctor_name'])) {
    $updateFields['doctor_name'] = trim($input['doctor_name']);
}
if (!empty($input['queue_priority'])) {
    $updateFields['queue_priority'] = strtolower(trim($input['queue_priority']));
}

if ($newStatus === 'checked_in' || $newStatus === 'waiting') {
    if (empty($apt['checked_in_at'])) {
        $updateFields['checked_in_at'] = date('Y-m-d H:i:s');
    }
    // Generate daily queue number if patient doesn't have one
    if (empty($apt['queue_number'])) {
        $todayAppts = $db->find('appointments', ['appointment_date' => $todayDate]);
        $updateFields['queue_number'] = sprintf("Q-%03d", count($todayAppts) + 1);
    }
    if (empty($apt['queue_order'])) {
        $waitingAppts = $db->find('appointments', [
            'appointment_date' => $todayDate,
            'status' => ['$in' => ['checked_in', 'waiting']]
        ]);
        $updateFields['queue_order'] = count($waitingAppts) + 1;
    }
} elseif ($newStatus === 'in_progress') {
    if (empty($apt['in_chair_at'])) {
        $updateFields['in_chair_at'] = date('Y-m-d H:i:s');
    }
} elseif ($newStatus === 'completed') {
    $updateFields['completed_at'] = date('Y-m-d H:i:s');
} elseif ($newStatus === 'cancelled' || $newStatus === 'no_show') {
    $updateFields['cancelled_at'] = date('Y-m-d H:i:s');
    $updateFields['cancelled_by'] = $_SESSION['email'] ?? 'receptionist';
    $updateFields['cancellation_reason'] = trim($input['reason'] ?? $input['cancellation_reason'] ?? 'Cancelled by receptionist');
}

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

// Audit logging
AuditLogger::log(
    'APPOINTMENT_STATUS_UPDATED',
    "appointments:{$appointmentId}",
    [
        'previous_status' => $apt['status'] ?? 'unknown',
        'new_status' => $newStatus,
        'patient_name' => $apt['patient_name'] ?? '',
        'receptionist' => $_SESSION['email'] ?? 'receptionist'
    ]
);

echo json_encode([
    "status" => "success",
    "message" => "Appointment status successfully updated to " . ucfirst(str_replace('_', ' ', $newStatus)) . ".",
    "appointment_id" => $appointmentId,
    "new_status" => $newStatus
]);

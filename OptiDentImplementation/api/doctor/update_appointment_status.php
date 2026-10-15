<?php
/**
 * OptiDent System - Doctor Appointment Status & Clinical Charting API
 * Allows healthcare providers to update consultation progress and save dental notes
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

$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Doctor session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$rawStatus = strtolower(trim($input['status'] ?? ''));
$statusAliases = [
    'pending' => 'scheduled',
    'waiting' => 'scheduled',
    'ongoing' => 'in_progress',
    'in_progress' => 'in_progress',
    'completed' => 'completed',
    'cancelled' => 'cancelled'
];
$newStatus = $statusAliases[$rawStatus] ?? $rawStatus;

$diagnosis = trim($input['diagnosis'] ?? '');
$teethSelected = $input['teeth_selected'] ?? [];
$procedureNotes = trim($input['procedure_notes'] ?? '');
$prescription = trim($input['prescription'] ?? '');
$followUpDate = trim($input['follow_up_date'] ?? '');
$cancellationReason = trim($input['cancellation_reason'] ?? ($input['reason'] ?? ''));

if (empty($appointmentId) || empty($newStatus)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID and target status are required."]);
    exit;
}

$allowedStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'];
if (!in_array($newStatus, $allowedStatuses)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid status: {$newStatus}"]);
    exit;
}

// 1. Locate appointment
$appointment = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$appointment) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment not found."]);
    exit;
}

// 2. Prepare update payload
$updateData = [
    'status' => $newStatus,
    'last_updated_at' => date('Y-m-d H:i:s'),
    'updated_by_doctor' => $userEmail
];

if ($newStatus === 'in_progress') {
    $updateData['consultation_started_at'] = date('Y-m-d H:i:s');
} else if ($newStatus === 'completed') {
    $updateData['completed_at'] = date('Y-m-d H:i:s');
    if (!empty($diagnosis)) $updateData['diagnosis'] = $diagnosis;
    if (!empty($teethSelected)) $updateData['teeth_selected'] = is_array($teethSelected) ? $teethSelected : explode(',', $teethSelected);
    if (!empty($procedureNotes)) $updateData['procedure_notes'] = $procedureNotes;
    if (!empty($prescription)) $updateData['prescription'] = $prescription;
    if (!empty($followUpDate)) $updateData['follow_up_date'] = $followUpDate;
} else if ($newStatus === 'cancelled') {
    $updateData['cancelled_at'] = date('Y-m-d H:i:s');
    $updateData['cancelled_by'] = $userEmail;
    $updateData['cancellation_reason'] = !empty($cancellationReason) ? $cancellationReason : 'Cancelled by Doctor';
}

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateData]);

// 3. Log Audit Trail
AuditLogger::log(
    'DOCTOR_CLINICAL_UPDATE',
    "appointments:{$appointmentId}",
    [
        'doctor' => $userEmail,
        'patient' => $appointment['patient_name'] ?? 'N/A',
        'service' => $appointment['service_name'] ?? 'N/A',
        'status_transition' => "{$appointment['status']} -> {$newStatus}",
        'diagnosis' => $diagnosis ?: ($appointment['diagnosis'] ?? 'N/A')
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Appointment successfully marked as " . strtoupper(str_replace('_', ' ', $newStatus)) . "!",
    "appointment_id" => $appointmentId,
    "new_status" => $newStatus
]);

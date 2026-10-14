<?php
/**
 * OptiDent System - Delete Clinical Record History API
 * Task D-004: Allows doctors to prune or remove historical revisions / old notes
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
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
    echo json_encode(["status" => "error", "message" => "Unauthorized. Doctor access required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$targetIndex = $input['history_index'] ?? null;

if (empty($appointmentId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID is required."]);
    exit;
}

$appointment = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$appointment) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Clinical record not found."]);
    exit;
}

$history = $appointment['edit_history'] ?? [];
$updateSet = [
    'last_updated_at' => date('Y-m-d H:i:s')
];

if ($targetIndex === 'all') {
    $history = [];
    $updateSet['edit_history'] = [];
} elseif ($targetIndex === 'original_details' || $targetIndex === 'current_details') {
    $updateSet['diagnosis'] = 'Standard procedure';
    $updateSet['procedure_notes'] = '';
    $updateSet['prescription'] = '';
    $updateSet['post_op_instructions'] = '';
    $updateSet['teeth_selected'] = [];
    $updateSet['tooth_surfaces'] = [];
} elseif ($targetIndex === 'wipe_everything') {
    $updateSet['diagnosis'] = 'Standard procedure';
    $updateSet['procedure_notes'] = '';
    $updateSet['prescription'] = '';
    $updateSet['post_op_instructions'] = '';
    $updateSet['teeth_selected'] = [];
    $updateSet['tooth_surfaces'] = [];
    $updateSet['edit_history'] = [];
} elseif (is_numeric($targetIndex)) {
    $idx = (int)$targetIndex;
    if (isset($history[$idx])) {
        array_splice($history, $idx, 1);
    }
    $updateSet['edit_history'] = array_values($history);
}

$db->updateOne('appointments', ['_id' => $appointmentId], [
    '$set' => $updateSet
]);

AuditLogger::log(
    'CLINICAL_HISTORY_DELETED',
    "appointments:{$appointmentId}",
    [
        'doctor' => $userEmail,
        'patient' => $appointment['patient_name'] ?? 'N/A',
        'target' => $targetIndex === 'all' ? 'all_revisions' : "index_{$targetIndex}"
    ]
);

echo json_encode([
    "status" => "success",
    "message" => "Historical record deleted successfully.",
    "remaining_history_count" => count($history)
]);

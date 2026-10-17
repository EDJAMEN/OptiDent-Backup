<?php
/**
 * OptiDent System - Receptionist Queue Reordering & Organization API
 * Task R-006: Manage the order and priority of patients waiting for service
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

// Session verification
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$appointmentId = trim($input['appointment_id'] ?? '');
$action = strtolower(trim($input['action'] ?? 'reorder')); // move_up, move_down, set_priority, transfer_chair
$direction = strtolower(trim($input['direction'] ?? ''));
$priority = strtolower(trim($input['priority'] ?? ''));
$operatoryChair = trim($input['operatory_chair'] ?? '');
$doctorName = trim($input['doctor_name'] ?? '');

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

$todayDate = date('Y-m-d');
$aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);

// Fetch all today's active waiting queue items
$rawTodayAppts = $db->find('appointments', [
    'appointment_date' => $todayDate,
    'is_deleted' => ['$ne' => true],
    'is_archived' => ['$ne' => true]
]);

// Filter down to patients currently in waiting lobby or checked-in
$waitingList = array_values(array_filter($rawTodayAppts, function($a) {
    $st = strtolower($a['status'] ?? 'scheduled');
    return in_array($st, ['checked_in', 'waiting']);
}));

// Sort waiting list by current queue order
usort($waitingList, function($a, $b) {
    // 1. Priority weight
    $pWeights = ['emergency' => -100, 'urgent' => -50, 'senior' => -40, 'pwd' => -40, 'normal' => 0];
    $pA = $pWeights[strtolower($a['queue_priority'] ?? 'normal')] ?? 0;
    $pB = $pWeights[strtolower($b['queue_priority'] ?? 'normal')] ?? 0;
    if ($pA !== $pB) return $pA - $pB;

    // 2. Explicit queue_order
    $oA = isset($a['queue_order']) ? (int)$a['queue_order'] : 999;
    $oB = isset($b['queue_order']) ? (int)$b['queue_order'] : 999;
    if ($oA !== $oB) return $oA - $oB;

    // 3. Time
    $tA = $a['checked_in_at'] ?? $a['time_slot'] ?? '';
    $tB = $b['checked_in_at'] ?? $b['time_slot'] ?? '';
    return strcmp($tA, $tB);
});

// Normalize queue_order for all waiting items (1, 2, 3...)
foreach ($waitingList as $idx => $w) {
    $expectedOrder = $idx + 1;
    if (($w['queue_order'] ?? null) !== $expectedOrder) {
        $db->updateOne('appointments', ['_id' => (string)$w['_id']], ['$set' => ['queue_order' => $expectedOrder]]);
        $waitingList[$idx]['queue_order'] = $expectedOrder;
    }
}

// Locate target appointment index
$targetIndex = -1;
foreach ($waitingList as $idx => $w) {
    if ((string)$w['_id'] === $appointmentId) {
        $targetIndex = $idx;
        break;
    }
}

$updatedFields = ['updated_at' => date('Y-m-d H:i:s'), 'updated_by' => $_SESSION['email'] ?? 'receptionist'];

if ($action === 'move_up' || $direction === 'up') {
    if ($targetIndex <= 0) {
        echo json_encode(["status" => "info", "message" => "Patient is already at the top of the waiting queue."]);
        exit;
    }
    // Swap with previous item
    $prevApt = $waitingList[$targetIndex - 1];
    $currentOrder = $waitingList[$targetIndex]['queue_order'];
    $prevOrder = $prevApt['queue_order'];

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => ['queue_order' => $prevOrder, 'updated_at' => date('Y-m-d H:i:s')]]);
    $db->updateOne('appointments', ['_id' => (string)$prevApt['_id']], ['$set' => ['queue_order' => $currentOrder, 'updated_at' => date('Y-m-d H:i:s')]]);

    AuditLogger::log('QUEUE_REORDERED', "appointments:{$appointmentId}", [
        'patient' => $apt['patient_name'] ?? 'Patient',
        'moved' => 'up',
        'swapped_with' => $prevApt['patient_name'] ?? 'Other'
    ]);

    echo json_encode(["status" => "success", "message" => "Moved {$apt['patient_name']} up in queue position."]);
    exit;

} elseif ($action === 'move_down' || $direction === 'down') {
    if ($targetIndex === -1 || $targetIndex >= count($waitingList) - 1) {
        echo json_encode(["status" => "info", "message" => "Patient is already at the end of the waiting queue."]);
        exit;
    }
    // Swap with next item
    $nextApt = $waitingList[$targetIndex + 1];
    $currentOrder = $waitingList[$targetIndex]['queue_order'];
    $nextOrder = $nextApt['queue_order'];

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => ['queue_order' => $nextOrder, 'updated_at' => date('Y-m-d H:i:s')]]);
    $db->updateOne('appointments', ['_id' => (string)$nextApt['_id']], ['$set' => ['queue_order' => $currentOrder, 'updated_at' => date('Y-m-d H:i:s')]]);

    AuditLogger::log('QUEUE_REORDERED', "appointments:{$appointmentId}", [
        'patient' => $apt['patient_name'] ?? 'Patient',
        'moved' => 'down',
        'swapped_with' => $nextApt['patient_name'] ?? 'Other'
    ]);

    echo json_encode(["status" => "success", "message" => "Moved {$apt['patient_name']} down in queue position."]);
    exit;

} elseif ($action === 'set_priority' || !empty($priority)) {
    $validPriorities = ['emergency', 'urgent', 'senior', 'pwd', 'normal'];
    if (!in_array($priority, $validPriorities)) {
        $priority = 'normal';
    }

    $updatedFields['queue_priority'] = $priority;
    if ($priority === 'emergency') {
        $updatedFields['queue_order'] = 1; // Float to top
    }

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updatedFields]);

    AuditLogger::log('QUEUE_PRIORITY_UPDATED', "appointments:{$appointmentId}", [
        'patient' => $apt['patient_name'] ?? 'Patient',
        'new_priority' => $priority
    ]);

    echo json_encode(["status" => "success", "message" => "Queue priority for {$apt['patient_name']} updated to " . strtoupper($priority) . "."]);
    exit;

} elseif ($action === 'transfer_chair' || !empty($operatoryChair)) {
    $updatedFields['operatory_chair'] = $operatoryChair;
    if (!empty($doctorName)) {
        $updatedFields['doctor_name'] = $doctorName;
    }

    $db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updatedFields]);

    AuditLogger::log('OPERATORY_STATION_ASSIGNED', "appointments:{$appointmentId}", [
        'patient' => $apt['patient_name'] ?? 'Patient',
        'operatory_chair' => $operatoryChair,
        'doctor' => $doctorName ?: ($apt['doctor_name'] ?? '')
    ]);

    echo json_encode(["status" => "success", "message" => "{$apt['patient_name']} reassigned to {$operatoryChair}."]);
    exit;

} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Unsupported queue management action."]);
    exit;
}

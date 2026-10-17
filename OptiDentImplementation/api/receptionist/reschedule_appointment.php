<?php
/**
 * OptiDent System - Receptionist Reschedule Appointment API
 * Task R-007: Appointment Management (Create, Reschedule, Manage)
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
$newDate = trim($input['appointment_date'] ?? $input['date'] ?? $input['new_date'] ?? '');
$newTime = trim($input['time_slot'] ?? $input['time'] ?? $input['new_time'] ?? '');
$doctorName = trim($input['doctor_name'] ?? '');
$serviceName = trim($input['service_name'] ?? '');
$operatoryChair = trim($input['operatory_chair'] ?? '');
$reason = trim($input['reason'] ?? $input['reschedule_reason'] ?? 'Patient requested schedule adjustment');

if (empty($appointmentId)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Appointment ID is required."]);
    exit;
}

if (empty($newDate) || empty($newTime)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "New appointment date and time slot are required."]);
    exit;
}

// Validate date is not in the past
$today = date('Y-m-d');
if ($newDate < $today) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Cannot reschedule appointments to past dates."]);
    exit;
}

$apt = $db->findOne('appointments', ['_id' => $appointmentId]);
if (!$apt) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Appointment record not found."]);
    exit;
}

$previousDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
$previousTime = $apt['time_slot'] ?? $apt['appointment_time'] ?? '09:00 AM';
$previousDoctor = $apt['doctor_name'] ?? 'Assigned Doctor';
$patientName = $apt['patient_name'] ?? 'Patient';

$timestamp = date('Y-m-d H:i:s');
$rescheduledBy = $_SESSION['email'] ?? 'receptionist';

// Prepare update payload
$finalDoctor = !empty($doctorName) ? $doctorName : $previousDoctor;
$finalChair = !empty($operatoryChair) ? $operatoryChair : ($apt['operatory_chair'] ?? 'Operatory Chair 1');
$finalService = !empty($serviceName) ? $serviceName : ($apt['service_name'] ?? 'Dental Consultation');

$historyEntry = [
    'from_date' => $previousDate,
    'from_time' => $previousTime,
    'to_date' => $newDate,
    'to_time' => $newTime,
    'from_doctor' => $previousDoctor,
    'to_doctor' => $finalDoctor,
    'reason' => $reason,
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $rescheduledBy
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
    'operatory_chair' => $finalChair,
    'service_name' => $finalService,
    'status' => 'scheduled', // Reset to scheduled for the new date
    'rescheduled_at' => $timestamp,
    'rescheduled_by' => $rescheduledBy,
    'reschedule_reason' => $reason,
    'reschedule_history' => $existingHistory,
    'updated_at' => $timestamp,
    'updated_by' => $rescheduledBy,
    // Clear previous cancellation flags if reviving a cancelled booking
    'cancellation_reason' => null,
    'cancelled_at' => null,
    'cancelled_by' => null
];

// If previously in today's active queue but moved to a future date, clear today queue numbers
if ($previousDate === $today && $newDate > $today) {
    $updateFields['queue_number'] = null;
    $updateFields['queue_order'] = null;
    $updateFields['checked_in_at'] = null;
    $updateFields['in_chair_at'] = null;
}

$db->updateOne('appointments', ['_id' => $appointmentId], ['$set' => $updateFields]);

// Audit logging
AuditLogger::log(
    'APPOINTMENT_RESCHEDULED',
    "appointments:{$appointmentId}",
    [
        'patient_name' => $patientName,
        'from_date' => $previousDate,
        'from_time' => $previousTime,
        'to_date' => $newDate,
        'to_time' => $newTime,
        'doctor' => $finalDoctor,
        'reason' => $reason,
        'rescheduled_by' => $rescheduledBy
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Appointment for {$patientName} successfully rescheduled to {$newDate} at {$newTime}.",
    "appointment" => [
        "_id" => $appointmentId,
        "patient_name" => $patientName,
        "appointment_date" => $newDate,
        "time_slot" => $newTime,
        "doctor_name" => $finalDoctor,
        "operatory_chair" => $finalChair,
        "status" => "scheduled"
    ]
]);

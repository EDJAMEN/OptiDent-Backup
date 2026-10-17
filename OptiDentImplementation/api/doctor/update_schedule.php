<?php
/**
 * OptiDent System - Doctor Schedule & Availability Management API (D-006)
 * Allows healthcare providers to define working days, duty hours, lunch breaks, and active booking slots
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
require_once __DIR__ . '/../config/clinic_hours_helper.php';

$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Doctor session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$targetEmail = $userEmail;
if (!empty($input['doctor_email'])) {
    $targetEmail = trim($input['doctor_email']);
} elseif (!empty($input['email'])) {
    $targetEmail = trim($input['email']);
}

$targetId = $input['doctor_id'] ?? $input['id'] ?? '';
$targetName = trim($input['doctor_name'] ?? '');

// Identify target doctor document portably
$doctorUser = null;
if (!empty($targetId)) {
    $doctorUser = $db->findOne('users', ['_id' => (string)$targetId]);
}

if (!$doctorUser && !empty($_SESSION['user_id']) && $userRole === 'doctor') {
    $doctorUser = $db->findOne('users', ['_id' => (string)$_SESSION['user_id']]);
}

if (!$doctorUser && !empty($targetEmail)) {
    $doctorUser = $db->findOne('users', ['email' => $targetEmail]);
}

// Case-insensitive matching across doctors
if (!$doctorUser) {
    $allDocs = $db->find('users', ['role' => 'doctor']);
    foreach ($allDocs as $d) {
        if (!empty($targetEmail) && strcasecmp($d['email'] ?? '', $targetEmail) === 0) {
            $doctorUser = $d;
            break;
        }
        if (!empty($targetName) && strcasecmp($d['full_name'] ?? '', $targetName) === 0) {
            $doctorUser = $d;
            break;
        }
        if (!empty($userEmail) && strcasecmp($d['email'] ?? '', $userEmail) === 0) {
            $doctorUser = $d;
            break;
        }
    }
}

if (!$doctorUser) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Doctor record not found for availability update."]);
    exit;
}

$workingDays = trim($input['working_days'] ?? 'Mon - Fri');
$openingTime = trim($input['opening_time'] ?? '08:00 AM');
$closingTime = trim($input['closing_time'] ?? '05:00 PM');
$timezone    = trim($input['timezone'] ?? 'Asia/Manila');

// Standardize time strings to hh:mm A (e.g. 7:00 AM -> 07:00 AM)
$sTime = strtotime("2026-01-01 " . $openingTime);
$eTime = strtotime("2026-01-01 " . $closingTime);
if ($sTime) $openingTime = date('h:i A', $sTime);
if ($eTime) $closingTime = date('h:i A', $eTime);

$lunchBreak = true;
if (isset($input['lunch_break'])) {
    $lb = $input['lunch_break'];
    $lunchBreak = ($lb === true || $lb === 'yes' || $lb === 'true' || $lb === 1 || $lb === '1');
}

// Generate dynamic appointment time slots for this doctor
$timeSlots = ClinicHoursHelper::generateSlots($openingTime, $closingTime, $lunchBreak);
$compiledSchedule = "{$workingDays} ({$openingTime} - {$closingTime})";

$updateFields = [
    'working_days'  => $workingDays,
    'opening_time'  => $openingTime,
    'closing_time'  => $closingTime,
    'lunch_break'   => $lunchBreak,
    'time_slots'    => array_values($timeSlots),
    'timezone'      => $timezone,
    'schedule_days' => $compiledSchedule,
    'updated_at'    => date('Y-m-d H:i:s')
];

// Update by primary _id
$db->updateOne('users', ['_id' => $doctorUser['_id']], ['$set' => $updateFields]);

$effectiveEmail = $doctorUser['email'] ?? $targetEmail;

// Log schedule modification in Audit Trail
AuditLogger::log(
    'DOCTOR_SCHEDULE_UPDATE',
    "users:{$effectiveEmail}",
    [
        'doctor_id'     => (string)$doctorUser['_id'],
        'doctor'        => $effectiveEmail,
        'schedule_days' => $compiledSchedule,
        'slots_count'   => count($timeSlots),
        'lunch_break'   => $lunchBreak ? 'EXCLUDED' : 'CONTINUOUS'
    ]
);

$mergedDoctor = array_merge($doctorUser, $updateFields);
$mergedDoctor['id'] = (string)$doctorUser['_id'];
$mergedDoctor['_id'] = (string)$doctorUser['_id'];

http_response_code(200);
echo json_encode([
    "status"   => "success",
    "message"  => "Doctor working hours and appointment availability successfully updated!",
    "schedule" => $updateFields,
    "doctor"   => $mergedDoctor
]);

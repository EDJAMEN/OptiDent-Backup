<?php
/**
 * OptiDent System - Doctor Profile & Availability Update API
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
    echo json_encode(["status" => "error", "message" => "Unauthorized."]);
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
    echo json_encode(["status" => "error", "message" => "Doctor user profile not found."]);
    exit;
}

$phone = trim($input['phone'] ?? '');
$specialization = trim($input['specialization'] ?? '');
$scheduleDays = trim($input['schedule_days'] ?? '');
$bio = trim($input['bio'] ?? '');

$update = [];
if (!empty($phone)) $update['phone'] = $phone;
if (!empty($specialization)) $update['specialization'] = $specialization;
if (!empty($bio)) $update['bio'] = $bio;

if (!empty($scheduleDays)) {
    $update['schedule_days'] = $scheduleDays;

    // Parse working days, opening time, closing time, and generate slots
    // Handles: "Mon - Fri (09:00 AM - 05:00 PM)", "Mon - Fri 09:00 AM - 05:00 PM", "Mon - Fri, 09:00 AM - 05:00 PM"
    $matched = false;
    if (preg_match('/^(.*?)\s*[\(,]\s*(.*?)\s*-\s*(.*?)\s*[\)]?$/i', $scheduleDays, $m)) {
        $parsedDays = trim($m[1]);
        $sTime = strtotime("2026-01-01 " . trim($m[2]));
        $eTime = strtotime("2026-01-01 " . trim($m[3]));
        if ($sTime && $eTime) {
            $parsedOpening = date('h:i A', $sTime);
            $parsedClosing = date('h:i A', $eTime);
            $update['working_days'] = !empty($parsedDays) ? $parsedDays : ($doctorUser['working_days'] ?? 'Mon - Fri');
            $update['opening_time'] = $parsedOpening;
            $update['closing_time'] = $parsedClosing;
            $update['schedule_days'] = "{$update['working_days']} ({$parsedOpening} - {$parsedClosing})";
            $update['time_slots'] = ClinicHoursHelper::generateSlots($parsedOpening, $parsedClosing, true);
            $matched = true;
        }
    }

    if (!$matched && preg_match('/^(.*?)\s*-\s*(.*?)$/i', $scheduleDays, $m)) {
        $sTime = strtotime("2026-01-01 " . trim($m[1]));
        $eTime = strtotime("2026-01-01 " . trim($m[2]));
        if ($sTime && $eTime) {
            $parsedOpening = date('h:i A', $sTime);
            $parsedClosing = date('h:i A', $eTime);
            $update['working_days'] = $doctorUser['working_days'] ?? 'Mon - Fri';
            $update['opening_time'] = $parsedOpening;
            $update['closing_time'] = $parsedClosing;
            $update['schedule_days'] = "{$update['working_days']} ({$parsedOpening} - {$parsedClosing})";
            $update['time_slots'] = ClinicHoursHelper::generateSlots($parsedOpening, $parsedClosing, true);
        }
    }
}

if (empty($update)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "No profile update fields provided."]);
    exit;
}

$update['updated_at'] = date('Y-m-d H:i:s');

$db->updateOne('users', ['_id' => $doctorUser['_id']], ['$set' => $update]);

$effectiveEmail = $doctorUser['email'] ?? $targetEmail;
AuditLogger::log('DOCTOR_PROFILE_UPDATED', "users:{$effectiveEmail}", $update);

$mergedDoctor = array_merge($doctorUser, $update);
$mergedDoctor['id'] = (string)$doctorUser['_id'];
$mergedDoctor['_id'] = (string)$doctorUser['_id'];

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Doctor profile & availability updated successfully!",
    "doctor" => $mergedDoctor
]);

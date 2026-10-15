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
    if (preg_match('/^(.*?)\s*\(\s*(.*?)\s*-\s*(.*?)\s*\)$/i', $scheduleDays, $m)) {
        $parsedDays = trim($m[1]);
        $sTime = strtotime("2026-01-01 " . trim($m[2]));
        $eTime = strtotime("2026-01-01 " . trim($m[3]));
        if ($sTime && $eTime) {
            $parsedOpening = date('h:i A', $sTime);
            $parsedClosing = date('h:i A', $eTime);
            $update['working_days'] = !empty($parsedDays) ? $parsedDays : 'Mon - Fri';
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

$db->updateOne('users', ['email' => $targetEmail], ['$set' => $update]);

AuditLogger::log('DOCTOR_PROFILE_UPDATED', "users:{$targetEmail}", $update);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Doctor profile & availability updated successfully!",
    "doctor" => $update
]);

<?php
/**
 * OptiDent System - Receptionist Change Password API
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

$currentPass = trim($input['current_password'] ?? '');
$newPass = trim($input['new_password'] ?? '');
$phone = trim($input['phone'] ?? '');

$email = $_SESSION['email'] ?? '';
$user = $db->findOne('users', ['email' => $email]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User account not found."]);
    exit;
}

$updateFields = [];

if (!empty($newPass)) {
    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "New password must be at least 6 characters."]);
        exit;
    }

    if (!empty($user['password_hash']) && !password_verify($currentPass, $user['password_hash']) && $currentPass !== $user['password_hash']) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Current password does not match our records."]);
        exit;
    }

    $updateFields['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT);
}

if (!empty($phone)) {
    $updateFields['phone'] = $phone;
}

if (!empty($updateFields)) {
    $updateFields['updated_at'] = date('Y-m-d H:i:s');
    $db->updateOne('users', ['email' => $email], ['$set' => $updateFields]);

    AuditLogger::log(
        'RECEPTIONIST_PROFILE_UPDATED',
        "users:{$email}",
        ['password_changed' => !empty($newPass), 'phone_updated' => !empty($phone)]
    );
}

echo json_encode([
    "status" => "success",
    "message" => "Profile successfully updated."
]);

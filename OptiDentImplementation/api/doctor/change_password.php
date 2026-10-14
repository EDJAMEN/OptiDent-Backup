<?php
/**
 * OptiDent System - Doctor Change Password API (D-005)
 * Verifies current password, then updates to a new bcrypt hash.
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
$userRole  = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized. Please log in."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$currentPassword = trim($input['current_password'] ?? '');
$newPassword     = trim($input['new_password']     ?? '');

if (empty($currentPassword) || empty($newPassword)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Both current and new password are required."]);
    exit;
}

if (strlen($newPassword) < 8) {
    http_response_code(422);
    echo json_encode(["status" => "error", "message" => "New password must be at least 8 characters."]);
    exit;
}

// Fetch current user record
$user = $db->findOne('users', ['email' => $userEmail]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User account not found."]);
    exit;
}

// Verify current password (bcrypt or legacy plaintext)
$stored = $user['password_hash'] ?? '';
$valid  = password_verify($currentPassword, $stored) || ($currentPassword === $stored);

if (!$valid) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Current password is incorrect."]);
    exit;
}

// Hash and save new password
$newHash = password_hash($newPassword, PASSWORD_BCRYPT);
$db->updateOne('users', ['email' => $userEmail], ['$set' => [
    'password_hash' => $newHash,
    'updated_at'    => date('Y-m-d H:i:s')
]]);

AuditLogger::log('DOCTOR_PASSWORD_CHANGED', "users:{$userEmail}", ['email' => $userEmail]);

http_response_code(200);
echo json_encode([
    "status"  => "success",
    "message" => "Password updated successfully. Please use your new password on next login."
]);

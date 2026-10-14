<?php
/**
 * OptiDent System - Soft Delete User Endpoint
 * Task SA-006: Soft Delete & Data Recovery Vault System
 * Deactivates and soft-deletes a user account without permanent loss
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

$db = MongoDBConnection::getInstance();

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied. Only Super Admin can delete user accounts."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$email = strtolower(trim($input['email'] ?? ''));

if (empty($email)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Email identifier is required."]);
    exit;
}

// 1. Safeguard: Prevent deleting own account
if ($email === strtolower($_SESSION['email'] ?? '')) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Security Safeguard: You cannot delete your own active Super Admin account!"]);
    exit;
}

$user = $db->findOne('users', ['email' => $email]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User account not found."]);
    exit;
}

// 2. Safeguard: Prevent deleting master admin
if (!empty($user['is_master']) && $user['is_master'] === true) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Protected Account: The primary Master Super Admin cannot be deleted."]);
    exit;
}

// 3. Perform Soft Delete
$softDeleteData = [
    'is_deleted'     => true,
    'deleted_at'     => date('Y-m-d H:i:s'),
    'deleted_by'     => $_SESSION['email'] ?? 'super_admin',
    'status'         => 'deleted',
    'is_active'      => false,
    'deleted_reason' => trim($input['reason'] ?? 'Deactivated by Super Admin')
];

$db->updateOne('users', ['email' => $email], ['$set' => $softDeleteData]);

// Log Audit Trail Event
AuditLogger::log('USER_SOFT_DELETE', "user:{$email}", [
    'user_name' => $user['full_name'] ?? '',
    'user_role' => $user['role'] ?? '',
    'reason'    => $softDeleteData['deleted_reason']
]);

echo json_encode([
    "status"  => "success",
    "message" => "User account for {$user['full_name']} ({$email}) was soft-deleted and moved to the Data Recovery Vault."
]);

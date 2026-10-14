<?php
/**
 * OptiDent System - Quick Toggle User Status Endpoint
 * Task SA-003: Activate or Suspend Account
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

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input)
    $input = $_POST;

$email = strtolower(trim($input['email'] ?? ''));

if (empty($email)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Email is required."]);
    exit;
}

// Prevent suspending oneself
if ($email === strtolower($_SESSION['email'] ?? '')) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "You cannot suspend your own Super Admin account!"]);
    exit;
}

$user = $db->findOne('users', ['email' => $email]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User not found."]);
    exit;
}

$currentStatus = $user['status'] ?? 'active';
$newStatus = ($currentStatus === 'active') ? 'suspended' : 'active';

$db->updateOne('users', ['email' => $email], [
    '$set' => [
        'status' => $newStatus,
        'is_active' => ($newStatus === 'active'),
        'status_updated_at' => date('Y-m-d H:i:s')
    ]
]);

echo json_encode([
    "status" => "success",
    "message" => "User {$email} is now " . strtoupper($newStatus) . ".",
    "new_status" => $newStatus
]);

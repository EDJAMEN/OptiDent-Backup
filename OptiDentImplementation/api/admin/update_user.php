<?php
/**
 * OptiDent System - Update User Endpoint
 * Task SA-003: Multi-User Management - Admin Edits Account Details
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
    echo json_encode(["status" => "error", "message" => "Access denied. Only Super Admin can update user accounts."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input)
    $input = $_POST;

$email = strtolower(trim($input['email'] ?? ''));
if (empty($email)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "User email identifier is required."]);
    exit;
}

$user = $db->findOne('users', ['email' => $email]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User account not found."]);
    exit;
}

// Build update array
$updateFields = [];

if (isset($input['full_name']) && !empty(trim($input['full_name']))) {
    $updateFields['full_name'] = trim($input['full_name']);
}

if (isset($input['phone'])) {
    $updateFields['phone'] = trim($input['phone']);
}

if (isset($input['role']) && !empty(trim($input['role']))) {
    $r = strtolower(trim($input['role']));
    if ($r === 'client')
        $r = 'patient';
    if (in_array($r, ['super_admin', 'doctor', 'receptionist', 'patient'])) {
        $updateFields['role'] = $r;
    }
}

if (isset($input['status']) && !empty(trim($input['status']))) {
    $st = strtolower(trim($input['status']));
    if (in_array($st, ['active', 'suspended', 'pending'])) {
        $updateFields['status'] = $st;
        $updateFields['is_active'] = ($st === 'active');
    }
}

if (isset($input['professional_id'])) {
    $updateFields['professional_id'] = trim($input['professional_id']);
}

if (!empty($input['password'])) {
    $updateFields['password_hash'] = password_hash(trim($input['password']), PASSWORD_BCRYPT);
}

if (empty($updateFields)) {
    echo json_encode(["status" => "info", "message" => "No changes provided."]);
    exit;
}

$updateFields['updated_at'] = date('Y-m-d H:i:s');

$db->updateOne('users', ['email' => $email], ['$set' => $updateFields]);

echo json_encode([
    "status" => "success",
    "message" => "User account for {$email} updated successfully!",
    "updated_fields" => array_keys($updateFields)
]);

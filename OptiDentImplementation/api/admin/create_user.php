<?php
/**
 * OptiDent System - Create User Account Endpoint
 * Task SA-003: Multi-User Management - Admin Creates Account
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
    echo json_encode(["status" => "error", "message" => "Access denied. Only Super Admin can create user accounts."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input)
    $input = $_POST;

$fullName = trim($input['full_name'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$phone = trim($input['phone'] ?? '');
$password = trim($input['password'] ?? '');
$role = strtolower(trim($input['role'] ?? 'patient'));
$status = strtolower(trim($input['status'] ?? 'active'));
$professionalId = trim($input['professional_id'] ?? '');

if (empty($fullName) || empty($email) || empty($password)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Name, email, and password are required."]);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid email format."]);
    exit;
}

// Map role
if ($role === 'client')
    $role = 'patient';
if (!in_array($role, ['super_admin', 'doctor', 'receptionist', 'patient'])) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid user role selected."]);
    exit;
}

// Check duplicate email
$existing = $db->findOne('users', ['email' => $email]);
if ($existing) {
    http_response_code(409);
    echo json_encode(["status" => "error", "message" => "An account with email {$email} already exists."]);
    exit;
}

// Position mapping
$position = 'Client / Patient';
if ($role === 'super_admin')
    $position = 'Super Admin Officer';
else if ($role === 'doctor')
    $position = 'Dental Surgeon / Dentist';
else if ($role === 'receptionist')
    $position = 'Clinic Receptionist';

$userDoc = [
    "full_name" => $fullName,
    "email" => $email,
    "phone" => $phone,
    "password_hash" => password_hash($password, PASSWORD_BCRYPT),
    "role" => $role,
    "status" => $status,
    "is_master" => $role === 'super_admin',
    "is_active" => $status === 'active',
    "professional_id" => $professionalId,
    "position" => $position,
    "reward_points" => 0,
    "created_at" => date('Y-m-d H:i:s')
];

$insertedId = $db->insertOne('users', $userDoc);

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "User account for {$fullName} ({$role}) created successfully!",
    "user_id" => $insertedId
]);

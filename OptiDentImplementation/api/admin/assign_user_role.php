<?php
/**
 * OptiDent System - Assign User Role Endpoint
 * Endpoint: POST /api/admin/assign_user_role.php
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/auth_guard.php';

AuthGuard::requireRole(['super_admin']);

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$email = strtolower(trim($data['email'] ?? ''));
$newRole = strtolower(trim($data['role'] ?? ''));

if (empty($email) || empty($newRole)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Email and target role are required."]);
    exit;
}

$allowedRoles = ['super_admin', 'doctor', 'receptionist', 'patient'];
if (!in_array($newRole, $allowedRoles)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid target role specified."]);
    exit;
}

$user = $db->findOne('users', ['email' => $email]);
if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "User with email '{$email}' not found."]);
    exit;
}

// Safeguard master super admin
if (!empty($user['is_master']) && $newRole !== 'super_admin') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Cannot demote the Master Super Admin account."]);
    exit;
}

$position = 'Client / Patient';
if ($newRole === 'super_admin') $position = 'Super Admin / Management';
else if ($newRole === 'doctor') $position = 'Dental Surgeon / Dentist';
else if ($newRole === 'receptionist') $position = 'Clinic Receptionist';

$db->updateOne('users', ['email' => $email], [
    '$set' => [
        'role' => $newRole,
        'position' => $position,
        'updated_at' => date('Y-m-d H:i:s'),
        'role_assigned_by' => $_SESSION['email'] ?? 'superadmin',
        'role_assigned_at' => date('Y-m-d H:i:s')
    ]
]);

echo json_encode([
    "status" => "success",
    "message" => "User {$email} successfully assigned to role: " . strtoupper($newRole) . ".",
    "email" => $email,
    "role" => $newRole
]);

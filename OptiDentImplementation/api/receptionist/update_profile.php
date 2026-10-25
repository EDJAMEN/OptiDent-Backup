<?php
/**
 * OptiDent System - Receptionist Profile Management API (R-012)
 * Allows Receptionists to fully customize their account information,
 * station details, schedule notes, avatar accent, and security credentials.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

// Verify authorized session: receptionist, staff, or admin
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['receptionist', 'staff', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Receptionist session required."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$currentSessionEmail = $_SESSION['email'] ?? '';
$sessionUserId = $_SESSION['user_id'] ?? '';

// Find current user document
$filter = [];
if (!empty($sessionUserId)) {
    $filter['_id'] = $sessionUserId;
    $user = $db->findOne('users', $filter);
    if (!$user && class_exists('MongoDB\BSON\ObjectId')) {
        try {
            $user = $db->findOne('users', ['_id' => new MongoDB\BSON\ObjectId($sessionUserId)]);
            if ($user) $filter = ['_id' => new MongoDB\BSON\ObjectId($sessionUserId)];
        } catch (\Exception $e) {}
    }
}

if (empty($user) && !empty($currentSessionEmail)) {
    $filter = ['email' => $currentSessionEmail];
    $user = $db->findOne('users', $filter);
}

if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Receptionist user account not found."]);
    exit;
}

$fullName = trim($input['full_name'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$phone = trim($input['phone'] ?? '');
$position = trim($input['position'] ?? '');
$scheduleDays = trim($input['schedule_days'] ?? '');
$bio = trim($input['bio'] ?? '');
$avatarColor = trim($input['avatar_color'] ?? '#0eb1b1');
$currentPass = trim($input['current_password'] ?? '');
$newPass = trim($input['new_password'] ?? '');

// Enforce mandatory fields
if (empty($fullName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Full Name is required."]);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "A valid email address is required."]);
    exit;
}

// If email changed, ensure no conflict with existing users
$existingUserByEmail = $db->findOne('users', ['email' => $email]);
if ($existingUserByEmail && (string)$existingUserByEmail['_id'] !== (string)$user['_id']) {
    http_response_code(409);
    echo json_encode(["status" => "error", "message" => "The email '{$email}' is already in use by another account."]);
    exit;
}

$updateFields = [
    'full_name' => $fullName,
    'email' => $email,
    'phone' => $phone,
    'position' => !empty($position) ? $position : 'Front Desk Receptionist',
    'schedule_days' => $scheduleDays,
    'bio' => $bio,
    'avatar_color' => $avatarColor,
    'updated_at' => date('Y-m-d H:i:s'),
    'updated_by' => $email
];

// Handle Password Change if requested
$passwordChanged = false;
if (!empty($newPass)) {
    if (strlen($newPass) < 6) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "New password must be at least 6 characters."]);
        exit;
    }

    if (empty($currentPass)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Current password is required to set a new password."]);
        exit;
    }

    $existingHash = $user['password_hash'] ?? '';
    if (!empty($existingHash) && !password_verify($currentPass, $existingHash) && $currentPass !== $existingHash) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Current password does not match our records."]);
        exit;
    }

    $updateFields['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT);
    $passwordChanged = true;
}

// Persist updates to database
$db->updateOne('users', $filter, ['$set' => $updateFields]);

// Update active session variables
$_SESSION['email'] = $email;
$_SESSION['full_name'] = $fullName;

// Audit Logging
AuditLogger::log(
    'RECEPTIONIST_PROFILE_UPDATED',
    "users:{$user['_id']}",
    [
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'position' => $updateFields['position'],
        'password_changed' => $passwordChanged,
        'updated_by' => $email
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Account profile updated successfully.",
    "receptionist" => [
        "id" => (string)$user['_id'],
        "full_name" => $fullName,
        "email" => $email,
        "phone" => $phone,
        "position" => $updateFields['position'],
        "schedule_days" => $scheduleDays,
        "bio" => $bio,
        "avatar_color" => $avatarColor,
        "role" => $role
    ]
]);

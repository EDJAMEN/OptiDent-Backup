<?php
/**
 * OptiDent System - Client / Patient Profile Customization API (C-008)
 * Allows Patients to update their name, contact details (phone, email, address, emergency contact),
 * and profile picture / avatar.
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

// Verify authorized patient session
$role = strtolower($_SESSION['role'] ?? '');
if (!in_array($role, ['patient', 'client', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Access denied. Patient session required."]);
    exit;
}

$sessionUserId = $_SESSION['user_id'] ?? '';
$sessionEmail = $_SESSION['email'] ?? '';

$filter = [];
if (!empty($sessionUserId)) {
    $filter['_id'] = $sessionUserId;
    $user = $db->findOne('users', $filter);
    if (!$user && class_exists('MongoDB\BSON\ObjectId')) {
        try {
            $oid = new MongoDB\BSON\ObjectId($sessionUserId);
            $user = $db->findOne('users', ['_id' => $oid]);
            if ($user) $filter = ['_id' => $oid];
        } catch (\Exception $e) {}
    }
}

if (empty($user) && !empty($sessionEmail)) {
    $filter = ['email' => $sessionEmail];
    $user = $db->findOne('users', $filter);
}

if (!$user) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Patient account not found."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$fullName = trim($input['full_name'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$phone = trim($input['phone'] ?? '');
$address = trim($input['address'] ?? '');
$emergName = trim($input['emergency_contact_name'] ?? '');
$emergPhone = trim($input['emergency_contact_phone'] ?? '');

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

// Check email uniqueness if email changed
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
    'address' => $address,
    'emergency_contact_name' => $emergName,
    'emergency_contact_phone' => $emergPhone,
    'updated_at' => date('Y-m-d H:i:s'),
    'updated_by' => $email
];

// Profile Picture & Avatar Accent
if (array_key_exists('profile_picture', $input)) {
    $updateFields['profile_picture'] = $input['profile_picture'];
}
if (array_key_exists('avatar_color', $input)) {
    $updateFields['avatar_color'] = trim($input['avatar_color']);
}

// Save to MongoDB
$db->updateOne('users', $filter, ['$set' => $updateFields]);

// Update active session variables
$_SESSION['email'] = $email;
$_SESSION['full_name'] = $fullName;

// If patient name changed, synchronize active upcoming appointments for clinic schedule accuracy
$prevName = $user['full_name'] ?? '';
if (!empty($prevName) && $prevName !== $fullName) {
    try {
        $db->updateMany(
            'appointments',
            ['patient_id' => (string)$user['_id']],
            ['$set' => ['patient_name' => $fullName, 'patient_phone' => $phone]]
        );
    } catch (\Exception $e) {}
}

// Audit trail
AuditLogger::log(
    'PATIENT_PROFILE_UPDATED',
    "users:{$user['_id']}",
    [
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'has_picture' => !empty($updateFields['profile_picture']),
        'updated_by' => $email
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Personal profile updated successfully.",
    "patient" => [
        "_id" => (string)$user['_id'],
        "full_name" => $fullName,
        "email" => $email,
        "phone" => $phone,
        "address" => $address,
        "emergency_contact_name" => $emergName,
        "emergency_contact_phone" => $emergPhone,
        "profile_picture" => $updateFields['profile_picture'] ?? ($user['profile_picture'] ?? ''),
        "avatar_color" => $updateFields['avatar_color'] ?? ($user['avatar_color'] ?? '#0eb1b1')
    ]
]);

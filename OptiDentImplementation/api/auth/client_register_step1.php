<?php
/**
 * OptiDent System - Client Registration Step 1 (Account & Gmail Verification)
 * Task C-001: Register user name and Gmail before filling up personal & clinical safety details.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

// 1. Extract & Sanitize
$fullName = trim($input['full_name'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$verificationCode = trim($input['verification_code'] ?? $input['code'] ?? '');
$password = trim($input['password'] ?? '');
$confirmPassword = trim($input['confirm_password'] ?? '');

// 2. Validate Inputs
if (empty($fullName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Full Name / Username is required."]);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "A valid Gmail address is required."]);
    exit;
}

if (empty($verificationCode)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Please enter the 6-digit verification code sent to your Gmail."
    ]);
    exit;
}

if (strlen($verificationCode) !== 6) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Verification code must be exactly 6 digits."
    ]);
    exit;
}

if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Password must be at least 8 characters long."]);
    exit;
}

if (!empty($confirmPassword) && $password !== $confirmPassword) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Passwords do not match."]);
    exit;
}

// 3. Verify 6-digit OTP code against MongoDB email_verifications or active session
$isCodeValid = false;
$ver = $db->findOne('email_verifications', ['email' => $email]);
if ($ver) {
    $now = time();
    $exp = strtotime($ver['expires_at'] ?? '2000-01-01');
    if ($ver['code'] === $verificationCode && $exp >= $now) {
        $isCodeValid = true;
    }
}

if (!$isCodeValid && isset($_SESSION['email_verification'])) {
    $sessVer = $_SESSION['email_verification'];
    if ($sessVer['email'] === $email && $sessVer['code'] === $verificationCode && $sessVer['expires_time'] >= time()) {
        $isCodeValid = true;
    }
}

if (!$isCodeValid) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Invalid or expired verification code. Please check your Gmail or request a new code."
    ]);
    exit;
}

// 4. Check for duplicate registered email
$existingUser = $db->findOne('users', ['email' => $email]);
if ($existingUser) {
    http_response_code(409);
    echo json_encode([
        "status" => "error",
        "message" => "An account with email {$email} already exists. Please sign in instead."
    ]);
    exit;
}

// 5. Create Patient Document in MongoDB
$passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
$username = strtolower(explode('@', $email)[0]);

$userDoc = [
    "full_name" => $fullName,
    "username" => $username,
    "email" => $email,
    "phone" => "",
    "role" => "patient",
    "status" => "active",
    "password_hash" => $passwordHash,
    "dob" => "",
    "age" => null,
    "gender" => "Not Specified",
    "blood_type" => "Unknown",
    "address" => "",
    "allergies" => "None recorded",
    "medical_alerts" => "None recorded",
    "emergency_contact_name" => "",
    "emergency_contact_phone" => "",
    "is_master" => false,
    "is_walkin" => false,
    "is_active" => true,
    "is_deleted" => false,
    "is_archived" => false,
    "is_email_verified" => true,
    "email_verified_at" => date('Y-m-d H:i:s'),
    "profile_completed" => false,
    "reward_points" => 0,
    "created_at" => date('Y-m-d H:i:s'),
    "registered_via" => "client_portal_step1"
];

$insertedId = $db->insertOne('users', $userDoc);

if (!$insertedId) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Failed to create patient account. Please try again."
    ]);
    exit;
}

// Clean up verification document & session
try {
    $db->deleteOne('email_verifications', ['email' => $email]);
    unset($_SESSION['email_verification']);
} catch (\Exception $e) {}

// Log registration audit
AuditLogger::log(
    'PATIENT_REGISTERED_STEP1',
    "users:{$email}",
    [
        'user_id' => (string)$insertedId,
        'full_name' => $fullName,
        'email' => $email,
        'role' => 'patient'
    ]
);

// Establish active patient session
$_SESSION['user_id'] = (string)$insertedId;
$_SESSION['email'] = $email;
$_SESSION['full_name'] = $fullName;
$_SESSION['role'] = 'patient';
$_SESSION['is_master'] = false;
$_SESSION['logged_in_at'] = time();

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Account created & Gmail verified successfully! Now proceed to complete your personal information and clinical safety details.",
    "step" => 2,
    "user_id" => (string)$insertedId,
    "user" => [
        "id" => (string)$insertedId,
        "full_name" => $fullName,
        "email" => $email,
        "role" => "patient"
    ]
]);

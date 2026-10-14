<?php
/**
 * OptiDent System - Client / Patient Self-Registration API
 * Task C-001: User Registration
 * 
 * Allows new clients/patients to securely register their personal information,
 * contact details, medical alerts, and credentials to access their patient portal.
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

// 1. Extract & Sanitize Inputs
$fullName = trim($input['full_name'] ?? '');
$email = strtolower(trim($input['email'] ?? ''));
$phone = trim($input['phone'] ?? '');
$dob = trim($input['dob'] ?? '');
$gender = trim($input['gender'] ?? 'Not Specified');
$bloodType = trim($input['blood_type'] ?? 'Unknown');
$address = trim($input['address'] ?? '');
$allergies = trim($input['allergies'] ?? $input['medical_alerts'] ?? 'None recorded');
$emergName = trim($input['emergency_contact_name'] ?? '');
$emergPhone = trim($input['emergency_contact_phone'] ?? '');
$password = trim($input['password'] ?? '');
$confirmPassword = trim($input['confirm_password'] ?? '');
$verificationCode = trim($input['verification_code'] ?? $input['code'] ?? '');

// 2. Validate Required Fields
if (empty($fullName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Full Name is required."]);
    exit;
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "A valid Email address is required."]);
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

// 2b. Verify Verification Code
$isCodeValid = false;
$ver = $db->findOne('email_verifications', ['email' => $email]);
if ($ver) {
    $now = time();
    $exp = strtotime($ver['expires_at'] ?? '2000-01-01');
    if ($ver['code'] === $verificationCode && $exp >= $now) {
        $isCodeValid = true;
    }
}

// Session fallback check
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

if (empty($phone)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Phone number is required."]);
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

// 3. Check for Duplicate Email in MongoDB
$existingUser = $db->findOne('users', ['email' => $email]);
if ($existingUser) {
    http_response_code(409);
    echo json_encode([
        "status" => "error",
        "message" => "An account with email {$email} already exists. Please sign in instead."
    ]);
    exit;
}

// Check if phone is already registered to another patient
$existingPhone = $db->findOne('users', ['phone' => $phone]);
if ($existingPhone) {
    http_response_code(409);
    echo json_encode([
        "status" => "error",
        "message" => "Phone number {$phone} is already linked to another patient profile."
    ]);
    exit;
}

// 4. Calculate Age from Date of Birth
$age = null;
if (!empty($dob)) {
    try {
        $birthDate = new DateTime($dob);
        $today = new DateTime('today');
        $age = $birthDate->diff($today)->y;
    } catch (Exception $e) {
        $age = null;
    }
}

// 5. Hash Password Securely
$passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);

// 6. Build User Document
$userDoc = [
    "full_name" => $fullName,
    "email" => $email,
    "phone" => $phone,
    "role" => "patient",
    "status" => "active",
    "password_hash" => $passwordHash,
    "dob" => $dob,
    "age" => $age,
    "gender" => $gender,
    "blood_type" => $bloodType,
    "address" => $address,
    "allergies" => $allergies ?: 'None recorded',
    "medical_alerts" => $allergies ?: 'None recorded',
    "emergency_contact_name" => $emergName,
    "emergency_contact_phone" => $emergPhone,
    "is_master" => false,
    "is_walkin" => false,
    "is_active" => true,
    "is_deleted" => false,
    "is_archived" => false,
    "is_email_verified" => true,
    "email_verified_at" => date('Y-m-d H:i:s'),
    "reward_points" => 0,
    "created_at" => date('Y-m-d H:i:s'),
    "registered_via" => "client_portal"
];

$insertedId = $db->insertOne('users', $userDoc);

// Clean up verification
try {
    $db->deleteOne('email_verifications', ['email' => $email]);
    unset($_SESSION['email_verification']);
} catch (\Exception $e) {}

if (!$insertedId) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Failed to create patient account. Please try again."
    ]);
    exit;
}

// 7. Audit Trail Logging
AuditLogger::log(
    'CLIENT_REGISTERED',
    "users:{$email}",
    [
        'user_id' => (string)$insertedId,
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'role' => 'patient'
    ]
);

// 8. Auto-Login (Establish PHP Session)
$_SESSION['user_id'] = (string)$insertedId;
$_SESSION['email'] = $email;
$_SESSION['full_name'] = $fullName;
$_SESSION['role'] = 'patient';
$_SESSION['is_master'] = false;
$_SESSION['logged_in_at'] = time();

// 9. Respond with Success and Redirect
http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Account created successfully! Welcome to OptiDent, {$fullName}.",
    "redirect" => "client_dashboard.html",
    "user" => [
        "id" => (string)$insertedId,
        "full_name" => $fullName,
        "email" => $email,
        "phone" => $phone,
        "role" => "patient"
    ]
]);

<?php
/**
 * OptiDent System - Send Patient Email Verification Code API
 * Task C-001: Verification Code based on Gmail
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
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/../config/audit_logger.php';

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$email = strtolower(trim($input['email'] ?? ''));
$fullName = trim($input['full_name'] ?? 'Patient');

// 1. Validate Email
if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "A valid email address is required to receive a verification code."
    ]);
    exit;
}

// 2. Check if email already registered in system
$existing = $db->findOne('users', ['email' => $email]);
if ($existing) {
    http_response_code(409);
    echo json_encode([
        "status" => "error",
        "message" => "An account with email {$email} already exists. Please sign in instead."
    ]);
    exit;
}

// 3. Generate 6-digit numeric verification code
$code = (string)random_int(100000, 999999);
$now = time();
$expiresAt = date('Y-m-d H:i:s', $now + 600); // 10 minutes expiry

// 4. Save verification code to MongoDB email_verifications collection
$verificationDoc = [
    "email" => $email,
    "full_name" => $fullName,
    "code" => $code,
    "created_at" => date('Y-m-d H:i:s', $now),
    "expires_at" => $expiresAt,
    "verified" => false,
    "ip_address" => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
];

// Clean up old verification codes for this email
try {
    $db->deleteOne('email_verifications', ['email' => $email]);
} catch (\Exception $e) {}

$inserted = $db->insertOne('email_verifications', $verificationDoc);

// Also cache in PHP session for instant fallback validation
$_SESSION['email_verification'] = [
    'email' => $email,
    'code' => $code,
    'expires_time' => $now + 600
];

// 5. Dispatch Email via Gmail SMTP
$mailResult = sendPatientVerificationEmail($email, $fullName, $code);

if (!$mailResult['sent']) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Failed to deliver verification code to {$email}: " . ($mailResult['reason'] ?? 'SMTP Delivery Error'),
        // In local development/fallback, provide indicator if SMTP fails
        "debug_code_sent" => false
    ]);
    exit;
}

AuditLogger::log(
    'PATIENT_VERIFICATION_SENT',
    "verifications:{$email}",
    [
        'email' => $email,
        'full_name' => $fullName,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
    ]
);

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => "Verification code successfully sent to {$email}! Please check your Gmail inbox or Spam folder.",
    "expires_in" => "10 minutes"
]);

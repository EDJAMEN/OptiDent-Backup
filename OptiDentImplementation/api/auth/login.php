<?php
/**
 * OptiDent System - Super Admin & User Login Endpoint
 * Task SA-001: Secure Login API for Super Admin
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

// Decode JSON input
$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$email = trim($input['email'] ?? '');
$password = trim($input['password'] ?? '');
$requiredRole = trim($input['required_role'] ?? '');

// 1. Input Validation
if (empty($email) || empty($password)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Email and password are required fields."
    ]);
    exit;
}

// 2. Query MongoDB 'users' collection
$user = $db->findOne('users', ['email' => $email]);

if (!$user) {
    http_response_code(404);
    echo json_encode([
        "status" => "error",
        "message" => "No account found matching this email address."
    ]);
    exit;
}

// 3. Verify Role Authorization
$userRole = strtolower($user['role'] ?? '');
if (!empty($requiredRole) && $requiredRole !== 'any') {
    if ($requiredRole === 'super_admin' && !in_array($userRole, ['super_admin', 'admin'])) {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "Access denied. This portal is restricted to Administrator personnel only."
        ]);
        exit;
    }
    if ($requiredRole === 'doctor' && $userRole !== 'doctor') {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "Access denied. This portal is restricted to Healthcare Providers (Doctors) only."
        ]);
        exit;
    }
    if (in_array($requiredRole, ['receptionist', 'staff']) && !in_array($userRole, ['receptionist', 'staff'])) {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "Access denied. This portal is restricted to Front Desk Receptionist personnel only."
        ]);
        exit;
    }
    if (in_array($requiredRole, ['patient', 'client']) && !in_array($userRole, ['patient', 'client'])) {
        http_response_code(403);
        echo json_encode([
            "status" => "error",
            "message" => "Access denied. This portal is restricted to Patients and Clients only."
        ]);
        exit;
    }
}

// 4. Verify Account Status
if (!empty($user['is_deleted']) || (isset($user['status']) && $user['status'] !== 'active')) {
    http_response_code(403);
    echo json_encode([
        "status" => "error",
        "message" => !empty($user['is_deleted'])
            ? "This account has been deactivated or soft-deleted. Please contact clinic administration."
            : ("Your account is currently " . htmlspecialchars($user['status']) . ". Please contact clinic support.")
    ]);
    exit;
}

// 5. Password Authentication
$passwordMatch = false;
if (password_verify($password, $user['password_hash'])) {
    $passwordMatch = true;
} else if ($password === $user['password_hash']) {
    // Legacy plaintext fallback check
    $passwordMatch = true;
}

if (!$passwordMatch) {
    http_response_code(401);
    echo json_encode([
        "status" => "error",
        "message" => "Invalid password credentials. Please try again."
    ]);
    exit;
}

// 6. Set Authenticated PHP Session
$_SESSION['user_id'] = (string) $user['_id'];
$_SESSION['email'] = $user['email'];
$_SESSION['full_name'] = $user['full_name'];
$_SESSION['role'] = $user['role'];
$_SESSION['is_master'] = $user['is_master'] ?? false;
$_SESSION['logged_in_at'] = time();

// 6b. Update last_login timestamp in MongoDB
try {
    $db->updateOne('users', ['email' => $email], [
        '$set' => [
            'last_login' => date('Y-m-d H:i:s'),
            'last_login_ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
        ]
    ]);
} catch (Exception $e) { /* non-critical, skip silently */
}

// 6c. Audit Trail Logging
AuditLogger::log(
    'USER_LOGIN',
    "users:{$email}",
    [
        'user_id' => (string) $user['_id'],
        'role' => $user['role'],
        'full_name' => $user['full_name'],
        'ip_address' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
    ]
);

// Prepare User Response Data (Omitting Sensitive Passwords)
$userResponse = [
    "id" => (string) $user['_id'],
    "full_name" => $user['full_name'],
    "email" => $user['email'],
    "phone" => $user['phone'] ?? '',
    "role" => $user['role'],
    "is_master" => (bool) ($user['is_master'] ?? false),
    "professional_id" => $user['professional_id'] ?? '',
    "position" => $user['position'] ?? '',
    "created_at" => $user['created_at'] ?? ''
];

$redirectUrl = 'index.html';
if (in_array($userRole, ['super_admin', 'admin'])) {
    $redirectUrl = 'admin_dashboard.html';
} else if ($userRole === 'doctor') {
    $redirectUrl = 'doctor_dashboard.html';
} else if ($userRole === 'receptionist' || $userRole === 'staff') {
    $redirectUrl = 'receptionist_dashboard.html';
} else if ($userRole === 'patient' || $userRole === 'client') {
    $redirectUrl = 'client_dashboard.html';
}

http_response_code(200);
echo json_encode([
    "status" => "success",
    "message" => ucfirst($userRole) . " login authenticated successfully!",
    "redirect" => $redirectUrl,
    "user" => $userResponse
]);

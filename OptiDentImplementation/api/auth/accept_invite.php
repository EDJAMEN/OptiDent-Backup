<?php
/**
 * OptiDent System - Accept Invitation & Register Staff Account
 * Registers Doctor or Receptionist into MongoDB 'users' Collection
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$token = trim($input['token'] ?? '');
$password = trim($input['password'] ?? '');
$fullName = trim($input['full_name'] ?? '');
$phone = trim($input['phone'] ?? '');
$professionalId = trim($input['professional_id'] ?? '');
$specialization = trim($input['specialization'] ?? '');
$scheduleDays = trim($input['schedule_days'] ?? '');
$bio = trim($input['bio'] ?? '');

if (empty($token) || empty($password) || empty($fullName)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Full name and password are required."]);
    exit;
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Password must be at least 6 characters."]);
    exit;
}

// 1. Verify invitation
$invite = $db->findOne('invitations', ['token' => $token, 'status' => 'pending']);
if (!$invite) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Invalid or expired invitation token."]);
    exit;
}

$email = $invite['email'];
$role = strtolower($invite['role']); // 'doctor', 'staff', 'admin'

// If role is doctor, enforce default specialization if empty
if ($role === 'doctor' && empty($specialization)) {
    $specialization = 'General Dentistry';
}

// 2. Check if user already exists
$existing = $db->findOne('users', ['email' => $email]);
$isPatient = ($role === 'patient' || $role === 'client');

if ($existing) {
    $existingRole = strtolower($existing['role'] ?? '');
    if ($isPatient || in_array($existingRole, ['patient', 'client'])) {
        // Patient account previously created by receptionist during walk-in
        $updateData = [
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'status' => 'active',
            'is_active' => true,
            'activated_at' => date('Y-m-d H:i:s')
        ];
        if (!empty($fullName)) $updateData['full_name'] = $fullName;
        if (!empty($phone)) $updateData['phone'] = $phone;

        $db->updateOne('users', ['_id' => $existing['_id']], ['$set' => $updateData]);
        $insertedUserId = $existing['_id'];
        $role = 'patient';
    } else {
        http_response_code(409);
        echo json_encode(["status" => "error", "message" => "An account with this email already exists."]);
        exit;
    }
} else {
    $position = trim($input['position'] ?? '');
    if (empty($position)) {
        $position = ($role === 'doctor') ? ('Doctor / ' . ($specialization ?: 'Dentist')) : ($isPatient ? 'Client / Patient' : 'Front Desk Receptionist');
    }

    // 3. Create new user document in 'users' collection
    $newUserDoc = [
        "full_name" => $fullName,
        "email" => $email,
        "phone" => $phone,
        "password_hash" => password_hash($password, PASSWORD_BCRYPT),
        "role" => $role,
        "status" => "active",
        "is_master" => false,
        "is_active" => true,
        "is_deleted" => false,
        "is_archived" => false,
        "reward_points" => 0,
        "created_at" => date('Y-m-d H:i:s'),
        "activated_at" => date('Y-m-d H:i:s')
    ];

    if (!$isPatient) {
        $newUserDoc["professional_id"] = $professionalId;
        $newUserDoc["specialization"] = $specialization;
        $newUserDoc["schedule_days"] = !empty($scheduleDays) ? $scheduleDays : 'Mon - Fri (9:00 AM - 5:00 PM)';
        $newUserDoc["bio"] = $bio;
        $newUserDoc["position"] = $position;
    }

    $insertedUserId = $db->insertOne('users', $newUserDoc);
}

// 4. Update invitation status to accepted
$db->updateOne('invitations', ['token' => $token], [
    '$set' => [
        'status' => 'accepted',
        'accepted_at' => date('Y-m-d H:i:s'),
        'user_id' => $insertedUserId
    ]
]);

// 5. Audit Log Entry
$auditAction = ($role === 'doctor') ? 'DOCTOR_ACTIVATED' : (($role === 'patient') ? 'PATIENT_ACTIVATED' : 'RECEPTIONIST_ACTIVATED');
AuditLogger::log(
    $auditAction,
    "users:{$email}",
    [
        'user_id' => (string) $insertedUserId,
        'full_name' => $fullName,
        'role' => $role,
        'position' => $position ?? '',
        'specialization' => $specialization ?? '',
        'professional_id' => $professionalId ?? ''
    ]
);

// 6. Set Authenticated PHP Session
$_SESSION['user_id'] = (string) $insertedUserId;
$_SESSION['email'] = $email;
$_SESSION['full_name'] = $fullName;
$_SESSION['role'] = $role;
$_SESSION['is_master'] = false;
$_SESSION['logged_in_at'] = time();

$redirectUrl = ($role === 'doctor') 
    ? 'doctor_dashboard.html' 
    : (($role === 'receptionist' || $role === 'staff') ? 'receptionist_dashboard.html' : 'client_dashboard.html');

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Your " . ucfirst($role) . " account has been activated successfully! You are now logged in.",
    "role" => $role,
    "email" => $email,
    "user_id" => (string) $insertedUserId,
    "redirect" => $redirectUrl
]);

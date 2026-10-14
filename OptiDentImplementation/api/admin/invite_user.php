<?php
/**
 * OptiDent System - Invite Doctor & Receptionist Endpoint
 * Task SA-002: Super Admin Invites Doctor or Receptionist via Email / Token Link
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

// Check if user is authenticated and is Super Admin
$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode([
        "status" => "error",
        "message" => "Access denied. Only Super Admin can send invitations."
    ]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$email = strtolower(trim($input['email'] ?? ''));
$role = strtolower(trim($input['role'] ?? ''));
$fullName = trim($input['full_name'] ?? '');

// 1. Validation
if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "A valid email address is required."]);
    exit;
}

if (!in_array($role, ['doctor', 'receptionist'])) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Role must be either 'doctor' or 'receptionist'."]);
    exit;
}

// 2. Check if user already exists in 'users' collection
$existingUser = $db->findOne('users', ['email' => $email]);
if ($existingUser) {
    http_response_code(409);
    echo json_encode([
        "status" => "error",
        "message" => "A user with email {$email} already exists in the system."
    ]);
    exit;
}

// 3. Dynamic Base URL detection (matches current server host and port)
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
$host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8080';
$baseUrl = "{$protocol}://{$host}";

// Check if there's already an active/pending invitation for this email
$existingInvite = $db->findOne('invitations', ['email' => $email, 'status' => 'pending']);
if ($existingInvite) {
    $token = $existingInvite['token'];
    $inviteLink = "{$baseUrl}/accept_invite.html?token=" . $token;
    // Update existing invite with correct current link
    $db->updateOne('invitations', ['_id' => $existingInvite['_id']], ['$set' => ['invite_link' => $inviteLink]]);
    echo json_encode([
        "status" => "info",
        "message" => "An active invitation for {$email} already exists.",
        "invite_link" => $inviteLink,
        "token" => $token,
        "role" => $existingInvite['role']
    ]);
    exit;
}

// 4. Generate secure token & expiration
$token = bin2hex(random_bytes(24));
$expiresAt = date('Y-m-d H:i:s', strtotime('+48 hours'));
$inviteLink = "{$baseUrl}/accept_invite.html?token=" . $token;

$invitationDoc = [
    "email" => $email,
    "role" => $role,
    "full_name" => $fullName,
    "token" => $token,
    "status" => "pending",
    "invited_by" => $_SESSION['email'] ?? 'superadmin@optident.com',
    "invite_link" => $inviteLink,
    "expires_at" => $expiresAt,
    "created_at" => date('Y-m-d H:i:s')
];

$insertedId = $db->insertOne('invitations', $invitationDoc);

// Read SMTP credentials if passed from frontend localStorage
$smtpUser = trim($input['smtp_user'] ?? '');
$smtpPass = trim($input['smtp_pass'] ?? '');

// Send real email via PHPMailer
$emailResult = sendStaffInvitationEmail($email, $fullName, $role, $inviteLink, $smtpUser, $smtpPass);

http_response_code(201);
echo json_encode([
    "status" => "success",
    "message" => "Invitation for " . ucfirst($role) . " ({$email}) created successfully!" . 
                 ($emailResult['sent'] ? " Email has been sent to their Gmail!" : " (Note: " . ($emailResult['reason'] ?? 'SMTP pending') . ")"),
    "email_sent" => $emailResult['sent'],
    "email_reason" => $emailResult['reason'] ?? null,
    "invitation_id" => $insertedId,
    "invite_link" => $inviteLink,
    "token" => $token,
    "role" => $role,
    "email" => $email,
    "expires_at" => $expiresAt
]);

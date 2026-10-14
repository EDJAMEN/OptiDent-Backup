<?php
/**
 * OptiDent System - Resend Staff Invitation Email
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
require_once __DIR__ . '/../config/mailer.php';

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
$email = trim($input['email'] ?? '');

if (empty($email)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Email is required."]);
    exit;
}

$invite = $db->findOne('invitations', ['email' => $email, 'status' => 'pending']);
if (!$invite) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Pending invitation not found."]);
    exit;
}

$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
$host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8080';
$baseUrl = "{$protocol}://{$host}";
$activeInviteLink = "{$baseUrl}/accept_invite.html?token=" . $invite['token'];

// Update database if link had old port
$db->updateOne('invitations', ['_id' => $invite['_id']], ['$set' => ['invite_link' => $activeInviteLink]]);

$smtpUser = trim($input['smtp_user'] ?? '');
$smtpPass = trim($input['smtp_pass'] ?? '');

$result = sendStaffInvitationEmail($invite['email'], $invite['full_name'] ?? '', $invite['role'], $activeInviteLink, $smtpUser, $smtpPass);

echo json_encode([
    "status" => $result['sent'] ? "success" : "info",
    "message" => $result['sent'] ? "Invitation email resent to {$email}!" : "Email delivery note: " . ($result['reason'] ?? 'SMTP pending'),
    "email_sent" => $result['sent'],
    "invite_link" => $activeInviteLink
]);

<?php
/**
 * OptiDent System - Validate Invite Token
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/db.php';

$token = trim($_GET['token'] ?? '');

if (empty($token)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invitation token is missing."]);
    exit;
}

$invite = $db->findOne('invitations', ['token' => $token]);

if (!$invite) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Invalid or non-existent invitation token."]);
    exit;
}

if ($invite['status'] !== 'pending') {
    http_response_code(400);
    echo json_encode([
        "status" => "error", 
        "message" => "This invitation has already been " . htmlspecialchars($invite['status']) . "."
    ]);
    exit;
}

echo json_encode([
    "status" => "valid",
    "email" => $invite['email'],
    "role" => $invite['role'],
    "full_name" => $invite['full_name'] ?? '',
    "expires_at" => $invite['expires_at'] ?? ''
]);

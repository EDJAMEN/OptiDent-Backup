<?php
/**
 * OptiDent System - Get Current Email Configuration
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied."]);
    exit;
}

require_once __DIR__ . '/../config/email_config.php';

echo json_encode([
    "status" => "success",
    "smtp_user" => SMTP_USER,
    "smtp_host" => SMTP_HOST,
    "smtp_port" => SMTP_PORT,
    "is_configured" => !empty(SMTP_USER) && !empty(SMTP_PASS)
]);

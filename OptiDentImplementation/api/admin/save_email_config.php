<?php
/**
 * OptiDent System - Save Email SMTP Settings
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

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied."]);
    exit;
}

$input = json_decode(file_get_contents("php://input"), true);
if (!$input) $input = $_POST;

$gmail = trim($input['smtp_user'] ?? '');
$password = trim($input['smtp_pass'] ?? '');

if (empty($gmail) || empty($password)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Both Gmail address and 16-character App Password are required."]);
    exit;
}

// Remove spaces from app password if copied with spaces
$password = str_replace(' ', '', $password);

$configFile = __DIR__ . '/../config/email_config.php';
$content = "<?php
/**
 * OptiDent System - Email & SMTP Settings
 */

define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_SECURE', 'tls');

define('SMTP_USER', '" . addslashes($gmail) . "');
define('SMTP_PASS', '" . addslashes($password) . "');
define('SMTP_FROM_NAME', 'OptiDent Dental Clinic');
";

file_put_contents($configFile, $content);

echo json_encode([
    "status" => "success",
    "message" => "Gmail SMTP settings saved successfully! Invitations will now be sent directly to recipients' Gmail inboxes.",
    "smtp_user" => $gmail
]);

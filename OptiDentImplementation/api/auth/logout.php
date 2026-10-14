<?php
/**
 * OptiDent System - Secure Logout Endpoint
 * Destroys PHP session and clears all auth cookies
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

// Log the logout before destroying session
$loggedEmail = $_SESSION['email'] ?? '';
$loggedRole  = $_SESSION['role'] ?? '';
$loggedName  = $_SESSION['full_name'] ?? '';

if (!empty($loggedEmail)) {
    // Update last_logout timestamp in DB
    try {
        $db->updateOne('users', ['email' => $loggedEmail], [
            '$set' => ['last_logout' => date('Y-m-d H:i:s')]
        ]);
    } catch (Exception $e) { /* silently skip */ }

    // Audit log
    AuditLogger::log(
        'USER_LOGOUT',
        "users:{$loggedEmail}",
        ['role' => $loggedRole, 'full_name' => $loggedName]
    );
}

// Destroy session completely
$_SESSION = [];
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}
session_destroy();

http_response_code(200);
echo json_encode([
    "status"   => "success",
    "message"  => "You have been securely logged out.",
    "redirect" => "index.html"
]);

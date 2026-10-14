<?php
/**
 * OptiDent System - Session Status Check (D-002)
 * Returns current authenticated user info from active PHP session.
 * Used by frontend to guard routes and auto-redirect authenticated users.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';

$email    = $_SESSION['email']     ?? '';
$role     = $_SESSION['role']      ?? '';
$fullName = $_SESSION['full_name'] ?? '';
$userId   = $_SESSION['user_id']   ?? '';
$isMaster = $_SESSION['is_master'] ?? false;

if (!empty($email)) {
    try {
        $freshUser = $db->findOne('users', ['email' => $email]);
        if ($freshUser) {
            $role = $freshUser['role'] ?? $role;
            $_SESSION['role'] = $role;
            $fullName = $freshUser['full_name'] ?? $fullName;
            $_SESSION['full_name'] = $fullName;
        }
    } catch (\Exception $e) {}
}

if (empty($email) || empty($role)) {
    http_response_code(401);
    echo json_encode([
        "status"  => "unauthenticated",
        "message" => "No active session. Please log in."
    ]);
    exit;
}

http_response_code(200);
echo json_encode([
    "status"    => "authenticated",
    "user_id"   => $userId,
    "email"     => $email,
    "full_name" => $fullName,
    "role"      => strtolower($role),
    "is_master" => (bool)$isMaster,
    "logged_in_at" => $_SESSION['logged_in_at'] ?? null
]);

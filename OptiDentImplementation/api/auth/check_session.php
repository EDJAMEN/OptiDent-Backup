<?php
/**
 * OptiDent System - Check Auth Session Status
 */
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';

if (isset($_SESSION['user_id']) && isset($_SESSION['role'])) {
    $email = $_SESSION['email'] ?? '';
    if (!empty($email)) {
        try {
            $freshUser = $db->findOne('users', ['email' => $email]);
            if ($freshUser && !empty($freshUser['role'])) {
                $_SESSION['role'] = $freshUser['role'];
                $_SESSION['full_name'] = $freshUser['full_name'] ?? $_SESSION['full_name'];
            }
        } catch (\Exception $e) {}
    }

    echo json_encode([
        "status" => "authenticated",
        "user" => [
            "id" => $_SESSION['user_id'],
            "email" => $_SESSION['email'],
            "full_name" => $_SESSION['full_name'],
            "role" => $_SESSION['role'],
            "is_master" => $_SESSION['is_master'] ?? false
        ]
    ]);
} else {
    http_response_code(401);
    echo json_encode([
        "status" => "unauthenticated",
        "message" => "No active session found."
    ]);
}

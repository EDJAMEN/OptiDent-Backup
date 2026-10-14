<?php
/**
 * OptiDent System - List Invitations
 * Task SA-002: Fetch All Pending & Accepted Invitations from MongoDB
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';

$userRole = strtolower($_SESSION['role'] ?? '');
if (!in_array($userRole, ['super_admin', 'admin'])) {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied."]);
    exit;
}

$rawInvitations = $db->find('invitations', []);

// Filter out soft-deleted and archived invitations
$invitations = array_values(array_filter($rawInvitations, function($inv) {
    return empty($inv['is_deleted']) && empty($inv['is_archived']);
}));

// Sort most recent first
usort($invitations, function($a, $b) {
    return strtotime($b['created_at'] ?? 0) - strtotime($a['created_at'] ?? 0);
});

echo json_encode([
    "status" => "success",
    "invitations" => $invitations
]);

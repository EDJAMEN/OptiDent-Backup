<?php
/**
 * OptiDent System - Cancel Invitation Endpoint
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

require_once __DIR__ . '/../config/audit_logger.php';

$invitation = $db->findOne('invitations', ['email' => $email]);
if (!$invitation) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Invitation not found."]);
    exit;
}

$updateData = [
    'is_deleted' => true,
    'status' => 'cancelled',
    'deleted_at' => date('Y-m-d H:i:s'),
    'deleted_by' => $_SESSION['email'] ?? 'superadmin@optident.com'
];
$db->updateOne('invitations', ['email' => $email], ['$set' => $updateData]);

AuditLogger::log(
    'SOFT_DELETE_INVITATION',
    "invitation:{$email}",
    ['email' => $email, 'role' => $invitation['role'] ?? '', 'message' => 'Moved invitation to Recovery Vault.']
);

echo json_encode([
    "status" => "success",
    "message" => "Invitation for {$email} was moved to the Recovery Vault."
]);

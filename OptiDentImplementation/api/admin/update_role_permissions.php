<?php
/**
 * OptiDent System - Update Role Permissions
 * Endpoint: POST /api/admin/update_role_permissions.php
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/auth_guard.php';

AuthGuard::requireRole(['super_admin']);

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$permKey = trim($data['key'] ?? '');
$role = strtolower(trim($data['role'] ?? ''));
$enabled = (bool)($data['enabled'] ?? false);

if (empty($permKey) || empty($role)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Permission key and role are required."]);
    exit;
}

if ($role === 'client') $role = 'patient';
if ($role === 'admin') $role = 'super_admin';

// Safeguard: Super Admin permissions cannot be revoked to avoid accidental system lockout
if ($role === 'super_admin' && !$enabled) {
    http_response_code(400);
    echo json_encode([
        "status" => "error", 
        "message" => "Cannot revoke permissions from the Super Admin role. Super Admin requires universal access."
    ]);
    exit;
}

$existing = $db->findOne('roles_permissions', ['key' => $permKey]);
if (!$existing) {
    http_response_code(404);
    echo json_encode(["status" => "error", "message" => "Permission '{$permKey}' not found in database."]);
    exit;
}

$currentRoles = (array)($existing['roles'] ?? []);
$normalizedCurrent = [];
foreach ($currentRoles as $r) {
    $r = strtolower($r);
    if ($r === 'admin') $r = 'super_admin';
    if ($r === 'client') $r = 'patient';
    $normalizedCurrent[] = $r;
}
$normalizedCurrent = array_values(array_unique($normalizedCurrent));

if ($enabled) {
    if (!in_array($role, $normalizedCurrent)) {
        $normalizedCurrent[] = $role;
    }
} else {
    $normalizedCurrent = array_values(array_filter($normalizedCurrent, function($r) use ($role) {
        return $r !== $role;
    }));
}

$db->updateOne('roles_permissions', ['key' => $permKey], [
    '$set' => [
        'roles' => $normalizedCurrent,
        'updated_at' => date('Y-m-d H:i:s'),
        'updated_by' => $_SESSION['email'] ?? 'superadmin'
    ]
]);

echo json_encode([
    "status" => "success",
    "message" => "Permission '{$permKey}' for role '{$role}' was successfully " . ($enabled ? "granted" : "revoked") . " in MongoDB.",
    "key" => $permKey,
    "role" => $role,
    "enabled" => $enabled,
    "roles" => $normalizedCurrent
]);

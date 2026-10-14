<?php
/**
 * OptiDent System - Current User Role & Permissions API
 * Returns the authenticated user's active role, metadata, and list of granted permissions
 * governed by Super Admin in the RBAC policy matrix ('roles_permissions').
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store, no-cache, must-revalidate");

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';

$email = $_SESSION['email'] ?? '';
$role  = strtolower($_SESSION['role'] ?? '');

if (empty($email) || empty($role)) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "No active session found. Please log in."]);
    exit;
}

// Fetch fresh user record from MongoDB
$user = $db->findOne('users', ['email' => $email]);
if ($user && !empty($user['role'])) {
    $role = strtolower($user['role']);
    $_SESSION['role'] = $role;
}

$roleTitles = [
    'super_admin' => 'Super Administrator',
    'doctor'      => 'Doctor (Healthcare Provider)',
    'receptionist'=> 'Front-Desk Receptionist',
    'staff'       => 'Front-Desk Staff',
    'patient'     => 'Client / Patient'
];

$roleDescriptions = [
    'super_admin' => 'Full administrative access and security management across all clinic workspaces.',
    'doctor'      => 'Healthcare provider credentials for patient dental charting, clinical treatments, and prescriptions.',
    'receptionist'=> 'Front-desk operations for live patient queue, arrival check-in, appointments booking, and patient records.',
    'staff'       => 'Front-desk operations for live patient queue, arrival check-in, appointments booking, and patient records.',
    'patient'     => 'Self-service client portal for appointment requests and viewing personal treatment histories.'
];

// Query all RBAC permissions from 'roles_permissions' collection
$allPermissions = $db->find('roles_permissions', []);

$grantedPermissions = [];
$grantedKeys = [];
$modules = [];

foreach ($allPermissions as $perm) {
    $key = $perm['key'] ?? '';
    $permRoles = array_map('strtolower', (array)($perm['roles'] ?? []));

    // Normalize synonyms
    if (in_array('admin', $permRoles)) $permRoles[] = 'super_admin';
    if (in_array('staff', $permRoles)) $permRoles[] = 'receptionist';
    if ($role === 'staff' && in_array('receptionist', $permRoles)) $permRoles[] = 'staff';

    // Super Admin has universal access
    $isGranted = ($role === 'super_admin') || in_array($role, $permRoles);

    if ($isGranted) {
        $modName = $perm['module'] ?? 'General';
        $grantedKeys[] = $key;
        $permItem = [
            "key" => $key,
            "name" => $perm['name'] ?? $key,
            "description" => $perm['description'] ?? '',
            "module" => $modName
        ];
        $grantedPermissions[] = $permItem;
        if (!isset($modules[$modName])) {
            $modules[$modName] = [];
        }
        $modules[$modName][] = $permItem;
    }
}

// Can manage roles/users?
$canManageRoles = in_array('rbac.manage', $grantedKeys) || ($role === 'super_admin');
$canManageUsers = in_array('users.view', $grantedKeys) || in_array('users.create', $grantedKeys) || ($role === 'super_admin');

echo json_encode([
    "status" => "success",
    "user" => [
        "id" => (string) ($user['_id'] ?? $_SESSION['user_id'] ?? ''),
        "full_name" => $user['full_name'] ?? $_SESSION['full_name'] ?? 'Clinic User',
        "email" => $email,
        "role" => $role,
        "role_title" => $roleTitles[$role] ?? ucfirst($role),
        "role_description" => $roleDescriptions[$role] ?? 'Assigned clinic operational role.',
        "position" => $user['position'] ?? 'Clinic Personnel',
        "governed_by" => "Super Admin Access Control Policy"
    ],
    "permission_keys" => $grantedKeys,
    "permissions" => $grantedPermissions,
    "modules" => $modules,
    "capabilities" => [
        "can_manage_roles" => $canManageRoles,
        "can_manage_users" => $canManageUsers,
        "can_view_queue" => in_array('queue.view', $grantedKeys),
        "can_manage_queue" => in_array('queue.manage', $grantedKeys),
        "can_view_appointments" => in_array('appointments.view_all', $grantedKeys),
        "can_create_appointments" => in_array('appointments.create', $grantedKeys),
        "can_view_clinical" => in_array('clinical.view_chart', $grantedKeys),
        "can_edit_clinical" => in_array('clinical.edit_treatment', $grantedKeys),
        "can_view_billing" => in_array('billing.view', $grantedKeys),
        "can_create_billing" => in_array('billing.create', $grantedKeys),
        "can_view_services" => in_array('services.view', $grantedKeys),
        "can_manage_services" => in_array('services.manage', $grantedKeys)
    ]
]);

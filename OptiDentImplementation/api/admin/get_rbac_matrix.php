<?php
/**
 * OptiDent System - Get RBAC Permissions Matrix
 * Endpoint: GET /api/admin/get_rbac_matrix.php
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/../config/auth_guard.php';

AuthGuard::requireRole(['super_admin']);

$rolesList = [
    [
        "id" => "super_admin",
        "name" => "Super Admin",
        "badge" => "badge-super-admin",
        "icon" => "bx bx-shield-quarter",
        "description" => "Executive clinic administrator with unrestricted system control and audit rights."
    ],
    [
        "id" => "doctor",
        "name" => "Doctor (Dentist)",
        "badge" => "role-badge-doctor",
        "icon" => "bx bxs-first-aid",
        "description" => "Licensed dental practitioner managing dental charts, clinical treatments, and doctor schedules."
    ],
    [
        "id" => "receptionist",
        "name" => "Receptionist (Staff)",
        "badge" => "role-badge-receptionist",
        "icon" => "bx bx-user",
        "description" => "Front-desk coordinator managing the live patient queue, appointments, and billing receipts."
    ],
    [
        "id" => "patient",
        "name" => "Client / Patient",
        "badge" => "role-badge-client",
        "icon" => "bx bx-smile",
        "description" => "Registered clinic client accessing self-service booking and personal dental records."
    ]
];

$rawPermissions = $db->find('roles_permissions', []);

// Group permissions by module
$modules = [];
foreach ($rawPermissions as $perm) {
    $modName = $perm['module'] ?? 'General';
    if (!isset($modules[$modName])) {
        $modules[$modName] = [];
    }

    $roles = (array)($perm['roles'] ?? []);
    // Normalize synonyms
    $normalizedRoles = [];
    foreach ($roles as $r) {
        $r = strtolower($r);
        if ($r === 'admin') $r = 'super_admin';
        if ($r === 'client') $r = 'patient';
        $normalizedRoles[] = $r;
    }

    $modules[$modName][] = [
        "key" => $perm['key'],
        "name" => $perm['name'] ?? $perm['key'],
        "description" => $perm['description'] ?? '',
        "roles" => $normalizedRoles
    ];
}

// Get user counts per role for context
$allUsers = $db->find('users', []);
$roleCounts = [
    "super_admin" => 0,
    "doctor" => 0,
    "receptionist" => 0,
    "patient" => 0
];
foreach ($allUsers as $u) {
    $r = strtolower($u['role'] ?? 'patient');
    if ($r === 'admin') $r = 'super_admin';
    if ($r === 'client') $r = 'patient';
    if (isset($roleCounts[$r])) {
        $roleCounts[$r]++;
    }
}

foreach ($rolesList as &$roleItem) {
    $roleItem['user_count'] = $roleCounts[$roleItem['id']] ?? 0;
}

echo json_encode([
    "status" => "success",
    "roles" => $rolesList,
    "modules" => $modules
]);

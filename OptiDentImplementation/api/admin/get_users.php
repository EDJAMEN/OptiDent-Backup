<?php
/**
 * OptiDent System - Get Users List Endpoint
 * Task SA-003: Multi-User Management - Fetch & Filter Users
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
    echo json_encode(["status" => "error", "message" => "Access denied. Only Super Admin can view all users."]);
    exit;
}

$roleFilter = strtolower(trim($_GET['role'] ?? 'all'));
$statusFilter = strtolower(trim($_GET['status'] ?? 'all'));
$searchTerm = strtolower(trim($_GET['search'] ?? ''));

// Build Mongo query filter
$filter = [];
if ($roleFilter !== 'all' && !empty($roleFilter)) {
    // Map patient / client synonym
    if ($roleFilter === 'client') {
        $filter['role'] = 'patient';
    } else {
        $filter['role'] = $roleFilter;
    }
}

if ($statusFilter !== 'all' && !empty($statusFilter)) {
    $filter['status'] = $statusFilter;
}

$allUsers = $db->find('users', $filter);

// Format and sanitize output (hide password hashes)
$sanitizedUsers = [];
foreach ($allUsers as $u) {
    // SA-006: Exclude soft-deleted records from standard active view
    if (!empty($u['is_deleted']) && $u['is_deleted'] === true) {
        continue;
    }
    if (($u['status'] ?? '') === 'deleted') {
        continue;
    }
    // SA-007: Exclude archived records from standard active view
    if (!empty($u['is_archived']) && $u['is_archived'] === true) {
        continue;
    }

    $id = is_array($u['_id'] ?? null) ? ($u['_id']['$oid'] ?? (string)$u['_id']) : (string)($u['_id'] ?? '');
    
    // Filter by search term if provided
    if (!empty($searchTerm)) {
        $haystack = strtolower(($u['full_name'] ?? '') . ' ' . ($u['email'] ?? '') . ' ' . ($u['phone'] ?? '') . ' ' . ($u['role'] ?? ''));
        if (strpos($haystack, $searchTerm) === false) {
            continue;
        }
    }

    $createdAt = $u['created_at'] ?? '';
    if (is_array($createdAt)) {
        if (isset($createdAt['$date'])) {
            $createdAt = is_string($createdAt['$date']) ? $createdAt['$date'] : date('Y-m-d H:i:s', (int)(($createdAt['$date']['$numberLong'] ?? 0) / 1000));
        } else {
            $createdAt = date('Y-m-d H:i:s');
        }
    }

    $sanitizedUsers[] = [
        "id" => $id,
        "full_name" => $u['full_name'] ?? 'Unnamed User',
        "email" => $u['email'] ?? '',
        "phone" => $u['phone'] ?? '',
        "role" => $u['role'] ?? 'patient',
        "status" => $u['status'] ?? 'active',
        "is_master" => (bool) ($u['is_master'] ?? false),
        "is_active" => (bool) ($u['is_active'] ?? true),
        "professional_id" => $u['professional_id'] ?? '',
        "position" => $u['position'] ?? '',
        "reward_points" => (int) ($u['reward_points'] ?? 0),
        "created_at" => (string)$createdAt
    ];
}

// Sort by creation date descending
usort($sanitizedUsers, function($a, $b) {
    $timeA = is_string($a['created_at'] ?? null) ? strtotime($a['created_at']) : 0;
    $timeB = is_string($b['created_at'] ?? null) ? strtotime($b['created_at']) : 0;
    return ($timeB ?: 0) - ($timeA ?: 0);
});

// Calculate metrics
$counts = [
    "total" => 0,
    "super_admin" => 0,
    "doctor" => 0,
    "receptionist" => 0,
    "client" => 0
];

$allRaw = (empty($filter) && empty($searchTerm)) ? $allUsers : $db->find('users', []);
foreach ($allRaw as $u) {
    if (!empty($u['is_deleted']) && $u['is_deleted'] === true) continue;
    if (($u['status'] ?? '') === 'deleted') continue;

    $counts['total']++;
    $r = strtolower($u['role'] ?? 'patient');
    if ($r === 'super_admin' || $r === 'admin') $counts['super_admin']++;
    else if ($r === 'doctor') $counts['doctor']++;
    else if ($r === 'receptionist') $counts['receptionist']++;
    else if ($r === 'patient' || $r === 'client') $counts['client']++;
}

echo json_encode([
    "status" => "success",
    "users" => $sanitizedUsers,
    "counts" => $counts
]);

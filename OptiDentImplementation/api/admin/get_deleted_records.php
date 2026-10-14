<?php
/**
 * OptiDent System - Get Deleted Records (Vault) Endpoint
 * Task SA-006: Soft Delete & Data Recovery Vault System
 * Retrieves soft-deleted records across collections for recovery
 */

require_once __DIR__ . '/../config/auth_guard.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $db = MongoDBConnection::getInstance();
    $targetCollection = strtolower(trim($_GET['collection'] ?? 'all'));
    $search = strtolower(trim($_GET['search'] ?? ''));

    $deletedItems = [];

    // 1. Soft-deleted Users
    if ($targetCollection === 'all' || $targetCollection === 'users') {
        $users = $db->find('users', []);
        foreach ($users as $u) {
            $isDel = (!empty($u['is_deleted']) && $u['is_deleted'] === true) || (($u['status'] ?? '') === 'deleted');
            if (!$isDel) continue;

            $id = is_array($u['_id'] ?? null) ? ($u['_id']['$oid'] ?? (string)$u['_id']) : (string)($u['_id'] ?? '');
            $name = $u['full_name'] ?? 'Unnamed Account';
            $email = $u['email'] ?? '';
            $role = $u['role'] ?? 'user';

            if (!empty($search)) {
                $haystack = strtolower("{$name} {$email} {$role} " . ($u['deleted_reason'] ?? ''));
                if (strpos($haystack, $search) === false) continue;
            }

            $deletedItems[] = [
                'id'             => $id,
                'collection'     => 'users',
                'title'          => $name,
                'identifier'     => $email,
                'role_or_type'   => $role,
                'deleted_at'     => $u['deleted_at'] ?? ($u['updated_at'] ?? 'Unknown Date'),
                'deleted_by'     => $u['deleted_by'] ?? 'Super Admin',
                'deleted_reason' => $u['deleted_reason'] ?? 'Soft deleted via admin panel',
                'can_purge'      => empty($u['is_master']) // Root admin cannot be purged
            ];
        }
    }

    // 2. Soft-deleted Invitations
    if ($targetCollection === 'all' || $targetCollection === 'invitations') {
        $invites = $db->find('invitations', []);
        foreach ($invites as $inv) {
            $isDel = (!empty($inv['is_deleted']) && $inv['is_deleted'] === true) || (($inv['status'] ?? '') === 'cancelled' || ($inv['status'] ?? '') === 'deleted');
            if (!$isDel) continue;

            $id = is_array($inv['_id'] ?? null) ? ($inv['_id']['$oid'] ?? (string)$inv['_id']) : (string)($inv['_id'] ?? '');
            $email = $inv['email'] ?? '';
            $role = $inv['role'] ?? 'staff';

            if (!empty($search)) {
                $haystack = strtolower("{$email} {$role} " . ($inv['deleted_reason'] ?? ''));
                if (strpos($haystack, $search) === false) continue;
            }

            $deletedItems[] = [
                'id'             => $id,
                'collection'     => 'invitations',
                'title'          => "Invitation for {$email}",
                'identifier'     => $email,
                'role_or_type'   => $role,
                'deleted_at'     => $inv['deleted_at'] ?? ($inv['cancelled_at'] ?? ($inv['updated_at'] ?? 'Unknown Date')),
                'deleted_by'     => $inv['deleted_by'] ?? 'Super Admin',
                'deleted_reason' => $inv['deleted_reason'] ?? 'Cancelled invitation moved to vault',
                'can_purge'      => true
            ];
        }
    }

    // Sort by deleted_at descending
    usort($deletedItems, function($a, $b) {
        return strcmp($b['deleted_at'] ?? '', $a['deleted_at'] ?? '');
    });

    echo json_encode([
        'status' => 'success',
        'count'  => count($deletedItems),
        'items'  => $deletedItems
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to load vault items: ' . $e->getMessage()
    ]);
}

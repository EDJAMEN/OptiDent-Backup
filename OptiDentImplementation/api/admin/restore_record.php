<?php
/**
 * OptiDent System - Restore Soft-Deleted Record Endpoint
 * Task SA-006: Soft Delete & Data Recovery Vault System
 * Restores a soft-deleted item back to active status
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    $collection = strtolower(trim($input['collection'] ?? ''));
    $id         = trim($input['id'] ?? '');
    $identifier = trim($input['identifier'] ?? '');

    if (empty($collection) || (empty($id) && empty($identifier))) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Collection and record identifier are required.']);
        exit;
    }

    $db = MongoDBConnection::getInstance();
    $filter = [];
    if (!empty($identifier) && $collection === 'users') {
        $filter = ['email' => $identifier];
    } elseif (!empty($id)) {
        $filter = ['_id' => $id];
    }

    $existing = $db->findOne($collection, $filter);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => "Record not found in collection '{$collection}'."]);
        exit;
    }

    $actorEmail = $_SESSION['email'] ?? 'super_admin';
    $now = date('Y-m-d H:i:s');

    if ($collection === 'users') {
        $updateData = [
            'is_deleted'  => false,
            'status'      => 'active',
            'is_active'   => true,
            'restored_at' => $now,
            'restored_by' => $actorEmail
        ];
        $db->updateOne('users', $filter, ['$set' => $updateData]);

        AuditLogger::log('RECORD_RESTORED', "user:{$existing['email']}", [
            'name' => $existing['full_name'] ?? '',
            'role' => $existing['role'] ?? ''
        ]);

        echo json_encode([
            'status'  => 'success',
            'message' => "User account for {$existing['full_name']} ({$existing['email']}) was successfully restored to active status."
        ]);
        exit;
    } elseif ($collection === 'invitations') {
        $updateData = [
            'is_deleted'  => false,
            'status'      => 'pending',
            'restored_at' => $now,
            'restored_by' => $actorEmail
        ];
        $db->updateOne('invitations', $filter, ['$set' => $updateData]);

        AuditLogger::log('RECORD_RESTORED', "invitation:{$existing['email']}", [
            'role' => $existing['role'] ?? ''
        ]);

        echo json_encode([
            'status'  => 'success',
            'message' => "Invitation for {$existing['email']} was restored to pending status."
        ]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => "Unsupported collection '{$collection}'."]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to restore record: ' . $e->getMessage()
    ]);
}

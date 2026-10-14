<?php
/**
 * OptiDent System - Permanent Purge Record Endpoint
 * Task SA-006: Soft Delete & Data Recovery Vault System
 * Executes hard deletion of soft-deleted items from MongoDB
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

    // Protection Safeguard: Root Master Admin can NEVER be purged
    if ($collection === 'users' && !empty($existing['is_master']) && $existing['is_master'] === true) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Protected Account: The primary Master Super Admin cannot be permanently purged.']);
        exit;
    }

    // Execute Hard Delete
    $deletedCount = $db->deleteOne($collection, $filter);

    $targetName = $existing['full_name'] ?? ($existing['email'] ?? 'Record');

    AuditLogger::log('RECORD_PERMANENTLY_PURGED', "{$collection}:" . ($existing['email'] ?? $id), [
        'purged_by' => $_SESSION['email'] ?? 'super_admin',
        'title'     => $targetName
    ]);

    echo json_encode([
        'status'  => 'success',
        'message' => "Record '{$targetName}' was permanently purged from MongoDB collection '{$collection}'."
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to purge record: ' . $e->getMessage()
    ]);
}

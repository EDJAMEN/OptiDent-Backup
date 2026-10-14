<?php
/**
 * OptiDent System - Unarchive Record Endpoint
 * Task SA-007: Data Archiving & Historical Preservation
 * Restores an archived historical record back to active operational status
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/db.php';
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

    $allowedCollections = ['appointments', 'users', 'invitations'];
    if (!in_array($collection, $allowedCollections)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => "Unsupported collection '{$collection}'."]);
        exit;
    }

    $db = MongoDBConnection::getInstance();
    $filter = [];
    if (!empty($identifier) && ($collection === 'users' || $collection === 'invitations')) {
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

    $unarchiveData = [
        'is_archived'   => false,
        'unarchived_at' => $now,
        'unarchived_by' => $actorEmail
    ];

    $db->updateOne($collection, $filter, ['$set' => $unarchiveData]);

    $targetName = $existing['full_name'] ?? ($existing['patient_name'] ?? ($existing['email'] ?? 'Record'));

    AuditLogger::log('RECORD_UNARCHIVED', "{$collection}:" . ($existing['email'] ?? $id), [
        'title'         => $targetName,
        'collection'    => $collection,
        'unarchived_by' => $actorEmail
    ]);

    echo json_encode([
        'status'  => 'success',
        'message' => "Record '{$targetName}' was unarchived and restored to active status."
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to unarchive record: ' . $e->getMessage()
    ]);
}

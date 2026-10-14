<?php
/**
 * OptiDent System - Archive Record Endpoint
 * Task SA-007: Data Archiving & Historical Preservation
 * Moves an operational record into the historical archive
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
    $reason     = trim($input['reason'] ?? 'Moved to historical archives by Master Admin');

    if (empty($collection) || (empty($id) && empty($identifier))) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Collection and record identifier are required.']);
        exit;
    }

    $allowedCollections = ['appointments', 'users', 'invitations'];
    if (!in_array($collection, $allowedCollections)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => "Unsupported archive collection '{$collection}'."]);
        exit;
    }

    $db = MongoDBConnection::getInstance();
    $filter = [];
    if (!empty($identifier) && $collection === 'users') {
        $filter = ['email' => $identifier];
    } elseif (!empty($identifier) && $collection === 'invitations') {
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

    // Protection Safeguard: Root Master Admin can NEVER be archived
    if ($collection === 'users' && !empty($existing['is_master']) && $existing['is_master'] === true) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Protected Account: The primary Master Super Admin cannot be archived.']);
        exit;
    }

    $actorEmail = $_SESSION['email'] ?? 'super_admin';
    $now = date('Y-m-d H:i:s');

    $archiveData = [
        'is_archived'    => true,
        'archived_at'    => $now,
        'archived_by'    => $actorEmail,
        'archive_reason' => $reason
    ];

    $db->updateOne($collection, $filter, ['$set' => $archiveData]);

    $targetName = $existing['full_name'] ?? ($existing['patient_name'] ?? ($existing['email'] ?? 'Record'));

    AuditLogger::log('RECORD_ARCHIVED', "{$collection}:" . ($existing['email'] ?? $id), [
        'title'       => $targetName,
        'collection'  => $collection,
        'reason'      => $reason,
        'archived_by' => $actorEmail
    ]);

    echo json_encode([
        'status'  => 'success',
        'message' => "Record '{$targetName}' was archived to historical storage."
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to archive record: ' . $e->getMessage()
    ]);
}

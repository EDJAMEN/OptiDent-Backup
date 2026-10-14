<?php
/**
 * OptiDent System - Get Administrative Audit Logs API
 * Task SA-005: Master Administrator Rights
 * Returns chronological ledger of administrative events
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $limit  = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 50;
    $action = !empty($_GET['action']) ? trim($_GET['action']) : null;

    $logs = AuditLogger::getRecent($limit, $action);

    global $db;
    $totalCount = 0;
    try {
        $allLogs = $db->find('audit_logs', []);
        $totalCount = count($allLogs);
    } catch (\Exception $e) {
        $totalCount = count($logs);
    }

    echo json_encode([
        "status"      => "success",
        "total_count" => $totalCount,
        "returned"    => count($logs),
        "logs"        => $logs
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to fetch audit logs: " . $e->getMessage()
    ]);
}

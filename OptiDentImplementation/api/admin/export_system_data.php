<?php
/**
 * OptiDent System - System Data & Backup Export API
 * Task SA-005: Master Administrator Rights
 * Exports database collections in JSON or CSV format
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin']);

    global $db;
    $collection = strtolower(trim($_GET['collection'] ?? 'all'));
    $format     = strtolower(trim($_GET['format'] ?? 'json'));
    $timestamp  = date('Y-m-d_His');

    // Available collections
    $allCollections = ['users', 'roles_permissions', 'invitations', 'system_settings', 'audit_logs'];

    // Audit log this export action
    AuditLogger::log('BACKUP_EXPORT', "system:{$collection}", [
        'format'     => $format,
        'collection' => $collection
    ]);

    if ($format === 'pdf') {
        $_GET['report'] = $collection;
        require __DIR__ . '/export_pdf.php';
        exit;
    }

    if ($collection === 'all' || $collection === 'full_backup') {
        // Full database JSON backup
        $fullDump = [
            'database'     => 'OptiDent',
            'exported_at'  => date('Y-m-d H:i:s'),
            'exported_by'  => $_SESSION['email'] ?? 'super_admin',
            'collections'  => []
        ];

        foreach ($allCollections as $col) {
            $docs = $db->find($col, []);
            // Sanitize sensitive fields in users
            if ($col === 'users') {
                $docs = array_map(function($u) {
                    unset($u['password_hash']);
                    return $u;
                }, $docs);
            }
            $fullDump['collections'][$col] = $docs;
        }

        $filename = "optident_full_backup_{$timestamp}.json";
        header('Content-Type: application/json; charset=UTF-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Pragma: no-cache');
        header('Expires: 0');
        echo json_encode($fullDump, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Specific single collection
    $docs = $db->find($collection, []);

    // Remove password_hash if users collection
    if ($collection === 'users') {
        $docs = array_map(function($u) {
            unset($u['password_hash']);
            return $u;
        }, $docs);
    }

    if ($format === 'csv') {
        $filename = "optident_{$collection}_{$timestamp}.csv";
        header('Content-Type: text/csv; charset=UTF-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Pragma: no-cache');
        header('Expires: 0');

        $out = fopen('php://output', 'w');
        // Add UTF-8 BOM for Excel compatibility
        fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

        if (!empty($docs)) {
            // Collect all unique keys for headers
            $headers = [];
            foreach ($docs as $doc) {
                foreach (array_keys($doc) as $k) {
                    if (!in_array($k, $headers)) {
                        $headers[] = $k;
                    }
                }
            }
            fputcsv($out, $headers);

            foreach ($docs as $doc) {
                $row = [];
                foreach ($headers as $h) {
                    $val = $doc[$h] ?? '';
                    if (is_array($val) || is_object($val)) {
                        $val = json_encode($val, JSON_UNESCAPED_SLASHES);
                    }
                    $row[] = (string)$val;
                }
                fputcsv($out, $row);
            }
        } else {
            fputcsv($out, ['info']);
            fputcsv($out, ["No records found in collection '{$collection}'"]);
        }

        fclose($out);
        exit;
    }

    // Single collection JSON
    $filename = "optident_{$collection}_{$timestamp}.json";
    header('Content-Type: application/json; charset=UTF-8');
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    echo json_encode([
        'collection'  => $collection,
        'exported_at' => date('Y-m-d H:i:s'),
        'count'       => count($docs),
        'records'     => $docs
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;

} catch (\Exception $e) {
    http_response_code(500);
    echo "Export Error: " . htmlspecialchars($e->getMessage());
}

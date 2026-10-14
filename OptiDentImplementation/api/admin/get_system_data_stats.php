<?php
/**
 * OptiDent System - System Data & Storage Health Stats API
 * Task SA-005: Master Administrator Rights
 * Returns collection counts, storage engine status, and runtime metrics
 */

require_once __DIR__ . '/../config/auth_guard.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    global $db;
    $collections = ['users', 'roles_permissions', 'invitations', 'system_settings', 'audit_logs'];
    $collectionStats = [
        'users'             => 0,
        'roles_permissions' => 0,
        'invitations'       => 0,
        'system_settings'   => 0,
        'audit_logs'        => 0
    ];
    $totalDocs = 0;
    $isMongoConnected = false;

    // Check if MongoDB port 27017 is open
    $fp = @fsockopen('127.0.0.1', 27017, $errno, $errstr, 0.5);
    if ($fp) {
        $isMongoConnected = true;
        fclose($fp);
    }

    if ($isMongoConnected) {
        // Fast batch count via single mongosh script
        $js = 'const r={users:db.users.countDocuments(),roles_permissions:db.roles_permissions.countDocuments(),invitations:db.invitations.countDocuments(),system_settings:db.system_settings.countDocuments(),audit_logs:db.audit_logs.countDocuments()};print(JSON.stringify(r));';
        $escapedJs = addcslashes($js, '"');
        $cmd = "mongosh \"mongodb://127.0.0.1:27017/OptiDent\" --quiet --eval \"{$escapedJs}\" 2>&1";
        $raw = @shell_exec($cmd);
        if ($raw) {
            $start = strpos($raw, '{');
            if ($start !== false) {
                $parsed = json_decode(substr($raw, $start), true);
                if (is_array($parsed)) {
                    $collectionStats = array_merge($collectionStats, $parsed);
                }
            }
        }
    }

    // If counts are still 0, check fallback storage
    $fallbackFile = __DIR__ . '/../../database_mongo_storage.json';
    if (file_exists($fallbackFile)) {
        $fbData = json_decode(file_get_contents($fallbackFile), true) ?? [];
        foreach ($collectionStats as $col => $cnt) {
            if ($cnt === 0 && isset($fbData[$col]) && is_array($fbData[$col])) {
                $collectionStats[$col] = count($fbData[$col]);
            }
        }
    }

    foreach ($collectionStats as $c) {
        $totalDocs += (int)$c;
    }

    echo json_encode([
        "status" => "success",
        "stats"  => [
            "storage_mode"       => $isMongoConnected ? "mongodb_native" : "json_fallback",
            "mongo_connected"    => $isMongoConnected,
            "total_documents"    => $totalDocs,
            "collections"        => $collectionStats,
            "server_php_version" => PHP_VERSION,
            "timezone"           => date_default_timezone_get(),
            "server_time"        => date('Y-m-d H:i:s')
        ]
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to inspect system statistics: " . $e->getMessage()
    ]);
}

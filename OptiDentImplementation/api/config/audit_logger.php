<?php
/**
 * OptiDent System - Audit Logger Helper
 * Task SA-005: Master Administrator Rights - System Audit Trail
 * Records administrative and security events into MongoDB (audit_logs collection)
 */

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

class AuditLogger {
    /**
     * Log an administrative or system event
     *
     * @param string $action  e.g. 'USER_CREATE', 'ROLE_UPDATE', 'SETTINGS_UPDATE', 'BACKUP_EXPORT'
     * @param string $target  e.g. 'user:doctor@optident.com', 'roles:doctor', 'system:clinic_profile'
     * @param array  $details Additional metadata or key-value changes
     * @param string $status  'SUCCESS' or 'WARNING' or 'FAILED'
     * @return string|null    Inserted document ID
     */
    public static function log($action, $target, $details = [], $status = 'SUCCESS') {
        global $db;

        $actorId = $_SESSION['user_id'] ?? 'system';
        $actorEmail = $_SESSION['email'] ?? 'system@optident.com';
        $actorName = $_SESSION['name'] ?? ($_SESSION['role'] ?? 'System Core');
        $actorRole = $_SESSION['role'] ?? 'system';

        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
        }

        $logEntry = [
            'actor_id'    => (string)$actorId,
            'actor_name'  => (string)$actorName,
            'actor_email' => (string)$actorEmail,
            'actor_role'  => (string)$actorRole,
            'action'      => strtoupper((string)$action),
            'target'      => (string)$target,
            'details'     => $details,
            'status'      => strtoupper((string)$status),
            'ip_address'  => (string)$ip,
            'user_agent'  => substr($_SERVER['HTTP_USER_AGENT'] ?? 'CLI/Internal', 0, 120),
            'created_at'  => date('Y-m-d H:i:s')
        ];

        try {
            return $db->insertOne('audit_logs', $logEntry);
        } catch (\Exception $e) {
            error_log("AuditLogger Error: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Fetch recent audit logs with optional filtering
     */
    public static function getRecent($limit = 50, $actionFilter = null) {
        global $db;
        $filter = [];
        if (!empty($actionFilter)) {
            $filter['action'] = strtoupper($actionFilter);
        }

        $options = [
            'limit' => (int)$limit,
            'sort'  => ['created_at' => -1]
        ];

        $logs = $db->find('audit_logs', $filter, $options);

        // Fallback sort if driver didn't sort natively
        usort($logs, function($a, $b) {
            return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
        });

        return array_slice($logs, 0, (int)$limit);
    }
}

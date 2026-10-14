<?php
/**
 * OptiDent System - RBAC Authorization Guard Middleware
 * Enforces role-based and permission-based access control across API endpoints
 */

require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

class AuthGuard {
    private static $cachedPermissions = null;

    /**
     * Ensure user is logged in
     */
    public static function checkAuth() {
        if (!isset($_SESSION['user_id']) || empty($_SESSION['role'])) {
            http_response_code(401);
            echo json_encode([
                "status" => "error",
                "code" => "UNAUTHORIZED",
                "message" => "Session expired or authentication required. Please log in."
            ]);
            exit;
        }
        return $_SESSION;
    }

    /**
     * Enforce specific allowed roles (e.g. ['super_admin', 'doctor'])
     */
    public static function requireRole($allowedRoles = []) {
        $session = self::checkAuth();
        $userRole = strtolower($session['role'] ?? '');

        // Normalize admin synonyms
        if ($userRole === 'admin') $userRole = 'super_admin';
        if ($userRole === 'client') $userRole = 'patient';

        $normalizedAllowed = array_map(function($r) {
            $r = strtolower($r);
            if ($r === 'admin') return 'super_admin';
            if ($r === 'client') return 'patient';
            return $r;
        }, (array)$allowedRoles);

        if (!in_array($userRole, $normalizedAllowed)) {
            http_response_code(403);
            echo json_encode([
                "status" => "error",
                "code" => "FORBIDDEN",
                "message" => "Access denied. Your role (" . ucfirst($userRole) . ") does not have permission to access this resource."
            ]);
            exit;
        }

        return $session;
    }

    /**
     * Enforce specific permission key (e.g. 'users.create', 'clinical.view_chart')
     */
    public static function requirePermission($permissionKey) {
        $session = self::checkAuth();
        $userRole = strtolower($session['role'] ?? '');
        if ($userRole === 'admin') $userRole = 'super_admin';
        if ($userRole === 'client') $userRole = 'patient';

        // Super Admin always has full access
        if ($userRole === 'super_admin') {
            return $session;
        }

        if (!self::hasPermission($userRole, $permissionKey)) {
            http_response_code(403);
            echo json_encode([
                "status" => "error",
                "code" => "FORBIDDEN",
                "message" => "Access denied. Missing required permission: '{$permissionKey}'."
            ]);
            exit;
        }

        return $session;
    }

    /**
     * Check if a role possesses a permission
     */
    public static function hasPermission($role, $permissionKey) {
        global $db;
        $role = strtolower($role);
        if ($role === 'admin') $role = 'super_admin';
        if ($role === 'client') $role = 'patient';

        if ($role === 'super_admin') return true;

        if (self::$cachedPermissions === null) {
            self::$cachedPermissions = $db->find('roles_permissions', []);
        }

        foreach (self::$cachedPermissions as $p) {
            if ($p['key'] === $permissionKey) {
                $roles = array_map('strtolower', (array)($p['roles'] ?? []));
                return in_array($role, $roles);
            }
        }

        return false;
    }
}

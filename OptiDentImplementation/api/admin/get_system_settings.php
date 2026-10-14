<?php
/**
 * OptiDent System - Get System Settings API
 * Task SA-005: Master Administrator Rights
 * Returns clinic profile, system rules, and security configuration
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    global $db;
    $settings = ClinicHoursHelper::getActiveClinicProfile($db);

    echo json_encode([
        "status"   => "success",
        "settings" => $settings
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to fetch settings: " . $e->getMessage()
    ]);
}

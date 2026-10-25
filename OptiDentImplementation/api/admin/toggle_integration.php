<?php
/**
 * OptiDent System - Toggle System Integration & Prone Function Switch API
 * Task SA-008: Settings & System Controls
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $input = file_get_contents('php://input');
    $data  = json_decode($input, true);

    if (!$data || !is_array($data) || !isset($data['integration'])) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Integration name and state are required."]);
        exit;
    }

    $integration = trim((string)$data['integration']);
    $enabled = !empty($data['enabled']);

    $allowedIntegrations = [
        'google_auth_enabled',
        'allow_non_admin_logins',
        'smtp_email_enabled',
        'sms_gateway_enabled',
        'patient_self_registration',
        'patient_online_booking',
        'patient_rescheduling_enabled',
        'maintenance_mode'
    ];

    if (!in_array($integration, $allowedIntegrations, true)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Unknown integration: {$integration}"]);
        exit;
    }

    global $db;
    $existing = ClinicHoursHelper::getActiveClinicProfile($db);
    $integrations = $existing['integrations'] ?? [];

    $integrations[$integration] = $enabled;

    // If disabling Google Auth, also disable general non-admin logins as requested by user
    if ($integration === 'google_auth_enabled' && !$enabled) {
        $integrations['allow_non_admin_logins'] = false;
    } else if ($integration === 'google_auth_enabled' && $enabled) {
        $integrations['allow_non_admin_logins'] = true;
    }

    // If toggling maintenance mode, sync both
    if ($integration === 'maintenance_mode') {
        $integrations['maintenance_mode'] = $enabled;
    }

    $updatePayload = [
        'integrations' => $integrations,
        'updated_at'   => date('Y-m-d H:i:s'),
        'updated_by'   => $_SESSION['email'] ?? 'super_admin'
    ];

    if ($integration === 'maintenance_mode') {
        $updatePayload['maintenance_mode'] = $enabled;
    }

    $db->updateOne('system_settings', ['setting_type' => 'clinic_profile'], [
        '$set' => $updatePayload
    ]);

    // Audit Trail
    AuditLogger::log('INTEGRATION_TOGGLE', "system:{$integration}", [
        'integration' => $integration,
        'state'       => $enabled ? 'ENABLED' : 'DISABLED',
        'admin'       => $_SESSION['email'] ?? 'super_admin'
    ]);

    $stateText = $enabled ? 'enabled' : 'disabled';
    $labelMap = [
        'google_auth_enabled'          => 'Google Auth & Non-Admin Logins',
        'allow_non_admin_logins'       => 'Non-Admin User Logins',
        'smtp_email_enabled'           => 'Gmail / SMTP Email Gateway',
        'sms_gateway_enabled'          => 'SMS Mobile Gateway',
        'patient_self_registration'    => 'Public Patient Self-Registration',
        'patient_online_booking'       => 'Online Patient Self-Booking',
        'patient_rescheduling_enabled' => 'Patient Self-Rescheduling & Cancellation',
        'maintenance_mode'             => 'Emergency Maintenance Mode'
    ];
    $displayLabel = $labelMap[$integration] ?? $integration;

    echo json_encode([
        "status"       => "success",
        "message"      => "{$displayLabel} successfully {$stateText}.",
        "integration"  => $integration,
        "enabled"      => $enabled,
        "integrations" => $integrations
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to update integration switch: " . $e->getMessage()
    ]);
}

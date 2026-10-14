<?php
/**
 * OptiDent System - Update System Settings API
 * Task SA-005: Master Administrator Rights
 * Saves clinic profile, system rules, and security configuration
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';
require_once __DIR__ . '/../config/clinic_hours_helper.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $input = file_get_contents('php://input');
    $data  = json_decode($input, true);

    if (!$data || !is_array($data)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Invalid JSON payload."]);
        exit;
    }

    $clinicName    = trim($data['clinic_name'] ?? '');
    $tagline       = trim($data['tagline'] ?? '');
    $contactEmail  = trim($data['contact_email'] ?? '');
    $contactPhone  = trim($data['contact_phone'] ?? '');
    $address       = trim($data['address'] ?? '');
    $operatingDays = trim($data['operating_days'] ?? 'Mon - Sat');
    $openingTime   = trim($data['opening_time'] ?? '08:00 AM');
    $closingTime   = trim($data['closing_time'] ?? '05:00 PM');
    $lunchBreak    = isset($data['lunch_break']) ? !empty($data['lunch_break']) : true;

    // Generate dynamic master time slots
    $timeSlots     = ClinicHoursHelper::generateSlots($openingTime, $closingTime, $lunchBreak);
    $operatingHours= !empty($data['operating_hours']) ? trim($data['operating_hours']) : ClinicHoursHelper::compileHoursText($operatingDays, $openingTime, $closingTime);

    $timezone      = trim($data['timezone'] ?? 'Asia/Manila');
    $sessionTimeout= max(15, min(1440, (int)($data['session_timeout_minutes'] ?? 60)));
    $maxAttempts   = max(3, min(10, (int)($data['max_login_attempts'] ?? 5)));
    $maintenance   = !empty($data['maintenance_mode']);

    if (empty($clinicName) || empty($contactEmail)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Clinic name and contact email are required."]);
        exit;
    }

    global $db;

    $updatedFields = [
        'setting_type'            => 'clinic_profile',
        'clinic_name'             => $clinicName,
        'tagline'                 => $tagline,
        'contact_email'           => $contactEmail,
        'contact_phone'           => $contactPhone,
        'address'                 => $address,
        'operating_days'          => $operatingDays,
        'opening_time'            => $openingTime,
        'closing_time'            => $closingTime,
        'lunch_break'             => $lunchBreak,
        'operating_hours'         => $operatingHours,
        'time_slots'              => array_values($timeSlots),
        'timezone'                => $timezone,
        'maintenance_mode'        => $maintenance,
        'session_timeout_minutes' => $sessionTimeout,
        'max_login_attempts'      => $maxAttempts,
        'updated_at'              => date('Y-m-d H:i:s'),
        'updated_by'              => $_SESSION['email'] ?? 'super_admin'
    ];

    $existing = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);
    if ($existing) {
        $db->updateOne('system_settings', ['setting_type' => 'clinic_profile'], $updatedFields);
    } else {
        $db->insertOne('system_settings', $updatedFields);
    }

    // Log the update action
    AuditLogger::log('SETTINGS_UPDATE', 'system:clinic_profile', [
        'clinic_name'      => $clinicName,
        'maintenance_mode' => $maintenance ? 'ENABLED' : 'DISABLED',
        'session_timeout'  => "{$sessionTimeout}m"
    ]);

    echo json_encode([
        "status"   => "success",
        "message"  => "Clinic & security configuration saved successfully.",
        "settings" => $updatedFields
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to update system settings: " . $e->getMessage()
    ]);
}

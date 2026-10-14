<?php
/**
 * OptiDent System - System Settings Initial Seeder
 * Task SA-005: Master Administrator Rights
 * Seeds default clinic configuration, security parameters, and initial audit logs into MongoDB
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit_logger.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    // 1. Check if settings already exist
    $existingSettings = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);

    $defaultSettings = [
        'setting_type'            => 'clinic_profile',
        'clinic_name'             => 'OptiDent Dental Clinic',
        'tagline'                 => 'Advanced Digital Dental Care & Management',
        'contact_email'           => 'admin@optident.com',
        'contact_phone'           => '+63 (032) 412-8899',
        'address'                 => 'Suite 402, MedTech Tower, Osmeña Blvd, Cebu City, Philippines',
        'operating_days'          => 'Mon - Sat',
        'opening_time'            => '08:00 AM',
        'closing_time'            => '05:00 PM',
        'lunch_break'             => true,
        'operating_hours'         => 'Mon - Sat: 08:00 AM - 05:00 PM | Sun: Closed',
        'time_slots'              => ['08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'],
        'timezone'                => 'Asia/Manila',
        'maintenance_mode'        => false,
        'session_timeout_minutes' => 60,
        'max_login_attempts'      => 5,
        'password_min_length'     => 8,
        'system_version'          => '1.5.0-PROD',
        'database_engine'         => 'MongoDB 7.x Native',
        'updated_at'              => date('Y-m-d H:i:s'),
        'updated_by'              => 'Super Admin (System Core)'
    ];

    if ($existingSettings) {
        $db->updateOne('system_settings', ['setting_type' => 'clinic_profile'], ['$set' => $defaultSettings]);
        $statusMsg = "System settings already existed - refreshed with standard defaults.";
    } else {
        $db->insertOne('system_settings', $defaultSettings);
        $statusMsg = "Initialized system settings collection successfully.";
    }

    // 2. Log initial audit entry
    AuditLogger::log(
        'SYSTEM_INIT',
        'system:clinic_profile',
        ['message' => 'Master Administrator initialized system settings and security policies.'],
        'SUCCESS'
    );

    echo json_encode([
        "status"   => "success",
        "message"  => $statusMsg,
        "settings" => $defaultSettings
    ], JSON_PRETTY_PRINT);

} catch (\Exception $e) {
    echo json_encode([
        "status"  => "error",
        "message" => "Failed to seed system settings: " . $e->getMessage()
    ]);
}

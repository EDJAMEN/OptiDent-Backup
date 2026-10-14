<?php
/**
 * OptiDent System - Super Admin Account Seeder
 * Task SA-001: Create Initial Super Admin Credentials in MongoDB
 */

header("Content-Type: application/json; charset=UTF-8");
require_once __DIR__ . '/db.php';

$superAdminEmail = 'superadmin@optident.com';
$superAdminPass = 'Admin123!';

// Check if super admin already exists
$existingUser = $db->findOne('users', ['email' => $superAdminEmail]);

if ($existingUser) {
    echo json_encode([
        "status" => "info",
        "message" => "Super Admin account already exists in MongoDB.",
        "credentials" => [
            "email" => $superAdminEmail,
            "password" => $superAdminPass,
            "role" => "super_admin"
        ]
    ], JSON_PRETTY_PRINT);
    exit;
}

// Seed Super Admin Document into 'users' collection
$superAdminDoc = [
    "full_name" => "Dr. Super Admin",
    "email" => $superAdminEmail,
    "phone" => "09171234567",
    "password_hash" => password_hash($superAdminPass, PASSWORD_BCRYPT),
    "role" => "super_admin",
    "status" => "active",
    "is_master" => true,
    "is_active" => true,
    "professional_id" => "SA-001-LICENSE",
    "position" => "Chief Executive Dental Officer",
    "dob" => "1985-05-15",
    "emergency_contact_name" => "Clinic Hotline",
    "emergency_contact_phone" => "09179998888",
    "allergies" => "None",
    "medications" => "None",
    "reward_points" => 0,
    "created_at" => date('Y-m-d H:i:s')
];

$insertedId = $db->insertOne('users', $superAdminDoc);

echo json_encode([
    "status" => "success",
    "message" => "Super Admin account created successfully in MongoDB!",
    "user_id" => $insertedId,
    "credentials" => [
        "email" => $superAdminEmail,
        "password" => $superAdminPass,
        "role" => "super_admin"
    ]
], JSON_PRETTY_PRINT);

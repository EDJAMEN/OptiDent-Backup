<?php
/**
 * OptiDent System - Seed RBAC Permissions Matrix
 * Seeds default role-based permissions into MongoDB 'roles_permissions' collection
 */

require_once __DIR__ . '/db.php';

$defaultPermissions = [
    // 1. User & Staff Management
    [
        "module" => "User Management",
        "key" => "users.view",
        "name" => "View User Accounts",
        "description" => "Ability to view the user list, search accounts, and view user details.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "User Management",
        "key" => "users.create",
        "name" => "Create User Accounts",
        "description" => "Directly register new user accounts across roles.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "User Management",
        "key" => "users.edit",
        "name" => "Edit User Accounts",
        "description" => "Modify user names, phone numbers, and reset passwords.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "User Management",
        "key" => "users.toggle_status",
        "name" => "Suspend / Activate Users",
        "description" => "Deactivate or reactivate user access to the clinic platform.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "User Management",
        "key" => "users.delete",
        "name" => "Delete User Accounts",
        "description" => "Permanently delete accounts from the database.",
        "roles" => ["super_admin"]
    ],

    // 2. Staff Invitations
    [
        "module" => "Staff Invitations",
        "key" => "invitations.send",
        "name" => "Send Staff Invitations",
        "description" => "Send email invitation tokens to doctors and receptionists.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "Staff Invitations",
        "key" => "invitations.manage",
        "name" => "Manage Invitations",
        "description" => "Cancel, resend, or track status of pending invitations.",
        "roles" => ["super_admin"]
    ],

    // 3. Role-Based Access Control
    [
        "module" => "Role & Permission Control",
        "key" => "rbac.manage",
        "name" => "Manage Role Permissions",
        "description" => "Assign roles and configure feature permission toggles per role.",
        "roles" => ["super_admin"]
    ],

    // 4. Clinical & Dental Records
    [
        "module" => "Clinical & Dental Records",
        "key" => "clinical.view_chart",
        "name" => "View Dental Charts & Odontograms",
        "description" => "Access patient tooth charts, conditions, and treatment history.",
        "roles" => ["super_admin", "doctor"]
    ],
    [
        "module" => "Clinical & Dental Records",
        "key" => "clinical.edit_treatment",
        "name" => "Record Treatments & Clinical Notes",
        "description" => "Add diagnoses, treatment procedures, and prescribe medications.",
        "roles" => ["super_admin", "doctor"]
    ],

    // 5. Appointments & Scheduling
    [
        "module" => "Appointments & Scheduling",
        "key" => "appointments.view_all",
        "name" => "View All Clinic Appointments",
        "description" => "Access the central clinic calendar and doctor schedules.",
        "roles" => ["super_admin", "doctor", "receptionist"]
    ],
    [
        "module" => "Appointments & Scheduling",
        "key" => "appointments.create",
        "name" => "Book Appointments for Patients",
        "description" => "Schedule new appointments for walk-in or calling patients.",
        "roles" => ["super_admin", "doctor", "receptionist"]
    ],
    [
        "module" => "Appointments & Scheduling",
        "key" => "appointments.client_book",
        "name" => "Self-Service Appointment Booking",
        "description" => "Patients can request and schedule their own dental appointments.",
        "roles" => ["super_admin", "patient"]
    ],
    [
        "module" => "Appointments & Scheduling",
        "key" => "appointments.cancel",
        "name" => "Cancel Appointments",
        "description" => "Ability for receptionists and doctors to cancel scheduled appointments, mark no-shows, and record cancellation reasons.",
        "roles" => ["super_admin", "receptionist", "doctor"]
    ],

    // 6. Global Queue Management
    [
        "module" => "Global Queue",
        "key" => "queue.view",
        "name" => "View Live Waiting Queue",
        "description" => "Monitor current waiting line and patient queue numbers.",
        "roles" => ["super_admin", "doctor", "receptionist", "patient"]
    ],
    [
        "module" => "Global Queue",
        "key" => "queue.manage",
        "name" => "Call & Update Queue Status",
        "description" => "Advance queue, call next patient to chair, mark completed.",
        "roles" => ["super_admin", "doctor", "receptionist"]
    ],

    // 7. Billing & Invoicing
    [
        "module" => "Billing & Invoices",
        "key" => "billing.view",
        "name" => "View Billing Records",
        "description" => "Inspect invoices, payment summaries, and receipts.",
        "roles" => ["super_admin", "receptionist"]
    ],
    [
        "module" => "Billing & Invoices",
        "key" => "billing.create",
        "name" => "Generate Invoices & Process Payment",
        "description" => "Create invoices, record cash/online payments, apply discounts.",
        "roles" => ["super_admin", "receptionist"]
    ],

    // 8. Services & Procedures
    [
        "module" => "Services & Catalog",
        "key" => "services.view",
        "name" => "View Clinic Services & Pricing",
        "description" => "Browse dental procedures, descriptions, and price list.",
        "roles" => ["super_admin", "doctor", "receptionist", "patient"]
    ],
    [
        "module" => "Services & Catalog",
        "key" => "services.manage",
        "name" => "Add / Edit Dental Services",
        "description" => "Modify clinic procedure offerings, durations, and rates.",
        "roles" => ["super_admin"]
    ],

    // 9. System & SMTP Settings
    [
        "module" => "System Settings",
        "key" => "settings.system",
        "name" => "Configure System & Clinic Info",
        "description" => "Update clinic profile, logo, operating hours, and policies.",
        "roles" => ["super_admin"]
    ],
    [
        "module" => "System Settings",
        "key" => "settings.smtp",
        "name" => "Configure Mail & SMS Gateways",
        "description" => "Manage Gmail SMTP delivery and notification settings.",
        "roles" => ["super_admin"]
    ]
];

echo "Seeding RBAC permissions into MongoDB...\n";

foreach ($defaultPermissions as $perm) {
    $existing = $db->findOne('roles_permissions', ['key' => $perm['key']]);
    if ($existing) {
        $db->updateOne('roles_permissions', ['key' => $perm['key']], [
            '$set' => [
                'module' => $perm['module'],
                'name' => $perm['name'],
                'description' => $perm['description'],
                'roles' => $perm['roles'],
                'updated_at' => date('Y-m-d H:i:s')
            ]
        ]);
        echo "Updated: {$perm['key']}\n";
    } else {
        $db->insertOne('roles_permissions', $perm);
        echo "Inserted: {$perm['key']}\n";
    }
}

echo "RBAC permissions successfully seeded in MongoDB OptiDent.roles_permissions!\n";

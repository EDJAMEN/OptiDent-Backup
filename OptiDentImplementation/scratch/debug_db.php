<?php
require_once __DIR__ . '/../api/config/db.php';

$users = $db->find('users', ['role' => 'patient']);
echo "Total patients in DB: " . count($users) . "\n";
foreach ($users as $u) {
    echo "  - " . ($u['full_name'] ?? '') . " | " . ($u['email'] ?? '') . " | _id: " . ($u['_id'] ?? '') . "\n";
}

$appts = $db->find('appointments', []);
echo "\nTotal appointments in DB: " . count($appts) . "\n";
foreach ($appts as $a) {
    echo "  - " . ($a['patient_name'] ?? '') . " | " . ($a['patient_email'] ?? '') . " | " . ($a['appointment_date'] ?? '') . " " . ($a['time_slot'] ?? '') . "\n";
}

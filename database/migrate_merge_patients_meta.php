<?php
// Run this script in your browser to merge patients_meta into users without dropping the database
include_once '../api/config/database.php';

echo "<h2>Starting Migration: Merging patients_meta into users</h2>";

// 1. Add columns to users table
$alter_sql = "
ALTER TABLE `users`
ADD COLUMN `dob` DATE DEFAULT NULL AFTER `is_active`,
ADD COLUMN `emergency_contact_name` VARCHAR(100) DEFAULT NULL AFTER `dob`,
ADD COLUMN `emergency_contact_phone` VARCHAR(20) DEFAULT NULL AFTER `emergency_contact_name`,
ADD COLUMN `allergies` TEXT DEFAULT NULL AFTER `emergency_contact_phone`,
ADD COLUMN `medications` TEXT DEFAULT NULL AFTER `allergies`,
ADD COLUMN `reward_points` INT(11) NOT NULL DEFAULT 0 AFTER `medications`;
";

if ($conn->multi_query($alter_sql)) {
    echo "Columns added to users table successfully.<br>";
    // clear results
    while ($conn->next_result()) {;}
} else {
    echo "Notice: Columns might already exist. Error: " . $conn->error . "<br>";
}

// 2. Transfer data from patients_meta to users
$transfer_sql = "
UPDATE `users` u
JOIN `patients_meta` pm ON u.id = pm.user_id
SET u.dob = pm.dob,
    u.emergency_contact_name = pm.emergency_contact_name,
    u.emergency_contact_phone = pm.emergency_contact_phone,
    u.allergies = pm.allergies,
    u.medications = pm.medications,
    u.reward_points = pm.reward_points;
";

if ($conn->query($transfer_sql) === TRUE) {
    echo "Data transferred successfully from patients_meta to users.<br>";
} else {
    echo "Error transferring data: " . $conn->error . "<br>";
}

// 3. Drop patients_meta table
$drop_sql = "DROP TABLE IF EXISTS `patients_meta`;";
if ($conn->query($drop_sql) === TRUE) {
    echo "Table patients_meta dropped successfully.<br>";
} else {
    echo "Error dropping patients_meta: " . $conn->error . "<br>";
}

echo "<h3>Migration Complete!</h3>";
$conn->close();
?>

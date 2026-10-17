<?php
/**
 * Test script for R-008 Dentist Schedule Monitoring & Slot Conflict Check
 */

require_once __DIR__ . '/../api/config/db.php';
require_once __DIR__ . '/../api/config/clinic_hours_helper.php';

echo "=== R-008 SCHEDULE MONITORING & CONFLICT CHECK VERIFICATION ===\n\n";

// 1. Fetch active doctors
$doctors = $db->find('users', ['role' => 'doctor']);
echo "Total Doctors Found: " . count($doctors) . "\n";
foreach ($doctors as $d) {
    $sched = ClinicHoursHelper::resolveDoctorSchedule($d);
    echo "- Dr. " . ($d['full_name'] ?? 'Doctor') . "\n";
    echo "  Working Days: " . $sched['working_days'] . "\n";
    echo "  Hours: " . $sched['opening_time'] . " - " . $sched['closing_time'] . "\n";
    echo "  Time Slots: " . implode(', ', $sched['time_slots']) . "\n";
}

// 2. Test day of week helper logic
$testDates = [
    '2026-10-17' => 'Saturday',
    '2026-10-18' => 'Sunday',
    '2026-10-19' => 'Monday'
];

echo "\n--- Testing Day-of-Week Working Day Enforcement ---\n";
foreach ($testDates as $date => $dayName) {
    $dayAbbr = date('D', strtotime($date));
    echo "Date: {$date} ({$dayName}, abbr: {$dayAbbr})\n";
    foreach ($doctors as $d) {
        $sched = ClinicHoursHelper::resolveDoctorSchedule($d);
        $wDays = $sched['working_days'];
        $isOnDuty = isDayInWorkingDays($dayAbbr, $wDays);
        echo "  Dr. {$d['full_name']}: " . ($isOnDuty ? "ON DUTY (Open for appointments)" : "OFF DUTY (No duty scheduled)") . "\n";
    }
}

function isDayInWorkingDays($dayAbbr, $workingDaysStr) {
    $workingDaysStr = strtolower(trim($workingDaysStr));
    $dayAbbr = strtolower(trim($dayAbbr));
    if (strpos($workingDaysStr, 'mon - sat') !== false || strpos($workingDaysStr, 'mon-sat') !== false) {
        return in_array($dayAbbr, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    }
    if (strpos($workingDaysStr, 'mon - fri') !== false || strpos($workingDaysStr, 'mon-fri') !== false) {
        return in_array($dayAbbr, ['mon', 'tue', 'wed', 'thu', 'fri']);
    }
    if (strpos($workingDaysStr, 'daily') !== false || strpos($workingDaysStr, 'mon - sun') !== false) {
        return true;
    }
    return (strpos($workingDaysStr, $dayAbbr) !== false);
}

echo "\nVerification script completed successfully!\n";

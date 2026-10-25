<?php
/**
 * Test script for C-007 Comprehensive Medical History
 */

require_once __DIR__ . '/../api/config/db.php';

$user = $db->findOne('users', ['email' => '2401111884@student.buksu.edu.ph']);
if (!$user) {
    die("Patient Nathaniel not found!\n");
}

session_start();
$_SESSION['user_id'] = (string)$user['_id'];
$_SESSION['email'] = $user['email'];
$_SESSION['role'] = $user['role'];
$_SESSION['full_name'] = $user['full_name'];

$sessId = session_id();
session_write_close();

echo "Session created for Nathaniel: {$sessId}\n";

$opts = [
    'http' => [
        'method' => 'GET',
        'header' => "Cookie: PHPSESSID={$sessId}\r\nConnection: close\r\n",
        'ignore_errors' => true
    ]
];
$context = stream_context_create($opts);

echo "\n--- Testing api/client/get_medical_history.php ---\n";
$res1 = file_get_contents("http://127.0.0.1:8080/api/client/get_medical_history.php", false, $context);
$data1 = json_decode($res1, true);

if ($data1 && ($data1['status'] ?? '') === 'success') {
    echo "SUCCESS: Medical History retrieved!\n";
    echo "Patient: " . $data1['patient']['name'] . " (" . $data1['patient']['blood_type'] . ")\n";
    echo "Total Completed Visits: " . $data1['patient']['total_completed_visits'] . "\n";
    echo "Treated Teeth Summary: " . implode(', ', $data1['treated_teeth_summary']) . "\n";
    echo "Systemic Conditions count: " . count($data1['systemic_health_questionnaire']) . "\n";
    echo "Allergies count: " . count($data1['allergies']) . "\n";
    echo "Treatment History Timeline count: " . count($data1['treatment_history_timeline']) . "\n";
    foreach ($data1['treatment_history_timeline'] as $t) {
        echo " - Visit on {$t['date']} ({$t['status']}): {$t['service']} | Diagnosis: {$t['diagnosis']} | Teeth: " . implode(',', $t['teeth_involved']) . " | Doctor: {$t['dentist']}\n";
    }
} else {
    echo "FAILED: " . $res1 . "\n";
}

echo "\n--- Testing api/client/get_dashboard_data.php ---\n";
$res2 = file_get_contents("http://127.0.0.1:8080/api/client/get_dashboard_data.php", false, $context);
$data2 = json_decode($res2, true);

if ($data2 && ($data2['status'] ?? '') === 'success') {
    echo "SUCCESS: Dashboard data retrieved!\n";
    echo "Past Appointments count: " . count($data2['past_appointments']) . "\n";
    echo "Treated Teeth in dashboard: " . implode(', ', $data2['treated_teeth_summary'] ?? []) . "\n";
    if (!empty($data2['past_appointments'])) {
        $p0 = $data2['past_appointments'][0];
        echo "Sample past appt fields: diagnosis='{$p0['diagnosis']}', notes='{$p0['procedure_notes']}', teeth=" . json_encode($p0['teeth_selected']) . "\n";
    }
} else {
    echo "FAILED: " . $res2 . "\n";
}

<?php
/**
 * Test script for patient_rescheduling_enabled switch functionality
 */

$baseUrl = 'http://127.0.0.1:8080';

function callApi($method, $url, $data = [], $cookies = '') {
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if (!empty($data)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    if ($cookies) {
        curl_setopt($ch, CURLOPT_COOKIE, $cookies);
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_HEADER, true);
    $response = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headersText = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);

    // Extract cookies
    preg_match_all('/^Set-Cookie:\s*([^;]*)/mi', $headersText, $matches);
    // Extract cookies - specifically PHPSESSID
    $cookieStr = '';
    if (preg_match_all('/Set-Cookie:\s*(PHPSESSID=[^;]+)/i', $headersText, $matches)) {
        $last = end($matches[1]);
        $cookieStr = $last;
    }

    return [
        'status' => $statusCode,
        'body' => json_decode($body, true),
        'raw_body' => $body,
        'cookies' => $cookieStr
    ];
}

echo "=== TEST PATIENT_RESCHEDULING_ENABLED SWITCH ===\n\n";

// 1. Login as Super Admin
echo "1. Logging in as Super Admin...\n";
$adminLogin = callApi('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => 'superadmin@optident.com',
    'password' => 'Admin123!'
]);
if ($adminLogin['status'] !== 200) {
    echo "FAILED: Super Admin login failed with status {$adminLogin['status']}: {$adminLogin['raw_body']}\n";
    exit(1);
}
$adminCookies = $adminLogin['cookies'];
echo "   Super Admin login SUCCESS. Session: {$adminCookies}\n\n";

require_once __DIR__ . '/../api/config/db.php';

// 2. Login as Patient
echo "2. Finding Patient in database...\n";
$patientUser = $db->findOne('users', ['email' => 'testpatient_switch@optident.com']);
if (!$patientUser) {
    echo "Creating active test patient...\n";
    $db->insertOne('users', [
        'full_name' => 'Test Patient Switch',
        'email' => 'testpatient_switch@optident.com',
        'password_hash' => password_hash('Password123!', PASSWORD_BCRYPT),
        'role' => 'patient',
        'status' => 'active',
        'is_deleted' => false,
        'phone' => '09123456789',
        'created_at' => date('Y-m-d H:i:s')
    ]);
} else {
    $db->updateOne('users', ['email' => 'testpatient_switch@optident.com'], [
        '$set' => [
            'password_hash' => password_hash('Password123!', PASSWORD_BCRYPT),
            'status' => 'active',
            'is_deleted' => false,
            'role' => 'patient'
        ]
    ]);
}
$patientEmail = 'testpatient_switch@optident.com';
$patientPass = 'Password123!';

$patientLogin = callApi('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => $patientEmail,
    'password' => $patientPass
]);
if ($patientLogin['status'] !== 200) {
    echo "FAILED: Patient login failed: {$patientLogin['raw_body']}\n";
    exit(1);
}
$patientCookies = $patientLogin['cookies'];
echo "   Patient login SUCCESS. Session: {$patientCookies}\n\n";

// 3. Test toggle integration: Set patient_rescheduling_enabled to false
echo "3. Toggling patient_rescheduling_enabled -> FALSE as Super Admin...\n";
$toggleOff = callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", [
    'integration' => 'patient_rescheduling_enabled',
    'enabled' => false
], $adminCookies);
echo "   Status: {$toggleOff['status']}\n";
echo "   Message: " . ($toggleOff['body']['message'] ?? 'None') . "\n";
echo "   Integrations state: " . json_encode($toggleOff['body']['integrations']['patient_rescheduling_enabled'] ?? null) . "\n";
if ($toggleOff['status'] !== 200 || ($toggleOff['body']['integrations']['patient_rescheduling_enabled'] ?? null) !== false) {
    echo "FAILED toggling patient_rescheduling_enabled off!\n";
    exit(1);
}
echo "   SUCCESS: patient_rescheduling_enabled is now FALSE.\n\n";

// 4. Verify client dashboard data returns patient_rescheduling_enabled = false
echo "4. Fetching client dashboard data to verify clinic_settings.integrations...\n";
$dashData = callApi('GET', "{$baseUrl}/api/client/get_dashboard_data.php", [], $patientCookies);
echo "   Dash status: {$dashData['status']}, body: {$dashData['raw_body']}\n";
$clientReschedSetting = $dashData['body']['clinic_settings']['integrations']['patient_rescheduling_enabled'] ?? null;
echo "   client_settings.integrations.patient_rescheduling_enabled: " . var_export($clientReschedSetting, true) . "\n";
if ($clientReschedSetting !== false) {
    echo "FAILED: client dashboard did not reflect patient_rescheduling_enabled = false!\n";
    exit(1);
}
echo "   SUCCESS: Client dashboard reflects disabled rescheduling.\n\n";

// Find an existing appointment for patient
$existingAppt = $dashData['body']['upcoming_appointments'][0] ?? null;
$apptId = $existingAppt ? ($existingAppt['_id'] ?? 'mock_apt_id') : 'mock_apt_id';

// 5. Test Patient Reschedule API -> Must return HTTP 403 Forbidden
echo "5. Testing api/client/reschedule_appointment.php while switch is OFF...\n";
$reschedAttempt = callApi('POST', "{$baseUrl}/api/client/reschedule_appointment.php", [
    'appointment_id' => $apptId,
    'appointment_date' => '2026-11-20',
    'time_slot' => '10:00 AM'
], $patientCookies);
echo "   Status: {$reschedAttempt['status']} (Expected: 403)\n";
echo "   Response: " . json_encode($reschedAttempt['body']) . "\n";
if ($reschedAttempt['status'] !== 403) {
    echo "FAILED: Expected 403 Forbidden, got {$reschedAttempt['status']}\n";
    exit(1);
}
echo "   SUCCESS: Patient reschedule was blocked with HTTP 403!\n\n";

// 6. Test Patient Cancel API -> Must return HTTP 403 Forbidden
echo "6. Testing api/client/cancel_appointment.php while switch is OFF...\n";
$cancelAttempt = callApi('POST', "{$baseUrl}/api/client/cancel_appointment.php", [
    'appointment_id' => $apptId,
    'reason' => 'Testing cancellation switch'
], $patientCookies);
echo "   Status: {$cancelAttempt['status']} (Expected: 403)\n";
echo "   Response: " . json_encode($cancelAttempt['body']) . "\n";
if ($cancelAttempt['status'] !== 403) {
    echo "FAILED: Expected 403 Forbidden, got {$cancelAttempt['status']}\n";
    exit(1);
}
echo "   SUCCESS: Patient cancel was blocked with HTTP 403!\n\n";

// 7. Toggle switch back to TRUE
echo "7. Toggling patient_rescheduling_enabled -> TRUE as Super Admin...\n";
$toggleOn = callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", [
    'integration' => 'patient_rescheduling_enabled',
    'enabled' => true
], $adminCookies);
echo "   Status: {$toggleOn['status']}\n";
echo "   Message: " . ($toggleOn['body']['message'] ?? 'None') . "\n";
echo "   Integrations state: " . json_encode($toggleOn['body']['integrations']['patient_rescheduling_enabled'] ?? null) . "\n";
if ($toggleOn['status'] !== 200 || ($toggleOn['body']['integrations']['patient_rescheduling_enabled'] ?? null) !== true) {
    echo "FAILED toggling patient_rescheduling_enabled back on!\n";
    exit(1);
}
echo "   SUCCESS: patient_rescheduling_enabled is now TRUE.\n\n";

// 8. Verify client dashboard data returns patient_rescheduling_enabled = true
echo "8. Fetching client dashboard data again...\n";
$dashData2 = callApi('GET', "{$baseUrl}/api/client/get_dashboard_data.php", [], $patientCookies);
$clientReschedSetting2 = $dashData2['body']['clinic_settings']['integrations']['patient_rescheduling_enabled'] ?? null;
echo "   client_settings.integrations.patient_rescheduling_enabled: " . var_export($clientReschedSetting2, true) . "\n";
if ($clientReschedSetting2 !== true) {
    echo "FAILED: client dashboard did not reflect patient_rescheduling_enabled = true!\n";
    exit(1);
}
echo "   SUCCESS: Client dashboard reflects active rescheduling.\n\n";

echo "ALL TESTS PASSED PERFECTLY!\n";

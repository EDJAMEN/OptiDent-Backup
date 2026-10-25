<?php
/**
 * Test Suite for SA-008: Settings & System Preferences
 */

session_start();
require_once __DIR__ . '/../api/config/db.php';

$superAdmin = $db->findOne('users', ['role' => 'super_admin']);
if (!$superAdmin) {
    die("[FAIL] No super_admin account found in database.\n");
}

$_SESSION['user_id'] = (string)$superAdmin['_id'];
$_SESSION['email'] = $superAdmin['email'];
$_SESSION['role'] = 'super_admin';
$_SESSION['full_name'] = $superAdmin['full_name'];
$sessId = session_id();
session_write_close();

echo "=== SA-008: SYSTEM SETTINGS & PREFERENCES TEST ===\n\n";
echo "Super Admin: {$superAdmin['email']}\n";
echo "Session ID: {$sessId}\n\n";

function request($method, $path, $data = null) {
    global $sessId;
    $url = "http://127.0.0.1:8080/{$path}";
    $headers = [
        "Cookie: PHPSESSID={$sessId}",
        "Connection: close"
    ];
    $content = '';
    if ($data !== null) {
        $content = json_encode($data);
        $headers[] = "Content-Type: application/json";
        $headers[] = "Content-Length: " . strlen($content);
    }
    $opts = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $content,
            'ignore_errors' => true,
            'timeout' => 15
        ]
    ];
    $context = stream_context_create($opts);
    $raw = @file_get_contents($url, false, $context);
    $code = 0;
    if (isset($http_response_header) && preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) {
        $code = (int)$m[1];
    }
    return ['code' => $code, 'data' => json_decode($raw, true), 'raw' => $raw];
}

// 1. Fetch current settings
echo "[TEST 1] Fetching system settings (api/admin/get_system_settings.php)...\n";
$r1 = request('GET', 'api/admin/get_system_settings.php');
if ($r1['code'] === 200 && ($r1['data']['status'] ?? '') === 'success') {
    $s = $r1['data']['settings'];
    echo "  [PASS] Settings fetched successfully!\n";
    echo "         Clinic Name: " . ($s['clinic_name'] ?? 'N/A') . "\n";
    echo "         Operating Days: " . ($s['operating_days'] ?? 'N/A') . "\n";
    echo "         Operating Hours: " . ($s['operating_hours'] ?? 'N/A') . "\n";
    echo "         Time Slots Count: " . count($s['time_slots'] ?? []) . "\n";
    echo "         Timezone: " . ($s['timezone'] ?? 'N/A') . "\n";
    echo "         Session Timeout: " . ($s['session_timeout_minutes'] ?? 'N/A') . " min\n";
    echo "         Max Login Attempts: " . ($s['max_login_attempts'] ?? 'N/A') . "\n";
    echo "         Maintenance Mode: " . (!empty($s['maintenance_mode']) ? 'ACTIVE' : 'OFF') . "\n";
} else {
    echo "  [FAIL] HTTP {$r1['code']}: {$r1['raw']}\n";
}

// 2. Update settings
echo "\n[TEST 2] Updating system configuration (api/admin/update_system_settings.php)...\n";
$updatePayload = [
    'clinic_name' => 'OptiDent Dental Clinic',
    'tagline' => 'Advanced Clinical & Oral Care Management',
    'contact_email' => 'contact@optident.clinic',
    'contact_phone' => '+63 912 345 6789',
    'address' => 'Fortich St., Malaybalay City, Bukidnon',
    'operating_days' => 'Mon - Sat',
    'opening_time' => '08:00 AM',
    'closing_time' => '05:00 PM',
    'lunch_break' => true,
    'timezone' => 'Asia/Manila',
    'session_timeout_minutes' => 45,
    'max_login_attempts' => 5,
    'maintenance_mode' => false
];
$r2 = request('POST', 'api/admin/update_system_settings.php', $updatePayload);
if ($r2['code'] === 200 && ($r2['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Settings saved successfully: {$r2['data']['message']}\n";
    echo "         Updated time slots: " . implode(', ', $r2['data']['settings']['time_slots']) . "\n";
} else {
    echo "  [FAIL] HTTP {$r2['code']}: {$r2['raw']}\n";
}

// 3. Verify changes persisted in database
echo "\n[TEST 3] Verifying persisted configuration from MongoDB...\n";
$r3 = request('GET', 'api/admin/get_system_settings.php');
if ($r3['code'] === 200 && ($r3['data']['settings']['session_timeout_minutes'] ?? 0) === 45) {
    echo "  [PASS] Verified! Configuration successfully persisted and reflects new session timeout (45 min).\n";
} else {
    echo "  [FAIL] Persisted verification failed.\n";
}

echo "\n=== ALL SA-008 TESTS COMPLETED ===\n";

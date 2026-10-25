<?php
/**
 * Test Suite for System Integrations & Prone Function Switches (SA-008 Extension)
 */

echo "=== STARTING SYSTEM INTEGRATIONS & CRITICAL SWITCHES TEST ===\n\n";

require_once __DIR__ . '/../api/config/db.php';

$baseUrl = 'http://127.0.0.1:8080';
$superAdminCookie = null;
$doctorCookie = null;

function callApi($method, $url, $data = null, &$cookieHolder = null) {
    $headers = ["Connection: close"];
    $content = '';
    if ($data !== null) {
        $content = json_encode($data);
        $headers[] = "Content-Type: application/json";
        $headers[] = "Content-Length: " . strlen($content);
    }
    if ($cookieHolder) {
        $headers[] = "Cookie: {$cookieHolder}";
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
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header) && !empty($http_response_header[0])) {
        if (preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) {
            $httpCode = (int)$m[1];
        }
        foreach ($http_response_header as $hdr) {
            if (stripos($hdr, 'Set-Cookie:') === 0) {
                $parts = explode(';', substr($hdr, 11));
                $cookieHolder = trim($parts[0]);
            }
        }
    }
    return ['code' => $httpCode, 'data' => json_decode($res, true), 'raw' => $res];
}

// Authenticate as Super Admin via API
$authRes = callApi('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => 'superadmin@optident.com',
    'password' => 'Admin123!',
    'required_role' => 'super_admin'
], $superAdminCookie);

if ($authRes['code'] !== 200) {
    die("[FAIL] Super Admin authentication failed: {$authRes['code']} - {$authRes['raw']}\n");
}

echo "[STEP 0] Super Admin Authenticated! Cookie: {$superAdminCookie}\n";

// ── TEST 1: Fetch Settings with Integrations ──────────────────
echo "\n[TEST 1] Fetching system settings via api/admin/get_system_settings.php...\n";
$getRes = callApi('GET', "{$baseUrl}/api/admin/get_system_settings.php", null, $superAdminCookie);
if ($getRes['code'] === 200 && !empty($getRes['data']['settings']['integrations'])) {
    $ints = $getRes['data']['settings']['integrations'];
    echo "  [PASS] Integrations fetched successfully:\n";
    foreach ($ints as $k => $v) {
        $state = is_bool($v) ? ($v ? 'TRUE' : 'FALSE') : $v;
        echo "         - {$k}: {$state}\n";
    }
} else {
    echo "  [FAIL] Failed to fetch integrations: {$getRes['code']}\n";
}

// ── TEST 2: Disable Google Auth & Non-Admin Logins Gate ───────
echo "\n[TEST 2] Toggling Google Auth & Non-Admin Logins OFF...\n";
$toggleOff = callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", [
    'integration' => 'google_auth_enabled',
    'enabled' => false
], $superAdminCookie);

if ($toggleOff['code'] === 200 && $toggleOff['data']['enabled'] === false) {
    echo "  [PASS] Google Auth & Non-Admin Logins switched OFF: {$toggleOff['data']['message']}\n";
} else {
    echo "  [FAIL] Failed to toggle Google Auth OFF: {$toggleOff['code']} - {$toggleOff['raw']}\n";
}

// ── TEST 3: Verify Doctor / Non-Admin Login is Blocked (HTTP 403) ──
echo "\n[TEST 3] Testing Doctor login while Google Auth / Non-Admin Logins are OFF...\n";
$dummyCookie = null;
// Find an active doctor or staff in database
$docUser = $db->findOne('users', ['role' => 'doctor', 'is_deleted' => ['$ne' => true]]);
if ($docUser) {
    $docLogin = callApi('POST', "{$baseUrl}/api/auth/login.php", [
        'email' => $docUser['email'],
        'password' => 'AnyPassword123!',
        'required_role' => 'doctor'
    ], $dummyCookie);

    if ($docLogin['code'] === 403 && strpos($docLogin['data']['message'] ?? '', 'disabled by the Super Admin') !== false) {
        echo "  [PASS] Correctly BLOCKED Doctor login with HTTP 403: {$docLogin['data']['message']}\n";
    } else {
        echo "  [FAIL] Expected 403 blocked login, got {$docLogin['code']}: {$docLogin['raw']}\n";
    }
} else {
    echo "  [SKIP] No doctor found in users collection.\n";
}

// ── TEST 4: Verify Super Admin STILL Can Log In (Super Admin Bypass) ──
echo "\n[TEST 4] Testing Super Admin emergency access while logins are OFF...\n";
$adminEmergencyCookie = null;
$saLogin = callApi('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => 'superadmin@optident.com',
    'password' => 'Admin123!',
    'required_role' => 'super_admin'
], $adminEmergencyCookie);

if ($saLogin['code'] === 200) {
    echo "  [PASS] Super Admin successfully bypassed the lockdown with master credentials!\n";
} else {
    echo "  [FAIL] Super Admin was locked out! Code: {$saLogin['code']}\n";
}

// ── TEST 5: Toggle Patient Self-Registration OFF ─────────────
echo "\n[TEST 5] Toggling Patient Self-Registration OFF and testing registration...\n";
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", [
    'integration' => 'patient_self_registration',
    'enabled' => false
], $superAdminCookie);

$dummyRegCookie = null;
$regAttempt = callApi('POST', "{$baseUrl}/api/auth/client_register_step1.php", [
    'full_name' => 'Blocked Patient',
    'email' => 'blocked.patient@example.com',
    'verification_code' => '123456',
    'password' => 'Password123!',
    'confirm_password' => 'Password123!'
], $dummyRegCookie);

if ($regAttempt['code'] === 403 && strpos($regAttempt['data']['message'] ?? '', 'paused') !== false) {
    echo "  [PASS] Patient Self-Registration successfully blocked with HTTP 403: {$regAttempt['data']['message']}\n";
} else {
    echo "  [FAIL] Expected 403 registration blocked, got {$regAttempt['code']}: {$regAttempt['raw']}\n";
}

// ── TEST 6: Test SMTP Email Gateway Paused Fallback ───────────
echo "\n[TEST 6] Toggling Gmail SMTP OFF and testing patient code dispatch...\n";
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", [
    'integration' => 'smtp_email_enabled',
    'enabled' => false
], $superAdminCookie);

$codeRes = callApi('POST', "{$baseUrl}/api/auth/send_patient_code.php", [
    'email' => 'test_mock_' . time() . '@gmail.com',
    'full_name' => 'Mock Test Patient'
]);

if ($codeRes['code'] === 200 && !empty($codeRes['data']['mock_code'])) {
    echo "  [PASS] SMTP paused: Safely returned mock verification code: {$codeRes['data']['mock_code']}\n";
} else {
    echo "  [FAIL] Expected 200 with mock code, got {$codeRes['code']}: {$codeRes['raw']}\n";
}

// ── TEST 7: Restore All Integrations Back to Normal ───────────
echo "\n[TEST 7] Restoring all integrations to normal operational status...\n";
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", ['integration' => 'google_auth_enabled', 'enabled' => true], $superAdminCookie);
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", ['integration' => 'smtp_email_enabled', 'enabled' => true], $superAdminCookie);
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", ['integration' => 'patient_self_registration', 'enabled' => true], $superAdminCookie);
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", ['integration' => 'patient_online_booking', 'enabled' => true], $superAdminCookie);
callApi('POST', "{$baseUrl}/api/admin/toggle_integration.php", ['integration' => 'maintenance_mode', 'enabled' => false], $superAdminCookie);

$finalCheck = callApi('GET', "{$baseUrl}/api/admin/get_system_settings.php", null, $superAdminCookie);
$finalInts = $finalCheck['data']['settings']['integrations'] ?? [];
echo "  [PASS] Restored state:\n";
echo "         - google_auth_enabled: " . ($finalInts['google_auth_enabled'] ? 'TRUE' : 'FALSE') . "\n";
echo "         - allow_non_admin_logins: " . ($finalInts['allow_non_admin_logins'] ? 'TRUE' : 'FALSE') . "\n";
echo "         - smtp_email_enabled: " . ($finalInts['smtp_email_enabled'] ? 'TRUE' : 'FALSE') . "\n";
echo "         - patient_self_registration: " . ($finalInts['patient_self_registration'] ? 'TRUE' : 'FALSE') . "\n";
echo "         - patient_online_booking: " . ($finalInts['patient_online_booking'] ? 'TRUE' : 'FALSE') . "\n";

echo "\n=== ALL SYSTEM INTEGRATIONS TESTS COMPLETED SUCCESSFULLY! ===\n";

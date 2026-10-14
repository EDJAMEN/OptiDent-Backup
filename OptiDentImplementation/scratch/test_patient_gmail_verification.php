<?php
/**
 * Test Suite for Patient Gmail Verification Code Flow
 */

echo "=== STARTING PATIENT GMAIL VERIFICATION TEST SUITE ===\n\n";

$baseUrl = 'http://127.0.0.1:8080';
$sessionCookie = null;

function apiCall($method, $url, $data = null) {
    global $sessionCookie;
    
    $headers = [
        "Connection: close"
    ];
    
    $content = '';
    if ($data !== null) {
        $content = json_encode($data);
        $headers[] = "Content-Type: application/json";
        $headers[] = "Content-Length: " . strlen($content);
    }
    
    if ($sessionCookie) {
        $headers[] = "Cookie: {$sessionCookie}";
    }
    
    $opts = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $content,
            'ignore_errors' => true,
            'timeout' => 60
        ]
    ];
    
    $context = stream_context_create($opts);
    $response = @file_get_contents($url, false, $context);
    
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header) && !empty($http_response_header[0])) {
        if (preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $m)) {
            $httpCode = (int)$m[1];
        }
        foreach ($http_response_header as $hdr) {
            if (stripos($hdr, 'Set-Cookie:') === 0) {
                $cookieParts = explode(';', substr($hdr, 11));
                $sessionCookie = trim($cookieParts[0]);
            }
        }
    }
    
    $json = json_decode($response, true);
    return ['code' => $httpCode, 'data' => $json, 'raw' => $response];
}

$time = time();
// Use the configured test email or a unique gmail
$testGmail = "testpatient.optident_{$time}@gmail.com";
$testName = "Leonora Rivera";
$testPhone = "0917" . substr((string)$time, -7);
$testPass = "SecurePass123!";

// ── TEST 1: Reject invalid email ──────────────────────────────
echo "[TEST 1] Testing rejection of invalid email...\n";
$res1 = apiCall('POST', "{$baseUrl}/api/auth/send_patient_code.php", [
    'email' => 'not-an-email',
    'full_name' => $testName
]);
if ($res1['code'] === 400) {
    echo "  [PASS] Correctly rejected invalid email with HTTP 400: {$res1['data']['message']}\n";
} else {
    echo "  [FAIL] Expected 400, got {$res1['code']}: {$res1['raw']}\n";
}

// ── TEST 2: Send Verification Code to Gmail ────────────────────
echo "\n[TEST 2] Testing send verification code to {$testGmail}...\n";
$res2 = apiCall('POST', "{$baseUrl}/api/auth/send_patient_code.php", [
    'email' => $testGmail,
    'full_name' => $testName
]);

echo "  Response Code: {$res2['code']}\n";
echo "  Response Message: " . ($res2['data']['message'] ?? $res2['raw']) . "\n";

// In the database or session, check the generated verification code
require_once __DIR__ . '/../api/config/db.php';
$verDoc = $db->findOne('email_verifications', ['email' => $testGmail]);
$generatedCode = $verDoc['code'] ?? null;

if ($generatedCode) {
    echo "  [PASS] Verification code recorded in MongoDB: {$generatedCode}\n";
} else {
    echo "  [FAIL] Verification code not found in MongoDB!\n";
}

// ── TEST 3: Registration with WRONG Verification Code ──────────
echo "\n[TEST 3] Testing registration with wrong code...\n";
$regPayload = [
    'full_name' => $testName,
    'email' => $testGmail,
    'verification_code' => '000000',
    'phone' => $testPhone,
    'dob' => '2001-08-10',
    'gender' => 'Female',
    'blood_type' => 'A+',
    'address' => 'Malaybalay City',
    'allergies' => 'Latex Allergy',
    'emergency_contact_name' => 'Dr. Jose',
    'emergency_contact_phone' => '09191112222',
    'password' => $testPass,
    'confirm_password' => $testPass
];

$res3 = apiCall('POST', "{$baseUrl}/api/auth/client_register.php", $regPayload);
if ($res3['code'] === 400 && strpos($res3['data']['message'] ?? '', 'Invalid or expired') !== false) {
    echo "  [PASS] Correctly rejected wrong verification code with HTTP 400: {$res3['data']['message']}\n";
} else {
    echo "  [FAIL] Expected 400 with invalid code message, got {$res3['code']}: {$res3['raw']}\n";
}

// ── TEST 4: Registration with CORRECT Verification Code ────────
echo "\n[TEST 4] Testing registration with CORRECT code ({$generatedCode})...\n";
$regPayload['verification_code'] = $generatedCode;

$res4 = apiCall('POST', "{$baseUrl}/api/auth/client_register.php", $regPayload);
if ($res4['code'] === 201 && ($res4['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Patient successfully registered & email verified! HTTP 201.\n";
    echo "         Redirect: {$res4['data']['redirect']}\n";
    echo "         User ID: {$res4['data']['user']['id']}\n";
} else {
    echo "  [FAIL] Registration failed. HTTP {$res4['code']}: {$res4['raw']}\n";
}

// ── TEST 5: Verify is_email_verified flag in MongoDB ───────────
echo "\n[TEST 5] Checking patient verification status in MongoDB...\n";
$userInDb = $db->findOne('users', ['email' => $testGmail]);
if (!empty($userInDb['is_email_verified'])) {
    echo "  [PASS] Confirmed in MongoDB: is_email_verified = true (Verified At: {$userInDb['email_verified_at']})\n";
} else {
    echo "  [FAIL] User document does not have is_email_verified set to true!\n";
}

// ── TEST 6: Login with newly verified Gmail account ────────────
echo "\n[TEST 6] Testing login with verified Gmail account...\n";
$res6 = apiCall('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => $testGmail,
    'password' => $testPass,
    'required_role' => 'patient'
]);

if ($res6['code'] === 200 && ($res6['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Patient login succeeded! HTTP 200.\n";
    echo "         Redirect Destination: {$res6['data']['redirect']}\n";
} else {
    echo "  [FAIL] Login failed. HTTP {$res6['code']}: {$res6['raw']}\n";
}

echo "\n=== ALL GMAIL VERIFICATION TESTS COMPLETED ===\n";

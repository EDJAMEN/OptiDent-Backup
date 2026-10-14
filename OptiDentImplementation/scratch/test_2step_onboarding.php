<?php
/**
 * Test Suite for 2-Step Registration & Onboarding Flow
 * Step 1: Register Username + Gmail + Verification Code
 * Step 2: Complete Personal Information & Clinical Safety Profile
 */

echo "=== STARTING 2-STEP REGISTRATION & CLINICAL SAFETY TEST SUITE ===\n\n";

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
$testGmail = "patient.step2_{$time}@gmail.com";
$testName = "Gabriela Silang";
$testPass = "Passcode@2026!";

// ── TEST 1: Send verification code to Gmail ────────────────────
echo "[TEST 1] Dispatching verification code to {$testGmail}...\n";
$res1 = apiCall('POST', "{$baseUrl}/api/auth/send_patient_code.php", [
    'email' => $testGmail,
    'full_name' => $testName
]);

echo "  Response Code: {$res1['code']}\n";
echo "  Response Message: " . ($res1['data']['message'] ?? $res1['raw']) . "\n";

require_once __DIR__ . '/../api/config/db.php';
$verDoc = $db->findOne('email_verifications', ['email' => $testGmail]);
$otp = $verDoc['code'] ?? null;

if ($otp) {
    echo "  [PASS] Retrieved generated 6-digit OTP from MongoDB: {$otp}\n";
} else {
    echo "  [FAIL] OTP not found in MongoDB!\n";
}

// ── TEST 2: Step 1 Registration (Username, Gmail, Password & Code) ──
echo "\n[TEST 2] Submitting Step 1: Username, Gmail, Password & Verification code...\n";
$step1Payload = [
    'full_name' => $testName,
    'email' => $testGmail,
    'verification_code' => $otp,
    'password' => $testPass,
    'confirm_password' => $testPass
];

$res2 = apiCall('POST', "{$baseUrl}/api/auth/client_register_step1.php", $step1Payload);

if ($res2['code'] === 201 && ($res2['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Step 1 Account Registration succeeded! HTTP 201.\n";
    echo "         Next Step: {$res2['data']['step']}\n";
    echo "         User ID: {$res2['data']['user_id']}\n";
} else {
    echo "  [FAIL] Step 1 failed. HTTP {$res2['code']}: {$res2['raw']}\n";
}

// ── TEST 3: Verify MongoDB document after Step 1 ───────────────
echo "\n[TEST 3] Inspecting MongoDB user document after Step 1...\n";
$userDoc1 = $db->findOne('users', ['email' => $testGmail]);
if ($userDoc1 && !empty($userDoc1['is_email_verified']) && $userDoc1['profile_completed'] === false) {
    echo "  [PASS] Account created: role={$userDoc1['role']}, is_email_verified=true, profile_completed=false\n";
} else {
    echo "  [FAIL] Document state unexpected: " . json_encode($userDoc1) . "\n";
}

// ── TEST 4: Step 2: Personal Information & Clinical Safety ─────
echo "\n[TEST 4] Submitting Step 2: Personal details & Clinical Safety alerts...\n";
$step2Payload = [
    'phone' => '09179876543',
    'dob' => '1995-12-04',
    'gender' => 'Female',
    'blood_type' => 'B+',
    'address' => 'Sayre Highway, Malaybalay City',
    'allergies' => 'Penicillin Allergy, Asthma',
    'emergency_contact_name' => 'Diego Silang',
    'emergency_contact_phone' => '09185554433'
];

$res4 = apiCall('POST', "{$baseUrl}/api/client/complete_profile.php", $step2Payload);

if ($res4['code'] === 200 && ($res4['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Step 2 Profile Completion succeeded! HTTP 200.\n";
    echo "         Message: {$res4['data']['message']}\n";
    echo "         Redirect: {$res4['data']['redirect']}\n";
} else {
    echo "  [FAIL] Step 2 failed. HTTP {$res4['code']}: {$res4['raw']}\n";
}

// ── TEST 5: Verify MongoDB document after Step 2 ───────────────
echo "\n[TEST 5] Inspecting MongoDB user document after Step 2...\n";
$userDoc2 = $db->findOne('users', ['email' => $testGmail]);
if ($userDoc2 && $userDoc2['profile_completed'] === true && !empty($userDoc2['phone'])) {
    echo "  [PASS] Profile completed in DB!\n";
    echo "         Phone: {$userDoc2['phone']}\n";
    echo "         Computed Age: " . ($userDoc2['age'] ?? 'N/A') . " yrs\n";
    echo "         Medical Alerts: {$userDoc2['allergies']}\n";
    echo "         Emergency Contact: {$userDoc2['emergency_contact_name']} ({$userDoc2['emergency_contact_phone']})\n";
} else {
    echo "  [FAIL] Document state unexpected after Step 2: " . json_encode($userDoc2) . "\n";
}

// ── TEST 6: Verify Client Dashboard loads complete profile ─────
echo "\n[TEST 6] Testing get_dashboard_data with completed patient profile...\n";
$res6 = apiCall('GET', "{$baseUrl}/api/client/get_dashboard_data.php");
if ($res6['code'] === 200 && ($res6['data']['status'] ?? '') === 'success') {
    $pat = $res6['data']['patient'];
    echo "  [PASS] Dashboard loaded profile successfully!\n";
    echo "         Name: {$pat['full_name']}\n";
    echo "         Allergies: {$pat['medical_alerts']}\n";
    echo "         Has Alert: " . ($pat['has_alert'] ? 'YES' : 'NO') . "\n";
} else {
    echo "  [FAIL] Dashboard data load failed. HTTP {$res6['code']}: {$res6['raw']}\n";
}

echo "\n=== ALL 2-STEP PROGRESSIVE ONBOARDING TESTS COMPLETED ===\n";

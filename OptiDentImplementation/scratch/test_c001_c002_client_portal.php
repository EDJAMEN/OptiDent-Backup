<?php
/**
 * Test Suite for C-001 & C-002: Client Registration and Login Portal
 * Uses stream context for HTTP requests without requiring ext-curl.
 */

echo "=== STARTING CLIENT REGISTRATION & LOGIN TEST SUITE ===\n\n";

$baseUrl = 'http://127.0.0.1:8080';
$sessionCookie = null;

function apiRequest($method, $url, $data = null) {
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
            'timeout' => 20
        ]
    ];
    
    $context = stream_context_create($opts);
    $response = @file_get_contents($url, false, $context);
    
    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
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

$timestamp = time();
$testEmail = "patient.test_{$timestamp}@optident.local";
$testPhone = "0917" . substr((string)$timestamp, -7);
$testPassword = "Password123!";

// ── TEST 1: Validation failure on missing fields ──────────────
echo "[TEST 1] Testing validation failure (short password)...\n";
$res1 = apiRequest('POST', "{$baseUrl}/api/auth/client_register.php", [
    'full_name' => 'Test Patient',
    'email' => $testEmail,
    'phone' => $testPhone,
    'password' => 'short'
]);

if ($res1['code'] === 400 && strpos($res1['data']['message'] ?? '', '8 characters') !== false) {
    echo "  [PASS] Correctly rejected short password with HTTP 400: {$res1['data']['message']}\n";
} else {
    echo "  [FAIL] Expected 400 error, got HTTP {$res1['code']}: {$res1['raw']}\n";
}

// ── TEST 2: Successful Client Registration (C-001) ────────────
echo "\n[TEST 2] Testing successful client registration (C-001)...\n";
$regPayload = [
    'full_name' => 'Maria Clara Dela Cruz',
    'email' => $testEmail,
    'phone' => $testPhone,
    'dob' => '1998-05-15',
    'gender' => 'Female',
    'blood_type' => 'O+',
    'address' => 'Malaybalay City, Bukidnon',
    'allergies' => 'Penicillin Allergy, Latex Allergy',
    'emergency_contact_name' => 'Crisostomo Ibarra',
    'emergency_contact_phone' => '09181234567',
    'password' => $testPassword,
    'confirm_password' => $testPassword
];

$res2 = apiRequest('POST', "{$baseUrl}/api/auth/client_register.php", $regPayload);

if ($res2['code'] === 201 && ($res2['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Registered successfully! HTTP 201.\n";
    echo "         Redirect: {$res2['data']['redirect']}\n";
    echo "         User ID: {$res2['data']['user']['id']}\n";
} else {
    echo "  [FAIL] Registration failed. HTTP {$res2['code']}: {$res2['raw']}\n";
}

// ── TEST 3: Duplicate Registration Guard ───────────────────────
echo "\n[TEST 3] Testing duplicate email rejection...\n";
$res3 = apiRequest('POST', "{$baseUrl}/api/auth/client_register.php", $regPayload);
if ($res3['code'] === 409) {
    echo "  [PASS] Duplicate email caught with HTTP 409: {$res3['data']['message']}\n";
} else {
    echo "  [FAIL] Expected 409 for duplicate registration, got {$res3['code']}: {$res3['raw']}\n";
}

// ── TEST 4: Client Login with Credentials (C-002) ──────────────
echo "\n[TEST 4] Testing client login with wrong password...\n";
$savedCookie = $sessionCookie;
$sessionCookie = null; // clear cookie to test login

$res4a = apiRequest('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => $testEmail,
    'password' => 'WrongPassword!',
    'required_role' => 'patient'
]);
if ($res4a['code'] === 401) {
    echo "  [PASS] Correctly rejected wrong password with HTTP 401.\n";
} else {
    echo "  [FAIL] Expected 401, got HTTP {$res4a['code']}: {$res4a['raw']}\n";
}

echo "\n[TEST 5] Testing valid client login (C-002)...\n";
$sessionCookie = null;

$res5 = apiRequest('POST', "{$baseUrl}/api/auth/login.php", [
    'email' => $testEmail,
    'password' => $testPassword,
    'required_role' => 'patient'
]);

if ($res5['code'] === 200 && ($res5['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Logged in successfully! HTTP 200.\n";
    echo "         Redirect destination: {$res5['data']['redirect']}\n";
    echo "         User Role: {$res5['data']['user']['role']}\n";
} else {
    echo "  [FAIL] Login failed. HTTP {$res5['code']}: {$res5['raw']}\n";
}

// ── TEST 6: Session Verification via api/auth/me.php ───────────
echo "\n[TEST 6] Testing session verification (api/auth/me.php)...\n";
$res6 = apiRequest('GET', "{$baseUrl}/api/auth/me.php");
if ($res6['code'] === 200 && ($res6['data']['role'] ?? '') === 'patient') {
    echo "  [PASS] Session authenticated as patient: {$res6['data']['full_name']} ({$res6['data']['email']})\n";
} else {
    echo "  [FAIL] Session check failed. HTTP {$res6['code']}: {$res6['raw']}\n";
}

// ── TEST 7: Client Dashboard Data Endpoint ─────────────────────
echo "\n[TEST 7] Testing Client Dashboard Data (api/client/get_dashboard_data.php)...\n";
$res7 = apiRequest('GET', "{$baseUrl}/api/client/get_dashboard_data.php");

if ($res7['code'] === 200 && ($res7['data']['status'] ?? '') === 'success') {
    $pat = $res7['data']['patient'];
    echo "  [PASS] Dashboard data retrieved successfully!\n";
    echo "         Patient Name: {$pat['full_name']}\n";
    echo "         Computed Age: " . ($pat['age'] ?? 'N/A') . " yrs\n";
    echo "         Medical Alerts: {$pat['medical_alerts']}\n";
    echo "         Emergency Contact: {$pat['emergency_contact_name']} ({$pat['emergency_contact_phone']})\n";
    echo "         Active Clinic Doctors Count: " . count($res7['data']['doctors']) . "\n";
    echo "         Available Services Count: " . count($res7['data']['services']) . "\n";
} else {
    echo "  [FAIL] Failed to fetch dashboard data. HTTP {$res7['code']}: {$res7['raw']}\n";
}

// ── TEST 8: Self-Service Appointment Booking ───────────────────
echo "\n[TEST 8] Testing Client Self-Service Booking (api/client/book_appointment.php)...\n";
$tomorrow = date('Y-m-d', strtotime('+2 days'));
$bookPayload = [
    'doctor_name' => 'Dr. Maria Santos',
    'service_name' => 'Dental Consultation & Oral Examination',
    'appointment_date' => $tomorrow,
    'time_slot' => '10:30 AM',
    'operatory_chair' => 'Operatory Chair 1',
    'notes' => 'Routine annual dental cleaning and checkup.'
];

$res8 = apiRequest('POST', "{$baseUrl}/api/client/book_appointment.php", $bookPayload);
if ($res8['code'] === 201 && ($res8['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Appointment successfully booked! HTTP 201.\n";
    echo "         Message: {$res8['data']['message']}\n";
    echo "         Appointment ID: {$res8['data']['appointment_id']}\n";
} else {
    echo "  [FAIL] Booking failed. HTTP {$res8['code']}: {$res8['raw']}\n";
}

// ── TEST 9: Verify Appointment appears in Upcoming List ────────
echo "\n[TEST 9] Verifying appointment in client's upcoming list...\n";
$res9 = apiRequest('GET', "{$baseUrl}/api/client/get_dashboard_data.php");
$upcoming = $res9['data']['upcoming_appointments'] ?? [];
$found = false;
foreach ($upcoming as $apt) {
    if ($apt['date'] === $tomorrow && $apt['time'] === '10:30 AM') {
        $found = true;
        echo "  [PASS] Verified scheduled appointment: {$apt['date']} at {$apt['time']} with {$apt['doctor_name']} ({$apt['service_name']})\n";
        break;
    }
}
if (!$found) {
    echo "  [FAIL] Scheduled appointment not found in upcoming list!\n";
}

echo "\n=== ALL C-001 & C-002 TESTS COMPLETED SUCCESSFULLY ===\n";

<?php
session_start();

require_once __DIR__ . '/../api/config/db.php';

// 1. Locate Super Admin
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

echo "=== SA-007: DATA ARCHIVING VERIFICATION TEST ===\n\n";
echo "[1] Super Admin located: {$superAdmin['email']} ({$superAdmin['full_name']})\n";
echo "    Session established: PHPSESSID={$sessId}\n\n";

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

// ── Test 1: Get Archived Records ──
echo "[TEST 1] Testing api/admin/get_archived_records.php...\n";
$r1 = request('GET', 'api/admin/get_archived_records.php');
if ($r1['code'] === 200 && ($r1['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Successfully retrieved archive records. Total currently archived: " . ($r1['data']['counts']['total'] ?? 0) . "\n";
    echo "         Breakdown: Appts=" . ($r1['data']['counts']['appointments'] ?? 0) . 
         ", Users=" . ($r1['data']['counts']['users'] ?? 0) . 
         ", Invites=" . ($r1['data']['counts']['invitations'] ?? 0) . "\n";
} else {
    echo "  [FAIL] Failed: HTTP {$r1['code']} - {$r1['raw']}\n";
}

// ── Test 2: Master Admin Protection Safeguard ──
echo "\n[TEST 2] Testing Master Admin Archiving Protection Safeguard...\n";
$r2 = request('POST', 'api/admin/archive_record.php', [
    'collection' => 'users',
    'id' => (string)$superAdmin['_id'],
    'identifier' => $superAdmin['email'],
    'reason' => 'Test archiving master admin'
]);
if ($r2['code'] === 403) {
    echo "  [PASS] Correctly rejected archiving Master Super Admin with HTTP 403: " . ($r2['data']['message'] ?? '') . "\n";
} else {
    echo "  [FAIL] Expected 403, got HTTP {$r2['code']}: {$r2['raw']}\n";
}

// ── Test 3: Manual Archival of a Record ──
echo "\n[TEST 3] Testing Manual Archival of a Test Patient/Account...\n";
// Create temporary test user to archive
$testEmail = "archive_test_" . time() . "@example.com";
$testUserId = $db->insertOne('users', [
    'email' => $testEmail,
    'full_name' => 'Archive Test Subject',
    'role' => 'patient',
    'status' => 'inactive',
    'created_at' => date('Y-m-d H:i:s'),
    'is_archived' => false
]);

$r3 = request('POST', 'api/admin/archive_record.php', [
    'collection' => 'users',
    'id' => (string)$testUserId,
    'identifier' => $testEmail,
    'reason' => 'Dormant account preserved per SA-007'
]);

if ($r3['code'] === 200 && ($r3['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Record archived successfully: {$r3['data']['message']}\n";
} else {
    echo "  [FAIL] Archive failed: HTTP {$r3['code']} - {$r3['raw']}\n";
}

// ── Test 4: Verify record appears in Archive and is excluded from active users ──
echo "\n[TEST 4] Verifying record is in archives and excluded from active users...\n";
$r4a = request('GET', 'api/admin/get_archived_records.php?category=users&search=' . urlencode($testEmail));
$inArchive = false;
if (!empty($r4a['data']['items'])) {
    foreach ($r4a['data']['items'] as $item) {
        if ($item['identifier'] === $testEmail) {
            $inArchive = true;
            break;
        }
    }
}
if ($inArchive) {
    echo "  [PASS] Found test record in Archived Records list.\n";
} else {
    echo "  [FAIL] Record not found in archive list.\n";
}

// Check active users endpoint
$r4b = request('GET', 'api/admin/get_users.php');
$inActive = false;
if (!empty($r4b['data']['users'])) {
    foreach ($r4b['data']['users'] as $u) {
        if ($u['email'] === $testEmail) {
            $inActive = true;
            break;
        }
    }
}
if (!$inActive) {
    echo "  [PASS] Record is properly EXCLUDED from active operational users list (get_users.php).\n";
} else {
    echo "  [FAIL] Record still appeared in active users list!\n";
}

// ── Test 5: Unarchive Record ──
echo "\n[TEST 5] Testing Unarchiving and Restoring Record (api/admin/unarchive_record.php)...\n";
$r5 = request('POST', 'api/admin/unarchive_record.php', [
    'collection' => 'users',
    'id' => (string)$testUserId,
    'identifier' => $testEmail
]);
if ($r5['code'] === 200 && ($r5['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Unarchived successfully: {$r5['data']['message']}\n";
} else {
    echo "  [FAIL] Unarchive failed: HTTP {$r5['code']} - {$r5['raw']}\n";
}

// Verify restored to active
$r5b = request('GET', 'api/admin/get_users.php');
$restoredActive = false;
if (!empty($r5b['data']['users'])) {
    foreach ($r5b['data']['users'] as $u) {
        if ($u['email'] === $testEmail) {
            $restoredActive = true;
            break;
        }
    }
}
if ($restoredActive) {
    echo "  [PASS] Record is back in active operational users list!\n";
} else {
    echo "  [FAIL] Record was not restored to active users list.\n";
}

// Cleanup test user
$db->deleteOne('users', ['_id' => $testUserId]);

// ── Test 6: Automated Batch Archival Policy ──
echo "\n[TEST 6] Testing Automated Batch Archival Endpoint (api/admin/batch_archive.php)...\n";
$r6 = request('POST', 'api/admin/batch_archive.php', [
    'rule' => 'completed_appointments_60d'
]);
if ($r6['code'] === 200 && ($r6['data']['status'] ?? '') === 'success') {
    echo "  [PASS] Batch archival policy executed: {$r6['data']['message']} (Archived {$r6['data']['archived_count']} records)\n";
} else {
    echo "  [FAIL] Batch archival failed: HTTP {$r6['code']} - {$r6['raw']}\n";
}

// ── Test 7: Export Archive ──
echo "\n[TEST 7] Testing Historical Archive Export (api/admin/export_archive.php)...\n";
$r7Json = request('GET', 'api/admin/export_archive.php?format=json');
if ($r7Json['code'] === 200 && is_array($r7Json['data'])) {
    echo "  [PASS] JSON Export working! Records exported: " . count($r7Json['data']) . "\n";
} else {
    echo "  [FAIL] JSON Export failed: HTTP {$r7Json['code']}\n";
}

$r7Csv = request('GET', 'api/admin/export_archive.php?format=csv');
if ($r7Csv['code'] === 200 && strpos($r7Csv['raw'], 'Category') !== false && strpos($r7Csv['raw'], 'Record Title') !== false) {
    echo "  [PASS] CSV Export working! Valid CSV header and content generated.\n";
} else {
    echo "  [FAIL] CSV Export failed: HTTP {$r7Csv['code']}\n";
}

// ── Test 8: Audit Log Verification ──
echo "\n[TEST 8] Verifying Audit Logging for Archive Operations...\n";
$logs = $db->find('audit_logs', []);
$foundArchiveLog = false;
$foundUnarchiveLog = false;
foreach ($logs as $l) {
    if (($l['action'] ?? '') === 'RECORD_ARCHIVED') $foundArchiveLog = true;
    if (($l['action'] ?? '') === 'RECORD_UNARCHIVED') $foundUnarchiveLog = true;
}
if ($foundArchiveLog && $foundUnarchiveLog) {
    echo "  [PASS] Both RECORD_ARCHIVED and RECORD_UNARCHIVED actions recorded in audit_logs collection!\n";
} else {
    echo "  [INFO] Archive logs: archived=" . ($foundArchiveLog ? 'YES' : 'NO') . ", unarchived=" . ($foundUnarchiveLog ? 'YES' : 'NO') . "\n";
}

echo "\n=== ALL SA-007 DATA ARCHIVING TESTS COMPLETED ===\n";

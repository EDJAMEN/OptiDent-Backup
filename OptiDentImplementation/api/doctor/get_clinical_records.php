<?php
/**
 * OptiDent System - Get Clinical Records & Dental Logs API (Task D-004)
 * Returns filtered and searchable clinical treatments and diagnostic logs.
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../config/db.php';

$userEmail = $_SESSION['email'] ?? '';
$userRole = strtolower($_SESSION['role'] ?? '');

if (empty($userEmail) || !in_array($userRole, ['doctor', 'super_admin', 'admin'])) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Unauthorized access."]);
    exit;
}

$query = trim($_GET['q'] ?? '');
$category = trim($_GET['category'] ?? '');
$dateFrom = trim($_GET['date_from'] ?? '');
$dateTo = trim($_GET['date_to'] ?? '');

$filter = [
    'status' => 'completed'
];

$allCompleted = $db->find('appointments', $filter);

$results = [];
foreach ($allCompleted as $rec) {
    $pName = $rec['patient_name'] ?? '';
    $diag  = $rec['diagnosis'] ?? '';
    $serv  = $rec['service_name'] ?? '';
    $teeth = is_array($rec['teeth_selected'] ?? null) ? implode(' ', $rec['teeth_selected']) : ($rec['teeth_selected'] ?? '');
    $cat   = $rec['treatment_category'] ?? '';
    $date  = $rec['appointment_date'] ?? '';

    // Search query filter
    if (!empty($query)) {
        $searchCorpus = strtolower("{$pName} {$diag} {$serv} {$teeth} " . ($rec['procedure_notes'] ?? '') . " " . ($rec['prescription'] ?? ''));
        if (strpos($searchCorpus, strtolower($query)) === false) {
            continue;
        }
    }

    // Category filter
    if (!empty($category) && $category !== 'all') {
        if (strcasecmp($cat, $category) !== 0 && stripos($serv, $category) === false) {
            continue;
        }
    }

    // Date filters
    if (!empty($dateFrom) && $date < $dateFrom) continue;
    if (!empty($dateTo) && $date > $dateTo) continue;

    $results[] = [
        '_id' => (string)($rec['_id'] ?? ''),
        'patient_name' => $pName,
        'patient_phone' => $rec['patient_phone'] ?? '',
        'patient_email' => $rec['patient_email'] ?? '',
        'appointment_date' => $date,
        'appointment_time' => $rec['appointment_time'] ?? '',
        'service_name' => $serv,
        'treatment_category' => $cat ?: 'General Dentistry',
        'diagnosis' => $diag ?: 'Clinical examination and therapy',
        'teeth_selected' => $rec['teeth_selected'] ?? [],
        'tooth_surfaces' => $rec['tooth_surfaces'] ?? [],
        'vital_signs' => $rec['vital_signs'] ?? null,
        'anesthesia' => $rec['anesthesia'] ?? '',
        'procedure_notes' => $rec['procedure_notes'] ?? '',
        'prescription' => $rec['prescription'] ?? '',
        'follow_up_date' => $rec['follow_up_date'] ?? '',
        'post_op_instructions' => $rec['post_op_instructions'] ?? '',
        'attending_doctor' => $rec['attending_doctor'] ?? $rec['dentist_name'] ?? 'Attending Doctor',
        'completed_at' => $rec['completed_at'] ?? $rec['last_updated_at'] ?? $date
    ];
}

// Sort descending by appointment_date / completed_at
usort($results, function($a, $b) {
    return strcmp($b['appointment_date'], $a['appointment_date']);
});

http_response_code(200);
echo json_encode([
    "status" => "success",
    "total" => count($results),
    "records" => $results
]);

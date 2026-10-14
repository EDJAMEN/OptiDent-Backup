<?php
/**
 * OptiDent System - Export Archived Historical Records
 * Task SA-007: Data Archiving & Historical Preservation
 * Exports archived records to JSON or CSV for legal retention compliance
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin']);

    $db = MongoDBConnection::getInstance();
    $format = strtolower(trim($_GET['format'] ?? 'json'));
    $category = strtolower(trim($_GET['category'] ?? 'all'));
    $today = date('Y-m-d_His');

    $archivedItems = [];

    // 1. Appointments
    if ($category === 'all' || $category === 'appointments') {
        $appts = $db->find('appointments', ['is_archived' => true]);
        foreach ($appts as $a) {
            $archivedItems[] = [
                'category'      => 'Appointments',
                'title'         => ($a['patient_name'] ?? 'Patient') . ' - ' . ($a['service_name'] ?? 'Service'),
                'identifier'    => $a['patient_email'] ?? ($a['patient_phone'] ?? 'N/A'),
                'doctor'        => $a['doctor_name'] ?? 'Dentist',
                'original_date' => $a['appointment_date'] ?? ($a['created_at'] ?? ''),
                'archived_at'   => $a['archived_at'] ?? '',
                'archived_by'   => $a['archived_by'] ?? 'System',
                'reason'        => $a['archive_reason'] ?? 'Historical record'
            ];
        }
    }

    // 2. Users
    if ($category === 'all' || $category === 'users') {
        $users = $db->find('users', ['is_archived' => true]);
        foreach ($users as $u) {
            $archivedItems[] = [
                'category'      => 'Inactive Accounts',
                'title'         => $u['full_name'] ?? 'User',
                'identifier'    => $u['email'] ?? 'N/A',
                'doctor'        => 'Role: ' . strtoupper($u['role'] ?? 'USER'),
                'original_date' => $u['created_at'] ?? '',
                'archived_at'   => $u['archived_at'] ?? '',
                'archived_by'   => $u['archived_by'] ?? 'System',
                'reason'        => $u['archive_reason'] ?? 'Inactive account'
            ];
        }
    }

    // 3. Invitations
    if ($category === 'all' || $category === 'invitations') {
        $invs = $db->find('invitations', ['is_archived' => true]);
        foreach ($invs as $inv) {
            $archivedItems[] = [
                'category'      => 'Staff Invitations',
                'title'         => "Invite: " . ($inv['email'] ?? 'Staff'),
                'identifier'    => $inv['email'] ?? 'N/A',
                'doctor'        => 'Role: ' . strtoupper($inv['role'] ?? 'STAFF'),
                'original_date' => $inv['created_at'] ?? '',
                'archived_at'   => $inv['archived_at'] ?? '',
                'archived_by'   => $inv['archived_by'] ?? 'System',
                'reason'        => $inv['archive_reason'] ?? 'Expired invitation'
            ];
        }
    }

    AuditLogger::log('ARCHIVE_EXPORTED', "archive:export_{$format}", [
        'format'       => $format,
        'category'     => $category,
        'record_count' => count($archivedItems),
        'exported_by'  => $_SESSION['email'] ?? 'super_admin'
    ]);

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=UTF-8');
        header("Content-Disposition: attachment; filename=\"OptiDent_Archive_{$today}.csv\"");
        header('Pragma: no-cache');
        header('Expires: 0');

        $output = fopen('php://output', 'w');
        // Add UTF-8 BOM for Excel compatibility
        fprintf($output, chr(0xEF).chr(0xBB).chr(0xBF));
        fputcsv($output, ['Category', 'Record Title', 'Identifier / Contact', 'Doctor / Role', 'Original Date', 'Archived Date', 'Archived By', 'Archive Reason']);

        foreach ($archivedItems as $row) {
            fputcsv($output, [
                $row['category'],
                $row['title'],
                $row['identifier'],
                $row['doctor'],
                $row['original_date'],
                $row['archived_at'],
                $row['archived_by'],
                $row['reason']
            ]);
        }
        fclose($output);
        exit;
    }

    // Default: JSON export
    header('Content-Type: application/json; charset=UTF-8');
    header("Content-Disposition: attachment; filename=\"OptiDent_Archive_{$today}.json\"");
    echo json_encode([
        'exported_at'  => date('Y-m-d H:i:s'),
        'clinic'       => 'OptiDent Dental Clinic',
        'category'     => $category,
        'total_count'  => count($archivedItems),
        'records'      => $archivedItems
    ], JSON_PRETTY_PRINT);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Export failed: ' . $e->getMessage()]);
}

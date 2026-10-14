<?php
/**
 * OptiDent System - Get Archived Records Endpoint
 * Task SA-007: Data Archiving & Historical Preservation
 * Retrieves archived historical records across collections
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/db.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $db = MongoDBConnection::getInstance();
    $targetCategory = strtolower(trim($_GET['category'] ?? 'all'));
    $search = strtolower(trim($_GET['search'] ?? ''));

    $archivedItems = [];
    $counts = [
        'total'        => 0,
        'appointments' => 0,
        'users'        => 0,
        'invitations'  => 0
    ];

    // 1. Archived Appointments
    $rawAppts = $db->find('appointments', []);
    foreach ($rawAppts as $appt) {
        $isArchived = !empty($appt['is_archived']) && $appt['is_archived'] === true;
        if (!$isArchived) continue;

        $counts['total']++;
        $counts['appointments']++;

        if ($targetCategory !== 'all' && $targetCategory !== 'appointments') continue;

        $id = is_array($appt['_id'] ?? null) ? ($appt['_id']['$oid'] ?? (string)$appt['_id']) : (string)($appt['_id'] ?? '');
        $patient = $appt['patient_name'] ?? 'Unknown Patient';
        $service = $appt['service_name'] ?? 'Dental Service';
        $email = $appt['patient_email'] ?? ($appt['patient_phone'] ?? 'No contact');
        $date = $appt['appointment_date'] ?? ($appt['created_at'] ?? 'Unknown Date');
        $doctor = $appt['doctor_name'] ?? 'Attending Dentist';
        $reason = $appt['archive_reason'] ?? 'Historical record retention policy';

        if (!empty($search)) {
            $haystack = strtolower("{$patient} {$service} {$email} {$doctor} {$reason} {$date}");
            if (strpos($haystack, $search) === false) continue;
        }

        $archivedItems[] = [
            'id'               => $id,
            'category'         => 'appointments',
            'category_label'   => 'Clinical Appointment',
            'title'            => "{$patient} &bull; {$service}",
            'identifier'       => "Date: {$date} ({$doctor})",
            'secondary_info'   => $email,
            'original_date'    => $date,
            'archived_at'      => $appt['archived_at'] ?? ($appt['completed_at'] ?? 'Archived'),
            'archived_by'      => $appt['archived_by'] ?? 'System Core',
            'archive_reason'   => $reason,
            'raw_status'       => $appt['status'] ?? 'completed'
        ];
    }

    // 2. Archived Users (Inactive / Suspended accounts archived for long-term retention)
    $rawUsers = $db->find('users', []);
    foreach ($rawUsers as $u) {
        $isArchived = !empty($u['is_archived']) && $u['is_archived'] === true;
        if (!$isArchived) continue;

        $counts['total']++;
        $counts['users']++;

        if ($targetCategory !== 'all' && $targetCategory !== 'users') continue;

        $id = is_array($u['_id'] ?? null) ? ($u['_id']['$oid'] ?? (string)$u['_id']) : (string)($u['_id'] ?? '');
        $name = $u['full_name'] ?? 'Unnamed Account';
        $email = $u['email'] ?? '';
        $role = strtoupper($u['role'] ?? 'USER');
        $date = $u['created_at'] ?? 'Unknown Date';
        $reason = $u['archive_reason'] ?? 'Inactive account archived';

        if (!empty($search)) {
            $haystack = strtolower("{$name} {$email} {$role} {$reason}");
            if (strpos($haystack, $search) === false) continue;
        }

        $archivedItems[] = [
            'id'               => $id,
            'category'         => 'users',
            'category_label'   => "Inactive Account ({$role})",
            'title'            => $name,
            'identifier'       => $email,
            'secondary_info'   => "Role: {$role} | ID: {$id}",
            'original_date'    => $date,
            'archived_at'      => $u['archived_at'] ?? 'Archived',
            'archived_by'      => $u['archived_by'] ?? 'System Core',
            'archive_reason'   => $reason,
            'raw_status'       => $u['status'] ?? 'inactive'
        ];
    }

    // 3. Archived Staff Invitations (Expired / Historical invites)
    $rawInvites = $db->find('invitations', []);
    foreach ($rawInvites as $inv) {
        $isArchived = !empty($inv['is_archived']) && $inv['is_archived'] === true;
        if (!$isArchived) continue;

        $counts['total']++;
        $counts['invitations']++;

        if ($targetCategory !== 'all' && $targetCategory !== 'invitations') continue;

        $id = is_array($inv['_id'] ?? null) ? ($inv['_id']['$oid'] ?? (string)$inv['_id']) : (string)($inv['_id'] ?? '');
        $email = $inv['email'] ?? 'No Email';
        $role = strtoupper($inv['role'] ?? 'STAFF');
        $date = $inv['created_at'] ?? 'Unknown Date';
        $reason = $inv['archive_reason'] ?? 'Expired invitation archived';

        if (!empty($search)) {
            $haystack = strtolower("{$email} {$role} {$reason}");
            if (strpos($haystack, $search) === false) continue;
        }

        $archivedItems[] = [
            'id'               => $id,
            'category'         => 'invitations',
            'category_label'   => "Staff Invite ({$role})",
            'title'            => "Staff Invite: {$email}",
            'identifier'       => "Role: {$role}",
            'secondary_info'   => "Expired: " . ($inv['expires_at'] ?? 'Past retention'),
            'original_date'    => $date,
            'archived_at'      => $inv['archived_at'] ?? 'Archived',
            'archived_by'      => $inv['archived_by'] ?? 'System Core',
            'archive_reason'   => $reason,
            'raw_status'       => $inv['status'] ?? 'expired'
        ];
    }

    // Sort by archived_at descending
    usort($archivedItems, function($a, $b) {
        return strcmp($b['archived_at'] ?? '', $a['archived_at'] ?? '');
    });

    echo json_encode([
        'status' => 'success',
        'counts' => $counts,
        'count'  => count($archivedItems),
        'items'  => $archivedItems
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to load archived records: ' . $e->getMessage()
    ]);
}

<?php
/**
 * OptiDent System - Automated Batch Archival Endpoint
 * Task SA-007: Data Archiving & Historical Preservation
 * Executes bulk archival policies for old or completed records
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/audit_logger.php';

header('Content-Type: application/json; charset=UTF-8');

try {
    AuthGuard::requireRole(['super_admin']);

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) $input = $_POST;

    $rule = trim($input['rule'] ?? 'completed_appointments_30d');
    $actorEmail = $_SESSION['email'] ?? 'super_admin';
    $now = date('Y-m-d H:i:s');
    $db = MongoDBConnection::getInstance();

    $archivedCount = 0;
    $details = [];

    if ($rule === 'completed_appointments_30d' || $rule === 'completed_appointments_60d') {
        $days = ($rule === 'completed_appointments_60d') ? 60 : 30;
        $cutoffDate = date('Y-m-d', strtotime("-{$days} days"));

        $appointments = $db->find('appointments', []);
        foreach ($appointments as $appt) {
            // Only archive active non-archived completed or cancelled appointments
            if (!empty($appt['is_archived'])) continue;
            $status = strtolower($appt['status'] ?? '');
            if (!in_array($status, ['completed', 'cancelled', 'no-show'])) continue;

            $apptDate = $appt['appointment_date'] ?? substr($appt['created_at'] ?? '', 0, 10);
            if ($apptDate <= $cutoffDate) {
                $filter = ['_id' => $appt['_id']];
                $archiveData = [
                    'is_archived'    => true,
                    'archived_at'    => $now,
                    'archived_by'    => $actorEmail,
                    'archive_reason' => "Automated policy: {$status} appointment older than {$days} days (Date: {$apptDate})"
                ];
                $db->updateOne('appointments', $filter, ['$set' => $archiveData]);
                $archivedCount++;
                $details[] = "Appt: " . ($appt['patient_name'] ?? 'Patient') . " ({$apptDate})";
            }
        }

        $ruleLabel = "Completed Appointments older than {$days} days";

    } elseif ($rule === 'expired_invitations') {
        $invitations = $db->find('invitations', []);
        foreach ($invitations as $inv) {
            if (!empty($inv['is_archived']) || !empty($inv['is_deleted'])) continue;
            $status = strtolower($inv['status'] ?? 'pending');
            $expiresAt = $inv['expires_at'] ?? '';

            $isExpired = (!empty($expiresAt) && strtotime($expiresAt) < time()) || ($status === 'expired');
            if ($isExpired) {
                $filter = ['_id' => $inv['_id']];
                $archiveData = [
                    'is_archived'    => true,
                    'archived_at'    => $now,
                    'archived_by'    => $actorEmail,
                    'archive_reason' => "Automated policy: expired staff invitation past validity window ({$expiresAt})"
                ];
                $db->updateOne('invitations', $filter, ['$set' => $archiveData]);
                $archivedCount++;
                $details[] = "Invite: " . ($inv['email'] ?? 'Staff');
            }
        }

        $ruleLabel = "Expired Staff Invitations";

    } elseif ($rule === 'inactive_accounts') {
        $users = $db->find('users', []);
        $cutoffDate = date('Y-m-d H:i:s', strtotime('-90 days'));

        foreach ($users as $u) {
            if (!empty($u['is_master']) || !empty($u['is_archived']) || !empty($u['is_deleted'])) continue;
            $status = strtolower($u['status'] ?? 'active');
            $createdOrUpdated = $u['status_updated_at'] ?? ($u['created_at'] ?? '');

            if ($status === 'suspended' && $createdOrUpdated <= $cutoffDate) {
                $filter = ['_id' => $u['_id']];
                $archiveData = [
                    'is_archived'    => true,
                    'archived_at'    => $now,
                    'archived_by'    => $actorEmail,
                    'archive_reason' => "Automated policy: suspended/inactive account older than 90 days"
                ];
                $db->updateOne('users', $filter, ['$set' => $archiveData]);
                $archivedCount++;
                $details[] = "User: " . ($u['email'] ?? 'User');
            }
        }

        $ruleLabel = "Suspended / Inactive Accounts older than 90 days";

    } else {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => "Unknown batch archival policy '{$rule}'."]);
        exit;
    }

    AuditLogger::log('BATCH_ARCHIVE_EXECUTED', "rule:{$rule}", [
        'rule_label'      => $ruleLabel,
        'archived_count'  => $archivedCount,
        'executed_by'     => $actorEmail,
        'sample_records'  => array_slice($details, 0, 5)
    ]);

    echo json_encode([
        'status'         => 'success',
        'archived_count' => $archivedCount,
        'rule'           => $rule,
        'message'        => "Batch Archival completed: {$archivedCount} record(s) archived under policy '{$ruleLabel}'."
    ]);

} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Batch archival failed: ' . $e->getMessage()
    ]);
}

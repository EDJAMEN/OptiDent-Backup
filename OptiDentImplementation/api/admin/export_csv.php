<?php
/**
 * OptiDent System - Operations Data CSV Exporter (SA-009)
 * Generates structured, standard RFC 4180 CSV files with UTF-8 BOM for Microsoft Excel compatibility
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin', 'admin']);
    global $db;

    $reportType = strtolower(trim($_GET['type'] ?? ($_GET['report'] ?? 'appointments')));
    $datePreset = strtolower(trim($_GET['date_preset'] ?? 'all_time'));
    $customFrom = trim($_GET['date_from'] ?? '');
    $customTo   = trim($_GET['date_to'] ?? '');
    $filterDoc  = trim($_GET['doctor'] ?? 'all');
    $filterStat = strtolower(trim($_GET['status'] ?? 'all'));
    $timestamp  = date('Y-m-d_His');

    $todayStr = date('Y-m-d');
    $startDate = null;
    $endDate = null;

    if ($datePreset === 'today') {
        $startDate = $todayStr;
        $endDate = $todayStr;
    } elseif ($datePreset === 'yesterday') {
        $yest = date('Y-m-d', strtotime('-1 day'));
        $startDate = $yest;
        $endDate = $yest;
    } elseif ($datePreset === 'this_week') {
        $startDate = date('Y-m-d', strtotime('monday this week'));
        $endDate = date('Y-m-d', strtotime('sunday this week'));
    } elseif ($datePreset === 'this_month') {
        $startDate = date('Y-m-01');
        $endDate = date('Y-m-t');
    } elseif ($datePreset === 'last_30_days') {
        $startDate = date('Y-m-d', strtotime('-30 days'));
        $endDate = $todayStr;
    } elseif ($datePreset === 'custom' && !empty($customFrom)) {
        $startDate = $customFrom;
        $endDate = !empty($customTo) ? $customTo : $todayStr;
    }

    AuditLogger::log('CSV_REPORT_EXPORTED', "report:{$reportType}", [
        'type' => $reportType,
        'date_preset' => $datePreset
    ]);

    $filename = "optident_{$reportType}_report_{$timestamp}.csv";
    header('Content-Type: text/csv; charset=UTF-8');
    header("Content-Disposition: attachment; filename=\"{$filename}\"");
    header('Pragma: no-cache');
    header('Expires: 0');

    // Output UTF-8 BOM for Excel compatibility
    echo "\xEF\xBB\xBF";
    $output = fopen('php://output', 'w');

    if ($reportType === 'patients') {
        fputcsv($output, ['Patient ID', 'Full Name', 'Email Address', 'Phone Number', 'Gender', 'Age', 'Medical Alerts', 'Account Status', 'Registered Date']);
        $allUsers = $db->find('users', []);
        foreach ($allUsers as $u) {
            if (!empty($u['is_deleted'])) continue;
            $role = strtolower($u['role'] ?? '');
            if ($role === 'patient' || $role === 'client' || empty($role)) {
                $createdAt = substr($u['created_at'] ?? '', 0, 10);
                if ($startDate && $endDate && ($createdAt < $startDate || $createdAt > $endDate)) {
                    continue;
                }
                fputcsv($output, [
                    (string)$u['_id'],
                    $u['full_name'] ?? 'N/A',
                    $u['email'] ?? 'N/A',
                    $u['phone'] ?? 'N/A',
                    $u['gender'] ?? 'N/A',
                    $u['age'] ?? 'N/A',
                    $u['medical_alerts'] ?? 'None',
                    $u['status'] ?? 'active',
                    $u['created_at'] ?? 'N/A'
                ]);
            }
        }
    } elseif ($reportType === 'queues') {
        fputcsv($output, ['Queue Number', 'Appointment Date', 'Time Slot', 'Patient Name', 'Phone', 'Service / Procedure', 'Attending Doctor', 'Operatory Chair', 'Queue Status', 'Walk-in?']);
        $allAppts = $db->find('appointments', []);
        foreach ($allAppts as $a) {
            if (!empty($a['is_deleted'])) continue;
            $aptDate = substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10);
            if ($startDate && $endDate && ($aptDate < $startDate || $aptDate > $endDate)) {
                continue;
            }
            fputcsv($output, [
                $a['queue_number'] ?? 'N/A',
                $aptDate,
                $a['appointment_time'] ?? $a['time_slot'] ?? 'N/A',
                $a['patient_name'] ?? 'N/A',
                $a['patient_phone'] ?? 'N/A',
                $a['service_name'] ?? 'N/A',
                $a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned',
                $a['operatory_chair'] ?? $a['chair_room'] ?? 'Chair 1',
                strtoupper($a['status'] ?? 'scheduled'),
                !empty($a['is_walkin']) ? 'YES' : 'NO'
            ]);
        }
    } elseif ($reportType === 'cancellations') {
        fputcsv($output, ['Appointment ID', 'Date', 'Time Slot', 'Patient Name', 'Phone', 'Service', 'Attending Doctor', 'Cancellation Reason', 'Cancelled At']);
        $allAppts = $db->find('appointments', ['status' => 'cancelled']);
        foreach ($allAppts as $a) {
            if (!empty($a['is_deleted'])) continue;
            $aptDate = substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10);
            if ($startDate && $endDate && ($aptDate < $startDate || $aptDate > $endDate)) {
                continue;
            }
            fputcsv($output, [
                (string)$a['_id'],
                $aptDate,
                $a['appointment_time'] ?? $a['time_slot'] ?? 'N/A',
                $a['patient_name'] ?? 'N/A',
                $a['patient_phone'] ?? 'N/A',
                $a['service_name'] ?? 'N/A',
                $a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned',
                $a['cancellation_reason'] ?? 'Not specified',
                $a['cancelled_at'] ?? $a['last_updated_at'] ?? 'N/A'
            ]);
        }
    } elseif ($reportType === 'audit_logs') {
        fputcsv($output, ['Event ID', 'Timestamp', 'Action / Event Type', 'Target Entity', 'IP Address', 'User Agent', 'Action Details']);
        $allAudit = $db->find('audit_logs', []);
        foreach ($allAudit as $log) {
            $logDate = substr($log['created_at'] ?? '', 0, 10);
            if ($startDate && $endDate && ($logDate < $startDate || $logDate > $endDate)) {
                continue;
            }
            $detailsStr = is_array($log['details'] ?? null) ? json_encode($log['details']) : ($log['details'] ?? '');
            fputcsv($output, [
                (string)($log['_id'] ?? ''),
                $log['created_at'] ?? 'N/A',
                $log['action'] ?? 'EVENT',
                $log['target'] ?? 'system',
                $log['ip_address'] ?? '127.0.0.1',
                $log['user_agent'] ?? '',
                $detailsStr
            ]);
        }
    } else {
        // Default: Appointments & Treatments
        fputcsv($output, ['Appointment ID', 'Date', 'Time Slot', 'Patient Name', 'Email', 'Phone', 'Service / Procedure', 'Attending Doctor', 'Operatory Chair', 'Status', 'Walk-in?', 'Diagnosis', 'Operative Notes', 'Cancellation Reason']);
        $allAppts = $db->find('appointments', []);
        foreach ($allAppts as $a) {
            if (!empty($a['is_deleted'])) continue;
            $aptDate = substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10);
            $status = strtolower($a['status'] ?? 'scheduled');
            $docName = $a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned';

            if ($startDate && $endDate && ($aptDate < $startDate || $aptDate > $endDate)) {
                continue;
            }
            if ($filterDoc !== 'all' && $filterDoc !== '' && stripos($docName, $filterDoc) === false) {
                continue;
            }
            if ($filterStat !== 'all' && $filterStat !== '' && $status !== $filterStat) {
                continue;
            }

            fputcsv($output, [
                (string)$a['_id'],
                $aptDate,
                $a['appointment_time'] ?? $a['time_slot'] ?? 'N/A',
                $a['patient_name'] ?? 'N/A',
                $a['patient_email'] ?? 'N/A',
                $a['patient_phone'] ?? 'N/A',
                $a['service_name'] ?? 'N/A',
                $docName,
                $a['operatory_chair'] ?? $a['chair_room'] ?? 'Chair 1',
                strtoupper($status),
                !empty($a['is_walkin']) ? 'YES' : 'NO',
                $a['diagnosis'] ?? '',
                $a['procedure_notes'] ?? '',
                $a['cancellation_reason'] ?? ''
            ]);
        }
    }

    fclose($output);
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo "Error generating CSV export: " . $e->getMessage();
}

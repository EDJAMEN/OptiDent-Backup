<?php
/**
 * OptiDent System - Operations & Monitoring Reports API (SA-009)
 * Highly optimized, fast data retrieval across patients, appointments, queues, cancellations, and system activities
 */

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, OPTIONS");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin', 'admin']);
    global $db;

    $category   = strtolower(trim($_GET['category'] ?? 'all'));
    $datePreset = strtolower(trim($_GET['date_preset'] ?? 'all_time'));
    $customFrom = trim($_GET['date_from'] ?? '');
    $customTo   = trim($_GET['date_to'] ?? '');
    $filterDoc  = trim($_GET['doctor'] ?? 'all');
    $filterStat = strtolower(trim($_GET['status'] ?? 'all'));

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

    // 1. Fetch Master Data from MongoDB
    $allUsers = $db->find('users', ['is_deleted' => ['$ne' => true]]);
    $allAppts = $db->find('appointments', ['is_deleted' => ['$ne' => true]]);
    $allAudit = $db->find('audit_logs', []);

    // Extract Doctors for dropdown
    $doctorsList = [];
    $allPatients = [];

    foreach ($allUsers as $u) {
        $role = strtolower($u['role'] ?? '');
        if ($role === 'doctor') {
            $doctorsList[] = [
                'id' => (string)($u['_id'] ?? ''),
                'name' => $u['full_name'] ?? 'Doctor',
                'specialization' => $u['specialization'] ?? 'General Dentistry'
            ];
        } elseif ($role === 'patient' || $role === 'client' || empty($role)) {
            $createdAt = substr($u['created_at'] ?? '', 0, 10);
            $allPatients[] = [
                'id' => (string)$u['_id'],
                'full_name' => $u['full_name'] ?? 'Patient',
                'email' => $u['email'] ?? '',
                'phone' => $u['phone'] ?? 'N/A',
                'age' => $u['age'] ?? 'N/A',
                'gender' => ucfirst(strtolower($u['gender'] ?? 'Other')),
                'medical_alerts' => $u['medical_alerts'] ?? 'None recorded',
                'status' => $u['status'] ?? 'active',
                'created_at' => $u['created_at'] ?? ''
            ];
        }
    }

    // 2. Filter & Process Appointments
    $filteredAppts = [];
    $completedCount = 0;
    $inProgressCount = 0;
    $scheduledCount = 0;
    $cancelledCount = 0;
    $walkinCount = 0;
    $todayQueue = [];
    $cancellationsList = [];

    foreach ($allAppts as $apt) {
        $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? $apt['created_at'] ?? '', 0, 10);
        $status = strtolower($apt['status'] ?? 'scheduled');
        $docName = $apt['doctor_name'] ?? $apt['dentist_name'] ?? 'Unassigned';

        // Apply Date Range Filter
        if ($startDate && $endDate) {
            if ($aptDate < $startDate || $aptDate > $endDate) {
                continue;
            }
        }

        // Apply Doctor Filter
        if ($filterDoc !== 'all' && $filterDoc !== '') {
            if (stripos($docName, $filterDoc) === false) {
                continue;
            }
        }

        // Apply Status Filter
        if ($filterStat !== 'all' && $filterStat !== '') {
            if ($filterStat === 'scheduled' && !in_array($status, ['scheduled', 'checked_in', 'pending'])) {
                continue;
            } elseif ($filterStat === 'in_progress' && !in_array($status, ['in_progress', 'ongoing', 'chair'])) {
                continue;
            } elseif ($filterStat === 'completed' && $status !== 'completed') {
                continue;
            } elseif ($filterStat === 'cancelled' && $status !== 'cancelled') {
                continue;
            }
        }

        $cleanApt = [
            'id' => (string)$apt['_id'],
            'patient_name' => $apt['patient_name'] ?? 'Patient',
            'patient_email' => $apt['patient_email'] ?? '',
            'patient_phone' => $apt['patient_phone'] ?? '',
            'doctor_name' => $docName,
            'service_name' => $apt['service_name'] ?? 'General Consultation',
            'appointment_date' => $aptDate,
            'appointment_time' => $apt['appointment_time'] ?? $apt['time_slot'] ?? '09:00 AM',
            'chair_room' => $apt['operatory_chair'] ?? $apt['chair_room'] ?? 'Chair 1',
            'status' => $status,
            'is_walkin' => !empty($apt['is_walkin']),
            'queue_number' => $apt['queue_number'] ?? null,
            'cancellation_reason' => $apt['cancellation_reason'] ?? '',
            'notes' => $apt['notes'] ?? ''
        ];

        $filteredAppts[] = $cleanApt;

        // Metric tallies
        if ($status === 'completed') {
            $completedCount++;
        } elseif (in_array($status, ['in_progress', 'ongoing', 'chair'])) {
            $inProgressCount++;
        } elseif ($status === 'cancelled') {
            $cancelledCount++;
            $cancellationsList[] = [
                'id' => (string)$apt['_id'],
                'patient_name' => $apt['patient_name'] ?? 'Patient',
                'doctor_name' => $docName,
                'service_name' => $apt['service_name'] ?? 'Consultation',
                'appointment_date' => $aptDate,
                'appointment_time' => $apt['appointment_time'] ?? $apt['time_slot'] ?? '09:00 AM',
                'cancellation_reason' => $apt['cancellation_reason'] ?? 'Not specified',
                'cancelled_at' => $apt['cancelled_at'] ?? $apt['last_updated_at'] ?? $aptDate
            ];
        } else {
            $scheduledCount++;
        }

        if (!empty($apt['is_walkin'])) {
            $walkinCount++;
        }

        // Live Queue (Today's active flow)
        if ($aptDate === $todayStr && in_array($status, ['scheduled', 'checked_in', 'in_progress', 'pending'])) {
            $todayQueue[] = [
                'id' => (string)$apt['_id'],
                'queue_number' => $apt['queue_number'] ?? ('Q-' . substr(md5((string)$apt['_id']), 0, 3)),
                'patient_name' => $apt['patient_name'] ?? 'Patient',
                'patient_phone' => $apt['patient_phone'] ?? '',
                'doctor_name' => $docName,
                'service_name' => $apt['service_name'] ?? 'Consultation',
                'appointment_time' => $apt['appointment_time'] ?? $apt['time_slot'] ?? '09:00 AM',
                'chair_room' => $apt['operatory_chair'] ?? $apt['chair_room'] ?? 'Chair 1',
                'status' => $status,
                'is_walkin' => !empty($apt['is_walkin']),
                'appointment_date' => $aptDate
            ];
        }
    }

    $totalApptsInPeriod = count($filteredAppts);
    $completionRate = $totalApptsInPeriod > 0 ? round(($completedCount / $totalApptsInPeriod) * 100, 1) : 0;
    $cancellationRate = $totalApptsInPeriod > 0 ? round(($cancelledCount / $totalApptsInPeriod) * 100, 1) : 0;

    // 3. Process Audit Logs
    $filteredAudit = [];
    $securityEventsCount = 0;

    foreach ($allAudit as $log) {
        $logDate = substr($log['created_at'] ?? '', 0, 10);
        if ($startDate && $endDate && ($logDate < $startDate || $logDate > $endDate)) {
            continue;
        }

        $action = $log['action'] ?? 'SYSTEM_EVENT';
        if (stripos($action, 'LOGIN') !== false || stripos($action, 'PASSWORD') !== false || stripos($action, 'ROLE') !== false || stripos($action, 'PERM') !== false) {
            $securityEventsCount++;
        }

        $filteredAudit[] = [
            'id' => (string)($log['_id'] ?? ''),
            'action' => $action,
            'target' => $log['target'] ?? 'system',
            'actor_name' => $log['actor_name'] ?? 'System',
            'actor_role' => $log['actor_role'] ?? 'admin',
            'ip_address' => $log['ip_address'] ?? '127.0.0.1',
            'created_at' => $log['created_at'] ?? date('Y-m-d H:i:s')
        ];
    }

    // Sort audit logs descending
    usort($filteredAudit, function($a, $b) {
        return strcmp($b['created_at'], $a['created_at']);
    });

    // Sort appointments latest first
    usort($filteredAppts, function($a, $b) {
        return strcmp($b['appointment_date'] . ' ' . $b['appointment_time'], $a['appointment_date'] . ' ' . $a['appointment_time']);
    });

    // 4. Return Clean, Optimized Response
    echo json_encode([
        'status' => 'success',
        'metrics' => [
            'total_patients'        => count($allPatients),
            'total_appointments'    => $totalApptsInPeriod,
            'completed_count'       => $completedCount,
            'in_progress_count'     => $inProgressCount,
            'scheduled_count'       => $scheduledCount,
            'cancelled_count'       => $cancelledCount,
            'walkin_count'          => $walkinCount,
            'completion_rate'       => $completionRate,
            'cancellation_rate'     => $cancellationRate,
            'today_queue_count'     => count($todayQueue),
            'audit_events_count'    => count($filteredAudit),
            'security_events_count' => $securityEventsCount
        ],
        'data' => [
            'appointments'  => array_slice($filteredAppts, 0, 100),
            'patients'      => array_slice($allPatients, 0, 100),
            'queues'        => array_slice($todayQueue, 0, 50),
            'cancellations' => array_slice($cancellationsList, 0, 50),
            'audit_logs'    => array_slice($filteredAudit, 0, 80)
        ],
        'filters_options' => [
            'doctors' => $doctorsList
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to query operations reports: ' . $e->getMessage()
    ]);
}

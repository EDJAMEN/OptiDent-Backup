<?php
/**
 * OptiDent System - Operations & Governance Reports API
 * Task SA-009: Reports & System Monitoring
 * Computes multi-dimensional analytics for patients, appointments, queues, cancellations, and system activities
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

    // 1. Fetch Master Data
    $allUsers = $db->find('users', []);
    $allAppts = $db->find('appointments', []);
    $allAudit = $db->find('audit_logs', []);
    $allServices = $db->find('services', []);

    // Filter out permanently deleted
    $activeUsers = array_filter($allUsers, function($u) {
        return empty($u['is_deleted']);
    });
    $activeAppts = array_filter($allAppts, function($a) {
        return empty($a['is_deleted']);
    });

    // Extract list of all doctors for dropdown
    $doctorsList = [];
    foreach ($activeUsers as $u) {
        if (strtolower($u['role'] ?? '') === 'doctor') {
            $doctorsList[] = [
                'id' => (string)($u['_id'] ?? ''),
                'name' => $u['full_name'] ?? 'Doctor',
                'specialization' => $u['specialization'] ?? 'General Dentistry'
            ];
        }
    }

    // 2. Filter Appointments
    $filteredAppts = [];
    $completedCount = 0;
    $inProgressCount = 0;
    $scheduledCount = 0;
    $cancelledCount = 0;
    $walkinCount = 0;
    $todayQueueCount = 0;
    $servicesTally = [];
    $doctorsTally = [];
    $cancellationReasons = [];

    foreach ($activeAppts as $apt) {
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

        $filteredAppts[] = $apt;

        // Status Counts
        if ($status === 'completed') {
            $completedCount++;
        } elseif (in_array($status, ['in_progress', 'ongoing', 'chair'])) {
            $inProgressCount++;
        } elseif ($status === 'cancelled') {
            $cancelledCount++;
            $reason = trim($apt['cancellation_reason'] ?? 'Not specified');
            // Clean reason category
            $reasonCategory = 'Other / Unspecified';
            if (stripos($reason, 'Patient No-Show') !== false) {
                $reasonCategory = 'Patient No-Show';
            } elseif (stripos($reason, 'Emergency') !== false) {
                $reasonCategory = 'Emergency Dental Reschedule';
            } elseif (stripos($reason, 'Doctor Medical') !== false || stripos($reason, 'Urgent Leave') !== false) {
                $reasonCategory = 'Doctor Medical / Urgent Leave';
            } elseif (stripos($reason, 'Patient Requested') !== false) {
                $reasonCategory = 'Patient Requested Reschedule';
            } elseif (stripos($reason, 'Deferred') !== false || stripos($reason, 'Contraindication') !== false) {
                $reasonCategory = 'Medical Contraindication / Deferred';
            } elseif (!empty($reason)) {
                $reasonCategory = $reason;
            }
            $cancellationReasons[$reasonCategory] = ($cancellationReasons[$reasonCategory] ?? 0) + 1;
        } else {
            $scheduledCount++;
        }

        if (!empty($apt['is_walkin'])) {
            $walkinCount++;
        }

        if ($aptDate === $todayStr && !in_array($status, ['completed', 'cancelled'])) {
            $todayQueueCount++;
        }

        // Service Procedure Breakdown
        $service = $apt['service_name'] ?? 'General Consultation';
        $servicesTally[$service] = ($servicesTally[$service] ?? 0) + 1;

        // Doctor Workload Breakdown
        if (!isset($doctorsTally[$docName])) {
            $doctorsTally[$docName] = [
                'doctor_name' => $docName,
                'total_appointments' => 0,
                'completed_procedures' => 0,
                'in_progress' => 0,
                'cancelled' => 0
            ];
        }
        $doctorsTally[$docName]['total_appointments']++;
        if ($status === 'completed') $doctorsTally[$docName]['completed_procedures']++;
        if (in_array($status, ['in_progress', 'ongoing'])) $doctorsTally[$docName]['in_progress']++;
        if ($status === 'cancelled') $doctorsTally[$docName]['cancelled']++;
    }

    $totalApptsInPeriod = count($filteredAppts);
    $completionRate = $totalApptsInPeriod > 0 ? round(($completedCount / $totalApptsInPeriod) * 100, 1) : 0;
    $cancellationRate = $totalApptsInPeriod > 0 ? round(($cancelledCount / $totalApptsInPeriod) * 100, 1) : 0;

    // 3. Filter Patients
    $allPatients = [];
    $newPatientsInPeriod = 0;
    $genderTally = ['Male' => 0, 'Female' => 0, 'Other' => 0];
    $ageTally = ['Pediatric (0-17)' => 0, 'Adult (18-59)' => 0, 'Senior (60+)' => 0];
    $medicalAlertsTally = [];

    // Patient visits map
    $patientVisits = [];
    foreach ($activeAppts as $a) {
        $pEmail = strtolower($a['patient_email'] ?? '');
        $pName = trim($a['patient_name'] ?? '');
        $key = $pEmail ?: $pName;
        if ($key) {
            $patientVisits[$key] = ($patientVisits[$key] ?? 0) + 1;
        }
    }

    foreach ($activeUsers as $u) {
        $uRole = strtolower($u['role'] ?? '');
        if ($uRole === 'patient' || $uRole === 'client' || empty($uRole)) {
            $pEmail = strtolower($u['email'] ?? '');
            $pName = trim($u['full_name'] ?? '');
            $key = $pEmail ?: $pName;
            $visitsCount = $patientVisits[$key] ?? 0;

            $createdAt = substr($u['created_at'] ?? '', 0, 10);
            if ($startDate && $endDate && $createdAt >= $startDate && $createdAt <= $endDate) {
                $newPatientsInPeriod++;
            }

            // Gender
            $gender = ucfirst(strtolower($u['gender'] ?? 'Other'));
            if (!in_array($gender, ['Male', 'Female'])) $gender = 'Other';
            $genderTally[$gender]++;

            // Age
            $age = (int)($u['age'] ?? 0);
            if ($age > 0 && $age < 18) {
                $ageTally['Pediatric (0-17)']++;
            } elseif ($age >= 60) {
                $ageTally['Senior (60+)']++;
            } elseif ($age >= 18) {
                $ageTally['Adult (18-59)']++;
            }

            $allPatients[] = [
                'id' => (string)$u['_id'],
                'full_name' => $u['full_name'] ?? 'Patient',
                'email' => $u['email'] ?? '',
                'phone' => $u['phone'] ?? 'N/A',
                'age' => $u['age'] ?? 'N/A',
                'gender' => $gender,
                'medical_alerts' => $u['medical_alerts'] ?? 'None recorded',
                'visits_count' => $visitsCount,
                'status' => $u['status'] ?? 'active',
                'created_at' => $u['created_at'] ?? ''
            ];
        }
    }

    // 4. Filter System Activities & Audit Logs
    $filteredAudit = [];
    $securityEventsCount = 0;
    $systemEventsCount = 0;

    foreach ($allAudit as $log) {
        $logDate = substr($log['created_at'] ?? '', 0, 10);
        if ($startDate && $endDate) {
            if ($logDate < $startDate || $logDate > $endDate) {
                continue;
            }
        }

        $action = $log['action'] ?? 'SYSTEM_EVENT';
        if (stripos($action, 'LOGIN') !== false || stripos($action, 'PASSWORD') !== false || stripos($action, 'ROLE') !== false || stripos($action, 'PERM') !== false) {
            $securityEventsCount++;
        } else {
            $systemEventsCount++;
        }

        $filteredAudit[] = [
            'id' => (string)($log['_id'] ?? ''),
            'action' => $action,
            'target' => $log['target'] ?? 'system',
            'details' => $log['details'] ?? null,
            'ip_address' => $log['ip_address'] ?? '127.0.0.1',
            'user_agent' => $log['user_agent'] ?? '',
            'created_at' => $log['created_at'] ?? date('Y-m-d H:i:s')
        ];
    }

    // Sort audit logs descending
    usort($filteredAudit, function($a, $b) {
        return strcmp($b['created_at'], $a['created_at']);
    });

    // 5. Structure Format for Top Procedures
    arsort($servicesTally);
    $servicesBreakdown = [];
    foreach ($servicesTally as $sName => $count) {
        $pct = $totalApptsInPeriod > 0 ? round(($count / $totalApptsInPeriod) * 100, 1) : 0;
        $servicesBreakdown[] = [
            'service_name' => $sName,
            'count' => $count,
            'percentage' => $pct
        ];
    }

    // Structure Format for Cancellation Reasons
    arsort($cancellationReasons);
    $cancellationBreakdown = [];
    foreach ($cancellationReasons as $rName => $count) {
        $pct = $cancelledCount > 0 ? round(($count / $cancelledCount) * 100, 1) : 0;
        $cancellationBreakdown[] = [
            'reason' => $rName,
            'count' => $count,
            'percentage' => $pct
        ];
    }

    // Structure Format for Doctor Workload
    $doctorsBreakdown = array_values($doctorsTally);
    usort($doctorsBreakdown, function($a, $b) {
        return $b['total_appointments'] - $a['total_appointments'];
    });

    // Top Queues List (Today's queue or active flow)
    $queueList = [];
    foreach ($activeAppts as $apt) {
        $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10);
        $status = strtolower($apt['status'] ?? 'scheduled');
        if (($aptDate === $todayStr || $aptDate >= $todayStr) && in_array($status, ['scheduled', 'checked_in', 'in_progress', 'pending'])) {
            $queueList[] = [
                'id' => (string)$apt['_id'],
                'queue_number' => $apt['queue_number'] ?? 'Q-' . substr(md5((string)$apt['_id']), 0, 3),
                'patient_name' => $apt['patient_name'] ?? 'Patient',
                'patient_phone' => $apt['patient_phone'] ?? '',
                'doctor_name' => $apt['doctor_name'] ?? $apt['dentist_name'] ?? 'Doctor',
                'service_name' => $apt['service_name'] ?? 'Consultation',
                'appointment_time' => $apt['appointment_time'] ?? $apt['time_slot'] ?? '09:00 AM',
                'chair_room' => $apt['operatory_chair'] ?? $apt['chair_room'] ?? 'Operatory Chair 1',
                'status' => $status,
                'is_walkin' => !empty($apt['is_walkin']),
                'appointment_date' => $aptDate
            ];
        }
    }

    // Top Cancellations List
    $cancellationsList = [];
    foreach ($activeAppts as $apt) {
        if (strtolower($apt['status'] ?? '') === 'cancelled') {
            $cancellationsList[] = [
                'id' => (string)$apt['_id'],
                'patient_name' => $apt['patient_name'] ?? 'Patient',
                'doctor_name' => $apt['doctor_name'] ?? $apt['dentist_name'] ?? 'Doctor',
                'service_name' => $apt['service_name'] ?? 'Consultation',
                'appointment_date' => substr($apt['appointment_date'] ?? $apt['date'] ?? '', 0, 10),
                'appointment_time' => $apt['appointment_time'] ?? $apt['time_slot'] ?? '09:00 AM',
                'cancellation_reason' => $apt['cancellation_reason'] ?? 'Not specified',
                'cancelled_at' => $apt['cancelled_at'] ?? $apt['last_updated_at'] ?? $apt['created_at'] ?? ''
            ];
        }
    }

    // Sort cancellations latest first
    usort($cancellationsList, function($a, $b) {
        return strcmp($b['appointment_date'], $a['appointment_date']);
    });

    // Sort filtered appointments latest first
    usort($filteredAppts, function($a, $b) {
        $dA = ($a['appointment_date'] ?? '') . ' ' . ($a['appointment_time'] ?? '');
        $dB = ($b['appointment_date'] ?? '') . ' ' . ($b['appointment_time'] ?? '');
        return strcmp($dB, $dA);
    });

    // Prepare clean appointments table array
    $cleanAppointments = array_map(function($a) {
        return [
            'id' => (string)$a['_id'],
            'patient_name' => $a['patient_name'] ?? 'Unknown',
            'patient_email' => $a['patient_email'] ?? '',
            'patient_phone' => $a['patient_phone'] ?? '',
            'doctor_name' => $a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned',
            'service_name' => $a['service_name'] ?? 'General Consultation',
            'appointment_date' => substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10),
            'appointment_time' => $a['appointment_time'] ?? $a['time_slot'] ?? '09:00 AM',
            'chair_room' => $a['operatory_chair'] ?? $a['chair_room'] ?? 'Chair 1',
            'status' => strtolower($a['status'] ?? 'scheduled'),
            'is_walkin' => !empty($a['is_walkin']),
            'queue_number' => $a['queue_number'] ?? null,
            'cancellation_reason' => $a['cancellation_reason'] ?? '',
            'notes' => $a['notes'] ?? '',
            'diagnosis' => $a['diagnosis'] ?? '',
            'procedure_notes' => $a['procedure_notes'] ?? ''
        ];
    }, array_slice($filteredAppts, 0, 150));

    // Response structure
    $response = [
        'status' => 'success',
        'meta' => [
            'generated_at' => date('Y-m-d H:i:s'),
            'date_preset'  => $datePreset,
            'start_date'   => $startDate ?: 'Beginning of records',
            'end_date'     => $endDate ?: 'Present date',
            'category'     => $category,
            'filter_doc'   => $filterDoc,
            'filter_stat'  => $filterStat
        ],
        'metrics' => [
            'total_patients'        => count($allPatients),
            'new_patients_period'   => $newPatientsInPeriod,
            'total_appointments'    => $totalApptsInPeriod,
            'completed_count'       => $completedCount,
            'in_progress_count'     => $inProgressCount,
            'scheduled_count'       => $scheduledCount,
            'cancelled_count'       => $cancelledCount,
            'walkin_count'          => $walkinCount,
            'completion_rate'       => $completionRate,
            'cancellation_rate'     => $cancellationRate,
            'today_queue_count'     => $todayQueueCount,
            'audit_events_count'    => count($filteredAudit),
            'security_events_count' => $securityEventsCount
        ],
        'breakdowns' => [
            'services'              => $servicesBreakdown,
            'cancellation_reasons'  => $cancellationBreakdown,
            'doctor_workload'       => $doctorsBreakdown,
            'patient_genders'       => $genderTally,
            'patient_ages'          => $ageTally
        ],
        'data' => [
            'appointments'  => $cleanAppointments,
            'patients'      => array_slice($allPatients, 0, 100),
            'queues'        => array_slice($queueList, 0, 50),
            'cancellations' => array_slice($cancellationsList, 0, 50),
            'audit_logs'    => array_slice($filteredAudit, 0, 80)
        ],
        'filters_options' => [
            'doctors' => $doctorsList,
            'services' => array_keys($servicesTally)
        ]
    ];

    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Failed to generate operational reports: ' . $e->getMessage()
    ]);
}

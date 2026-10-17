<?php
/**
 * OptiDent System - Official PDF Report Generator
 * Task SA-009 & SA-005: Operational & System Governance Reports
 * Generates official, printable PDF forms and reports for clinic governance
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin', 'admin']);

    global $db;
    $reportType  = strtolower(trim($_GET['report'] ?? ($_GET['type'] ?? 'comprehensive')));
    $datePreset  = strtolower(trim($_GET['date_preset'] ?? 'all_time'));
    $customFrom  = trim($_GET['date_from'] ?? '');
    $customTo    = trim($_GET['date_to'] ?? '');
    $filterDoc   = trim($_GET['doctor'] ?? 'all');
    $filterStat  = strtolower(trim($_GET['status'] ?? 'all'));

    $todayStr    = date('Y-m-d');
    $startDate   = null;
    $endDate     = null;

    if ($datePreset === 'today') {
        $startDate = $todayStr;
        $endDate   = $todayStr;
    } elseif ($datePreset === 'yesterday') {
        $yest = date('Y-m-d', strtotime('-1 day'));
        $startDate = $yest;
        $endDate   = $yest;
    } elseif ($datePreset === 'this_week') {
        $startDate = date('Y-m-d', strtotime('monday this week'));
        $endDate   = date('Y-m-d', strtotime('sunday this week'));
    } elseif ($datePreset === 'this_month') {
        $startDate = date('Y-m-01');
        $endDate   = date('Y-m-t');
    } elseif ($datePreset === 'last_30_days') {
        $startDate = date('Y-m-d', strtotime('-30 days'));
        $endDate   = $todayStr;
    } elseif ($datePreset === 'custom' && !empty($customFrom)) {
        $startDate = $customFrom;
        $endDate   = !empty($customTo) ? $customTo : $todayStr;
    }

    $generatedAt = date('F d, Y \a\t h:i A');
    $reportId    = 'OPT-' . strtoupper(substr(md5($reportType . time()), 0, 8));
    $generatedBy = $_SESSION['name'] ?? ($_SESSION['email'] ?? 'Dr. Super Admin');

    // Fetch clinic settings for letterhead
    $clinic = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);
    $clinicName    = $clinic['clinic_name'] ?? 'OptiDent Dental Clinic';
    $clinicTagline = $clinic['tagline'] ?? 'Advanced Digital Dental Care & Management';
    $clinicAddress = $clinic['address'] ?? 'Suite 402, MedTech Tower, Osmeña Blvd, Cebu City, Philippines';
    $clinicPhone   = $clinic['contact_phone'] ?? '+63 (032) 412-8899';
    $clinicEmail   = $clinic['contact_email'] ?? 'admin@optident.com';

    // Log the PDF report generation
    AuditLogger::log('REPORT_PDF_GENERATED', "report:{$reportType}", [
        'report_id'   => $reportId,
        'report'      => $reportType,
        'date_preset' => $datePreset
    ]);

    // Data fetching
    $allUsers = $db->find('users', []);
    $allAppts = $db->find('appointments', []);
    $allAudit = $db->find('audit_logs', []);

    $activeUsers = array_filter($allUsers, function($u) { return empty($u['is_deleted']); });
    $activeAppts = array_filter($allAppts, function($a) { return empty($a['is_deleted']); });

    // Filter appointments
    $filteredAppts = [];
    $completedCount = 0;
    $inProgressCount = 0;
    $scheduledCount = 0;
    $cancelledCount = 0;
    $walkinCount = 0;
    $todayQueue = [];
    $cancellationsList = [];
    $servicesTally = [];
    $doctorsTally = [];
    $cancellationReasons = [];

    foreach ($activeAppts as $apt) {
        $aptDate = substr($apt['appointment_date'] ?? $apt['date'] ?? $apt['created_at'] ?? '', 0, 10);
        $status  = strtolower($apt['status'] ?? 'scheduled');
        $docName = $apt['doctor_name'] ?? $apt['dentist_name'] ?? 'Unassigned';
        $sName   = $apt['service_name'] ?? 'General Consultation';

        // Date check
        if ($startDate && $endDate) {
            if ($aptDate < $startDate || $aptDate > $endDate) continue;
        }

        // Doctor check
        if ($filterDoc !== 'all' && $filterDoc !== '') {
            if (stripos($docName, $filterDoc) === false) continue;
        }

        // Status check
        if ($filterStat !== 'all' && $filterStat !== '') {
            if ($filterStat === 'scheduled' && !in_array($status, ['scheduled', 'checked_in', 'pending'])) continue;
            elseif ($filterStat === 'in_progress' && !in_array($status, ['in_progress', 'ongoing', 'chair'])) continue;
            elseif ($filterStat === 'completed' && $status !== 'completed') continue;
            elseif ($filterStat === 'cancelled' && $status !== 'cancelled') continue;
        }

        $filteredAppts[] = $apt;

        if ($status === 'completed') $completedCount++;
        elseif (in_array($status, ['in_progress', 'ongoing', 'chair'])) $inProgressCount++;
        elseif ($status === 'cancelled') {
            $cancelledCount++;
            $reason = trim($apt['cancellation_reason'] ?? 'Not specified');
            $cancellationReasons[$reason] = ($cancellationReasons[$reason] ?? 0) + 1;
            $cancellationsList[] = $apt;
        } else {
            $scheduledCount++;
        }

        if (!empty($apt['is_walkin'])) $walkinCount++;

        // Live queue (today or pending)
        if (($aptDate === $todayStr || $aptDate >= $todayStr) && in_array($status, ['scheduled', 'checked_in', 'in_progress', 'pending'])) {
            $todayQueue[] = $apt;
        }

        $servicesTally[$sName] = ($servicesTally[$sName] ?? 0) + 1;
        $doctorsTally[$docName] = ($doctorsTally[$docName] ?? 0) + 1;
    }

    $totalApptsInPeriod = count($filteredAppts);
    $completionRate = $totalApptsInPeriod > 0 ? round(($completedCount / $totalApptsInPeriod) * 100, 1) : 0;
    $cancellationRate = $totalApptsInPeriod > 0 ? round(($cancelledCount / $totalApptsInPeriod) * 100, 1) : 0;

    // Filter patients
    $patientsList = [];
    foreach ($activeUsers as $u) {
        $uRole = strtolower($u['role'] ?? '');
        if ($uRole === 'patient' || $uRole === 'client' || empty($uRole)) {
            $createdAt = substr($u['created_at'] ?? '', 0, 10);
            if ($reportType === 'patients' && $startDate && $endDate && ($createdAt < $startDate || $createdAt > $endDate)) {
                continue;
            }
            $patientsList[] = $u;
        }
    }

    // Filter audit logs
    $filteredAudit = [];
    foreach ($allAudit as $log) {
        $logDate = substr($log['created_at'] ?? '', 0, 10);
        if ($startDate && $endDate && ($logDate < $startDate || $logDate > $endDate)) {
            continue;
        }
        $filteredAudit[] = $log;
    }
    usort($filteredAudit, function($a, $b) {
        return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
    });

    // Titles & Subtitles
    $title = "Official Clinic Operations Report";
    $subtitle = "Clinical Services, Scheduling Analytics & System Governance Monitoring";

    if ($reportType === 'patients') {
        $title = "Patient Registry & Demographics Report";
        $subtitle = "Active Patient Records, Clinical Alerts, and Registration History";
    } elseif ($reportType === 'appointments') {
        $title = "Appointments & Procedures Summary Report";
        $subtitle = "Consultations, Dental Treatments, and Service Completion Records";
    } elseif ($reportType === 'queues') {
        $title = "Clinical Queue & Operatory Schedule Report";
        $subtitle = "Live Patient Flow, Chair Allocations, and Walk-in Monitoring";
    } elseif ($reportType === 'cancellations') {
        $title = "Appointment Cancellations & No-Show Audit Report";
        $subtitle = "Service Rescheduling Incidents, Attrition Root Causes, and Discontinuation Logs";
    } elseif ($reportType === 'audit_logs') {
        $title = "System Security & Administrative Audit Trail";
        $subtitle = "Immutable Ledger of System Actions, Grants, and Configuration Events";
    } elseif ($reportType === 'users') {
        $title = "Official Staff & User Directory Report";
        $subtitle = "Complete Master Registry of Authorized Clinic Accounts & Roles";
    } elseif ($reportType === 'system_settings') {
        $title = "Master System Configuration & Security Rules";
        $subtitle = "Clinical Parameters, Security Thresholds, and Database Engine Profile";
    }
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($title); ?> - <?php echo htmlspecialchars($clinicName); ?></title>
    <link href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" rel="stylesheet">
    <style>
        @page {
            size: A4 portrait;
            margin: 12mm 15mm 15mm 15mm;
        }

        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1e293b;
            background: #f1f5f9;
            margin: 0;
            padding: 24px;
            font-size: 11px;
            line-height: 1.45;
        }

        /* Top Action Bar for Browser View */
        .no-print-bar {
            max-width: 920px;
            margin: 0 auto 20px auto;
            background: #ffffff;
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .btn-print {
            background: #0eb1b1;
            color: white;
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .btn-print:hover {
            background: #0c9696;
            transform: translateY(-1px);
        }

        .btn-back {
            background: #f8fafc;
            color: #64748b;
            border: 1px solid #cbd5e1;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 500;
            font-size: 13px;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Printable Sheet */
        .pdf-page {
            max-width: 920px;
            margin: 0 auto;
            background: #ffffff;
            padding: 36px 40px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.06);
            position: relative;
        }

        /* Clinic Header */
        .clinic-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #0eb1b1;
            padding-bottom: 14px;
            margin-bottom: 20px;
        }

        .clinic-brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .clinic-logo-text {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #0eb1b1;
            line-height: 1;
        }

        .clinic-logo-text span {
            color: #0f172a;
        }

        .clinic-meta {
            text-align: right;
            font-size: 11px;
            color: #64748b;
            line-height: 1.4;
        }

        .report-title-box {
            background: #f8fafc;
            border-left: 4px solid #0eb1b1;
            padding: 12px 16px;
            margin-bottom: 18px;
            border-radius: 0 8px 8px 0;
        }

        .report-title {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 4px 0;
        }

        .report-subtitle {
            font-size: 11px;
            color: #64748b;
            margin: 0;
        }

        .report-info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 14px;
        }

        .info-item label {
            display: block;
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 700;
            color: #94a3b8;
            margin-bottom: 2px;
        }

        .info-item span {
            font-size: 11px;
            font-weight: 600;
            color: #1e293b;
        }

        /* KPI Metric Cards */
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 22px;
        }

        .kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 12px;
            text-align: center;
        }

        .kpi-val {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
        }

        .kpi-lbl {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-top: 2px;
        }

        /* Two Column Section */
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 22px;
        }

        .summary-box {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 14px;
        }

        .summary-box h3 {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #0f172a;
            margin: 0 0 10px 0;
            border-bottom: 1px solid #f1f5f9;
            padding-bottom: 6px;
        }

        .stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            padding: 4px 0;
            border-bottom: 1px dashed #f1f5f9;
        }

        /* Data Tables */
        table.pdf-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 10.5px;
        }

        table.pdf-table th {
            background: #f1f5f9;
            color: #334155;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            font-size: 9px;
            padding: 8px 10px;
            border-bottom: 2px solid #cbd5e1;
            text-align: left;
        }

        table.pdf-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
        }

        table.pdf-table tr:nth-child(even) td {
            background: #f8fafc;
        }

        .badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 999px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .badge-active { background: #dcfce7; color: #15803d; }
        .badge-completed { background: #d1fae5; color: #047857; }
        .badge-progress { background: #e0f2fe; color: #0369a1; }
        .badge-scheduled { background: #fef3c7; color: #b45309; }
        .badge-cancelled { background: #fee2e2; color: #b91c1c; }
        .badge-role { background: #f1f5f9; color: #334155; }

        /* Sign-off footer */
        .pdf-footer {
            margin-top: 30px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }

        .signature-box {
            width: 240px;
            text-align: center;
        }

        .signature-line {
            border-bottom: 1px solid #0f172a;
            margin-bottom: 5px;
            height: 35px;
        }

        .signature-name {
            font-weight: 700;
            font-size: 11px;
            color: #0f172a;
        }

        .signature-title {
            font-size: 10px;
            color: #64748b;
        }

        /* Print Media Styles */
        @media print {
            body {
                background: white;
                padding: 0;
            }

            .no-print-bar {
                display: none !important;
            }

            .pdf-page {
                box-shadow: none;
                padding: 0;
                max-width: 100%;
            }

            table.pdf-table {
                page-break-inside: auto;
            }

            table.pdf-table tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
        }
    </style>
</head>
<body>

    <!-- Floating Top Bar for Browser View -->
    <div class="no-print-bar">
        <div style="display: flex; align-items: center; gap: 10px;">
            <a href="../../admin_dashboard.html" class="btn-back">
                <i class='bx bx-arrow-back'></i> Return to Dashboard
            </a>
            <span style="font-size: 13px; color: #64748b;">
                Viewing Official <strong><?php echo ucfirst(str_replace('_', ' ', $reportType)); ?></strong> Report
            </span>
        </div>
        <div style="display: flex; gap: 8px;">
            <button class="btn-print" onclick="window.print()">
                <i class='bx bx-printer'></i> Print / Save as PDF
            </button>
        </div>
    </div>

    <!-- Printable Report Sheet -->
    <div class="pdf-page">
        <!-- Clinic Letterhead -->
        <div class="clinic-header">
            <div class="clinic-brand">
                <div>
                    <div class="clinic-logo-text">Opti<span>Dent</span></div>
                    <div style="font-size: 11px; color: #64748b; font-weight: 500;"><?php echo htmlspecialchars($clinicTagline); ?></div>
                </div>
            </div>
            <div class="clinic-meta">
                <div><strong><?php echo htmlspecialchars($clinicName); ?></strong></div>
                <div><?php echo htmlspecialchars($clinicAddress); ?></div>
                <div>Tel: <?php echo htmlspecialchars($clinicPhone); ?> &bull; Email: <?php echo htmlspecialchars($clinicEmail); ?></div>
            </div>
        </div>

        <!-- Report Title Box -->
        <div class="report-title-box">
            <h1 class="report-title"><?php echo htmlspecialchars($title); ?></h1>
            <p class="report-subtitle"><?php echo htmlspecialchars($subtitle); ?></p>
        </div>

        <!-- Metadata Grid -->
        <div class="report-info-grid">
            <div class="info-item">
                <label>Document Reference</label>
                <span><?php echo htmlspecialchars($reportId); ?></span>
            </div>
            <div class="info-item">
                <label>Period Range</label>
                <span><?php echo $startDate && $endDate ? htmlspecialchars("{$startDate} to {$endDate}") : "All Available Records"; ?></span>
            </div>
            <div class="info-item">
                <label>Generated On</label>
                <span><?php echo htmlspecialchars($generatedAt); ?></span>
            </div>
            <div class="info-item">
                <label>Authorized Signatory</label>
                <span><?php echo htmlspecialchars($generatedBy); ?></span>
            </div>
        </div>

        <?php if ($reportType === 'comprehensive' || $reportType === 'master_operations'): ?>
            <!-- Master Executive Operational KPI Dashboard -->
            <div class="kpi-row">
                <div class="kpi-card">
                    <div class="kpi-val" style="color: #0eb1b1;"><?php echo count($patientsList); ?></div>
                    <div class="kpi-lbl">Total Patients</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-val"><?php echo $totalApptsInPeriod; ?></div>
                    <div class="kpi-lbl">Appointments</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-val" style="color: #10b981;"><?php echo $completionRate; ?>%</div>
                    <div class="kpi-lbl">Completion Rate</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-val" style="color: #3b82f6;"><?php echo count($todayQueue); ?></div>
                    <div class="kpi-lbl">Active Queue</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-val" style="color: #ef4444;"><?php echo $cancellationRate; ?>%</div>
                    <div class="kpi-lbl">Cancellation Rate</div>
                </div>
            </div>

            <!-- Operations Breakdown Grid -->
            <div class="summary-grid">
                <div class="summary-box">
                    <h3>Top Dental Procedures & Services</h3>
                    <?php 
                    arsort($servicesTally);
                    $topServices = array_slice($servicesTally, 0, 5, true);
                    if (empty($topServices)): ?>
                        <div style="color: #94a3b8; font-size: 10px;">No procedures recorded in this range.</div>
                    <?php else: 
                        foreach ($topServices as $s => $cnt): ?>
                        <div class="stat-item">
                            <span><?php echo htmlspecialchars($s); ?></span>
                            <strong><?php echo $cnt; ?> visit(s)</strong>
                        </div>
                    <?php endforeach; endif; ?>
                </div>

                <div class="summary-box">
                    <h3>Attending Doctor Workload Distribution</h3>
                    <?php 
                    arsort($doctorsTally);
                    $topDocs = array_slice($doctorsTally, 0, 5, true);
                    if (empty($topDocs)): ?>
                        <div style="color: #94a3b8; font-size: 10px;">No provider records in this range.</div>
                    <?php else: 
                        foreach ($topDocs as $d => $cnt): ?>
                        <div class="stat-item">
                            <span><?php echo htmlspecialchars($d); ?></span>
                            <strong><?php echo $cnt; ?> appointment(s)</strong>
                        </div>
                    <?php endforeach; endif; ?>
                </div>
            </div>

            <!-- Operational Appointments Table -->
            <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0f172a; margin: 0 0 8px 0;">
                Clinical Appointments Log (Recent Sample)
            </h3>
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 14%;">Date & Time</th>
                        <th style="width: 24%;">Patient Name</th>
                        <th style="width: 24%;">Service / Treatment</th>
                        <th style="width: 22%;">Attending Doctor</th>
                        <th style="width: 16%;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $sampleAppts = array_slice($filteredAppts, 0, 20);
                    if (empty($sampleAppts)): ?>
                        <tr><td colspan="5" style="text-align: center; color: #94a3b8;">No appointments found in this range.</td></tr>
                    <?php else:
                        foreach ($sampleAppts as $a):
                            $st = strtolower($a['status'] ?? 'scheduled');
                            $bClass = 'badge-scheduled';
                            if ($st === 'completed') $bClass = 'badge-completed';
                            elseif (in_array($st, ['in_progress', 'ongoing', 'chair'])) $bClass = 'badge-progress';
                            elseif ($st === 'cancelled') $bClass = 'badge-cancelled';
                    ?>
                    <tr>
                        <td>
                            <strong><?php echo htmlspecialchars(substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10)); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($a['appointment_time'] ?? $a['time_slot'] ?? ''); ?></div>
                        </td>
                        <td>
                            <strong><?php echo htmlspecialchars($a['patient_name'] ?? 'N/A'); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($a['patient_phone'] ?? ''); ?></div>
                        </td>
                        <td><?php echo htmlspecialchars($a['service_name'] ?? 'Consultation'); ?></td>
                        <td><?php echo htmlspecialchars($a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned'); ?></td>
                        <td><span class="badge <?php echo $bClass; ?>"><?php echo strtoupper(str_replace('_', ' ', $st)); ?></span></td>
                    </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>

            <!-- Audit Trail Snippet -->
            <h3 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0f172a; margin: 16px 0 8px 0;">
                Recent System Activity Audit Trail
            </h3>
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 20%;">Timestamp</th>
                        <th style="width: 25%;">Admin / User</th>
                        <th style="width: 25%;">Action</th>
                        <th style="width: 30%;">Target Entity / Context</th>
                    </tr>
                </thead>
                <tbody>
                    <?php 
                    $sampleAudit = array_slice($filteredAudit, 0, 10);
                    if (empty($sampleAudit)): ?>
                        <tr><td colspan="4" style="text-align: center; color: #94a3b8;">No audit activity recorded.</td></tr>
                    <?php else:
                        foreach ($sampleAudit as $l): ?>
                    <tr>
                        <td style="color: #64748b;"><?php echo htmlspecialchars($l['created_at'] ?? 'N/A'); ?></td>
                        <td><strong><?php echo htmlspecialchars($l['actor_name'] ?? 'System'); ?></strong></td>
                        <td><span class="badge badge-role"><?php echo htmlspecialchars($l['action'] ?? 'ACTION'); ?></span></td>
                        <td><code><?php echo htmlspecialchars($l['target'] ?? 'system'); ?></code></td>
                    </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'patients'): ?>
            <!-- Patients Registry Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">Patient Name</th>
                        <th style="width: 25%;">Email & Contact</th>
                        <th style="width: 15%;">Gender / Age</th>
                        <th style="width: 23%;">Medical Alerts</th>
                        <th style="width: 12%;">Registered</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($patientsList as $p): ?>
                    <tr>
                        <td><strong><?php echo htmlspecialchars($p['full_name'] ?? 'N/A'); ?></strong></td>
                        <td>
                            <div><?php echo htmlspecialchars($p['email'] ?? 'N/A'); ?></div>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($p['phone'] ?? ''); ?></div>
                        </td>
                        <td><?php echo htmlspecialchars($p['gender'] ?? 'Other'); ?> / <?php echo htmlspecialchars($p['age'] ?? '—'); ?> yrs</td>
                        <td>
                            <?php 
                            $alerts = $p['medical_alerts'] ?? 'None recorded';
                            $isAlert = strtolower($alerts) !== 'none recorded' && !empty($alerts);
                            ?>
                            <span style="<?php echo $isAlert ? 'color: #dc2626; font-weight: 600;' : 'color: #64748b;'; ?>">
                                <?php echo htmlspecialchars($alerts); ?>
                            </span>
                        </td>
                        <td style="color: #64748b;"><?php echo htmlspecialchars(substr($p['created_at'] ?? '', 0, 10)); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'appointments'): ?>
            <!-- Appointments Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 14%;">Date & Time</th>
                        <th style="width: 22%;">Patient Name</th>
                        <th style="width: 24%;">Service / Treatment</th>
                        <th style="width: 22%;">Attending Doctor</th>
                        <th style="width: 18%;">Current Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($filteredAppts as $a): 
                        $st = strtolower($a['status'] ?? 'scheduled');
                        $bClass = 'badge-scheduled';
                        if ($st === 'completed') $bClass = 'badge-completed';
                        elseif (in_array($st, ['in_progress', 'ongoing', 'chair'])) $bClass = 'badge-progress';
                        elseif ($st === 'cancelled') $bClass = 'badge-cancelled';
                    ?>
                    <tr>
                        <td>
                            <strong><?php echo htmlspecialchars(substr($a['appointment_date'] ?? $a['date'] ?? '', 0, 10)); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($a['appointment_time'] ?? $a['time_slot'] ?? ''); ?></div>
                        </td>
                        <td>
                            <strong><?php echo htmlspecialchars($a['patient_name'] ?? 'N/A'); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($a['patient_phone'] ?? ''); ?></div>
                        </td>
                        <td><?php echo htmlspecialchars($a['service_name'] ?? 'Consultation'); ?></td>
                        <td><?php echo htmlspecialchars($a['doctor_name'] ?? $a['dentist_name'] ?? 'Unassigned'); ?></td>
                        <td><span class="badge <?php echo $bClass; ?>"><?php echo strtoupper(str_replace('_', ' ', $st)); ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'queues'): ?>
            <!-- Queues Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 14%;">Queue ID</th>
                        <th style="width: 22%;">Patient</th>
                        <th style="width: 22%;">Service</th>
                        <th style="width: 20%;">Doctor</th>
                        <th style="width: 12%;">Operatory</th>
                        <th style="width: 10%;">Type</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($todayQueue)): ?>
                        <tr><td colspan="6" style="text-align: center; color: #94a3b8;">No active queues found.</td></tr>
                    <?php else:
                        foreach ($todayQueue as $q): ?>
                    <tr>
                        <td><strong><?php echo htmlspecialchars($q['queue_number'] ?? 'Q-001'); ?></strong></td>
                        <td>
                            <strong><?php echo htmlspecialchars($q['patient_name'] ?? 'Patient'); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($q['patient_phone'] ?? ''); ?></div>
                        </td>
                        <td><?php echo htmlspecialchars($q['service_name'] ?? 'Consultation'); ?></td>
                        <td><?php echo htmlspecialchars($q['doctor_name'] ?? $q['dentist_name'] ?? 'Doctor'); ?></td>
                        <td><?php echo htmlspecialchars($q['operatory_chair'] ?? $q['chair_room'] ?? 'Chair 1'); ?></td>
                        <td>
                            <span class="badge <?php echo !empty($q['is_walkin']) ? 'badge-cancelled' : 'badge-progress'; ?>">
                                <?php echo !empty($q['is_walkin']) ? 'WALK-IN' : 'BOOKED'; ?>
                            </span>
                        </td>
                    </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'cancellations'): ?>
            <!-- Cancellations Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 15%;">Appt Date</th>
                        <th style="width: 22%;">Patient Name</th>
                        <th style="width: 20%;">Doctor</th>
                        <th style="width: 20%;">Service</th>
                        <th style="width: 23%;">Cancellation Reason</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($cancellationsList)): ?>
                        <tr><td colspan="5" style="text-align: center; color: #94a3b8;">No cancellations recorded in this period.</td></tr>
                    <?php else:
                        foreach ($cancellationsList as $c): ?>
                    <tr>
                        <td><strong><?php echo htmlspecialchars(substr($c['appointment_date'] ?? $c['date'] ?? '', 0, 10)); ?></strong></td>
                        <td><strong><?php echo htmlspecialchars($c['patient_name'] ?? 'Patient'); ?></strong></td>
                        <td><?php echo htmlspecialchars($c['doctor_name'] ?? $c['dentist_name'] ?? 'Doctor'); ?></td>
                        <td><?php echo htmlspecialchars($c['service_name'] ?? 'Consultation'); ?></td>
                        <td><span style="color: #b91c1c; font-weight: 600;"><?php echo htmlspecialchars($c['cancellation_reason'] ?? 'Not specified'); ?></span></td>
                    </tr>
                    <?php endforeach; endif; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'audit_logs'): ?>
            <!-- Audit Trail Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 18%;">Timestamp</th>
                        <th style="width: 22%;">Actor / Admin</th>
                        <th style="width: 18%;">Action</th>
                        <th style="width: 18%;">Target Entity</th>
                        <th style="width: 24%;">Event Summary</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($filteredAudit as $l): 
                        $details = is_array($l['details'] ?? null) ? json_encode($l['details']) : ($l['details'] ?? '—');
                    ?>
                    <tr>
                        <td style="color: #64748b; font-size: 9.5px;"><?php echo htmlspecialchars($l['created_at'] ?? 'N/A'); ?></td>
                        <td>
                            <strong><?php echo htmlspecialchars($l['actor_name'] ?? 'System'); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($l['actor_role'] ?? ''); ?></div>
                        </td>
                        <td><span class="badge badge-role"><?php echo htmlspecialchars($l['action'] ?? 'ACTION'); ?></span></td>
                        <td><code><?php echo htmlspecialchars($l['target'] ?? 'system'); ?></code></td>
                        <td style="font-size: 9.5px; color: #475569; word-break: break-all;"><?php echo htmlspecialchars($details); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'users'): ?>
            <!-- Users Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">User / Staff Name</th>
                        <th style="width: 25%;">Email & Contact</th>
                        <th style="width: 15%;">System Role</th>
                        <th style="width: 15%;">Professional ID</th>
                        <th style="width: 10%;">Status</th>
                        <th style="width: 10%;">Joined Date</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($activeUsers as $u): 
                        $statusClass = ($u['status'] ?? 'active') === 'active' ? 'badge-active' : 'badge-cancelled';
                        $roleTitle = ucwords(str_replace('_', ' ', $u['role'] ?? 'User'));
                    ?>
                    <tr>
                        <td>
                            <strong><?php echo htmlspecialchars($u['full_name'] ?? 'N/A'); ?></strong>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($u['position'] ?? ''); ?></div>
                        </td>
                        <td>
                            <div><?php echo htmlspecialchars($u['email'] ?? 'N/A'); ?></div>
                            <div style="font-size: 9px; color: #64748b;"><?php echo htmlspecialchars($u['phone'] ?? ''); ?></div>
                        </td>
                        <td><span class="badge badge-role"><?php echo htmlspecialchars($roleTitle); ?></span></td>
                        <td><code><?php echo htmlspecialchars($u['professional_id'] ?? '—'); ?></code></td>
                        <td><span class="badge <?php echo $statusClass; ?>"><?php echo strtoupper($u['status'] ?? 'active'); ?></span></td>
                        <td style="color: #64748b;"><?php echo htmlspecialchars(substr($u['created_at'] ?? '', 0, 10)); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>

        <?php elseif ($reportType === 'system_settings'): ?>
            <!-- System Settings Table -->
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 35%;">System Configuration Property</th>
                        <th style="width: 40%;">Current Operational Value</th>
                        <th style="width: 25%;">Compliance Level</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Clinic Identity & Trading Name</strong></td>
                        <td><?php echo htmlspecialchars($clinicName); ?></td>
                        <td><span class="badge badge-active">Verified</span></td>
                    </tr>
                    <tr>
                        <td><strong>Primary Operating Timezone</strong></td>
                        <td><?php echo htmlspecialchars($clinic['timezone'] ?? 'Asia/Manila'); ?></td>
                        <td><span class="badge badge-active">Standard GMT+8</span></td>
                    </tr>
                    <tr>
                        <td><strong>System Maintenance Mode Status</strong></td>
                        <td><?php echo !empty($clinic['maintenance_mode']) ? 'ACTIVE (Staff Access Restricted)' : 'NORMAL (All Services Online)'; ?></td>
                        <td><span class="badge <?php echo !empty($clinic['maintenance_mode']) ? 'badge-cancelled' : 'badge-active'; ?>"><?php echo !empty($clinic['maintenance_mode']) ? 'Maintenance' : 'Optimal'; ?></span></td>
                    </tr>
                    <tr>
                        <td><strong>Administrative Session Lifetime</strong></td>
                        <td><?php echo htmlspecialchars($clinic['session_timeout_minutes'] ?? 60); ?> Minutes</td>
                        <td><span class="badge badge-active">HIPAA Compliant</span></td>
                    </tr>
                    <tr>
                        <td><strong>Maximum Failed Authentication Attempts</strong></td>
                        <td><?php echo htmlspecialchars($clinic['max_login_attempts'] ?? 5); ?> Attempts before lock</td>
                        <td><span class="badge badge-active">Brute Force Guard</span></td>
                    </tr>
                    <tr>
                        <td><strong>Database Engine Platform</strong></td>
                        <td>MongoDB 8.x WiredTiger Concurrency Engine</td>
                        <td><span class="badge badge-active">Live & Monitored</span></td>
                    </tr>
                </tbody>
            </table>
        <?php endif; ?>

        <!-- Official Sign-off & Document Watermark -->
        <div class="pdf-footer">
            <div style="font-size: 9.5px; color: #94a3b8; max-width: 440px;">
                CONFIDENTIALITY NOTICE: This official document contains privileged medical and administrative information intended solely for the authorized management of OptiDent Dental Clinic.
            </div>
            <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-name"><?php echo htmlspecialchars($generatedBy); ?></div>
                <div class="signature-title">Master Administrator & Chief Dental Officer</div>
            </div>
        </div>
    </div>

</body>
</html>
<?php 
} catch (\Exception $e) {
    echo "<h3>Report Generation Error</h3><p>" . htmlspecialchars($e->getMessage()) . "</p>";
}
?>

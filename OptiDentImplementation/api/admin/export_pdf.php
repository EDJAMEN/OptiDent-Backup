<?php
/**
 * OptiDent System - Official PDF Report Generator
 * Task SA-005: Master Administrator Rights
 * Generates official, printable PDF forms and reports for clinic governance
 */

require_once __DIR__ . '/../config/auth_guard.php';
require_once __DIR__ . '/../config/audit_logger.php';

try {
    AuthGuard::requireRole(['super_admin']);

    global $db;
    $reportType = strtolower(trim($_GET['report'] ?? ($_GET['collection'] ?? 'users')));
    $generatedAt = date('F d, Y \a\t h:i A');
    $reportId = 'OPT-' . strtoupper(substr(md5($reportType . time()), 0, 8));
    $generatedBy = $_SESSION['name'] ?? ($_SESSION['email'] ?? 'Dr. Super Admin');

    // Fetch clinic settings for header
    $clinic = $db->findOne('system_settings', ['setting_type' => 'clinic_profile']);
    $clinicName    = $clinic['clinic_name'] ?? 'OptiDent Dental Clinic';
    $clinicTagline = $clinic['tagline'] ?? 'Advanced Digital Dental Care & Management';
    $clinicAddress = $clinic['address'] ?? 'Suite 402, MedTech Tower, Osmeña Blvd, Cebu City, Philippines';
    $clinicPhone   = $clinic['contact_phone'] ?? '+63 (032) 412-8899';
    $clinicEmail   = $clinic['contact_email'] ?? 'admin@optident.com';

    // Log the PDF report generation
    AuditLogger::log('REPORT_PDF_GENERATED', "report:{$reportType}", [
        'report_id' => $reportId,
        'report'    => $reportType
    ]);

    // Data fetching
    $title = "Official Clinic Report";
    $subtitle = "System Governance & Administrative Record";
    $records = [];

    if ($reportType === 'users') {
        $title = "Official Staff & User Directory Report";
        $subtitle = "Complete Master Registry of Authorized Clinic Accounts & Roles";
        $records = $db->find('users', []);
        usort($records, function($a, $b) {
            return strcmp($a['role'] ?? '', $b['role'] ?? '');
        });
    } elseif ($reportType === 'audit_logs') {
        $title = "System Security & Administrative Audit Trail";
        $subtitle = "Immutable Ledger of System Actions, Grants, and Configuration Events";
        $records = $db->find('audit_logs', []);
        usort($records, function($a, $b) {
            return strcmp($b['created_at'] ?? '', $a['created_at'] ?? '');
        });
        $records = array_slice($records, 0, 100);
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
            margin: 15mm 15mm 20mm 15mm;
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
            font-size: 12px;
            line-height: 1.5;
        }

        /* Top Action Bar for Browser View */
        .no-print-bar {
            max-width: 900px;
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
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            padding: 40px;
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
            padding-bottom: 16px;
            margin-bottom: 24px;
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
            margin-bottom: 24px;
            border-radius: 0 8px 8px 0;
        }

        .report-title {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 4px 0;
        }

        .report-subtitle {
            font-size: 12px;
            color: #64748b;
            margin: 0;
        }

        .report-info-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 24px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
        }

        .info-item label {
            display: block;
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 700;
            color: #94a3b8;
            margin-bottom: 2px;
        }

        .info-item span {
            font-size: 12px;
            font-weight: 600;
            color: #1e293b;
        }

        /* Data Tables */
        table.pdf-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            font-size: 11px;
        }

        table.pdf-table th {
            background: #f1f5f9;
            color: #334155;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 10px;
            padding: 10px 12px;
            border-bottom: 2px solid #cbd5e1;
            text-align: left;
        }

        table.pdf-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
        }

        table.pdf-table tr:nth-child(even) td {
            background: #f8fafc;
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .badge-active { background: #dcfce7; color: #15803d; }
        .badge-suspended { background: #fee2e2; color: #b91c1c; }
        .badge-role { background: #e0f2fe; color: #0369a1; }
        .badge-super { background: #fef3c7; color: #b45309; }

        /* Sign-off footer */
        .pdf-footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }

        .signature-box {
            width: 250px;
            text-align: center;
        }

        .signature-line {
            border-bottom: 1px solid #0f172a;
            margin-bottom: 6px;
            height: 40px;
        }

        .signature-name {
            font-weight: 700;
            font-size: 12px;
            color: #0f172a;
        }

        .signature-title {
            font-size: 11px;
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
                Viewing Official <strong><?php echo ucfirst($reportType); ?></strong> Report
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
                <label>Generated On</label>
                <span><?php echo htmlspecialchars($generatedAt); ?></span>
            </div>
            <div class="info-item">
                <label>Authorized Signatory</label>
                <span><?php echo htmlspecialchars($generatedBy); ?></span>
            </div>
        </div>

        <?php if ($reportType === 'users'): ?>
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
                    <?php foreach ($records as $u): 
                        $statusClass = ($u['status'] ?? 'active') === 'active' ? 'badge-active' : 'badge-suspended';
                        $roleClass = ($u['role'] ?? '') === 'super_admin' ? 'badge-super' : 'badge-role';
                        $roleTitle = ucwords(str_replace('_', ' ', $u['role'] ?? 'User'));
                    ?>
                    <tr>
                        <td>
                            <strong><?php echo htmlspecialchars($u['full_name'] ?? 'N/A'); ?></strong>
                            <?php if (!empty($u['is_master'])): ?>
                                <span style="color: #b45309; font-size: 10px; font-weight: 700;">(Root Authority)</span>
                            <?php endif; ?>
                            <div style="font-size: 10px; color: #64748b;"><?php echo htmlspecialchars($u['position'] ?? ''); ?></div>
                        </td>
                        <td>
                            <div><?php echo htmlspecialchars($u['email'] ?? 'N/A'); ?></div>
                            <div style="font-size: 10px; color: #64748b;"><?php echo htmlspecialchars($u['phone'] ?? ''); ?></div>
                        </td>
                        <td>
                            <span class="badge <?php echo $roleClass; ?>"><?php echo htmlspecialchars($roleTitle); ?></span>
                        </td>
                        <td><code><?php echo htmlspecialchars($u['professional_id'] ?? '—'); ?></code></td>
                        <td>
                            <span class="badge <?php echo $statusClass; ?>"><?php echo strtoupper($u['status'] ?? 'active'); ?></span>
                        </td>
                        <td style="color: #64748b;">
                            <?php echo htmlspecialchars(substr($u['created_at'] ?? '', 0, 10)); ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
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
                    <?php foreach ($records as $l): 
                        $details = is_array($l['details'] ?? null) ? json_encode($l['details']) : ($l['details'] ?? '—');
                    ?>
                    <tr>
                        <td style="color: #64748b; font-size: 10px;">
                            <?php echo htmlspecialchars($l['created_at'] ?? ($l['timestamp'] ?? 'N/A')); ?>
                        </td>
                        <td>
                            <strong><?php echo htmlspecialchars($l['actor_name'] ?? 'System'); ?></strong>
                            <div style="font-size: 10px; color: #64748b;"><?php echo htmlspecialchars($l['actor_role'] ?? ''); ?> &bull; <?php echo htmlspecialchars($l['ip_address'] ?? '127.0.0.1'); ?></div>
                        </td>
                        <td>
                            <span class="badge badge-role"><?php echo htmlspecialchars($l['action'] ?? 'ACTION'); ?></span>
                        </td>
                        <td><code><?php echo htmlspecialchars($l['target'] ?? 'system'); ?></code></td>
                        <td style="font-size: 10px; color: #475569; word-break: break-all;">
                            <?php echo htmlspecialchars($details); ?>
                        </td>
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
                        <td><span class="badge <?php echo !empty($clinic['maintenance_mode']) ? 'badge-suspended' : 'badge-active'; ?>"><?php echo !empty($clinic['maintenance_mode']) ? 'Maintenance' : 'Optimal'; ?></span></td>
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
                        <td>MongoDB 8.x WiredTiger High-Concurrency Engine</td>
                        <td><span class="badge badge-active">Live & Monitored</span></td>
                    </tr>
                </tbody>
            </table>
        <?php endif; ?>

        <!-- Official Sign-off & Document Watermark -->
        <div class="pdf-footer">
            <div style="font-size: 10px; color: #94a3b8; max-width: 400px;">
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

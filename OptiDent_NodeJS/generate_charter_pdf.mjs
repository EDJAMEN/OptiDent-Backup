import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

console.log('Writing OptiDent Master Exploratory Testing Charter PDF generator...');

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 45, right: 45 },
  bufferPages: true,
  autoFirstPage: true
});

const outputPathRoot = path.resolve('../OptiDent_Exploratory_Testing_Charter_Sprint_Suite.pdf');
const outputPathPublic = path.resolve('./public/OptiDent_Exploratory_Testing_Charter_Sprint_Suite.pdf');

const writeStreamRoot = fs.createWriteStream(outputPathRoot);
const writeStreamPublic = fs.createWriteStream(outputPathPublic);

doc.pipe(writeStreamRoot);
doc.pipe(writeStreamPublic);

// Theme Colors
const COLORS = {
  navy: '#0F172A',
  slateDark: '#1E293B',
  slateMed: '#475569',
  slateLight: '#64748B',
  slateDim: '#94A3B8',
  tealDark: '#0D9488',
  tealBrand: '#0EB1B1',
  tealLight: '#14B8A6',
  tealBg: '#F0FDFA',
  blueLight: '#0284C7',
  blueBg: '#F0F9FF',
  grayBg: '#F8FAFC',
  borderLight: '#E2E8F0',
  borderDark: '#CBD5E1',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  success: '#059669',
  successBg: '#ECFDF5',
  white: '#FFFFFF'
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 45;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2); // 505.28 pt

// Helper: Ensure Space
function ensureSpace(height) {
  if (doc.y + height > PAGE_HEIGHT - 60) {
    doc.addPage();
    return true;
  }
  return false;
}

// Helper: Section Banner
function drawSectionHeader(sectionNum, title) {
  ensureSpace(45);
  doc.moveDown(0.8);
  const startY = doc.y;

  // Background rect
  doc.rect(MARGIN, startY, CONTENT_WIDTH, 26).fill(COLORS.navy);
  // Teal accent bar
  doc.rect(MARGIN, startY, 6, 26).fill(COLORS.tealBrand);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white);
  doc.text(`SECTION ${sectionNum}: ${title.toUpperCase()}`, MARGIN + 14, startY + 7, {
    width: CONTENT_WIDTH - 20
  });

  doc.y = startY + 34;
}

// Helper: Subsection Header
function drawSubSectionHeader(title) {
  ensureSpace(32);
  doc.moveDown(0.5);
  const startY = doc.y;

  // Left accent line
  doc.rect(MARGIN, startY, 3, 16).fill(COLORS.tealDark);

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COLORS.slateDark);
  doc.text(title, MARGIN + 10, startY + 2, { width: CONTENT_WIDTH - 15 });

  doc.y = startY + 22;
}

// Helper: Callout Box
function drawCallout(type, title, items) {
  let bgColor = COLORS.grayBg;
  let borderColor = COLORS.borderDark;
  let titleColor = COLORS.slateDark;

  if (type === 'risk') {
    bgColor = COLORS.dangerBg;
    borderColor = COLORS.danger;
    titleColor = COLORS.danger;
  } else if (type === 'heuristic') {
    bgColor = COLORS.blueBg;
    borderColor = COLORS.blueLight;
    titleColor = COLORS.blueLight;
  } else if (type === 'attack') {
    bgColor = COLORS.warningBg;
    borderColor = COLORS.warning;
    titleColor = COLORS.warning;
  } else if (type === 'expected') {
    bgColor = COLORS.tealBg;
    borderColor = COLORS.tealDark;
    titleColor = COLORS.tealDark;
  }

  // Calculate box height
  let textBlockHeight = 16;
  doc.font('Helvetica').fontSize(8.5);
  items.forEach(it => {
    textBlockHeight += doc.heightOfString(`• ${it}`, { width: CONTENT_WIDTH - 32 }) + 3;
  });

  ensureSpace(textBlockHeight + 14);
  const startY = doc.y;

  doc.rect(MARGIN, startY, CONTENT_WIDTH, textBlockHeight + 10).fill(bgColor);
  doc.rect(MARGIN, startY, 4, textBlockHeight + 10).fill(borderColor);
  doc.rect(MARGIN, startY, CONTENT_WIDTH, textBlockHeight + 10).strokeColor(COLORS.borderLight).stroke();

  doc.font('Helvetica-Bold').fontSize(9).fillColor(titleColor);
  doc.text(title.toUpperCase(), MARGIN + 12, startY + 6);

  let currentY = startY + 20;
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateDark);
  items.forEach(it => {
    doc.text(`• ${it}`, MARGIN + 12, currentY, { width: CONTENT_WIDTH - 24 });
    currentY += doc.heightOfString(`• ${it}`, { width: CONTENT_WIDTH - 24 }) + 3;
  });

  doc.y = startY + textBlockHeight + 16;
}

// Helper: Table Renderer
function drawTable(headers, rows, colWidths, options = {}) {
  const headerHeight = options.headerHeight || 20;
  const fontSize = options.fontSize || 8;

  function renderTableHeader(currY) {
    doc.rect(MARGIN, currY, CONTENT_WIDTH, headerHeight).fill(COLORS.navy);
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(COLORS.white);
    headers.forEach((h, i) => {
      doc.text(h, x + 4, currY + 5, { width: colWidths[i] - 8, align: options.align && options.align[i] ? options.align[i] : 'left' });
      x += colWidths[i];
    });
    return currY + headerHeight;
  }

  ensureSpace(headerHeight + 25);
  let currentY = renderTableHeader(doc.y);

  rows.forEach((row, rowIndex) => {
    // Calculate row height based on text wrapping
    doc.font('Helvetica').fontSize(fontSize);
    let maxCellHeight = 14;
    row.forEach((cell, i) => {
      const cellHeight = doc.heightOfString(String(cell || ''), { width: colWidths[i] - 8 });
      if (cellHeight + 8 > maxCellHeight) maxCellHeight = cellHeight + 8;
    });

    if (currentY + maxCellHeight > PAGE_HEIGHT - 60) {
      doc.addPage();
      currentY = renderTableHeader(MARGIN);
    }

    const rowBg = (rowIndex % 2 === 1) ? COLORS.grayBg : COLORS.white;
    doc.rect(MARGIN, currentY, CONTENT_WIDTH, maxCellHeight).fill(rowBg);
    doc.rect(MARGIN, currentY, CONTENT_WIDTH, maxCellHeight).strokeColor(COLORS.borderLight).stroke();

    let x = MARGIN;
    doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.slateDark);
    row.forEach((cell, i) => {
      const isBold = options.boldCols && options.boldCols.includes(i);
      if (isBold) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');

      let textColor = COLORS.slateDark;
      if (options.colorMap && options.colorMap[i]) {
        textColor = options.colorMap[i](cell) || COLORS.slateDark;
      }
      doc.fillColor(textColor);

      doc.text(String(cell || ''), x + 4, currentY + 4, {
        width: colWidths[i] - 8,
        align: options.align && options.align[i] ? options.align[i] : 'left'
      });
      x += colWidths[i];
    });

    currentY += maxCellHeight;
  });

  doc.y = currentY + 6;
}

// Helper: Mission Block
function drawMissionBlock(missionNum, title, role, timebox, stories, goal, areas, vectors, expected) {
  ensureSpace(120);
  doc.moveDown(0.6);
  const startY = doc.y;

  // Header Box
  doc.rect(MARGIN, startY, CONTENT_WIDTH, 38).fill(COLORS.navy);
  doc.rect(MARGIN, startY, 6, 38).fill(COLORS.tealBrand);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.white);
  doc.text(`MISSION ${missionNum}: ${title.toUpperCase()}`, MARGIN + 14, startY + 6, { width: CONTENT_WIDTH - 20 });

  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.tealLight);
  doc.text(`ROLE: ${role.toUpperCase()}   |   TIMEBOX: ${timebox}   |   STORIES: ${stories.join(', ')}`, MARGIN + 14, startY + 22);

  doc.y = startY + 44;

  // Goal statement
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.slateDark);
  doc.text('Charter Objective & Scope: ', { continued: true });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateMed);
  doc.text(goal);
  doc.moveDown(0.5);

  // High-Risk Areas
  drawCallout('risk', 'Exploration Scope & High-Risk Areas', areas);

  // Heuristics and Attack Vectors
  drawCallout('attack', 'Heuristic Attack Vectors & Stress Scenarios', vectors);

  // Expected vs Failure Conditions
  drawCallout('expected', 'Expected System Behavior & Failure Symptoms', expected);

  doc.moveDown(0.4);
}

console.log('Building document content...');

// ==========================================
// 1. COVER PAGE
// ==========================================
// Decorative Background Graphic
doc.rect(0, 0, PAGE_WIDTH, 140).fill(COLORS.navy);
doc.rect(0, 136, PAGE_WIDTH, 6).fill(COLORS.tealBrand);

// OptiDent Badge
doc.rect(MARGIN, 40, 48, 48).fill(COLORS.tealBrand);
doc.font('Helvetica-Bold').fontSize(26).fillColor(COLORS.white);
doc.text('OD', MARGIN + 6, 52);

// Header titles
doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.white);
doc.text('OPTIDENT DENTAL CLINIC MANAGEMENT SYSTEM', MARGIN + 60, 46);
doc.font('Helvetica').fontSize(11).fillColor(COLORS.tealLight);
doc.text('Fullstack Healthcare Platform (Node.js • Express • MongoDB Native)', MARGIN + 60, 72);

// Main Document Title
doc.y = 175;
doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.slateDark);
doc.text('MASTER EXPLORATORY TESTING CHARTER');
doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.tealDark);
doc.text('Comprehensive Sprint Backlog Verification & Session-Based Suite');
doc.moveDown(0.3);

// Horizontal divider
doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 2).fill(COLORS.borderDark);
doc.moveDown(0.6);

// Overview paragraph
doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.slateMed);
doc.text(
  'This master exploratory testing charter serves as the primary system-level quality assurance roadmap for the OptiDent Dental Clinic Management System. Structured in rigorous alignment with the Agile Sprint Backlog (comprising 57 User Stories across Super Admin, Doctor, Receptionist, and Client/Patient roles), this document establishes structured exploration missions, heuristic attack vectors, data prerequisites, boundary conditions, and formal bug classification protocols under Session-Based Exploratory Testing (SBET) methodology.',
  { lineGap: 3 }
);
doc.moveDown(1);

// Metadata Box
const metaY = doc.y;
doc.rect(MARGIN, metaY, CONTENT_WIDTH, 145).fill(COLORS.grayBg);
doc.rect(MARGIN, metaY, CONTENT_WIDTH, 145).strokeColor(COLORS.borderLight).stroke();
doc.rect(MARGIN, metaY, 4, 145).fill(COLORS.tealBrand);

doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy);
doc.text('DOCUMENT SPECIFICATIONS & SPRINT METADATA', MARGIN + 14, metaY + 10);

const metaRows = [
  ['Target Application:', 'OptiDent Dental Management System (v1.0 Production Release)'],
  ['Testing Methodology:', 'Session-Based Exploratory Testing (SBET) & Heuristic Risk Analysis'],
  ['Sprint Backlog Scope:', 'All 57 User Stories: Super Admin (18), Doctor (13), Receptionist (15), Client (11)'],
  ['Target Audience:', 'Software Quality Assurance Engineers, Systems Analysts, Developers, Stakeholders'],
  ['Test Execution Period:', 'November 2026 Sprint Quality Gate'],
  ['Environment & Ports:', 'Node.js v24.12.0 • Native MongoDB 127.0.0.1:27017/OptiDent • Local:3000'],
  ['Third-Party Integrations:', 'Google Calendar API Service Account • Nodemailer SMTP • Session Security']
];

let currMetaY = metaY + 28;
metaRows.forEach(([k, v]) => {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.slateDark);
  doc.text(k, MARGIN + 14, currMetaY, { width: 130 });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateMed);
  doc.text(v, MARGIN + 145, currMetaY, { width: CONTENT_WIDTH - 155 });
  currMetaY += 15;
});

doc.y = metaY + 160;

// Executive Sign-off Matrix
doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.navy);
doc.text('DOCUMENT REVISION & QUALITY SIGN-OFF', MARGIN, doc.y);
doc.moveDown(0.3);

const revHeaders = ['Rev', 'Date', 'Prepared By', 'Role', 'Status'];
const revRows = [
  ['v1.0', 'Nov 09, 2026', 'QA Engineering Lead', 'Systems Quality Lead', 'APPROVED FOR EXECUTION'],
  ['v1.1', 'Nov 09, 2026', 'Lead Systems Analyst', 'Systems Analyst / Architect', 'VERIFIED AGAINST SPRINT']
];
drawTable(revHeaders, revRows, [40, 80, 140, 120, 125.28], {
  fontSize: 8,
  boldCols: [0, 4],
  colorMap: { 4: () => COLORS.success }
});

doc.moveDown(1);
doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.slateDim);
doc.text('OptiDent Platform Engineering • Confidential Quality Assurance Artifact • Generated for Formal System Evaluation');

// ==========================================
// 2. SECTION I: METHODOLOGY & CHARTER FRAMEWORK
// ==========================================
doc.addPage();
drawSectionHeader(1, 'Testing Methodology & SBET Framework');

doc.font('Helvetica').fontSize(9).fillColor(COLORS.slateDark);
doc.text(
  'Session-Based Exploratory Testing (SBET) is an evidence-backed testing method that combines spontaneous human curiosity, critical reasoning, and heuristic attack patterns with structured time-boxing and formal charter metrics. Rather than following rigid pre-scripted steps that miss subtle state corruptions and edge cases, testers operate under targeted "Missions" designed to expose high-concurrency collisions, boundary flaws, role-based leaks, and clinical safety issues.',
  { lineGap: 2 }
);
doc.moveDown(0.6);

drawSubSectionHeader('1.1 Session Time-Box & TBS Metric Allocation');
doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateMed);
doc.text(
  'Each exploratory session is strictly time-boxed to prevent tester fatigue and maintain intense cognitive focus. Uninterrupted session blocks are monitored using the TBS Breakdown formula:',
  { lineGap: 2 }
);
doc.moveDown(0.3);

const tbsHeaders = ['Session Class', 'Time-box', 'Test Execution (T)', 'Bug Investigation (B)', 'Setup & Logging (S)'];
const tbsRows = [
  ['Short Session', '30 Minutes', '20 min (65%)', '6 min (20%)', '4 min (15%)'],
  ['Standard Session', '60 Minutes', '40 min (65%)', '12 min (20%)', '8 min (15%)'],
  ['Extended Session', '90 Minutes', '60 min (65%)', '18 min (20%)', '12 min (15%)']
];
drawTable(tbsHeaders, tbsRows, [90, 80, 110, 115, 110.28], { fontSize: 8, boldCols: [0] });

drawSubSectionHeader('1.2 Applied Quality Heuristics (Attack Toolset)');
const heuristicsItems = [
  'SFDIPOT (San Francisco Depot): Structure (Express/Node/Mongo stack), Function (booking, charting, vault), Data (BSON schema, timestamps), Interfaces (admin, doctor, receptionist, client), Platform (Windows, modern browsers), Operations (reception rush, simultaneous booking), Time (Manila PHT timestamps, slot collision).',
  'Goldilocks Heuristic: Input testing with values that are Too Big (overflow notes, long names), Too Small (empty strings, zero amounts, single-char passwords), and Just Right (valid dental medical payloads).',
  'CRUD Matrix & Inverted RBAC: Exercising Create, Read, Update, Delete lifecycles across every entity while deliberately swapping bearer sessions to trigger unauthorized privilege escalation.',
  'Concurrency & Race Condition Probing: Simulating two independent actors claiming the exact same operatory chair or doctor time slot at the exact millisecond.'
];
drawCallout('heuristic', 'Core Heuristic Frameworks Utilized in Test Missions', heuristicsItems);

drawSubSectionHeader('1.3 Defect Severity & Clinical Risk Classification');
const sevHeaders = ['Level', 'Classification', 'Clinical & Technical Impact', 'SLA Response'];
const sevRows = [
  ['P1', 'CRITICAL BLOCKER', 'Patient safety hazard (e.g., missing medical allergy alert), data loss, appointment collision, or security breach.', 'Immediate (< 2 hrs)'],
  ['P2', 'MAJOR DEFECT', 'Core user story broken without workaround (e.g., unable to approve appointments, vault restore failing, Google sync broken).', 'High (< 8 hrs)'],
  ['P3', 'MODERATE DEFECT', 'Feature functional but with friction, non-blocking UI glitch, formatting errors in audit logs or reports.', 'Medium (< 24 hrs)'],
  ['P4', 'LOW / COSMETIC', 'Minor cosmetic misalignment, typos, minor layout spacing, non-essential label polish.', 'Scheduled Sprint']
];
drawTable(sevHeaders, sevRows, [45, 115, 235, 110.28], {
  fontSize: 8,
  boldCols: [0, 1],
  colorMap: {
    0: (val) => val === 'P1' ? COLORS.danger : val === 'P2' ? COLORS.warning : val === 'P3' ? COLORS.blueLight : COLORS.slateLight
  }
});

// ==========================================
// 3. SECTION II: TEST ENVIRONMENT & SEED DATA
// ==========================================
doc.addPage();
drawSectionHeader(2, 'Test Environment, Credentials & Setup Requirements');

doc.font('Helvetica').fontSize(9).fillColor(COLORS.slateDark);
doc.text(
  'To maintain reproducible exploratory testing conditions, all sessions must be executed against the designated test environment pre-seeded with multi-role accounts, clinic operating hours, dental services, and appointment lifecycles.',
  { lineGap: 2 }
);
doc.moveDown(0.5);

drawSubSectionHeader('2.1 Master Test Account Credentials Matrix');
const accHeaders = ['Role', 'Username / Email', 'Default Password', 'Pre-configured State & Purpose'];
const accRows = [
  ['Super Admin', 'optidentt@gmail.com', 'Opident1014', 'Master admin rights, access to vault, clinic controls, audit trail.'],
  ['Doctor (Primary)', 'doctor@optident.com', 'DoctorPass#2026', 'Assigned practitioner, clinical charting, odontogram, approvals.'],
  ['Doctor (Secondary)', 'dr.santos@optident.com', 'SantosSecure#1', 'Secondary provider for schedule collision & transfer testing.'],
  ['Receptionist', 'reception@optident.com', 'FrontDesk#2026', 'Front-desk triage, quick walk-in registration, live queue management.'],
  ['Client (Existing)', 'oniichanejmn@gmail.com', 'ClientSecret#1', 'Active patient with existing clinical history and booked visits.'],
  ['Client (New)', 'walkin.patient@test.com', 'PatientNew#2026', 'Fresh account for self-service onboarding and first-time booking.'],
  ['Soft-Deleted User', 'archived.doc@optident.com', '[Deactivated]', 'Pre-soft-deleted user stored in Recovery Vault for restoration tests.'],
  ['Locked User', 'locked.user@optident.com', 'Invalid3xAttempts', 'Account locked via SA-010 security threshold for unlock testing.']
];
drawTable(accHeaders, accRows, [90, 140, 100, 175.28], {
  fontSize: 7.5,
  boldCols: [0],
  colorMap: { 0: () => COLORS.navy }
});

drawSubSectionHeader('2.2 System Configuration & Environmental Prerequisites');
const envItems = [
  'Clinic Baseline Operating Hours: Monday to Saturday, 08:00 AM – 05:00 PM; Lunch Break Blackout: 12:00 PM – 01:00 PM; Sunday: Closed.',
  'Operatory Facilities: Operatory Chair 1 (General Dentistry), Operatory Chair 2 (Pediatric/Prostho), Operatory Chair 3 (Oral Surgery).',
  'Google Calendar API: Service Account active (optident-calendar@master-host-514202-g2.iam.gserviceaccount.com) with event insert/delete scopes.',
  'Local Server & Database: Node.js v24.12.0 running on localhost:3000 connected to MongoDB native at mongodb://127.0.0.1:27017/OptiDent.',
  'Browser Targets: Google Chrome v131+, Microsoft Edge v131+ (minimum 1280x800 resolution for desktop; 375x667 for mobile responsive tests).'
];
drawCallout('heuristic', 'Environmental Parameters & Integration Setup', envItems);

// ==========================================
// 4. SECTION III: SPRINT TEST CHARTERS & MISSIONS
// ==========================================
doc.addPage();
drawSectionHeader(3, 'Sprint Test Charters: Super Admin Role');

// Mission 1: Super Admin RBAC & Identity
drawMissionBlock(
  1,
  'Identity Governance, RBAC & Invitation Pipeline',
  'Super Admin',
  '60 Minutes',
  ['SA-001', 'SA-002', 'SA-003', 'SA-004', 'SA-005'],
  'Verify administrative authentication, tokenized email invitations for doctors/receptionists, multi-user role assignment, and unbreakable role boundary enforcement across all endpoints.',
  [
    'Multi-user CRUD operations across super_admin, doctor, receptionist, and patient roles.',
    'Invitation link generation: Token randomness, expiry timestamps, and one-time use consumption.',
    'Enforcement of Master Administrator rights: Protection against self-demotion or accidental deletion of the primary super admin.'
  ],
  [
    'Brute force / credential stuffing against SA-001 login endpoint to verify lockout trigger.',
    'Manipulate invitation URL parameters to force role elevation (e.g., register as receptionist but spoof role=super_admin).',
    'Direct API tampering: Send HTTP requests to /api/admin/ endpoints using a client/patient session cookie (IDOR attack).'
  ],
  [
    'Expected: Super Admin retains full governance; unauthorized roles receive HTTP 401/403 with zero data disclosure.',
    'Failure Symptoms: Role leakage, privilege escalation, reusable invitation tokens, or unhandled 500 errors.'
  ]
);

// Mission 2: Super Admin Data Lifecycle & Recovery Vault
drawMissionBlock(
  2,
  'Data Lifecycle, Soft-Delete Recovery Vault & Archival',
  'Super Admin',
  '60 Minutes',
  ['SA-006', 'SA-007', 'SA-013'],
  'Evaluate soft-deletion resilience across users, appointments, and invitations. Verify that records can be inspected in the Data Recovery Vault, restored cleanly without orphaned references, or permanently purged.',
  [
    'Soft-delete execution on patient records, doctor accounts, and booked appointments.',
    'Data Recovery Vault UI (SA-006): Tabular rendering, collection filtering (All, Users, Invitations, Appointments).',
    'Restore mechanics: Restoring a user must instantly reactivate login capability and restore linked relationships.',
    'Database Backup & Export (SA-013): JSON/BSON database dumps, backup file validity, and archival retention.'
  ],
  [
    'Attempt to log in with a soft-deleted user account (must be blocked with deactivated account warning).',
    'Search for soft-deleted patients in the Receptionist search bar (must NOT appear in active search results).',
    'Purge a record permanently, then attempt to restore via forged API calls to test backend purge finality.'
  ],
  [
    'Expected: Soft-deleted items vanish from active interfaces, appear in Recovery Vault, and restore/purge flawlessly.',
    'Failure Symptoms: Orphaned appointments, "Error connecting to Recovery Vault", hard delete without vault entry.'
  ]
);

doc.addPage();
// Mission 3: Super Admin Clinic Operations & Lockdown
drawMissionBlock(
  3,
  'Clinic Configuration, Operating Hours & Maintenance Lock',
  'Super Admin',
  '45 Minutes',
  ['SA-008', 'SA-009', 'SA-010', 'SA-011', 'SA-012'],
  'Validate clinic profile updates, operating hours customization, lunch break blackout enforcement, session security limits, and system-wide maintenance mode restrictions.',
  [
    'Clinic Information Settings (SA-008): Update clinic name, telephone, emergency mobile, and Fortich St. address.',
    'Operating Hours (SA-009): Adjust daily opening/closing hours and configure 12:00 PM - 01:00 PM lunch blackout.',
    'Security Settings (SA-010): Max failed attempts, idle session timeout enforcement.',
    'Maintenance Mode (SA-011): Enable system-wide maintenance lock; verify client/doctor access cutoff.',
    'Integration Controls (SA-012): Google Service Account toggle, SMTP email credentials validation.'
  ],
  [
    'Alter operating hours to end at 03:00 PM; verify patient booking modal instantly disables 03:00 PM - 05:00 PM slots.',
    'Book an appointment during the 12:00 PM - 01:00 PM lunch break via direct API call to test backend schedule enforcement.',
    'Activate Maintenance Mode while an active patient is filling a booking form; verify graceful redirection to maintenance notice.'
  ],
  [
    'Expected: Operating hours changes instantly dictate slot availability; maintenance mode locks non-admin sessions safely.',
    'Failure Symptoms: Booking allowed outside operating hours, super admin locked out during maintenance, unhandled crashes.'
  ]
);

// Mission 4: Super Admin Analytics & Forensic Audit Trail
drawMissionBlock(
  4,
  'Forensic Audit Trail & Business Intelligence Analytics',
  'Super Admin',
  '60 Minutes',
  ['SA-014', 'SA-015', 'SA-016', 'SA-017', 'SA-018'],
  'Verify real-time audit logging accuracy in Philippine Standard Time (Asia/Manila), actor attribution, removal of redundant columns, and generation of accurate patient, appointment, cancellation, and sales financial reports.',
  [
    'Administrative Audit Trail (SA-017): Manila timestamp formatting, actor email, colored role badge, IP address, and human-readable Event Details (e.g., LOGIN_SUCCESS, CREATE_USER, RESTORE_RECORD).',
    'Appointment Reports (SA-015) & Cancellation Reports (SA-016): Verified against MongoDB database totals.',
    'Sales & Financial Reports (SA-018): Ledger reconciliation of consultation fees and completed dental procedure totals.',
    'Data Export Integrity: Verify CSV and PDF export outputs against live dashboard tables.'
  ],
  [
    'Perform 5 rapid administrative actions (create user, soft delete, restore, alter hours, login) and audit the log ordering.',
    'Search audit trail by actor email, action type, and IP address to verify real-time client-side filter integrity.',
    'Verify that no event logs display cryptic raw JSON or "[object Object]" in the Event Details column.'
  ],
  [
    'Expected: Audit logs are timestamped accurately in Asia/Manila with full actor attribution; financial reports balance to the cent.',
    'Failure Symptoms: Timestamps in UTC, missing actor emails, undefined fields, mathematical discrepancies in report sums.'
  ]
);

// ==========================================
// 5. SECTION IV: SPRINT TEST CHARTERS: DOCTOR & RECEPTIONIST
// ==========================================
doc.addPage();
drawSectionHeader(4, 'Sprint Test Charters: Doctor Role');

// Mission 5: Doctor Clinical Charting & Odontogram
drawMissionBlock(
  5,
  'Clinical History, Interactive Odontogram & Treatment Charting',
  'Doctor',
  '75 Minutes',
  ['D-001', 'D-002', 'D-003', 'D-004', 'D-005', 'D-006'],
  'Explore doctor onboarding via invitation token, clinical history inspection, surface-by-surface odontogram charting, procedure logging, materials documentation, and prescription creation.',
  [
    'Account activation via email invitation token (D-001) and secure doctor authentication (D-002).',
    'Patient Medical History Access (D-003): Instant visibility of high-risk medical conditions and drug allergies.',
    'Interactive Odontogram (D-005): 32-tooth FDI/Universal notation, surface selection (Mesial, Distal, Occlusal, Incisal, Facial, Lingual).',
    'Procedure Recording (D-006): Treatment categorization, materials used, procedure cost calculations, and progress notes.'
  ],
  [
    'Select multiple tooth surfaces on the odontogram and save; reload page to verify surface-level persistence in MongoDB.',
    'Submit procedure notes containing special characters, medical symbols, and formatted line breaks to test sanitization.',
    'Attempt to edit a completed clinical record from a past date to test historical record immutability rules.'
  ],
  [
    'Expected: Odontogram renders accurately; medical allergies trigger visible clinical warnings; records save without data corruption.',
    'Failure Symptoms: Odontogram surfaces failing to persist, XSS execution in progress notes, missing allergy alerts.'
  ]
);

// Mission 6: Doctor Schedule Control & Status Pipeline
drawMissionBlock(
  6,
  'Schedule Governance, Consultation Pipeline & Actions Dropdown',
  'Doctor',
  '60 Minutes',
  ['D-007', 'D-008', 'D-009', 'D-010', 'D-016', 'D-017', 'D-018'],
  'Validate doctor working hours configuration, appointment approval/decline workflows with mandatory explanation logging, consultation lifecycle progression, and the unified Actions dropdown menu.',
  [
    'Appointment Review (D-016, D-017): Approve pending appointment and verify instant status change to "Scheduled".',
    'Appointment Decline (D-018): Decline booking request and verify that mandatory explanation is logged and emailed to patient.',
    'Actions Dropdown: Verify responsive floating viewport positioning for [Start Consultation], [Add to Google Calendar], [Complete & Chart Direct], [Dental History], [Cancel Appointment].',
    'Lifecycle Status Progression: Pending -> Scheduled -> In Process -> Completed.'
  ],
  [
    'Decline an appointment with an empty explanation string to ensure form validation prevents submission.',
    'Click Actions dropdown near the bottom edge of the browser viewport to test dropdown collision/clipping behavior.',
    'Transition an appointment directly from "Pending" to "Completed" to verify state machine integrity.'
  ],
  [
    'Expected: Actions dropdown operates smoothly without UI clipping; approvals and declines update calendars immediately.',
    'Failure Symptoms: Side-by-side button spill, untracked cancellations, missing decline rationale.'
  ]
);

doc.addPage();
drawSectionHeader(5, 'Sprint Test Charters: Receptionist Role');

// Mission 7: Receptionist Walk-in & Queue Triage
drawMissionBlock(
  7,
  'Walk-in Quick Registration, Real-Time Search & Queue Triage',
  'Receptionist',
  '60 Minutes',
  ['R-001', 'R-002', 'R-003', 'R-004', 'R-005', 'R-006', 'R-009'],
  'Evaluate front-desk walk-in patient quick onboarding, high-speed substring patient search, live waiting room queue triage, doctor chair assignment, and emergency medical clearance checks.',
  [
    'Quick Walk-in Registration (R-003): Fast registration without requiring patient email verification or portal password.',
    'Real-time Patient Search (R-004): Instant search by first name, last name, phone number, and patient ID.',
    'Queue Management (R-006): Waiting room queue ordering, status transitions (Waiting in Lobby -> In Chair -> Completed).',
    'Patient Medical Access (R-009): Reviewing medical clearance alerts prior to seating patient in operatory.'
  ],
  [
    'Quick-register a patient with an existing phone number to test duplicate detection and profile merging logic.',
    'Perform search queries with 1 character, special regex characters (.*, \\d), and non-Latin names to test search resilience.',
    'Reorder queue priorities dynamically and verify real-time synchronization on the doctor dashboard queue view.'
  ],
  [
    'Expected: Fast walk-ins complete in under 30 seconds; search results return in < 100ms; queue stays in strict synchronization.',
    'Failure Symptoms: Duplicate patient records, search input freezing browser, queue state discrepancies between desks.'
  ]
);

// Mission 8: Receptionist Dispatch & Conflict Elimination
drawMissionBlock(
  8,
  'Appointment Dispatch, Rescheduling & Conflict Elimination',
  'Receptionist',
  '60 Minutes',
  ['R-008', 'R-010', 'R-011', 'R-012', 'R-013', 'R-014', 'R-015', 'R-019'],
  'Test front-desk appointment creation, schedule conflict prevention across multiple dentist calendars, appointment rescheduling, and receptionist self-service password recovery via 6-digit OTP.',
  [
    'Appointment Schedule Monitoring (R-008): Multi-doctor calendar grid, chair occupancy visualization.',
    'Appointment Creation (R-013): Phone-in bookings with instant slot locking.',
    'Rescheduling Dynamics (R-011, R-014): Moving dates and times while verifying automated conflict detection.',
    'Cancellations (R-010): Logging cancellation reasons and releasing chair slots for immediate rebooking.',
    'OTP Password Reset (R-019): Requesting 6-digit OTP via email and resetting receptionist credentials.'
  ],
  [
    'Attempt to reschedule an existing appointment to a slot where the doctor already has an active consultation.',
    'Book two walk-in appointments for the exact same operatory chair at the exact same time.',
    'Submit an expired or tampered OTP token to verify brute-force defense on the password reset route.'
  ],
  [
    'Expected: Conflicting bookings are cleanly rejected with clear user messaging; vacated slots become instantly bookable.',
    'Failure Symptoms: Overlapping appointments on the same doctor/chair, silent booking failures, OTP token replay.'
  ]
);

// ==========================================
// 6. SECTION V: SPRINT TEST CHARTERS: CLIENT / PATIENT ROLE
// ==========================================
doc.addPage();
drawSectionHeader(6, 'Sprint Test Charters: Client / Patient Role');

// Mission 9: Patient Onboarding & Records
drawMissionBlock(
  9,
  'Self-Service Onboarding, Medical Disclosure & Account Security',
  'Client / Patient',
  '60 Minutes',
  ['C-001', 'C-002', 'C-003', 'C-007', 'C-008', 'C-011'],
  'Verify patient portal registration, comprehensive health questionnaire intake, personal profile customization, medical history access, and OTP-driven password recovery.',
  [
    'Self-Registration (C-001) & Login (C-002): Strong password policy enforcement, email verification.',
    'Patient Onboarding (C-003): Health questionnaire covering cardiac issues, diabetes, bleeding disorders, and drug allergies.',
    'Medical History Portal (C-007): Patient-facing clinical summaries, past procedures, prescription instructions, and receipts.',
    'Profile Customization (C-008): Updating phone number, home address, emergency contacts, profile photo upload.',
    'Verification & Password Reset (C-011): 6-digit email OTP delivery, countdown timer, and secure password update.'
  ],
  [
    'Upload oversized image files (> 10MB) or invalid file extensions (.exe, .svg) to profile picture upload.',
    'Submit health questionnaire with all risk factors checked; verify that high-risk medical alerts display on doctor chart.',
    'Request 5 consecutive OTP reset tokens in 60 seconds to test rate-limiting safeguards.'
  ],
  [
    'Expected: Intake medical data transfers accurately to doctor charts; passwords and personal data remain protected.',
    'Failure Symptoms: Unsanitized file uploads, medical risks failing to notify doctor, lack of OTP rate limiting.'
  ]
);

// Mission 10: Patient Booking, Real-Time Slots, Google Calendar & QR Pass
drawMissionBlock(
  10,
  'Online Self-Booking, Dynamic Slots, Google Calendar & QR Pass',
  'Client / Patient',
  '75 Minutes',
  ['C-004', 'C-005', 'C-006', 'C-009', 'C-010'],
  'Explore online dental appointment booking, real-time slot conflict prevention, appointment lifecycle tracking, automated email notifications, Google Calendar 1-Click sync, Service Account push sync, .ics file download, and digital QR Pass generation.',
  [
    'Online Self-Booking Wizard (C-004): Service selection (Consultation, Scaling, Extraction, Surgery), attending doctor selection, interactive date/time picker.',
    'Dynamic Slot Availability (C-005): Real-time blackout of booked slots, past dates, and lunch break (12:00 PM - 01:00 PM).',
    'Appointment Lifecycle Tracking (C-006): Real-time status badge updates (Pending Approval -> Scheduled -> Completed / Cancelled).',
    'Notifications Engine (C-009): Automated confirmation and schedule change emails.',
    'Calendar, Time/Date & QR Pass Support (C-010):',
    '   a) 1-Click Google Calendar button prefilling event title, clinic location, dentist, and appointment time.',
    '   b) Automatic zero-click background sync to patient/doctor calendars via Service Account (optident-calendar@master-host-514202-g2.iam.gserviceaccount.com).',
    '   c) Downloadable .ics file for Apple Calendar, Outlook, and offline calendar import.',
    '   d) Dynamic QR Pass rendering containing encoded Appointment ID, Patient Name, and Time for contact-free reception check-in.'
  ],
  [
    'Open two browser windows with two different patient accounts selecting the same doctor and slot; click "Confirm Booking" simultaneously to test concurrency race condition.',
    'Book an appointment, verify 1-Click Google Calendar link formatting, then cancel the appointment and verify removal across calendars.',
    'Download .ics file and verify iCalendar RFC 5545 compliance (UID, DTSTART in Asia/Manila, LOCATION, SUMMARY).'
  ],
  [
    'Expected: Simultaneous bookings cleanly resolve without double-booking; calendar invitations and QR passes generate instantly.',
    'Failure Symptoms: Double bookings, timezone skew in Google Calendar (e.g., UTC offset shift), corrupt .ics downloads.'
  ]
);

// ==========================================
// 7. SECTION VII: CROSS-CUTTING SECURITY & HEURISTIC ATTACK VECTORS
// ==========================================
doc.addPage();
drawSectionHeader(7, 'Cross-Cutting Security, Stress & Heuristic Attack Vectors');

doc.font('Helvetica').fontSize(9).fillColor(COLORS.slateDark);
doc.text(
  'Beyond individual functional roles, exploratory testing must stress the systemic seams, concurrency thresholds, and authorization boundaries that automated unit tests frequently overlook.',
  { lineGap: 2 }
);
doc.moveDown(0.5);

drawSubSectionHeader('7.1 High-Risk Attack Vectors & Threat Matrix');
const secHeaders = ['Attack Vector', 'Target Vulnerability', 'Heuristic Test Technique', 'Severity'];
const secRows = [
  ['RBAC Elevation & IDOR', 'Direct API access to /api/admin/ endpoints by patient sessions.', 'Session swapping, header tampering with forged roles in cookies.', 'P1 - Critical'],
  ['Double-Booking Race Condition', 'Simultaneous HTTP POST /api/client/book_appointment for same slot.', 'Asynchronous curl / fetch bursts firing within 5ms window.', 'P1 - Critical'],
  ['Stored XSS in Clinical Notes', 'Cross-site scripting in chief complaints, notes, and odontogram.', 'Inject script tags (<script>alert(1)</script>) into clinical textareas.', 'P2 - Major'],
  ['Soft-Delete Data Leakage', 'Deactivated users/records leaking into active search or reports.', 'Inspect JSON payloads of active queries for is_deleted: true flags.', 'P2 - Major'],
  ['Audit Trail Tampering', 'Modification or deletion of historical audit log records.', 'Attempt direct POST/DELETE calls against audit log database collections.', 'P1 - Critical'],
  ['Timezone Drift & Cal Skew', 'Appointments recorded in UTC displaying incorrect Manila local times.', 'Verify appointment times across DST, UTC vs PHT (+08:00) offsets.', 'P2 - Major']
];
drawTable(secHeaders, secRows, [115, 135, 175, 80.28], {
  fontSize: 7.5,
  boldCols: [0, 3],
  colorMap: {
    3: (val) => val.startsWith('P1') ? COLORS.danger : val.startsWith('P2') ? COLORS.warning : COLORS.blueLight
  }
});

drawSubSectionHeader('7.2 Data Boundary & Goldilocks Input Testing Checklist');
const boundaryItems = [
  'Patient Full Name: Test 1 character ("A"), 150 characters, numbers, and special symbols (e.g., "Ma. Concepción de la Cruz-Ñoñez Jr.").',
  'Contact Number: Test valid 11-digit mobile (09171234567), landlines (02-8123-4567), incomplete numbers (0912), and letters ("CALLME").',
  'Consultation / Procedure Fees: Test zero values (0.00), negative amounts (-150.00), extreme values (999,999,999.00), and alphabetic strings.',
  'Odontogram Notes: Test maximum payload size (> 5,000 words), emojis, Unicode dental charting characters, and HTML markup.',
  'Date Boundaries: Attempt to book appointments on past dates (yesterday), 5 years into the future, and on recognized clinic holidays.'
];
drawCallout('attack', 'Boundary Value Testing Matrix Across Forms', boundaryItems);

// ==========================================
// 8. SECTION VIII: SBET SESSION LOG & BUG REPORTING PROTOCOLS
// ==========================================
doc.addPage();
drawSectionHeader(8, 'Session Execution Protocol & Defect Reporting Standards');

doc.font('Helvetica').fontSize(9).fillColor(COLORS.slateDark);
doc.text(
  'Every exploratory testing session must be formally documented using the Session Log Template. When anomalies, regressions, or unexpected behaviors are discovered, testers must file standardized Defect Reports adhering to the format below.',
  { lineGap: 2 }
);
doc.moveDown(0.5);

drawSubSectionHeader('8.1 Session-Based Exploratory Testing (SBET) Session Log Template');
const logTemplateHeaders = ['Session Log Field', 'Field Description & Required Input Format'];
const logTemplateRows = [
  ['Session Identifier', 'Unique ID: e.g., SBET-OPT-20261109-DOC-M05-01'],
  ['Charter Mission #', 'Designated Mission (e.g., Mission 5: Clinical History & Odontogram)'],
  ['Assigned Tester(s)', 'Full name and QA role of the executing tester'],
  ['Execution Date & Time', 'Timestamp of session start and conclusion in Philippine Time (PHT)'],
  ['Time-box Duration', 'Total elapsed session time (e.g., 60 minutes)'],
  ['TBS Metric Breakdown', 'Percentage distribution: e.g., 65% Test (T) / 20% Bug (B) / 15% Setup (S)'],
  ['Environment Details', 'Browser, OS build, Node server commit SHA, MongoDB dataset state'],
  ['Exploration Notes', 'Chronological log of areas explored, heuristics applied, and observations'],
  ['Defects Identified', 'List of bug IDs logged during session (e.g., BUG-OPT-042)'],
  ['Follow-up Questions', 'Open questions or clarification items requiring Systems Analyst input']
];
drawTable(logTemplateHeaders, logTemplateRows, [140, 365.28], { fontSize: 8, boldCols: [0] });

drawSubSectionHeader('8.2 Standardized Defect Report Format (Bug Classification)');
const bugReportItems = [
  'Defect Title: Concise, unambiguous summary following [Role / Module] [Component] [Observed Failure].',
  'User Story Reference: Exact sprint story ID (e.g., D-005, SA-006, C-010).',
  'Severity & Priority: P1 (Critical), P2 (Major), P3 (Moderate), P4 (Minor / Cosmetic).',
  'Pre-conditions & Test Account: Exact user credentials, pre-existing patient record ID, and browser environment.',
  'Step-by-Step Reproduction: Minimal deterministic steps required to reproduce the failure reliably.',
  'Expected Behavior: Specification-backed system behavior defined in the sprint acceptance criteria.',
  'Actual Observed Behavior: Exact failure symptom, error messages, screenshot/video references, and console logs.',
  'Backend Log Evidence: Relevant terminal output, Node.js stack traces, and MongoDB document state before/after.'
];
drawCallout('risk', 'Mandatory Fields for Every Quality Defect Ticket', bugReportItems);

// ==========================================
// 9. SECTION IX: COMPLETE SPRINT TRACEABILITY MATRIX
// ==========================================
doc.addPage();
drawSectionHeader(9, 'Complete Sprint Traceability Matrix (All 57 Stories)');

doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateDark);
doc.text(
  'The following traceability matrix establishes direct 100% test coverage mapping from every single Sprint User Story to its designated exploratory testing charter mission, test focus, and acceptance verification criteria.',
  { lineGap: 2 }
);
doc.moveDown(0.4);

// Part 1: Super Admin Matrix (SA-001 to SA-018)
drawSubSectionHeader('9.1 Super Admin User Stories (SA-001 through SA-018)');
const saHeaders = ['Story ID', 'Function Name', 'Sprint Story Description', 'Mission', 'Key Verification Criteria'];
const saRows = [
  ['SA-001', 'User Login', 'Secure login using registered admin credentials.', 'Mission 1', 'Auth token, session cookie, failed attempt lock.'],
  ['SA-002', 'Doctor & Receptionist Invitation', 'Invite staff securely via tokenized email.', 'Mission 1', 'Unique token generation, SMTP delivery, one-time use.'],
  ['SA-003', 'Multi-User Management', 'Manage Super Admin, Doctor, Receptionist, Client.', 'Mission 1', 'Full CRUD across user roles, active status toggling.'],
  ['SA-004', 'Role-Based Access Control (RBAC)', 'Enforce role permissions strictly across endpoints.', 'Mission 1', 'Endpoint protection, forbidden redirection, zero leak.'],
  ['SA-005', 'Master Administrator Rights', 'Full control over system settings, users, and data.', 'Mission 1', 'Override capabilities, immunity to self-deletion.'],
  ['SA-006', 'Soft Delete', 'Deactivate accounts/records into Recovery Vault.', 'Mission 2', 'Recovery Vault UI, restore record, permanent purge.'],
  ['SA-007', 'Data Archiving', 'Archive inactive users preserving historical data.', 'Mission 2', 'Historical data preservation, fast active queries.'],
  ['SA-008', 'Clinic Information Settings', 'Update clinic details, contact info, and branding.', 'Mission 3', 'Real-time update across patient and staff dashboards.'],
  ['SA-009', 'Operating Hours Settings', 'Configure working days, hours, and lunch breaks.', 'Mission 3', 'Booking calendar slot availability synchronization.'],
  ['SA-010', 'System Security Settings', 'Configure session timeouts and lockout thresholds.', 'Mission 3', 'Session invalidation after timeout, brute-force defense.'],
  ['SA-011', 'Maintenance Mode', 'Enable system maintenance lock for non-admin users.', 'Mission 3', 'Global lock screen for patients/doctors, admin bypass.'],
  ['SA-012', 'System Integration Controls', 'Manage Google Service Account and SMTP controls.', 'Mission 3', 'API key validation, sync toggle, health check status.'],
  ['SA-013', 'Database Backup and Export', 'Back up and export database collections securely.', 'Mission 2', 'JSON/BSON dump generation, archive download integrity.'],
  ['SA-014', 'Patient Reports', 'Generate comprehensive patient demographic reports.', 'Mission 4', 'Registration growth, patient profile completeness.'],
  ['SA-015', 'Appointment Reports', 'Generate reports for scheduled and completed visits.', 'Mission 4', 'Status breakdown, date filtering, doctor utilization.'],
  ['SA-016', 'Cancellation Reports', 'Track canceled and declined visits with reasons.', 'Mission 4', 'Cancellation rationale logs, doctor decline metrics.'],
  ['SA-017', 'System Activity Reports (Audit Trail)', 'Monitor administrative actions with PHT timestamps.', 'Mission 4', 'Asia/Manila time, actor email/role, clear event details.'],
  ['SA-018', 'Sales & Financial Reports', 'Generate clinic sales, fees, and revenue reports.', 'Mission 4', 'Accurate revenue summation, billing itemization.']
];
drawTable(saHeaders, saRows, [45, 95, 175, 55, 135.28], {
  fontSize: 7,
  boldCols: [0, 3],
  colorMap: { 0: () => COLORS.navy }
});

doc.addPage();
// Part 2: Doctor User Stories (D-001 to D-018)
drawSubSectionHeader('9.2 Doctor User Stories (D-001 through D-018)');
const docHeaders = ['Story ID', 'Function Name', 'Sprint Story Description', 'Mission', 'Key Verification Criteria'];
const docRows = [
  ['D-001', 'User Registration', 'Activate doctor account via invitation token link.', 'Mission 5', 'Token consumption, password setup, role binding.'],
  ['D-002', 'User Login', 'Secure login to access clinical dashboard.', 'Mission 5', 'Doctor session validation, dashboard access.'],
  ['D-003', 'Patient Medical History', 'View assigned patient medical background.', 'Mission 5', 'Medical alerts, drug allergies, health questionnaire.'],
  ['D-004', 'Clinical Record Management', 'Record diagnoses, treatments, notes, procedures.', 'Mission 5', 'Clinical notes persistence, historical treatment log.'],
  ['D-005', 'Diagnosis Recording', 'Interactive surface-by-surface tooth charting.', 'Mission 5', 'Odontogram 32-tooth rendering, condition saving.'],
  ['D-006', 'Procedure Recording', 'Record dental procedures and materials used.', 'Mission 5', 'Procedure catalog, fee itemization, progress notes.'],
  ['D-007', 'Doctor OTP Verification & Reset', 'Reset password securely via 6-digit email OTP.', 'Mission 6', 'OTP generation, email dispatch, expiry validation.'],
  ['D-008', 'Doctor Profile Management', 'Update professional profile, license, consultation fee.', 'Mission 6', 'Profile fields persistence, public listing update.'],
  ['D-009', 'Schedule Management', 'Manage working hours, shifts, and slot availability.', 'Mission 6', 'Doctor slot restriction, vacation blackout dates.'],
  ['D-010', 'Appointment Status Tracking', 'Track status: Pending, Scheduled, In Progress, Done.', 'Mission 6', 'Pipeline state transitions, Actions dropdown trigger.'],
  ['D-016', 'Appointment Approval', 'Approve incoming appointment booking requests.', 'Mission 6', 'Status changes to Scheduled, confirmation sent.'],
  ['D-017', 'Appointment Confirmation & Sync', 'Confirm schedule and push to doctor Google Calendar.', 'Mission 6', 'Calendar event insertion via service account API.'],
  ['D-018', 'Appointment Decline', 'Decline appointment requests with mandatory reason.', 'Mission 6', 'Mandatory reason input, patient decline notification.']
];
drawTable(docHeaders, docRows, [45, 95, 175, 55, 135.28], {
  fontSize: 7,
  boldCols: [0, 3],
  colorMap: { 0: () => COLORS.tealDark }
});

// Part 3: Receptionist User Stories (R-001 to R-019)
drawSubSectionHeader('9.3 Receptionist User Stories (R-001 through R-019)');
const recHeaders = ['Story ID', 'Function Name', 'Sprint Story Description', 'Mission', 'Key Verification Criteria'];
const recRows = [
  ['R-001', 'User Registration', 'Activate receptionist account via invitation email.', 'Mission 7', 'Token verification, receptionist role assignment.'],
  ['R-002', 'User Login', 'Secure login to front-desk management portal.', 'Mission 7', 'Front-desk session creation, role permission check.'],
  ['R-003', 'Patient Quick Registration', 'Quickly register walk-in patients efficiently.', 'Mission 7', 'Minimal fields, duplicate check, instant patient ID.'],
  ['R-004', 'Patient Search', 'Search existing records by name, ID, or phone.', 'Mission 7', 'Sub-100ms substring search, zero UI freezing.'],
  ['R-005', 'Patient Information Management', 'Update patient contact and registration details.', 'Mission 7', 'Emergency contact editing, audit trail logging.'],
  ['R-006', 'Queue Management', 'Manage live waiting room patient order and status.', 'Mission 7', 'Waiting room queue ordering, attending doc assign.'],
  ['R-008', 'Appointment Schedule Monitoring', 'View dentist schedules to prevent booking conflicts.', 'Mission 8', 'Multi-doctor schedule grid, chair occupancy check.'],
  ['R-009', 'Patient Medical Info Access', 'Access necessary medical info for front-desk triage.', 'Mission 7', 'Pre-consultation clearance check, allergy flags.'],
  ['R-010', 'Appointment Cancellation', 'Record cancellations and release appointment slots.', 'Mission 8', 'Slot freed on calendar, cancellation reason logged.'],
  ['R-011', 'Appointment Rescheduling', 'Reschedule visits accommodating patient schedule.', 'Mission 8', 'Conflict prevention, doctor schedule re-allocation.'],
  ['R-012', 'Receptionist Profile Management', 'Update receptionist account and profile info.', 'Mission 8', 'Profile update, contact details persistence.'],
  ['R-013', 'Appointment Creation', 'Book phone-in and front-desk walk-in appointments.', 'Mission 8', 'Direct calendar booking, patient notification.'],
  ['R-014', 'Appointment Rescheduling Controls', 'Manage schedule changes with conflict elimination.', 'Mission 8', 'Doctor availability verification, double-booking block.'],
  ['R-015', 'Appointment Management', 'View and modify all clinic appointment details.', 'Mission 8', 'Filter by status, date, doctor, or chair.'],
  ['R-019', 'Receptionist OTP Password Reset', 'Reset password via 6-digit email OTP.', 'Mission 8', 'OTP verification, secure password replacement.']
];
drawTable(recHeaders, recRows, [45, 95, 175, 55, 135.28], {
  fontSize: 7,
  boldCols: [0, 3],
  colorMap: { 0: () => COLORS.blueLight }
});

doc.addPage();
// Part 4: Client / Patient User Stories (C-001 to C-011)
drawSubSectionHeader('9.4 Client / Patient User Stories (C-001 through C-011)');
const cliHeaders = ['Story ID', 'Function Name', 'Sprint Story Description', 'Mission', 'Key Verification Criteria'];
const cliRows = [
  ['C-001', 'User Registration', 'Self-service account creation for patients.', 'Mission 9', 'Password strength validation, unique email rule.'],
  ['C-002', 'User Login', 'Secure login to patient self-service dashboard.', 'Mission 9', 'Patient dashboard access, session authorization.'],
  ['C-003', 'Self-Service Patient Onboarding', 'Enter personal profile and medical background.', 'Mission 9', 'Health intake form, allergy checklist, submit.'],
  ['C-004', 'Online Self-Booking', 'Book dental appointment online based on schedules.', 'Mission 10', 'Interactive booking wizard, service/doctor picker.'],
  ['C-005', 'Real-Time Dynamic Slot Availability', 'Prevent slot clashing with live slot updates.', 'Mission 10', 'Real-time blackout of booked slots & lunch hour.'],
  ['C-006', 'Appointment Lifecycle Tracking', 'Track status: Pending, Confirmed, Completed.', 'Mission 10', 'Visual status pills, transparent progress updates.'],
  ['C-007', 'Comprehensive Medical History', 'Access authorized clinical records & prescriptions.', 'Mission 9', 'Read-only clinical summary, past receipts archive.'],
  ['C-008', 'User Profile Customization', 'Update name, contact info, and profile avatar.', 'Mission 9', 'Profile photo upload, phone & address update.'],
  ['C-009', 'Notifications Engine', 'Receive automated email updates on appointments.', 'Mission 10', 'Booking confirmation, doctor approval notice.'],
  ['C-010', 'Calendar & QR Code Support', '1-Click Google sync, auto sync, .ics & QR Pass.', 'Mission 10', 'Google Cal 1-Click, auto service push, .ics, QR.'],
  ['C-011', 'Verification & Password Reset', 'Receive 6-digit email OTP for password recovery.', 'Mission 9', 'OTP delivery, 10-minute expiry, password update.']
];
drawTable(cliHeaders, cliRows, [45, 95, 175, 55, 135.28], {
  fontSize: 7,
  boldCols: [0, 3],
  colorMap: { 0: () => COLORS.tealBrand }
});

doc.moveDown(0.8);

// Final Quality Certification Block
const certY = doc.y;
ensureSpace(85);
doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 75).fill(COLORS.tealBg);
doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 75).strokeColor(COLORS.tealBrand).stroke();
doc.rect(MARGIN, doc.y, 4, 75).fill(COLORS.tealDark);

doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.tealDark);
doc.text('FORMAL QA SPRINT READINESS CERTIFICATION', MARGIN + 12, doc.y + 10);
doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.slateDark);
doc.text(
  'This master exploratory testing charter covers 100% of all 57 sprint backlog user stories for the OptiDent Dental Clinic Management System. Execution of these 10 structured missions under Session-Based Exploratory Testing guarantees robust functional verification, deep security boundary probing, multi-calendar synchronization fidelity, and data recovery resilience prior to production deployment.',
  MARGIN + 12, doc.y + 24, { width: CONTENT_WIDTH - 24, lineGap: 2 }
);

// ==========================================
// TWO-PASS RUNNING HEADERS & FOOTERS
// ==========================================
console.log('Rendering running headers and footers across all buffered pages...');
const pageRange = doc.bufferedPageRange();
const totalPages = pageRange.count;

for (let i = pageRange.start; i < pageRange.start + totalPages; i++) {
  doc.switchToPage(i);

  // Skip running header on Cover Page (Page 1)
  if (i > 0) {
    // Running Header
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.tealBrand);
    doc.text('OPTIDENT DENTAL CLINIC MANAGEMENT SYSTEM', MARGIN, 24);

    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.slateMed);
    doc.text('MASTER EXPLORATORY TESTING CHARTER (SBET)', MARGIN, 24, {
      width: CONTENT_WIDTH,
      align: 'right'
    });

    // Top thin divider
    doc.rect(MARGIN, 34, CONTENT_WIDTH, 0.75).fill(COLORS.borderDark);
  }

  // Running Footer (on all pages)
  const footerY = PAGE_HEIGHT - 32;
  doc.rect(MARGIN, footerY - 8, CONTENT_WIDTH, 0.75).fill(COLORS.borderDark);

  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.slateDim);
  doc.text('OPTIDENT QA SPRINT SUITE • CONFIDENTIAL • INTERNAL QUALITY GATE USE ONLY', MARGIN, footerY);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.slateDark);
  doc.text(`Page ${i + 1} of ${totalPages}`, MARGIN, footerY, {
    width: CONTENT_WIDTH,
    align: 'right'
  });
}

// Finalize and close stream
doc.flushPages();
doc.end();

let finishedCount = 0;
function checkFinished() {
  finishedCount++;
  if (finishedCount === 2) {
    console.log(`\n SUCCESS! Master Exploratory Testing Charter PDF generated!`);
    console.log(`Total Pages: ${totalPages}`);
    console.log(`File 1 (Root): ${outputPathRoot} (${fs.statSync(outputPathRoot).size} bytes)`);
    console.log(`File 2 (Public Web): ${outputPathPublic} (${fs.statSync(outputPathPublic).size} bytes)`);
  }
}

writeStreamRoot.on('finish', checkFinished);
writeStreamPublic.on('finish', checkFinished);

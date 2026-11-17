/**
 * Shared PDF report endpoint for every role's report screens.
 * The page sends the report it already shows (columns, rows, filters, summary); the server adds
 * the official header/footer from trusted data (clinic name from settings, author from the session).
 */
import express from 'express';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { renderReportPdf, buildReportHtml } from '../config/pdfReport.js';
import { htmlToPdf } from '../config/integrationVerifier.js';
import { getIntegration } from '../config/integrationStore.js';

const router = express.Router();
router.use(requireAuth(['super_admin', 'admin', 'receptionist', 'staff', 'doctor']));

const MAX_ROWS = 5000, MAX_COLS = 14, MAX_CELL = 400;
const str = (v, max) => String(v ?? '').slice(0, max);
const isStrList = (a, maxLen) => Array.isArray(a) && a.length <= maxLen;

router.post('/pdf', async (req, res) => {
    try {
        const apiKey = getIntegration('pdf_api_enabled')?.api_key;
        if (!apiKey) {
            return res.status(403).json({ status: 'error', message: 'PDF reports are off: the Super Admin has not connected the PDF Report API key (Settings & Controls → Open Gateway Center).' });
        }
        const b = req.body || {};
        // Validate shape and size before rendering anything
        if (!b.title || !isStrList(b.columns, MAX_COLS) || !b.columns.length || !isStrList(b.rows, MAX_ROWS)) {
            return res.status(400).json({ status: 'error', message: `A report needs a title, 1-${MAX_COLS} columns and at most ${MAX_ROWS} rows.` });
        }
        const columns = b.columns.map(c => str(c, 60));
        const rows = b.rows.map(r => (Array.isArray(r) ? r : []).slice(0, columns.length).map(c => str(c, MAX_CELL)));
        const filters = isStrList(b.filters, 12) ? b.filters.filter(Array.isArray).map(([k, v]) => [str(k, 40), str(v, 120)]) : [];
        const summary = isStrList(b.summary, 12) ? b.summary.map(s => str(s, 160)) : [];

        const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' });
        const roleLabel = { super_admin: 'Super Admin', admin: 'Admin', receptionist: 'Receptionist', staff: 'Staff', doctor: 'Doctor' }[req.user.role] || req.user.role;
        const fileBase = str(b.title, 60).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Report';
        const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

        const report = {
            clinicName: settings?.clinic_name || 'OptiDent Dental Clinic',
            title: str(b.title, 120),
            subtitle: str(b.subtitle, 200),
            filters, summary, columns, rows,
            generatedBy: `${req.user.full_name || req.user.email} (${roleLabel})`
        };

        // Primary: PDF Report API (PDFShift). If it fails (quota, outage), fall back to the built-in renderer.
        let pdf = null, renderer = 'pdfshift';
        try {
            pdf = await htmlToPdf(buildReportHtml(report), apiKey);
        } catch (apiErr) {
            console.warn('[PDF] PDFShift failed, using built-in renderer:', apiErr.message);
            renderer = 'built-in';
        }

        await logAudit(req, 'REPORT_PDF_EXPORTED', 'REPORTS', { title: report.title, rows: rows.length, renderer }, 'success');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OptiDent_${fileBase}_${stamp}.pdf"`);
        res.setHeader('X-Report-Renderer', renderer);
        if (pdf) return res.send(pdf);
        renderReportPdf(res, report);
    } catch (err) {
        console.error('PDF report error:', err);
        if (!res.headersSent) res.status(500).json({ status: 'error', message: 'Could not generate the PDF.' });
    }
});

export default router;

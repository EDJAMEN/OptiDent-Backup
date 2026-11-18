/**
 * Shared clinic reports: receptionists upload PDFs/images to Cloudinary; doctors (and admins) view them.
 * Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.
 */
import express from 'express';
import { cloudinaryConfigured, uploadToCloudinary } from '../config/cloudinary.js';
import dbClient from '../config/db.js';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';

const router = express.Router();
router.use(requireAuth(['receptionist', 'staff', 'doctor', 'super_admin', 'admin']));

const MAX_BYTES = 10 * 1024 * 1024;
const FOLDER = 'optident/reports';
const DATA_URL = /^data:(application\/pdf|image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/;

// @endpoint POST /api/shared_reports/upload - Receptionist-only: uploads a report (PDF/image) to Cloudinary and lists it for doctors
router.post('/upload', async (req, res) => {
    try {
        if (String(req.session.role || '').toLowerCase() !== 'receptionist') {
            return res.status(403).json({ status: 'forbidden', message: 'Only the receptionist can upload reports.' });
        }
        if (!cloudinaryConfigured()) {
            return res.status(503).json({ status: 'error', message: 'Report storage is not set up: add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to .env.' });
        }
        const title = String(req.body?.title || '').trim().slice(0, 120);
        const patientName = String(req.body?.patient_name || '').trim().slice(0, 120);
        const fileName = String(req.body?.file_name || 'report').replace(/[^\w.\- ]+/g, '').slice(0, 120);
        if (!title) return res.status(400).json({ status: 'error', message: 'A report title is required.' });

        const match = DATA_URL.exec(String(req.body?.file || ''));
        if (!match) return res.status(400).json({ status: 'error', message: 'Choose a PDF, PNG, JPG or WebP file.' });
        if (Buffer.byteLength(match[3], 'base64') > MAX_BYTES) {
            return res.status(400).json({ status: 'error', message: 'File size must be under 10MB.' });
        }

        const up = await uploadToCloudinary(req.body.file, FOLDER);
        const doc = {
            title, patient_name: patientName, file_name: fileName,
            file_url: up.url, public_id: up.public_id, bytes: up.bytes,
            uploaded_by: req.user.full_name || req.user.email,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        await dbClient.insertOne('shared_reports', doc);
        await logAudit(req, 'SHARED_REPORT_UPLOADED', 'RECEPTIONIST', { title, public_id: up.public_id }, 'success');
        res.json({ status: 'success', message: 'Report uploaded. Doctors can now see it.' });
    } catch (err) {
        console.error('Report upload error:', err.message);
        if (!res.headersSent) res.status(502).json({ status: 'error', message: err.message || 'Could not upload the report.' });
    }
});

// @endpoint GET /api/shared_reports/list - Lists uploaded reports, newest first (doctors, admins, receptionist)
router.get('/list', async (req, res) => {
    try {
        const rows = await dbClient.find('shared_reports', {});
        const reports = (rows || [])
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 200)
            .map(r => ({ id: String(r._id), title: r.title, patient_name: r.patient_name || '', file_name: r.file_name, file_url: r.file_url, uploaded_by: r.uploaded_by, created_at: r.created_at }));
        res.json({ status: 'success', reports });
    } catch (err) {
        console.error('Report list error:', err.message);
        res.status(500).json({ status: 'error', message: 'Could not load reports.' });
    }
});

export default router;

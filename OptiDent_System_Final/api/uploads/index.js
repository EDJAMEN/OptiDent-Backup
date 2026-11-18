/**
 * Profile-photo uploads, hosted on Cloudinary.
 * Needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.
 */
import express from 'express';
import requireAuth from '../middleware/authGuard.js';
import logAudit from '../config/auditLogger.js';
import { cloudinaryConfigured, uploadToCloudinary } from '../config/cloudinary.js';

const router = express.Router();
router.use(requireAuth(['patient', 'client', 'receptionist', 'staff', 'doctor', 'super_admin', 'admin']));

const MAX_BYTES = 3 * 1024 * 1024;
const DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

// @endpoint POST /api/uploads/avatar - Uploads a profile photo to Cloudinary and returns its public URL
router.post('/avatar', async (req, res) => {
    try {
        if (!cloudinaryConfigured()) {
            return res.status(503).json({ status: 'error', message: 'Photo uploads are not set up: add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to .env.' });
        }

        const match = DATA_URL.exec(String(req.body?.image || ''));
        if (!match) {
            return res.status(400).json({ status: 'error', message: 'Please choose a PNG, JPG, WebP or GIF image.' });
        }
        if (Buffer.byteLength(match[2], 'base64') > MAX_BYTES) {
            return res.status(400).json({ status: 'error', message: 'Image file size must be under 3MB.' });
        }

        const up = await uploadToCloudinary(req.body.image, 'optident/avatars');
        await logAudit(req, 'PROFILE_PHOTO_UPLOADED', 'PROFILE', {}, 'success');
        res.json({ status: 'success', url: up.url });
    } catch (err) {
        console.error('Avatar upload error:', err.message);
        await logAudit(req, 'PROFILE_PHOTO_UPLOAD_FAILED', 'PROFILE', { reason: err.message }, 'failed').catch(() => {});
        if (!res.headersSent) res.status(502).json({ status: 'error', message: err.message || 'Could not upload the photo.' });
    }
});

export default router;

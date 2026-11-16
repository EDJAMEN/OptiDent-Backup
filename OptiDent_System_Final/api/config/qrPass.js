/**
 * Signed appointment QR passes.
 * The QR holds only "OPTIDENT-QR:v1:<appointmentId>:<signature>" — no personal data.
 * The signature is an HMAC of the appointment ID with SESSION_SECRET, so a QR made or edited
 * by anyone else fails verification at the front desk.
 */
import crypto from 'crypto';
import dbClient from './db.js';

const PREFIX = 'OPTIDENT-QR:v1:';

function sign(id) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET is not configured; QR passes cannot be signed.');
    return crypto.createHmac('sha256', secret).update(`qr:v1:${id}`).digest('base64url').slice(0, 22); // 132 bits
}

/** Super Admin switch in the Gateway Center (Settings → QR Check-in Passes). On unless explicitly turned off. */
export async function qrCheckinEnabled() {
    const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' });
    return settings?.integrations?.qr_checkin_enabled !== false;
}

/** goQR.me integration (Gateway Center). Off unless explicitly turned on. */
export async function goqrEnabled() {
    const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' });
    return settings?.integrations?.goqr_enabled === true;
}

export function makeQrCode(appointmentId) {
    const id = String(appointmentId);
    return `${PREFIX}${id}:${sign(id)}`;
}

/** @returns {string|null} the appointment ID if the code is genuine, otherwise null */
export function readQrCode(code) {
    const m = /^OPTIDENT-QR:v1:([A-Za-z0-9_-]{6,64}):([A-Za-z0-9_-]{22})$/.exec(String(code || '').trim());
    if (!m) return null;
    let expected;
    try { expected = sign(m[1]); } catch { return null; } // no secret → fail closed
    const a = Buffer.from(m[2]), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

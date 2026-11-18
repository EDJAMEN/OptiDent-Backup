/**
 * Cloudinary uploads (signed). Credentials come from the Gateway Center (Cloudinary card):
 * cloud name, API key and API secret, stored encrypted. Works only while the card is switched on.
 * The API secret is only used on the server to sign uploads; it is never sent to the browser.
 */
import crypto from 'crypto';
import { getIntegration, isIntegrationOn } from './integrationStore.js';

function credentials() {
    if (!isIntegrationOn('cloudinary_enabled')) return null;
    const c = getIntegration('cloudinary_enabled');
    return c && c.cloud_name && c.api_key && c.api_secret ? c : null;
}

export function cloudinaryConfigured() {
    return !!credentials();
}

/**
 * @param {string} dataUri  base64 data URI (image/* or application/pdf)
 * @param {string} folder   e.g. 'optident/avatars'
 * @returns {Promise<{url: string, public_id: string, bytes: number}>}
 */
export async function uploadToCloudinary(dataUri, folder) {
    const c = credentials();
    if (!c) throw new Error('Cloudinary is off: turn on the Cloudinary card and save its keys in the Gateway Center.');
    const timestamp = Math.floor(Date.now() / 1000);
    // Signature = SHA-1 of the sorted params plus the API secret
    const signature = crypto.createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${c.api_secret}`)
        .digest('hex');
    const form = new FormData();
    form.append('file', dataUri);
    form.append('folder', folder);
    form.append('timestamp', String(timestamp));
    form.append('api_key', c.api_key);
    form.append('signature', signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(c.cloud_name)}/auto/upload`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(30000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || `Cloudinary upload failed (HTTP ${res.status}).`);
    return { url: data.secure_url, public_id: data.public_id, bytes: data.bytes };
}

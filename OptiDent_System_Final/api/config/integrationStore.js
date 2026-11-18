/**
 * In-memory cache of decrypted integration credentials.
 * Loaded at startup and reloaded after every save/disable, so new keys work immediately.
 */
import dbClient from './db.js';
import { decryptToken } from './encryptionHelper.js';

let cache = {};
let switches = {};

export async function reloadIntegrations() {
    const settings = await dbClient.findOne('system_settings', { setting_type: 'clinic_profile' });
    const next = {};
    for (const [key, fields] of Object.entries(settings?.integration_credentials || {})) {
        if (!fields || typeof fields !== 'object') continue; // legacy single-string entries are ignored
        next[key] = Object.fromEntries(Object.entries(fields).map(([f, v]) => [f, decryptToken(v)]));
    }
    cache = next;
    switches = settings?.integrations || {};
}

/** Decrypted fields for an integration, e.g. getIntegration('smtp_email_enabled')?.smtp_pass */
export function getIntegration(key) {
    return cache[key] || null;
}

/** True only when the Super Admin has switched the integration on (fails closed). */
export function isIntegrationOn(key) {
    return switches[key] === true;
}

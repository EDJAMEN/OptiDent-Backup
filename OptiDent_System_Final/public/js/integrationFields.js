// Single source of truth for integration form fields.
// Imported by the admin dashboard (browser) AND api/admin (server), so both clean input identically.

export const INTEGRATION_FIELDS = {
    google_auth_enabled: [
        { name: 'client_id', label: 'OAuth Client ID', pattern: /^[\w-]+\.apps\.googleusercontent\.com$/ },
        { name: 'client_secret', label: 'OAuth Client Secret', secret: true, pattern: /^[\w-]{20,100}$/ }
    ],
    smtp_email_enabled: [
        { name: 'smtp_user', label: 'Gmail address', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        { name: 'smtp_pass', label: 'App Password', secret: true, stripSpaces: true, pattern: /^[a-z]{16}$/i }
    ],
    recaptcha_enabled: [
        // Public, but must come from the same reCAPTCHA registration as the secret or every login fails.
        { name: 'site_key', label: 'reCAPTCHA Site Key', pattern: /^6L[\w-]{38}$/ },
        { name: 'secret_key', label: 'reCAPTCHA Secret Key', secret: true, pattern: /^6L[\w-]{38}$/ }
    ],
    sms_gateway_enabled: [
        { name: 'api_key', label: 'SMS API Key', secret: true, pattern: /^[\w-]{10,100}$/ }
    ],
    google_calendar_sync: [
        { name: 'service_account_json', label: 'Service Account JSON', secret: true, jsonKeys: ['client_email', 'private_key', 'private_key_id'] }
    ],
    imgbb_enabled: [
        { name: 'api_key', label: 'ImgBB API Key', secret: true, pattern: /^[a-f0-9]{32}$/i }
    ],
    // No admin input: the server generates the webhook secret.
    google_forms_enabled: []
};

/** Keeps only known fields, trims them, checks formats. Throws Error with a user-facing message. */
export function cleanIntegrationInput(key, input) {
    const fields = INTEGRATION_FIELDS[key];
    if (!fields) throw new Error(`Unknown integration: ${key}`);
    const clean = {};
    for (const f of fields) {
        let v = String((input || {})[f.name] ?? '').trim();
        if (f.stripSpaces) v = v.replace(/\s+/g, '');
        if (!v) throw new Error(`${f.label} is required.`);
        if (f.pattern && !f.pattern.test(v)) throw new Error(`${f.label} has an invalid format.`);
        if (f.jsonKeys) {
            let obj;
            try { obj = JSON.parse(v); } catch { throw new Error(`${f.label} is not valid JSON.`); }
            const missing = f.jsonKeys.filter(k => !obj || !obj[k]);
            if (missing.length) throw new Error(`${f.label} is missing: ${missing.join(', ')}.`);
        }
        clean[f.name] = v;
    }
    return clean;
}

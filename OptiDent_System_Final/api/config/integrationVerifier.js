/**
 * Live, harmless test calls that prove integration credentials work.
 * A test must actually pass — there is no "format looks fine" fallback.
 * Each function throws Error(user-facing message) on failure.
 */
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const TIMEOUT_MS = 8000;
// 1×1 transparent PNG
const PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function withTimeout(promise, what) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not respond within ${TIMEOUT_MS / 1000}s.`)), TIMEOUT_MS))
    ]);
}

async function postForm(url, params) {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
}

const TESTS = {
    // Google only answers invalid_grant to a dummy code after the client ID + secret check out.
    async google_auth_enabled({ client_id, client_secret }) {
        const { data } = await postForm('https://oauth2.googleapis.com/token', {
            code: 'optident-credential-probe', client_id, client_secret,
            redirect_uri: 'postmessage', grant_type: 'authorization_code'
        });
        if (data.error !== 'invalid_grant') {
            throw new Error(`Google rejected the client ID/secret (${data.error || 'unexpected response'}).`);
        }
        return 'Google accepted the OAuth client ID and secret.';
    },

    // Sends a real test message to the admin who is saving.
    async smtp_email_enabled({ smtp_user, smtp_pass }, { adminEmail }) {
        const t = { connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS };
        const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: smtp_user, pass: smtp_pass }, ...t });
        await withTimeout(transporter.sendMail({
            from: `"OptiDent" <${smtp_user}>`,
            to: adminEmail,
            subject: 'OptiDent email integration test',
            text: 'This test message confirms the email integration credentials work. No action needed.'
        }), 'Gmail SMTP');
        return `Test email sent to ${adminEmail}.`;
    },

    // Google returns invalid-input-secret for a bad secret; anything else means the secret is real.
    async recaptcha_enabled({ secret_key }) {
        const { res, data } = await postForm('https://www.google.com/recaptcha/api/siteverify', { secret: secret_key, response: 'optident-probe' });
        if (!res.ok || (data['error-codes'] || []).includes('invalid-input-secret')) {
            throw new Error('Google rejected the reCAPTCHA secret key.');
        }
        return 'Google accepted the reCAPTCHA secret key.';
    },

    async google_calendar_sync({ service_account_json }) {
        const credentials = JSON.parse(service_account_json);
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar.events'] });
        const client = await auth.getClient();
        await withTimeout(client.getAccessToken(), 'Google OAuth');
        return `Google issued a token for ${credentials.client_email}.`;
    },

    // Cloudinary Admin API ping: a harmless read that only passes with a real cloud name, key and secret.
    async cloudinary_enabled({ cloud_name, api_key, api_secret }) {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud_name)}/ping`, {
            headers: { Authorization: 'Basic ' + Buffer.from(`${api_key}:${api_secret}`).toString('base64') },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error('Cloudinary rejected the API key or API secret.');
        if (res.status === 404) throw new Error('Cloudinary does not recognise that cloud name.');
        if (!res.ok) throw new Error(`Cloudinary check failed (${data?.error?.message || 'HTTP ' + res.status}).`);
        return 'Cloudinary accepted the credentials.';
    }
};

// Draws one QR with the key; API Ninjas answers {"error": "Invalid API Key."} for a bad key.
TESTS.qr_api_enabled = async function ({ api_key }) {
    const png = await fetchQrPng('OptiDent key check', api_key);
    return `API Ninjas drew a test QR code (${png.length} bytes).`;
};

/** Draw a QR PNG with API Ninjas. @returns {Promise<Buffer>} */
export async function fetchQrPng(data, apiKey) {
    const res = await fetch(`https://api.api-ninjas.com/v1/qrcode?format=png&data=${encodeURIComponent(data)}`, {
        headers: { 'X-Api-Key': apiKey, Accept: 'image/png' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('json')) {
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(body.toString('utf8')).error || msg; } catch {}
        throw new Error(`API Ninjas rejected the request (${msg}).`);
    }
    if (type.startsWith('image/')) return body;
    // Without image negotiation the API returns the PNG base64-encoded as text
    const decoded = Buffer.from(body.toString('utf8').trim(), 'base64');
    if (decoded.subarray(1, 4).toString() !== 'PNG') throw new Error('API Ninjas returned an unexpected response.');
    return decoded;
}

// Checks the key against PDFShift's usage endpoint, which does not spend a conversion credit.
TESTS.pdf_api_enabled = async function ({ api_key }) {
    const res = await fetch('https://api.pdfshift.io/v3/credits/usage', { headers: { 'X-API-Key': api_key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(`PDFShift rejected the key (${data.error || 'HTTP ' + res.status}).`);
    return 'PDFShift accepted the API key.';
};

/**
 * Convert an HTML page to PDF with PDFShift. header/footer are HTML repeated on every page;
 * PDFShift fills {{page}} and {{total}} in them. @returns {Promise<Buffer>}
 */
export async function htmlToPdf({ html, header, footer, landscape }, apiKey) {
    const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source: html, format: 'A4', landscape: !!landscape, use_print: true,
            margin: { top: '78px', bottom: '56px', left: '36px', right: '36px' },
            header: { source: header, height: '70px' },
            footer: { source: footer, height: '44px' }
        }),
        signal: AbortSignal.timeout(30000)
    });
    const body = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !(res.headers.get('content-type') || '').includes('pdf')) {
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(body.toString('utf8')).error || msg; } catch {}
        throw new Error(`PDFShift could not convert the report (${msg}).`);
    }
    return body;
}

/** @returns {Promise<string>} success message */
export async function testIntegration(key, fields, ctx = {}) {
    const test = TESTS[key];
    if (!test) throw new Error(`No live test exists for ${key}.`);
    try {
        return await test(fields, ctx);
    } catch (err) {
        if (err.name === 'TimeoutError') throw new Error('The service did not respond in time. Try again.');
        throw err;
    }
}

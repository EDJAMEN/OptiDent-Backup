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

    async sms_gateway_enabled({ api_key }) {
        const res = await fetch(`https://api.semaphore.co/api/v4/account?apikey=${encodeURIComponent(api_key)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`Semaphore rejected the API key (HTTP ${res.status}).`);
        return 'Semaphore accepted the API key.';
    },

    async google_calendar_sync({ service_account_json }) {
        const credentials = JSON.parse(service_account_json);
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar.events'] });
        const client = await auth.getClient();
        await withTimeout(client.getAccessToken(), 'Google OAuth');
        return `Google issued a token for ${credentials.client_email}.`;
    },

    // Uploads a 1×1 image that ImgBB deletes after 60s (its minimum expiration).
    async imgbb_enabled({ api_key }) {
        const { data } = await postForm(`https://api.imgbb.com/1/upload?expiration=60&key=${encodeURIComponent(api_key)}`, { image: PIXEL_PNG_BASE64 });
        if (data.error?.code === 103) {
            // Key is real, but ImgBB blocks the account or this server's network/IP
            throw new Error('ImgBB recognised the key but has blocked its account or this network (ImgBB code 103: "forbidden"). Log in at imgbb.com to check the account, or try a key from another account or network.');
        }
        if (!data.success) throw new Error(`ImgBB rejected the API key (${data.error?.message || 'upload failed'}).`);
        return 'ImgBB accepted a self-deleting test upload.';
    }
};

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

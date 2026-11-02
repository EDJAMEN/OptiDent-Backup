/**
 * OptiDent System - Google reCAPTCHA Verification Helper (ES Module)
 */

export async function verifyRecaptcha(token, remoteIp = '') {
    if (!token) return false;

    // Google Test Secret Key (passes automatically for test key) or live key from environment
    const secret = process.env.RECAPTCHA_SECRET_KEY || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';
    const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';

    try {
        const params = new URLSearchParams();
        params.append('secret', secret);
        params.append('response', token);
        if (remoteIp) params.append('remoteip', remoteIp);

        const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        const data = await res.json();
        return !!data.success;
    } catch (err) {
        console.error('reCAPTCHA verification network error:', err);
        return false;
    }
}

export default verifyRecaptcha;


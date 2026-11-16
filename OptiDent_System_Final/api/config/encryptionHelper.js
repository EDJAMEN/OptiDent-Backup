/**
 * AES-256-GCM encryption for integration secrets.
 * Key: INTEGRATION_ENCRYPTION_KEY = 64 hex chars (32 bytes). No fallback key, ever.
 * Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/** Returns the 32-byte key, or null when INTEGRATION_ENCRYPTION_KEY is missing/invalid. Read lazily so .env changes apply. */
export function getEncryptionKey() {
    const hex = (process.env.INTEGRATION_ENCRYPTION_KEY || '').trim();
    return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}

/** @returns {string} enc:gcm:iv:tag:ciphertext */
export function encryptToken(plainText) {
    const key = getEncryptionKey();
    if (!key) throw new Error('INTEGRATION_ENCRYPTION_KEY is missing or invalid.');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    return `enc:gcm:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

/** @returns {string|null} plaintext, or null if missing key, malformed, or tampered */
export function decryptToken(encryptedString) {
    const key = getEncryptionKey();
    if (!key || typeof encryptedString !== 'string' || !encryptedString.startsWith('enc:gcm:')) return null;
    try {
        const [, , iv, tag, data] = encryptedString.split(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error('[EncryptionHelper] Decryption failed or data tampered:', err.message);
        return null;
    }
}

/** Only the last 4 characters survive. */
export function hintOf(secret) {
    return '••••' + String(secret || '').slice(-4);
}

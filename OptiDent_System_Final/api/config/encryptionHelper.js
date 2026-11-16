/**
 * OptiDent Encryption & Token Masking Utility
 * 
 * Provides:
 * 1. AES-256-GCM Authenticated Encryption for sensitive API tokens and credentials.
 * 2. AES-256-GCM Decryption with integrity verification.
 * 3. Token masking to display half-masked tokens (e.g. ••••••••••••8f2a) in the UI.
 */

import crypto from 'crypto';

// Secret key derivation (32 bytes for AES-256)
const MASTER_SECRET = process.env.ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'optident_secure_vault_master_key_2026';
const SALT = 'optident_integration_vault_salt_2026';
const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.scryptSync(MASTER_SECRET, SALT, 32);

/**
 * Encrypt a plain-text token or JSON credentials object using AES-256-GCM
 * @param {string|object} data 
 * @returns {string} Serialized encrypted string: enc:gcm:iv:tag:ciphertext
 */
export function encryptToken(data) {
    if (!data) return null;
    const plainText = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `enc:gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-GCM encrypted token string
 * @param {string} encryptedString 
 * @param {boolean} parseJson If true, attempts to parse as JSON
 * @returns {string|object|null}
 */
export function decryptToken(encryptedString, parseJson = false) {
    if (!encryptedString || typeof encryptedString !== 'string') return null;
    if (!encryptedString.startsWith('enc:gcm:')) return encryptedString; // Return as-is if legacy unencrypted

    try {
        const parts = encryptedString.split(':');
        if (parts.length !== 5) return null;
        
        const iv = Buffer.from(parts[2], 'hex');
        const authTag = Buffer.from(parts[3], 'hex');
        const cipherText = parts[4];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(cipherText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        if (parseJson) {
            try { return JSON.parse(decrypted); } catch (e) { return decrypted; }
        }
        return decrypted;
    } catch (err) {
        console.error('[EncryptionHelper] Decryption failed or data tampered:', err.message);
        return null;
    }
}

/**
 * Mask a token so that at least half of it is encrypted/hidden with • characters
 * Examples:
 * - "AIzaSyB8f2a9D3k1234567890abcdef" -> "AIza••••••••••••••••cdef"
 * - "emuvfyqhuyyafpku" -> "••••••••••••fpku"
 * - Service Account JSON -> "optident-calendar@... ••••5a4a"
 * 
 * @param {string|object} token 
 * @returns {string}
 */
export function maskToken(token) {
    if (!token) return '';
    
    // If it's a JSON object or stringified JSON (e.g. Service Account)
    let parsedObj = null;
    if (typeof token === 'object') {
        parsedObj = token;
    } else if (typeof token === 'string' && token.trim().startsWith('{')) {
        try { parsedObj = JSON.parse(token); } catch (e) {}
    }

    if (parsedObj) {
        const email = parsedObj.client_email || parsedObj.client_id || 'service-account';
        const privateKeyId = parsedObj.private_key_id ? parsedObj.private_key_id.slice(-6) : 'key';
        return `${email} ••••••${privateKeyId}`;
    }

    const str = String(token).trim();
    const len = str.length;

    if (len <= 4) {
        return '••••';
    }

    if (len <= 8) {
        // e.g. 8 chars: 2 visible, 4 dots, 2 visible
        return `${str.slice(0, 2)}••••${str.slice(-2)}`;
    }

    if (len <= 16) {
        // e.g. 16-char SMTP app password: first 2 visible, middle 10 dots, last 4 visible
        const visibleEnd = 4;
        const visibleStart = 2;
        const dots = '•'.repeat(len - visibleStart - visibleEnd);
        return `${str.slice(0, visibleStart)}${dots}${str.slice(-visibleEnd)}`;
    }

    // Long tokens (API keys, JWT, 32+ chars)
    // Reveal first 4 characters, last 4 characters, and mask the entire middle (>50%)
    const visibleStart = 4;
    const visibleEnd = 4;
    const maskedLength = Math.max(12, len - visibleStart - visibleEnd);
    const dots = '•'.repeat(Math.min(16, maskedLength));
    return `${str.slice(0, visibleStart)}${dots}${str.slice(-visibleEnd)}`;
}

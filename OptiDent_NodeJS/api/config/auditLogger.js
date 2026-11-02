import dbClient from './db.js';

export async function logAudit(req, action, category, details = {}, status = 'success') {
    try {
        const user = req.user || req.session || {};
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'OptiDent-Client';

        const record = {
            user_id: user.user_id || user.id || 'system',
            user_email: user.email || 'system@optident.local',
            user_role: user.role || 'guest',
            action,
            category,
            details,
            status,
            ip_address: ip,
            user_agent: userAgent,
            created_at: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };

        await dbClient.insertOne('audit_logs', record);
    } catch (err) {
        console.error('[AuditLog Error]', err.message);
    }
}

export default logAudit;


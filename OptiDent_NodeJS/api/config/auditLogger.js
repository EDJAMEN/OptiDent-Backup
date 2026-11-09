import dbClient from './db.js';

export async function logAudit(req, action, category, details = {}, status = 'success') {
    try {
        const user = req.user || req.session || {};
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || 'OptiDent-Client';

        // Format Philippine Standard Time (Asia/Manila)
        const manilaTime = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date()).replace(',', '');

        const actorEmail = user.email || (req.body && req.body.email) || 'system@optident.local';
        const actorRole = (user.role || (actorEmail.includes('admin') ? 'super_admin' : 'system')).toLowerCase();
        const actorName = user.full_name || user.name || actorEmail;

        const record = {
            user_id: user.user_id || user.id || 'system',
            user_email: actorEmail,
            actor_name: actorName,
            user_role: actorRole,
            actor_role: actorRole,
            action,
            category,
            details,
            status,
            ip_address: ip,
            user_agent: userAgent,
            created_at: manilaTime,
            timestamp: manilaTime
        };

        await dbClient.insertOne('audit_logs', record);
    } catch (err) {
        console.error('[AuditLog Error]', err.message);
    }
}

export default logAudit;


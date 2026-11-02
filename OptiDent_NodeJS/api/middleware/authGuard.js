import dbClient from '../config/db.js';

export function requireAuth(allowedRoles = []) {
    return async (req, res, next) => {
        const session = req.session;
        if (!session || !session.email || !session.role) {
            return res.status(401).json({
                status: 'unauthenticated',
                message: 'No active session. Please log in.'
            });
        }

        const role = (session.role || '').toLowerCase();
        
        // If allowedRoles is provided, check role
        if (allowedRoles.length > 0) {
            const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
            // super_admin always has access
            if (!normalizedAllowed.includes(role) && role !== 'super_admin' && !session.is_master) {
                return res.status(403).json({
                    status: 'forbidden',
                    message: `Access denied. Requires one of [${allowedRoles.join(', ')}], your role is '${role}'.`
                });
            }
        }

        // Attach user info to req
        req.user = {
            id: session.user_id,
            email: session.email,
            full_name: session.full_name,
            role: role,
            is_master: session.is_master
        };

        next();
    };
}

export default requireAuth;


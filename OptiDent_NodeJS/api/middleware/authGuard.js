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

export function requirePermission(permissionKey) {
    return async (req, res, next) => {
        const session = req.session;
        if (!session || !session.email || !session.role) {
            return res.status(401).json({ status: 'unauthenticated', message: 'No active session. Please log in.' });
        }

        const role = (session.role || '').toLowerCase();
        if (role === 'super_admin' || session.is_master) {
            return next();
        }

        try {
            const perm = await dbClient.findOne('roles_permissions', {
                $or: [{ key: permissionKey }, { permission_key: permissionKey }]
            });

            if (perm) {
                const allowed = (perm.roles || []).map(r => r.toLowerCase());
                if (!allowed.includes(role)) {
                    return res.status(403).json({
                        status: 'forbidden',
                        message: `Action denied. Your role '${role}' has not been granted the '${permissionKey}' permission by Super Admin.`
                    });
                }
            }
        } catch (err) {
            console.error('[RBAC Check Error]', err.message);
        }

        next();
    };
}

export default requireAuth;


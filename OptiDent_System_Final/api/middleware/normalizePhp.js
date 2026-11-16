/**
 * Transparently strips '.php' from incoming request paths
 * so that existing frontend JavaScript fetch calls work immediately
 * without needing every single script to be rewritten!
 */
export function normalizePhp(req, res, next) {
    if (req.url.includes('.php')) {
        req.url = req.url.replace(/\.php(\?|$)/, '$1');
    }
    next();
}

export default normalizePhp;


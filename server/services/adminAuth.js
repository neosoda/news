const crypto = require('crypto');

const DEFAULT_ADMIN_WINDOW_MS = 15 * 60 * 1000;

function getConfiguredOrigins() {
    const configured = (process.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (configured.length > 0) return new Set(configured);
    if (process.env.NODE_ENV !== 'production') return new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
    return new Set();
}

function createCorsOptions() {
    const allowedOrigins = getConfiguredOrigins();
    return {
        origin(origin, callback) {
            // Requests without Origin are same-origin, server-to-server, or CLI calls.
            return callback(null, !origin || allowedOrigins.has(origin));
        },
        methods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type', 'X-Admin-Token'],
        maxAge: 600
    };
}

function secureCompare(expected, received) {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(received, 'utf8');
    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function requireAdmin(req, res, next) {
    const expectedToken = process.env.ADMIN_TOKEN;
    if (!expectedToken || expectedToken.length < 32) {
        return res.status(503).json({
            error: 'L’administration est verrouillée : ADMIN_TOKEN doit contenir au moins 32 caractères.',
            code: 'admin_auth_not_configured'
        });
    }

    const receivedToken = req.get('X-Admin-Token') || '';
    if (!receivedToken) return res.status(401).json({ error: 'Authentification administrateur requise.', code: 'admin_auth_required' });
    if (!secureCompare(expectedToken, receivedToken)) return res.status(403).json({ error: 'Jeton administrateur invalide.', code: 'admin_auth_invalid' });
    return next();
}

function createRateLimiter({ limit, windowMs = DEFAULT_ADMIN_WINDOW_MS, key = (req) => req.ip }) {
    const requests = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const requestKey = key(req) || 'unknown';
        const current = requests.get(requestKey);
        const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
        entry.count += 1;
        requests.set(requestKey, entry);
        if (entry.count > limit) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'Trop de requêtes. Réessayez plus tard.', code: 'rate_limited' });
        }
        return next();
    };
}

module.exports = {
    createCorsOptions,
    requireAdmin,
    limitAdminMutation: createRateLimiter({ limit: 30 }),
    limitSummarization: createRateLimiter({ limit: 20 })
};

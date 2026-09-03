const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const { createCorsOptions } = require('./services/adminAuth');

app.disable('x-powered-by');
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "connect-src 'self'",
        "frame-src https://www.youtube-nocookie.com"
    ].join('; '));
    next();
});

const apiRoutes = require('./routes');
const cron = require('node-cron');
const { updateAllFeeds } = require('./services/rss');
const { ensureBreachSources } = require('./services/breachSources');

app.use('/api', apiRoutes);
// Routes are handled in routes.js

const clientBuildPath = path.join(__dirname, 'public');
const clientIndexPath = path.join(clientBuildPath, 'index.html');
const hasClientBuild = fs.existsSync(clientIndexPath);

if (hasClientBuild) {
    app.use(express.static(clientBuildPath));
    app.get(/(.*)/, (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(clientIndexPath);
    });
} else {
    console.warn('[BOOT] Frontend build not found in /public. API-only mode enabled.');
}

async function runFeedRefresh(trigger) {
    try {
        await ensureBreachSources();
        await updateAllFeeds();
    } catch (error) {
        console.error(`[RSS] Refresh failed (${trigger}):`, error);
    }
}

// Schedule RSS update every 15 minutes
cron.schedule('*/15 * * * *', () => {
    console.log('Running scheduled RSS update...');
    runFeedRefresh('cron');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Initial fetch on start
    runFeedRefresh('startup');
});

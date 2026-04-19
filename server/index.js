const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const apiRoutes = require('./routes');
const cron = require('node-cron');
const { updateAllFeeds } = require('./services/rss');

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
        await updateAllFeeds();
    } catch (error) {
        console.error(`[RSS] Refresh failed (${trigger}):`, error);
    }
}

// Schedule RSS update every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log('Running scheduled RSS update...');
    runFeedRefresh('cron');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Initial fetch on start
    runFeedRefresh('startup');
});

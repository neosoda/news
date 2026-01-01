const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config();

const app = express();
const prisma = require('./db');
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10kb' })); // Protection against large payloads
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const apiRoutes = require('./routes');
const cron = require('node-cron');
const { updateAllFeeds } = require('./services/rss');

app.use('/api', apiRoutes);
// Routes are handled in routes.js

const clientBuildPath = path.join(__dirname, 'public');
app.use(express.static(clientBuildPath));

app.get(/(.*)/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Schedule RSS update every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log('Running scheduled RSS update...');
    updateAllFeeds();
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Initial fetch on start
    updateAllFeeds().catch(console.error);
});

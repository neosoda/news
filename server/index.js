const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const prisma = require('./db');
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.send('News Aggregator API is running');
});

const apiRoutes = require('./routes');
const cron = require('node-cron');
const { updateAllFeeds } = require('./services/rss');

app.use('/api', apiRoutes);

// Schedule RSS update every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log('Running scheduled RSS update...');
    updateAllFeeds();
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Initial fetch on start
    // updateAllFeeds(); 
});

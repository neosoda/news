const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

// Auto-fix SQLITE_URL prefix if missing or empty
if (!process.env.SQLITE_URL || process.env.SQLITE_URL.trim() === "") {
    process.env.SQLITE_URL = 'file:/app/prisma/dev.db';
} else if (!process.env.SQLITE_URL.startsWith('file:')) {
    process.env.SQLITE_URL = `file:${process.env.SQLITE_URL}`;
}

const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

async function checkConnection() {
    try {
        await prisma.$connect();
        console.log('Successfully connected to the database.');
    } catch (e) {
        console.error('Failed to connect to the database:', e);
    }
}

checkConnection();

module.exports = prisma;

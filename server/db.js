const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

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

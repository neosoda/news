process.env.SQLITE_URL = 'file:' + require('path').join(require('os').tmpdir(), 'newsai-breach-exclusion-test.db').replace(/\\/g, '/');
process.env.ADMIN_TOKEN = 'breach-exclusion-test-token-with-at-least-32-characters';
const prisma = require('../db');
const routes = require('../routes');
console.log('Modules loaded OK');
console.log('Routes count:', routes.stack?.length || 'unknown');
prisma.$disconnect().then(() => process.exit(0));

require('dotenv').config();
const { generateResponse } = require('./services/openrouter');

console.log('Module loaded OK');
generateResponse('Test: réponds juste "ok"', { maxTokens: 10, timeoutMs: 20000 })
    .then(r => console.log('LLM response:', r))
    .catch(e => {
        console.error('LLM error:', e.message);
        if (e.failures) {
            e.failures.forEach(f => console.error(' -', f.provider, f.model, 'attempt', f.attempt, ':', f.error));
        }
    });

require('dotenv').config();

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODEL_CASCADE = [
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'openai/gpt-oss-20b:free',
    'google/gemma-3-12b-it:free',
    'z-ai/glm-4.5-air:free',
    'qwen/qwen3-4b:free',
    'google/gemma-3-4b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-3n-e4b-it:free',
    'google/gemma-3n-e2b-it:free'
];

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES_PER_MODEL = 3;

function isBlankResponse(content) {
    return !content || typeof content !== 'string' || content.trim().length === 0;
}

function shouldRetry(error) {
    if (error?.name === 'AbortError') return true;
    if (error?.code === 'ETIMEDOUT') return true;
    if (typeof error?.status === 'number' && RETRYABLE_HTTP_STATUS.has(error.status)) return true;
    return false;
}

async function requestCompletion({ model, messages, temperature = 0.2, maxTokens = 700, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            }),
            signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(payload?.error?.message || `OpenRouter error: HTTP ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        const content = payload?.choices?.[0]?.message?.content;
        if (isBlankResponse(content)) {
            const error = new Error('OpenRouter returned an empty response');
            error.status = 204;
            throw error;
        }

        return content.trim();
    } finally {
        clearTimeout(timeout);
    }
}

async function generateResponse(prompt, options = {}) {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not set');
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
        throw new Error('generateResponse requires a non-empty prompt string');
    }

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt.trim() });

    const failures = [];

    for (const model of MODEL_CASCADE) {
        for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
            try {
                const content = await requestCompletion({
                    model,
                    messages,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                    timeoutMs: options.timeoutMs
                });

                console.info(`[LLM] Success with model: ${model} (attempt ${attempt})`);
                return content;
            } catch (error) {
                failures.push({ model, attempt, error: error.message, status: error.status || null });

                const retryable = shouldRetry(error) || error.message === 'OpenRouter returned an empty response';
                const hasRemainingAttempts = attempt < MAX_RETRIES_PER_MODEL;

                if (retryable && hasRemainingAttempts) {
                    continue;
                }

                break;
            }
        }
    }

    const error = new Error('All OpenRouter fallback models failed');
    error.failures = failures;
    throw error;
}

module.exports = {
    generateResponse,
    MODEL_CASCADE
};

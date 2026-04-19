require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_PRIMARY_MODEL = 'llama-3.1-8b-instant';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = 'mistral-small-latest';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODEL_CASCADE = [
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'google/gemma-3-12b-it:free',
    'qwen/qwen3-4b:free',
    'google/gemma-3-4b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-3n-e4b-it:free',
];

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES_PER_MODEL = 3;
const MAX_GROQ_RETRIES = 2;

function isBlankResponse(content) {
    return !content || typeof content !== 'string' || content.trim().length === 0;
}

// Network/server errors worth retrying on the SAME provider
function shouldRetry(error) {
    if (error?.name === 'AbortError') return true;
    if (error?.code === 'ETIMEDOUT') return true;
    // 500/502/503/504 are server-side transient errors
    if (typeof error?.status === 'number' && [500, 502, 503, 504].includes(error.status)) return true;
    return false;
}

// Rate-limit / quota errors: skip immediately to next provider, no retry needed
function isRateLimited(error) {
    return typeof error?.status === 'number' && error.status === 429;
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

async function requestGroqCompletion({ messages, temperature = 0.2, maxTokens = 700, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: GROQ_PRIMARY_MODEL,
                messages,
                temperature,
                max_completion_tokens: maxTokens,
                top_p: 1,
                stream: false,
                stop: null
            }),
            signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(payload?.error?.message || `Groq error: HTTP ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        const content = payload?.choices?.[0]?.message?.content;
        if (isBlankResponse(content)) {
            const error = new Error('Groq returned an empty response');
            error.status = 204;
            throw error;
        }

        return content.trim();
    } finally {
        clearTimeout(timeout);
    }
}

async function requestMistralCompletion({ messages, temperature = 0.2, maxTokens = 700, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${MISTRAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages,
                temperature,
                max_tokens: maxTokens
            }),
            signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(payload?.message || `Mistral error: HTTP ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        const content = payload?.choices?.[0]?.message?.content;
        if (isBlankResponse(content)) {
            const error = new Error('Mistral returned an empty response');
            error.status = 204;
            throw error;
        }

        return content.trim();
    } finally {
        clearTimeout(timeout);
    }
}

async function generateResponse(prompt, options = {}) {
    if (!GROQ_API_KEY && !MISTRAL_API_KEY && !OPENROUTER_API_KEY) {
        throw new Error('No LLM API key configured (GROQ_API_KEY, MISTRAL_API_KEY, or OPENROUTER_API_KEY)');
    }

    if (!OPENROUTER_API_KEY) {
        console.warn('[LLM] OPENROUTER_API_KEY is not set, Groq-only mode enabled.');
    }

    if (!GROQ_API_KEY) {
        console.warn('[LLM] GROQ_API_KEY is not set, using Mistral/OpenRouter fallback chain.');
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

    if (GROQ_API_KEY) {
        for (let attempt = 1; attempt <= MAX_GROQ_RETRIES; attempt++) {
            try {
                const content = await requestGroqCompletion({
                    messages,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                    timeoutMs: options.timeoutMs
                });
                console.info(`[LLM] Success with Groq model: ${GROQ_PRIMARY_MODEL} (attempt ${attempt})`);
                return content;
            } catch (error) {
                failures.push({ provider: 'groq', model: GROQ_PRIMARY_MODEL, attempt, error: error.message, status: error.status || null });

                if (isRateLimited(error)) break; // Skip immediately, no point retrying
                const retryable = shouldRetry(error) || error.message === 'Groq returned an empty response';
                const hasRemainingAttempts = attempt < MAX_GROQ_RETRIES;

                if (retryable && hasRemainingAttempts) {
                    continue;
                }

                break;
            }
        }
    }

    // Try Mistral API (direct, uses MISTRAL_API_KEY)
    if (MISTRAL_API_KEY) {
        for (let attempt = 1; attempt <= MAX_GROQ_RETRIES; attempt++) {
            try {
                const content = await requestMistralCompletion({
                    messages,
                    temperature: options.temperature,
                    maxTokens: options.maxTokens,
                    timeoutMs: options.timeoutMs
                });
                console.info(`[LLM] Success with Mistral model: ${MISTRAL_MODEL} (attempt ${attempt})`);
                return content;
            } catch (error) {
                failures.push({ provider: 'mistral', model: MISTRAL_MODEL, attempt, error: error.message, status: error.status || null });

                if (isRateLimited(error)) break; // Skip immediately, quota exhausted
                const retryable = shouldRetry(error) || error.message === 'Mistral returned an empty response';
                const hasRemainingAttempts = attempt < MAX_GROQ_RETRIES;

                if (retryable && hasRemainingAttempts) {
                    continue;
                }

                break;
            }
        }
    }

    if (!OPENROUTER_API_KEY) {
        const error = new Error('All configured LLM providers failed (Groq, Mistral). Set OPENROUTER_API_KEY for additional fallback.');
        error.failures = failures;
        throw error;
    }

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
                failures.push({ provider: 'openrouter', model, attempt, error: error.message, status: error.status || null });

                const retryable = shouldRetry(error) || error.message === 'OpenRouter returned an empty response';
                const hasRemainingAttempts = attempt < MAX_RETRIES_PER_MODEL;

                if (retryable && hasRemainingAttempts) {
                    continue;
                }

                break;
            }
        }
    }

    const error = new Error('All LLM providers failed (Groq, Mistral, OpenRouter)');
    error.failures = failures;
    throw error;
}

module.exports = {
    generateResponse,
    MODEL_CASCADE
};

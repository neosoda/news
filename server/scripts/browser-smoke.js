// Real browser E2E smoke test against an isolated fixture server, using Node 22 CDP WebSocket.
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(fn, description, timeout = 20000) {
    const end = Date.now() + timeout;
    let lastError;
    while (Date.now() < end) {
        try {
            const result = await fn();
            if (result) return result;
        } catch (error) {
            lastError = error;
        }
        await delay(150);
    }
    throw new Error(`Timeout: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}

async function main() {
    const dir = mkdtempSync(join(tmpdir(), 'newsai-chrome-'));
    const screenshots = '/tmp/newsai-browser-screenshots';
    mkdirSync(screenshots, { recursive: true });

    const bin = ['google-chrome', 'chromium', 'chromium-browser'].find(
        (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0
    );
    assert.ok(bin, 'Chromium or Google Chrome is required');

    const fixtureEnv = { ...process.env };
    if (!fixtureEnv.SQLITE_URL) {
        fixtureEnv.SQLITE_URL = `file:${join(dir, 'fixture.db').replace(/\\/g, '/')}`;
        const serverDir = join(__dirname, '..');
        const push = spawnSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
            cwd: serverDir,
            env: fixtureEnv,
            stdio: 'inherit'
        });
        assert.equal(push.status, 0, 'Failed to initialize isolated fixture SQLite database');
    }

    const app = spawn(process.execPath, [join(__dirname, 'browser-fixture.js')], {
        env: fixtureEnv,
        stdio: 'inherit'
    });
    const chrome = spawn(
        bin,
        [
            '--headless=new',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-background-networking',
            '--remote-debugging-port=0',
            `--user-data-dir=${dir}`,
            'about:blank'
        ],
        { stdio: 'ignore' }
    );

    let ws;
    const runtimeExceptions = [];

    try {
        await until(async () => (await fetch('http://127.0.0.1:4179/api/health')).ok, 'fixture server');
        const port = await until(
            () => existsSync(join(dir, 'DevToolsActivePort')) && readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0],
            'Chrome port'
        );
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const target = targets.find((item) => item.type === 'page');
        assert.ok(target, 'No Chrome page target found');

        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', reject, { once: true });
        });

        let seq = 0;
        const pending = new Map();
        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.exceptionThrown') {
                runtimeExceptions.push(msg.params?.exceptionDetails?.text || 'Uncaught exception');
                return;
            }
            const entry = pending.get(msg.id);
            if (entry) {
                pending.delete(msg.id);
                if (msg.error) entry.reject(new Error(msg.error.message));
                else entry.resolve(msg.result);
            }
        });

        const cdp = (method, params = {}) =>
            new Promise((resolve, reject) => {
                const id = ++seq;
                pending.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });

        const evaluate = async (expression) => {
            const result = await cdp('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true
            });
            if (result.exceptionDetails) {
                throw new Error(result.exceptionDetails.text);
            }
            return result.result.value;
        };

        const waitText = (text) =>
            until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), `text: ${text}`);

        const nav = async (routePath) => {
            const url = `http://127.0.0.1:4179${routePath}`;
            await cdp('Page.navigate', { url });
            await until(
                () => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === "complete"`),
                `navigation ${routePath}`
            );
        };

        const shot = async (name) => {
            await delay(120);
            const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            writeFileSync(join(screenshots, `${name}.png`), Buffer.from(result.data, 'base64'));
        };

        await cdp('Page.enable');
        await cdp('Runtime.enable');
        await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

        // 1. Home page — verify light/dark theme init (no FOUC), artwork, featured Korben badge, category counts
        await nav('/');
        await waitText('Microsoft Azure Kubernetes cluster migration');
        assert.equal(await evaluate('Boolean(document.documentElement.dataset.theme)'), true, 'theme dataset initialized');
        assert.equal(await evaluate('document.querySelectorAll("[data-article-artwork]").length >= 3'), true, 'artwork on every card');
        await waitText('À surveiller');
        await shot('home-light-desktop');

        // Toggle to dark mode and verify persistence
        await evaluate('document.querySelector("button.theme-toggle").click()');
        await until(() => evaluate('document.documentElement.dataset.theme === "dark" && localStorage.getItem("newsai-theme") === "dark"'), 'dark mode persisted');
        await shot('home-dark-desktop');

        // 2. Bookmarks & local history workflow
        await until(() => evaluate('Boolean(document.querySelector("article a[href=\\"https://example.com/article/1\\"]"))'), 'fixture article');
        await evaluate('document.querySelector("article a[href=\\"https://example.com/article/1\\"]").closest("article").querySelector("button[aria-label=\\"Ajouter aux favoris\\"]").click()');
        await until(() => evaluate('JSON.parse(localStorage.getItem("newsai-bookmarks-v1") || "[]").length === 1'), 'bookmark persisted');

        await nav('/bookmarks');
        await waitText('Microsoft Azure Kubernetes cluster migration');
        await evaluate('(() => { const a = document.querySelector("main a[href=\\"https://example.com/article/1\\"]"); a.addEventListener("click", (e) => e.preventDefault(), { once: true }); a.click(); })()');
        await until(() => evaluate('JSON.parse(localStorage.getItem("newsai-opened-articles-v1") || "[]").length === 1'), 'history persisted');

        await nav('/history');
        await waitText('Microsoft Azure Kubernetes cluster migration');

        // 3. Multi-term search + URL filters + atomic reset
        await nav('/?q=Azure&period=24h');
        await waitText('Microsoft Azure Kubernetes cluster migration');
        await until(
            () => evaluate('!document.querySelector("main section[aria-label=\\"Actualités\\"]")?.innerText.includes("Fixture CERT advisory")'),
            'filtered results'
        );

        // 4. Hidden source preferences
        await nav('/');
        await waitText('Microsoft Azure Kubernetes cluster migration');
        await until(() => evaluate('Boolean(document.querySelector("main details"))'), 'source preferences control');
        await evaluate('document.querySelector("main details").open = true');
        await until(
            () => evaluate('Boolean([...document.querySelectorAll("label")].find((x) => x.textContent.trim() === "Fixture Technology" && x.querySelector("input[type=checkbox]")))'),
            'source preferences checkbox'
        );
        await evaluate('(() => { const label = [...document.querySelectorAll("label")].find((x) => x.textContent.trim() === "Fixture Technology" && x.querySelector("input[type=checkbox]")); label.closest("details").open = true; label.querySelector("input").click(); })()');
        await until(
            () => evaluate('JSON.parse(localStorage.getItem("newsai-hidden-sources-v1") || "[]").length === 1 && !document.querySelector("main section[aria-label=\\"Actualités\\"] a[href=\\"https://example.com/article/1\\"]")'),
            'source hidden'
        );
        await evaluate('localStorage.removeItem("newsai-hidden-sources-v1")');

        // 5. Editorial dossiers
        await nav('/editorial');
        await waitText('2 sources');
        await shot('editorial-desktop');

        // 6. Cyber Radar — KEV + ransomware filter + CERT-FR CVE KEV badge
        await nav('/cyber');
        await waitText('ExampleVendor');
        await waitText('CloudCore');
        await waitText('Fixture CERT advisory');
        await waitText('CVE-2026-12345');
        await shot('cyber-desktop');
        await evaluate('([...document.querySelectorAll("button")].find((b) => b.textContent.includes("Rançongiciel connu"))).click()');
        await until(() => evaluate('document.body.innerText.includes("ExampleVendor") && !document.body.innerText.includes("CloudCore")'), 'ransomware filter applied');

        // 7. Source Observatory
        await nav('/observatory');
        await waitText('Fixture Technology');
        await shot('observatory-desktop');

        // 8. Breaches page (isolated from main feed)
        await nav('/breaches');
        await waitText('Fuite confirmée chez ExempleCorp');
        await shot('breaches-desktop');

        // 9. Archived Brief edition & French singularization
        await nav('/daily-brief');
        await until(() => evaluate('Boolean(document.querySelector("option[value=\\"2026-01-01\\"]"))'), 'archive option');
        await evaluate('(() => { const el = document.querySelector("select"); el.value = "2026-01-01"; el.dispatchEvent(new Event("change", { bubbles: true })); })()');
        await waitText('Fixture edition');
        await waitText('1 article analysé');
        await shot('brief-desktop');

        // 10. Responsive checks (390px and 768px) with horizontal overflow assertion
        for (const width of [390, 768]) {
            await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
            await nav('/');
            await waitText('Microsoft Azure Kubernetes cluster migration');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, `horizontal overflow on / at ${width}`);
            await shot(`home-${width}`);

            await nav('/cyber');
            await waitText('ExampleVendor');
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, `horizontal overflow on /cyber at ${width}`);
            await shot(`cyber-${width}`);
        }

        assert.deepEqual(runtimeExceptions, [], `Unexpected browser runtime exceptions: ${runtimeExceptions.join('; ')}`);
        console.log('PASS: home (light+dark, artwork, Korben), search, bookmarks, local history, hidden sources, dossiers, Cyber Radar + ransomware filter, source observatory, breaches, archived brief, responsive 390/768/1440 px, 0 runtime exceptions');
    } finally {
        ws?.close();
        app.kill();
        chrome.kill();
        await delay(500);
        rmSync(dir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

/**
 * HomeoIntelligence - SWARM Crawler (Parallel Multi-Agent)
 *
 * Runs N concurrent Playwright browser workers, each pulling URLs
 * from a shared queue. N×faster than sequential scraping.
 *
 * Usage:
 *   node scraper-node/swarm_crawl.js [workers] [delay]
 *
 *   workers: number of concurrent browsers (default: 6)
 *   delay:   ms between each worker's requests (default: 1000)
 *
 * Examples:
 *   node scraper-node/swarm_crawl.js          # 6 workers, 1s delay
 *   node scraper-node/swarm_crawl.js 10 500   # 10 workers, 0.5s delay
 *   node scraper-node/swarm_crawl.js 4 2000   # 4 workers, 2s delay (polite)
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const NUM_WORKERS   = parseInt(process.argv[2]) || 6;
const WORKER_DELAY  = parseInt(process.argv[3]) || 1000; // ms between each worker's page loads
const BASE_URL      = 'https://www.homeoint.org/books/boericmm';
const RAW_DIR       = path.join(__dirname, '..', 'data', 'raw');
const STATE_FILE    = path.join(RAW_DIR, 'crawl_all_urls.json');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ─── Get already-scraped URLs ─────────────────────────────────────────────────
function getScrapedUrls() {
    const urls = new Set();
    if (!fs.existsSync(RAW_DIR)) return urls;
    for (const f of fs.readdirSync(RAW_DIR)) {
        if (!f.startsWith('raw_') || !f.endsWith('.json')) continue;
        try {
            const d = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
            if (d.url) urls.add(d.url);
        } catch {}
    }
    return urls;
}

// ─── Discover all letter pages and their remedy URLs ─────────────────────────
async function discoverAllUrls() {
    // If we have a saved state, use it
    if (fs.existsSync(STATE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const all = Object.values(saved.byLetter || {}).flat();
        console.log(`  ✅ Loaded ${all.length} URLs from previous discovery cache`);
        return [...new Set(all)];
    }

    console.log('  🔍 Discovering all remedy URLs from scratch...');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();

    // Get index page for letter links
    await page.goto(`${BASE_URL}/index.htm`, { waitUntil: 'networkidle', timeout: 45000 });
    const letterLinks = await page.evaluate((baseUrl) =>
        Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h && /\/[a-z]\.htm$/.test(h) && h.includes('boericmm'))
    , BASE_URL);
    await browser.close();

    const letterPages = [...new Set(letterLinks)].sort();
    console.log(`  📚 Found ${letterPages.length} letter pages`);

    // Discover remedy URLs from each letter page using multiple browsers in parallel
    const DISCOVERY_WORKERS = Math.min(4, letterPages.length);
    const letterQueue = [...letterPages];
    const byLetter = {};

    const discoverWorker = async (workerId) => {
        const browser = await chromium.launch({ headless: true });
        const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: getUA() });
        const page = await ctx.newPage();

        while (letterQueue.length > 0) {
            const letterPage = letterQueue.shift();
            if (!letterPage) break;
            const letter = letterPage.split('/').pop().replace('.htm', '');
            try {
                await page.goto(letterPage, { waitUntil: 'networkidle', timeout: 30000 });
                const allLinks = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
                );
                const remedyUrls = [...new Set(allLinks.filter(href => {
                    const fn = href.split('/').pop();
                    return fn.endsWith('.htm') && fn.length > 5 &&
                           !fn.match(/^[a-z]\.htm$/) && !fn.includes('index') &&
                           href.includes('/books/boericmm/');
                }))];
                byLetter[letter] = remedyUrls;
                console.log(`  [W${workerId}] ${letter.toUpperCase()}: ${remedyUrls.length} remedy URLs`);
            } catch (e) {
                console.log(`  [W${workerId}] ⚠️  Error on ${letter}: ${e.message.substring(0, 60)}`);
                byLetter[letter] = [];
            }
            await sleep(500);
        }
        await browser.close();
    };

    await Promise.all(Array.from({ length: DISCOVERY_WORKERS }, (_, i) => discoverWorker(i + 1)));

    const allUrls = [...new Set(Object.values(byLetter).flat())];
    const total = allUrls.length;

    // Save for next time
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        discoveredAt: new Date().toISOString(),
        byLetter,
        total,
    }, null, 2));

    console.log(`  💾 Saved discovery cache: ${total} total URLs\n`);
    return allUrls;
}

// ─── Worker: scrapes URLs from shared queue ───────────────────────────────────
async function worker(workerId, queue, stats, delay) {
    const browser = await chromium.launch({ headless: true });

    while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;

        const ua = getUA();
        const ctx = await browser.newContext({
            userAgent: ua,
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',
            ignoreHTTPSErrors: true,
        });

        // Block images/fonts for speed
        await ctx.route('**/*', route => {
            if (['image', 'font', 'media'].includes(route.request().resourceType())) {
                route.abort();
            } else {
                route.continue();
            }
        });

        const page = await ctx.newPage();
        const current = stats.total - queue.length;

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(300 + Math.random() * 700); // minimal human-like delay

            const extracted = await page.evaluate(() => {
                ['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header'].forEach(t => {
                    document.querySelectorAll(t).forEach(el => el.remove());
                });
                const mainEl = document.querySelector('main, article, .content, #content, body');
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => ({ text: a.textContent.trim(), href: a.href }))
                    .filter(l => l.href.startsWith('http') && l.text.length > 2)
                    .slice(0, 50);
                return {
                    title: document.title,
                    h1: document.querySelector('h1')?.textContent?.trim() || '',
                    metaDesc: document.querySelector('meta[name="description"]')?.content || '',
                    content: mainEl?.innerText?.trim() || '',
                    links,
                };
            });

            const data = {
                url,
                title: extracted.title,
                h1: extracted.h1,
                metaDescription: extracted.metaDesc,
                timestamp: new Date().toISOString(),
                content: extracted.content,
                links: extracted.links,
                userAgent: ua,
            };

            const filename = `raw_${Date.now()}_w${workerId}.json`;
            const outputPath = path.join(RAW_DIR, filename);
            fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

            stats.success++;
            const pct = Math.round((current / stats.total) * 100);
            console.log(`[W${workerId}] ✅ [${current}/${stats.total} ${pct}%] ${url.split('/').pop()} (${extracted.content.length} chars)`);

        } catch (err) {
            stats.errors++;
            console.log(`[W${workerId}] ❌ [${current}/${stats.total}] ${url.split('/').pop()} — ${err.message.substring(0, 60)}`);
        } finally {
            await ctx.close();
        }

        // Per-worker rate limiting (staggered automatically by different start times)
        if (queue.length > 0) {
            await sleep(delay + Math.random() * delay * 0.5);
        }
    }

    await browser.close();
    console.log(`[W${workerId}] 🏁 Worker done`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const startTime = Date.now();
    console.log('═'.repeat(65));
    console.log('  🐝 HomeoIntelligence - SWARM Crawler (Parallel Multi-Agent)');
    console.log('═'.repeat(65));
    console.log(`  Workers:    ${NUM_WORKERS} concurrent browser instances`);
    console.log(`  Delay/worker: ${WORKER_DELAY}ms between requests`);
    console.log(`  Expected speedup: ~${NUM_WORKERS}× faster than sequential\n`);

    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

    // Step 1: Discover all remedy URLs
    console.log('📚 Step 1: Getting all remedy URLs...');
    const allUrls = await discoverAllUrls();

    // Step 2: Filter out already-scraped URLs
    const scraped = getScrapedUrls();
    const toScrape = allUrls.filter(u => !scraped.has(u));
    console.log(`\n  Total discovered:  ${allUrls.length}`);
    console.log(`  Already scraped:   ${scraped.size}`);
    console.log(`  Remaining to scrape: ${toScrape.length}\n`);

    if (toScrape.length === 0) {
        console.log('✅ All URLs already scraped! Running fast processing...');
    } else {
        // Step 3: Swarm scrape with N parallel workers
        console.log(`🕷️  Step 3: Swarm scraping ${toScrape.length} URLs with ${NUM_WORKERS} workers...\n`);

        const queue = [...toScrape]; // shared mutable queue
        const stats = { total: toScrape.length, success: 0, errors: 0 };

        // Stagger worker starts by 200ms to avoid all hitting the server simultaneously
        const workerPromises = Array.from({ length: NUM_WORKERS }, async (_, i) => {
            await sleep(i * 300); // stagger starts
            return worker(i + 1, queue, stats, WORKER_DELAY);
        });

        await Promise.all(workerPromises);

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        console.log(`\n  ✅ Swarm scraping complete!`);
        console.log(`  Success: ${stats.success} | Errors: ${stats.errors} | Time: ${mins}m ${secs}s`);
        console.log(`  Speed: ~${Math.round(toScrape.length / Math.max(elapsed / 60, 1))} URLs/min\n`);
    }

    // Step 4: Fast rule-based batch processing
    console.log('⚡ Step 4: Fast batch processing with rule-based extraction...\n');
    try {
        execSync('node main.js --process-all --fast', {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit',
        });
    } catch (e) {
        console.error('Processing error:', e.message);
    }

    // Summary
    const rawCount = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('raw_') && f.endsWith('.json')).length;
    const processedDir = path.join(__dirname, '..', 'data', 'processed');
    const processedCount = fs.existsSync(processedDir)
        ? fs.readdirSync(processedDir).filter(f => f.endsWith('.json')).length : 0;

    const totalElapsed = Math.round((Date.now() - startTime) / 1000);
    const tm = Math.floor(totalElapsed / 60);
    const ts = totalElapsed % 60;

    console.log('\n' + '═'.repeat(65));
    console.log('  ✅ SWARM CRAWL COMPLETE');
    console.log('═'.repeat(65));
    console.log(`  Raw files:    ${rawCount}`);
    console.log(`  Processed:    ${processedCount}`);
    console.log(`  Total time:   ${tm}m ${ts}s`);
    console.log('\n  Next step (optional overnight AI enrichment):');
    console.log('  python3 engine-python/enrich_with_ollama.py');
    console.log('═'.repeat(65));
}

main().catch(console.error);

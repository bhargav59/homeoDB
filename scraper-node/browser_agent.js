/**
 * HomeoIntelligence - Browser Agent (Playwright)
 * Advanced headless browser scraper with:
 *   - Stealth user-agent rotation
 *   - Proxy support (HTTP/SOCKS5)
 *   - Smart content extraction (removes boilerplate)
 *   - Configurable wait strategies
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const PROXY_URL = process.env.PROXY_URL || null; // e.g. "http://user:pass@proxy.example.com:8080"

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Core Scraper ───────────────────────────────────────────────────────────

/**
 * Scrape a single URL with stealth and anti-detection measures.
 * @param {string} url - The URL to scrape.
 * @param {object} options - Optional configuration.
 * @param {string} options.proxy - Proxy URL override.
 * @param {number} options.timeout - Navigation timeout in ms (default 60000).
 * @param {boolean} options.screenshot - Whether to take a screenshot (default false).
 * @returns {object} Scraped data object.
 */
async function scrapeUrl(url, options = {}) {
    const ua = getRandomUA();
    console.log(`[Browser Agent] Navigating to: ${url}`);
    console.log(`[Browser Agent] User-Agent: ${ua.substring(0, 50)}...`);

    const launchOptions = { headless: true };
    
    // Proxy support
    const proxyUrl = options.proxy || PROXY_URL;
    if (proxyUrl) {
        console.log(`[Browser Agent] Using proxy: ${proxyUrl.replace(/\/\/.*@/, '//***@')}`);
        launchOptions.proxy = { server: proxyUrl };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        userAgent: ua,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreHTTPSErrors: true,
        // Block unnecessary resource types for speed
        bypassCSP: true,
    });

    // Block images, fonts, and tracking scripts for faster scraping
    await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
            route.abort();
        } else {
            route.continue();
        }
    });

    const page = await context.newPage();
    const timeout = options.timeout || 60000;

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout });

        // Human-like delay (randomized 1-3 seconds)
        await sleep(1000 + Math.random() * 2000);

        // Scroll down to trigger lazy-loaded content
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
                // Safety timeout
                setTimeout(() => { clearInterval(timer); resolve(); }, 5000);
            });
        });

        // Wait a moment for dynamically loaded content
        await sleep(500);

        // Smart content extraction
        const extractedData = await page.evaluate(() => {
            // Remove noise elements
            const noiseSelectors = [
                'script', 'style', 'noscript', 'iframe',
                'nav', 'footer', 'header',
                '.cookie-banner', '.popup', '.modal', '.overlay',
                '.sidebar', '.advertisement', '.ad', '.ads',
                '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
                '.social-share', '.comments', '.related-posts',
            ];
            noiseSelectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => el.remove());
            });

            // Try to find the main content area
            const mainEl = document.querySelector('main, article, .content, .post-content, .entry-content, #content, .article-body')
                || document.querySelector('body');
            
            const title = document.title;
            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
            const h1 = document.querySelector('h1')?.textContent?.trim() || '';
            const content = mainEl.innerText.trim();

            // Extract all links for potential crawling
            const links = Array.from(document.querySelectorAll('a[href]'))
                .map(a => ({ text: a.textContent.trim(), href: a.href }))
                .filter(l => l.href.startsWith('http') && l.text.length > 2)
                .slice(0, 100); // Cap at 100 links

            return { title, metaDesc, h1, content, links };
        });

        // Optional screenshot
        if (options.screenshot) {
            const screenshotPath = path.join(__dirname, '../data/raw', `screenshot_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`[Browser Agent] Screenshot saved to: ${screenshotPath}`);
        }

        const data = {
            url,
            title: extractedData.title,
            h1: extractedData.h1,
            metaDescription: extractedData.metaDesc,
            timestamp: new Date().toISOString(),
            content: extractedData.content,
            links: extractedData.links,
            userAgent: ua,
        };

        const filename = `raw_${Date.now()}.json`;
        const outputPath = path.join(__dirname, '../data/raw', filename);
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

        console.log(`[Browser Agent] ✅ Scraped ${data.content.length} chars, ${data.links.length} links`);
        console.log(`[Browser Agent] Saved to: ${outputPath}`);
        return data;

    } catch (error) {
        console.error(`[Browser Agent] ❌ Error scraping ${url}:`, error.message);
        throw error;
    } finally {
        await browser.close();
    }
}


/**
 * Scrape multiple URLs sequentially with a delay between each.
 * @param {string[]} urls - Array of URLs to scrape.
 * @param {number} delayMs - Delay between requests in ms (default 3000).
 */
async function scrapeMultiple(urls, delayMs = 3000) {
    console.log(`\n[Browser Agent] Starting batch scrape of ${urls.length} URLs\n`);
    const results = [];
    for (let i = 0; i < urls.length; i++) {
        console.log(`\n--- [${i + 1}/${urls.length}] ---`);
        try {
            const data = await scrapeUrl(urls[i]);
            results.push({ url: urls[i], status: 'success', file: data });
        } catch (err) {
            results.push({ url: urls[i], status: 'error', error: err.message });
        }
        if (i < urls.length - 1) {
            const jitteredDelay = delayMs + Math.random() * 2000;
            console.log(`[Browser Agent] Waiting ${Math.round(jitteredDelay / 1000)}s before next request...`);
            await sleep(jitteredDelay);
        }
    }
    console.log(`\n[Browser Agent] Batch complete. Success: ${results.filter(r => r.status === 'success').length}/${urls.length}`);
    return results;
}


// ─── CLI Entry Point ────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage:');
        console.log('  Single URL:    node browser_agent.js <url>');
        console.log('  Multiple URLs: node browser_agent.js <url1> <url2> <url3>');
        console.log('');
        console.log('Environment Variables:');
        console.log('  PROXY_URL      - HTTP/SOCKS5 proxy (e.g. http://user:pass@host:port)');
        process.exit(0);
    }
    
    if (args.length === 1) {
        scrapeUrl(args[0]);
    } else {
        scrapeMultiple(args);
    }
}

module.exports = { scrapeUrl, scrapeMultiple };

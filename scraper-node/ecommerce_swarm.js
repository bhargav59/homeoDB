/**
 * HomeoIntelligence - ECOMMERCE SWARM
 * Handles modern paginated stores (SBL, Reckeweg, Wheezal)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGETS_FILE = path.join(__dirname, 'ecom_targets.json');
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const WORKERS_PER_SITE = 4;
const DELAY = 2000;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15'
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

async function discoverEcommerceLinks(target) {
    console.log(`[${target.id}] 🔍 Discovering products from ${target.indexUrl}`);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: getUA() });
    
    let allLinks = new Set();
    try {
        const page = await ctx.newPage();
        
        let currentUrl = target.indexUrl;
        let pagesCrawled = 0;
        
        while (currentUrl && pagesCrawled < 50) { // Limit to 50 paginated pages
            console.log(`[${target.id}] Scraping grid page: ${currentUrl}`);
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            
            // Auto-scroll to load lazy images/links
            await page.evaluate(async () => {
                await new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 300;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if(totalHeight >= document.body.scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 50);
                    setTimeout(() => resolve(), 3000); // 3s max scroll
                });
            });

            // Extract generic product links (usually contain /product/ or /collections/)
            const links = await page.evaluate(() => 
                Array.from(document.querySelectorAll('a[href]'))
                     .map(a => a.href)
                     .filter(href => href.includes('/product') || href.includes('/item') || href.includes('-dilution'))
            );
            
            links.forEach(l => allLinks.add(l.split('?')[0].split('#')[0]));
            pagesCrawled++;
            
            // Try to find a 'Next' page link (common pagination patterns)
            const nextUrl = await page.evaluate(() => {
                const nextBtn = Array.from(document.querySelectorAll('a, button')).find(el => {
                    const t = el.innerText.toLowerCase().replace(/[^a-z]/g, '');
                    return t === 'next' || t === 'nextpage' || el.className.includes('next');
                });
                return nextBtn ? nextBtn.href : null;
            });
            
            currentUrl = nextUrl && nextUrl.startsWith('http') ? nextUrl : null;
            await sleep(1000);
        }
        
    } catch (e) {
        console.error(`[${target.id}] ❌ Discovery error: ${e.message.split('\\n')[0]}`);
    } finally {
        await browser.close();
    }
    
    const finalLinks = [...allLinks];
    console.log(`[${target.id}] ✅ Total discovered products: ${finalLinks.length}`);
    return finalLinks;
}

function getScrapedUrls() {
    const urls = new Set();
    if (!fs.existsSync(RAW_DIR)) return urls;
    for (const f of fs.readdirSync(RAW_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
            const d = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
            if (d.url) urls.add(d.url);
        } catch {}
    }
    return urls;
}

async function ecomWorker(targetId, workerId, queue, stats) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: getUA() });
    
    // Block rich media for speed
    await ctx.route('**/*', route => {
        if (['image', 'font', 'media'].includes(route.request().resourceType())) route.abort();
        else route.continue();
    });

    const page = await ctx.newPage();

    while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;
        const current = stats.total - queue.length;
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(500 + Math.random() * 1000); // polite delay for ecommerce
            
            const extracted = await page.evaluate(() => {
                // Remove header/footer noise
                ['script', 'style', 'nav', 'footer', 'header', 'iframe'].forEach(s => 
                    document.querySelectorAll(s).forEach(e => e.remove())
                );
                return {
                    title: document.title,
                    h1: document.querySelector('h1')?.innerText || '',
                    content: document.body.innerText.trim(),
                    // grab potential prices / sizes if visible
                    price: document.querySelector('.price, [id*="price"]')?.innerText || '',
                };
            });
            
            fs.writeFileSync(path.join(RAW_DIR, `raw_${Date.now()}_${targetId}_w${workerId}.json`), JSON.stringify({
                source_id: targetId,
                url,
                title: extracted.title,
                h1: extracted.h1,
                price: extracted.price,
                content: extracted.content,
                timestamp: new Date().toISOString()
            }, null, 2));
            
            stats.success++;
            const pct = Math.round((current / stats.total) * 100);
            console.log(`[${targetId}-W${workerId}] ✅ [${pct}%] Scraped product: ${url.split('/').pop()}`);
        } catch (e) {
            stats.errors++;
            console.log(`[${targetId}-W${workerId}] ❌ Failed: ${url.split('/').pop()} (${e.message.split('\\n')[0]})`);
        }
    }
    await browser.close();
}

async function runSwarmForTarget(target, scrapedUrls) {
    let links = [];
    const queueFile = path.join(__dirname, 'ecommerce_queue.json');
    if (fs.existsSync(queueFile)) {
        const q = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        if (q[target.id] && q[target.id].length > 0) {
            links = q[target.id];
            console.log(`[${target.id}] 📂 Loaded ${links.length} URLs from pre-fetched queue.`);
        }
    }

    if (links.length === 0) {
        links = await discoverEcommerceLinks(target);
    }

    const toScrape = links.filter(u => !scrapedUrls.has(u));
    
    console.log(`[${target.id}] 🚀 Starting swarm: ${toScrape.length} new URLs to scrape`);
    if (toScrape.length === 0) return;

    const queue = [...toScrape];
    const stats = { total: toScrape.length, success: 0, errors: 0 };
    
    const workers = Array.from({length: WORKERS_PER_SITE}, (_, i) => 
        ecomWorker(target.id, i+1, queue, stats)
    );
    
    await Promise.all(workers);
}

async function main() {
    console.log('═'.repeat(60));
    console.log(' 🛒 HomeoIntelligence - ECOMMERCE SWARM');
    console.log('═'.repeat(60));
    
    const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
    const scrapedUrls = getScrapedUrls();
    
    const swarmPromises = targets.map(t => runSwarmForTarget(t, scrapedUrls));
    await Promise.all(swarmPromises);
    
    console.log('\\n✅ ALL ECOMMERCE SWARMS COMPLETE!');
}

main().catch(console.error);

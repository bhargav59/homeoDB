/**
 * HomeoIntelligence - MULTI-DOMAIN SWARM 
 * 
 * Orchestrates concurrent swarms across multiple independent websites/repositories.
 * Reads configurations from targets.json and launches a dedicated worker pool for each.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGETS_FILE = path.join(__dirname, 'targets.json');
const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');

const WORKERS_PER_SITE = 5;
const DELAY = 1500;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

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

async function discoverLinksForTarget(target) {
    console.log(`[${target.id}] 🔍 Discovering links from ${target.indexUrl}`);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: getUA() });
    
    let allLinks = [];
    try {
        const page = await ctx.newPage();
        await page.goto(target.indexUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        let extractedLinks = await page.evaluate(() => 
            Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
        );
        
        // Check for A-Z letter index pages (e.g., a.htm, b.htm, a.php)
        const letterLinks = extractedLinks.filter(href => {
            const fileName = href.split('/').pop();
            return /^[a-z]\.htm(l)?$/i.test(fileName);
        });

        const regex = new RegExp(target.linkMatch);

        if (letterLinks.length > 0) {
            console.log(`[${target.id}] 📚 Found ${letterLinks.length} A-Z index pages. Traversing them...`);
            for (const letterUrl of new Set([...letterLinks].sort())) {
                try {
                    await page.goto(letterUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    const subLinks = await page.evaluate(() => 
                        Array.from(document.querySelectorAll('a[href]')).map(a => a.href)
                    );
                    const matching = subLinks.filter(href => regex.test(href) && !href.endsWith('index.htm') && !/^[a-z]\.htm(l)?$/i.test(href.split('/').pop()));
                    allLinks.push(...matching);
                } catch (e) {
                    console.log(`[${target.id}] ⚠️ Error reading ${letterUrl}: ${e.message.split('\n')[0]}`);
                }
            }
        } else {
            console.log(`[${target.id}] 📚 No A-Z pages found. Searching index directly...`);
            allLinks = extractedLinks.filter(href => regex.test(href) && !href.endsWith('index.htm') && !/^[a-z]\.htm(l)?$/i.test(href.split('/').pop()));
        }

        allLinks = [...new Set(allLinks)];
        console.log(`[${target.id}] ✅ Total discovered target URLs: ${allLinks.length}`);
    } catch (e) {
        console.error(`[${target.id}] ❌ Discovery error: ${e.message}`);
    } finally {
        await browser.close();
    }
    return allLinks;
}

async function worker(targetId, workerId, queue, stats) {
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
        
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(500 + Math.random() * 500);
            
            const extracted = await page.evaluate(() => {
                ['script', 'style', 'nav', 'footer', 'header', 'iframe'].forEach(s => 
                    document.querySelectorAll(s).forEach(e => e.remove())
                );
                return {
                    title: document.title,
                    h1: document.querySelector('h1')?.innerText || '',
                    content: document.body.innerText.trim()
                };
            });
            
            const filename = `raw_${Date.now()}_${targetId}_w${workerId}.json`;
            fs.writeFileSync(path.join(RAW_DIR, filename), JSON.stringify({
                source_id: targetId,
                url,
                title: extracted.title,
                h1: extracted.h1,
                content: extracted.content,
                timestamp: new Date().toISOString()
            }, null, 2));
            
            stats.success++;
            console.log(`[${targetId}-W${workerId}] ✅ Scraped ${url.split('/').pop()} (${extracted.content.length} chars)`);
        } catch (e) {
            stats.errors++;
            console.log(`[${targetId}-W${workerId}] ❌ Failed ${url.split('/').pop()}: ${e.message.split('\n')[0]}`);
        }
        await sleep(DELAY);
    }
    await browser.close();
}

async function runSwarmForTarget(target, scrapedUrls) {
    const links = await discoverLinksForTarget(target);
    const toScrape = links.filter(u => !scrapedUrls.has(u));
    
    console.log(`[${target.id}] 🚀 Starting swarm: ${toScrape.length} new URLs to scrape (${links.length - toScrape.length} already done)`);
    if (toScrape.length === 0) return;

    const queue = [...toScrape];
    const stats = { success: 0, errors: 0 };
    
    const workers = Array.from({length: WORKERS_PER_SITE}, (_, i) => 
        worker(target.id, i+1, queue, stats)
    );
    
    await Promise.all(workers);
    console.log(`[${target.id}] 🏁 Swarm complete. Success: ${stats.success}, Errors: ${stats.errors}`);
}

async function main() {
    console.log('═'.repeat(60));
    console.log(' 🌐 HomeoIntelligence - MULTI-DOMAIN SWARM ORCHESTRATOR');
    console.log('═'.repeat(60));
    
    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, {recursive: true});
    
    const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
    console.log(`Loaded ${targets.length} targets. Will run swarms concurrently!`);
    
    const scrapedUrls = getScrapedUrls();
    
    // Run swarms for all targets SIMULTANEOUSLY
    const swarmPromises = targets.map(t => runSwarmForTarget(t, scrapedUrls));
    await Promise.all(swarmPromises);
    
    console.log('\n✅ ALL MULTI-DOMAIN SWARMS COMPLETE!');
}

main().catch(console.error);

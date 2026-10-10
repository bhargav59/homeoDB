/**
 * Full Boericke Materia Medica Crawl
 * 
 * Discovers ALL remedy URLs from all 26 letter pages,
 * scrapes them sequentially with retry logic, then batch-processes
 * using rule-based extraction (fast, no Ollama needed).
 *
 * Usage: node scraper-node/full_crawl.js [max-per-letter] [delay-ms]
 *   max-per-letter: max remedies per letter (default: 999 = all)
 *   delay-ms: delay between requests (default: 4000)
 */

const { chromium } = require('playwright');
const { scrapeMultiple } = require('./browser_agent');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '../data/raw');
const MAX_PER_LETTER = parseInt(process.argv[2]) || 999;
const DELAY_MS = parseInt(process.argv[3]) || 4000;
const BASE_URL = 'https://www.homeoint.org/books/boericmm';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Get all already-scraped URLs to avoid re-scraping
function getScrapedUrls() {
    const urls = new Set();
    const files = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('raw_') && f.endsWith('.json'));
    for (const f of files) {
        try {
            const d = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
            if (d.url) urls.add(d.url);
        } catch(e) {}
    }
    return urls;
}

// Discover all remedy URLs from a letter page with retry
async function discoverLetterUrls(letterPage, maxUrls = 999) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();

    let urls = [];
    try {
        await page.goto(letterPage, { waitUntil: 'networkidle', timeout: 45000 });
        const allLinks = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
        );
        // Filter: remedy pages are like abies-n.htm, acon.htm (not single-char + .htm)
        const letter = letterPage.split('/').pop().replace('.htm', '');
        urls = allLinks
            .filter(href => {
                const filename = href.split('/').pop();
                return filename.endsWith('.htm') &&
                    filename.length > 5 &&
                    !filename.match(/^[a-z]\.htm$/) &&
                    !filename.includes('index') &&
                    href.includes('/books/boericmm/');
            })
            .slice(0, maxUrls);
        urls = [...new Set(urls)]; // deduplicate
    } catch(e) {
        console.log(`  [!] Error discovering ${letterPage}: ${e.message.substring(0,80)}`);
    } finally {
        await browser.close();
    }
    return urls;
}

async function main() {
    console.log('═'.repeat(60));
    console.log('  HomeoIntelligence - Full Boericke Materia Medica Crawl');
    console.log('═'.repeat(60));
    console.log(`  Max per letter: ${MAX_PER_LETTER === 999 ? 'ALL' : MAX_PER_LETTER}`);
    console.log(`  Delay: ${DELAY_MS}ms`);
    console.log('');

    // Step 1: Discover all letter pages
    console.log('📚 Step 1: Discovering all letter pages...');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/index.htm`, { waitUntil: 'networkidle', timeout: 45000 });
    const letterLinks = await page.evaluate((baseUrl) =>
        Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h && /\/[a-z]\.htm$/.test(h) && h.includes('boericmm'))
    , BASE_URL);
    await browser.close();

    const letterPages = [...new Set(letterLinks)].sort();
    console.log(`  Found ${letterPages.length} letter pages: ${letterPages.map(l => l.split('/').pop()).join(', ')}\n`);

    // Step 2: Discover all remedy URLs (skip already-discovered)
    const alreadyScrapedUrls = getScrapedUrls();
    console.log(`  Already scraped: ${alreadyScrapedUrls.size} URLs (will skip these)\n`);

    let allNewUrls = [];
    const allUrlsFile = path.join(RAW_DIR, 'crawl_all_urls.json');
    
    // Load previously discovered URLs if available
    let discoveredMap = {};
    if (fs.existsSync(allUrlsFile)) {
        const saved = JSON.parse(fs.readFileSync(allUrlsFile, 'utf8'));
        discoveredMap = saved.byLetter || {};
        const savedTotal = Object.values(discoveredMap).flat().length;
        console.log(`  Loaded ${savedTotal} previously discovered URLs`);
    }

    console.log('📚 Step 2: Discovering remedy URLs from each letter page...');
    for (const letterPage of letterPages) {
        const letter = letterPage.split('/').pop().replace('.htm', '');
        
        if (discoveredMap[letter]) {
            const newOnes = discoveredMap[letter].filter(u => !alreadyScrapedUrls.has(u));
            allNewUrls.push(...newOnes);
            console.log(`  ${letter.toUpperCase()}: ${discoveredMap[letter].length} known, ${newOnes.length} still need scraping`);
        } else {
            process.stdout.write(`  ${letter.toUpperCase()}: discovering...`);
            const urls = await discoverLetterUrls(letterPage, MAX_PER_LETTER);
            discoveredMap[letter] = urls;
            const newOnes = urls.filter(u => !alreadyScrapedUrls.has(u));
            allNewUrls.push(...newOnes);
            console.log(` ${urls.length} found, ${newOnes.length} new`);
            
            // Save progress after each letter
            fs.writeFileSync(allUrlsFile, JSON.stringify({ 
                discoveredAt: new Date().toISOString(), 
                byLetter: discoveredMap,
                total: Object.values(discoveredMap).flat().length
            }, null, 2));
            
            await sleep(2000); // brief pause between letter pages
        }
    }

    // Deduplicate
    allNewUrls = [...new Set(allNewUrls)];
    const totalDiscovered = Object.values(discoveredMap).flat().length;
    
    console.log(`\n  📊 Total discovered: ${totalDiscovered}`);
    console.log(`  📊 Already scraped: ${alreadyScrapedUrls.size}`);
    console.log(`  📊 Need scraping: ${allNewUrls.length}\n`);

    if (allNewUrls.length === 0) {
        console.log('✅ All URLs already scraped! Proceeding to processing...');
    } else {
        // Step 3: Scrape all new URLs
        console.log(`🕷️  Step 3: Scraping ${allNewUrls.length} remedy pages...\n`);
        await scrapeMultiple(allNewUrls, DELAY_MS);
        console.log('\n✅ Scraping complete!\n');
    }

    // Step 4: Fast rule-based batch processing of ALL unprocessed files
    console.log('⚡ Step 4: Fast batch processing with rule-based extraction...\n');
    execSync('node main.js --process-all --fast', {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
        env: {
            ...process.env,
            // Force rule-based by unsetting Ollama during fast mode
            // (main.js --fast flag will be handled below)
        }
    });

    // Summary
    const rawCount = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('raw_') && f.endsWith('.json')).length;
    const processedCount = fs.readdirSync(path.join(__dirname, '../data/processed')).filter(f => f.endsWith('.json')).length;
    
    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ FULL CRAWL COMPLETE');
    console.log('═'.repeat(60));
    console.log(`  Raw files: ${rawCount}`);
    console.log(`  Processed: ${processedCount}`);
    console.log('');
    console.log('  Run Ollama enrichment overnight:');
    console.log('  node enrich_with_ollama.js');
    console.log('═'.repeat(60));
}

main().catch(console.error);

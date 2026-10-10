/**
 * HomeoIntelligence - Site Crawler
 * Discovers all remedy URLs from a listing/index page,
 * then batch-scrapes them using the browser_agent.
 * 
 * This replaces the Scrapy spider with a Node.js equivalent,
 * keeping the entire scraping stack in one language.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { scrapeMultiple } = require('./browser_agent');

// ─── Crawler Configuration ──────────────────────────────────────────────────

const CRAWL_CONFIGS = {
    // Vithoulkas Materia Medica index page
    'vithoulkas': {
        indexUrl: 'https://www.vithoulkas.com/learning-center/materia-medica',
        linkSelector: 'a[href*="/materia-medica/"]',
        linkFilter: (href) => !href.endsWith('/materia-medica') && !href.endsWith('/materia-medica/'),
        maxPages: 50,
        isMultiLevel: false,
    },
    // Boericke's Materia Medica — two-level: index → letter pages → remedy pages
    'boericke': {
        indexUrl: 'https://www.homeoint.org/books/boericmm/index.htm',
        linkSelector: 'a[href]',
        // First level: pick only letter index pages (a.htm, b.htm, etc.)
        linkFilter: (href) => {
            const filename = href.split('/').pop();
            return /^[a-z]\.htm$/.test(filename);
        },
        // Second level: from each letter page, pick remedy sub-pages
        secondLevelSelector: 'a[href]',
        secondLevelFilter: (href) => {
            const filename = href.split('/').pop();
            // Remedy pages are like "acon.htm", "agar.htm" — more than 1 char before .htm
            return filename.endsWith('.htm') && filename.length > 5 && !/^[a-z]\.htm$/.test(filename) && !filename.includes('index');
        },
        maxPages: 100,
        isMultiLevel: true,
    },
    // Clarke's Dictionary of Materia Medica
    'clarke': {
        indexUrl: 'https://www.homeoint.org/clarke/index.htm',
        linkSelector: 'a[href]',
        linkFilter: (href) => href.endsWith('.htm') && !href.includes('index'),
        maxPages: 100,
        isMultiLevel: false,
    }
};


/**
 * Discover all remedy URLs from an index/listing page.
 * @param {string} indexUrl - The index page URL.
 * @param {string} linkSelector - CSS selector for remedy links.
 * @param {function} linkFilter - Filter function for discovered hrefs.
 * @param {number} maxPages - Max pages to return.
 * @returns {string[]} Array of remedy URLs.
 */
async function discoverUrls(indexUrl, linkSelector, linkFilter, maxPages = 50) {
    console.log(`[Crawler] Discovering URLs from: ${indexUrl}`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    
    try {
        await page.goto(indexUrl, { waitUntil: 'networkidle', timeout: 60000 });
        
        const links = await page.evaluate((selector) => {
            return Array.from(document.querySelectorAll(selector)).map(a => ({
                text: a.textContent.trim(),
                href: a.href,
            }));
        }, linkSelector);
        
        await browser.close();
        
        // Filter and deduplicate
        const filteredUrls = [...new Set(
            links
                .map(l => l.href)
                .filter(linkFilter)
        )].slice(0, maxPages);
        
        console.log(`[Crawler] Discovered ${filteredUrls.length} remedy URLs (max ${maxPages})`);
        return filteredUrls;
        
    } catch (error) {
        console.error(`[Crawler] ❌ Error discovering URLs:`, error.message);
        await browser.close();
        return [];
    }
}


/**
 * Run a full crawl: discover URLs, then scrape each one.
 * @param {string} configName - Name of the config in CRAWL_CONFIGS (e.g. 'vithoulkas').
 * @param {number} limit - Override max pages.
 * @param {number} delayMs - Delay between requests.
 */
async function crawl(configName, limit = null, delayMs = 5000) {
    const config = CRAWL_CONFIGS[configName];
    if (!config) {
        console.error(`[Crawler] Unknown config: "${configName}". Available: ${Object.keys(CRAWL_CONFIGS).join(', ')}`);
        process.exit(1);
    }
    
    const maxPages = limit || config.maxPages;
    console.log(`\n🕷️  Starting crawl: ${configName} (max ${maxPages} pages)\n`);
    
    let urls;
    
    if (config.isMultiLevel) {
        // Multi-level: first discover letter/category pages, then discover remedy pages within them
        console.log('[Crawler] Multi-level mode: discovering category pages first...');
        const categoryUrls = await discoverUrls(config.indexUrl, config.linkSelector, config.linkFilter, 30);
        
        if (categoryUrls.length === 0) {
            console.log('[Crawler] No category URLs found.');
            return;
        }
        console.log(`[Crawler] Found ${categoryUrls.length} category pages. Discovering remedy pages...\n`);
        
        urls = [];
        for (const catUrl of categoryUrls) {
            if (urls.length >= maxPages) break;
            const remedyUrls = await discoverUrls(catUrl, config.secondLevelSelector, config.secondLevelFilter, maxPages - urls.length);
            urls.push(...remedyUrls);
            console.log(`[Crawler] Total remedy URLs so far: ${urls.length}`);
        }
        // Deduplicate
        urls = [...new Set(urls)].slice(0, maxPages);
        console.log(`\n[Crawler] Final: ${urls.length} unique remedy URLs to scrape.`);
    } else {
        // Single-level: discover directly from index page
        urls = await discoverUrls(config.indexUrl, config.linkSelector, config.linkFilter, maxPages);
    }
    
    if (urls.length === 0) {
        console.log('[Crawler] No URLs found. Check the index URL and selectors.');
        return;
    }
    
    // Save discovered URLs for reference
    const urlListPath = path.join(__dirname, '../data/raw', `crawl_${configName}_urls.json`);
    fs.writeFileSync(urlListPath, JSON.stringify({ config: configName, discovered_at: new Date().toISOString(), urls }, null, 2));
    console.log(`[Crawler] URL list saved to: ${urlListPath}\n`);
    
    // Step 2: Batch scrape
    const results = await scrapeMultiple(urls, delayMs);
    
    // Save results summary
    const summaryPath = path.join(__dirname, '../data/raw', `crawl_${configName}_summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify({
        config: configName,
        completed_at: new Date().toISOString(),
        total: urls.length,
        success: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        results,
    }, null, 2));
    
    console.log(`\n🕷️  Crawl complete! Summary saved to: ${summaryPath}`);
}


// ─── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node crawler.js <config-name> [max-pages] [delay-ms]');
        console.log('');
        console.log('Available configs:');
        Object.entries(CRAWL_CONFIGS).forEach(([name, cfg]) => {
            console.log(`  ${name.padEnd(12)} - ${cfg.indexUrl} (max ${cfg.maxPages})`);
        });
        console.log('');
        console.log('Example:');
        console.log('  node crawler.js vithoulkas 10 5000');
        process.exit(0);
    }
    
    const configName = args[0];
    const limit = args[1] ? parseInt(args[1]) : null;
    const delay = args[2] ? parseInt(args[2]) : 5000;
    
    crawl(configName, limit, delay);
}

module.exports = { crawl, discoverUrls, CRAWL_CONFIGS };

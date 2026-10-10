#!/usr/bin/env node
/**
 * Resume Crawl Script
 * Reads a saved URL list, checks which are already scraped,
 * and only scrapes the missing ones. Includes retry logic for network errors.
 * 
 * Usage: node resume_crawl.js [max-retries] [delay-ms]
 */

const fs = require('fs');
const path = require('path');
const { scrapeUrl } = require('./scraper-node/browser_agent');
const { execSync } = require('child_process');

const RAW_DIR = path.join(__dirname, 'data/raw');
const MISSING_FILE = path.join(RAW_DIR, 'missing_urls.json');
const MAX_RETRIES = parseInt(process.argv[2]) || 3;
const BASE_DELAY = parseInt(process.argv[3]) || 5000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getAlreadyScrapedUrls() {
    const files = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('raw_') && f.endsWith('.json'));
    const urls = new Set();
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
            if (data.url) urls.add(data.url);
        } catch (e) { /* skip corrupt files */ }
    }
    return urls;
}

async function scrapeWithRetry(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await scrapeUrl(url);
            if (result && result.content) {
                return result;
            }
            console.log(`[Resume] Attempt ${attempt}: empty result for ${url}`);
        } catch (err) {
            const isNetworkError = err.message && (
                err.message.includes('ERR_INTERNET_DISCONNECTED') ||
                err.message.includes('ERR_NETWORK_CHANGED') ||
                err.message.includes('ERR_CONNECTION_REFUSED') ||
                err.message.includes('ERR_NAME_NOT_RESOLVED') ||
                err.message.includes('ETIMEDOUT') ||
                err.message.includes('timeout')
            );
            
            if (isNetworkError && attempt < retries) {
                const waitTime = BASE_DELAY * attempt * 2; // exponential backoff
                console.log(`[Resume] ⚠️  Network error on attempt ${attempt}/${retries}. Waiting ${waitTime/1000}s before retry...`);
                await sleep(waitTime);
            } else {
                console.log(`[Resume] ❌ Failed after ${attempt} attempt(s): ${err.message.substring(0, 100)}`);
                return null;
            }
        }
    }
    return null;
}

async function main() {
    // Load missing URLs
    let missingUrls;
    if (fs.existsSync(MISSING_FILE)) {
        missingUrls = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
    } else {
        // Recalculate from crawl URL list
        const crawlFiles = fs.readdirSync(RAW_DIR).filter(f => f.startsWith('crawl_') && f.includes('_urls.json'));
        if (crawlFiles.length === 0) {
            console.log('[Resume] No crawl URL files found. Run a crawl first.');
            process.exit(1);
        }
        const allUrls = JSON.parse(fs.readFileSync(path.join(RAW_DIR, crawlFiles[0]), 'utf8')).urls;
        const scraped = getAlreadyScrapedUrls();
        missingUrls = allUrls.filter(u => !scraped.has(u));
    }

    // Double-check against what's actually scraped
    const scraped = getAlreadyScrapedUrls();
    missingUrls = missingUrls.filter(u => !scraped.has(u));

    console.log(`\n🔄 Resume Crawl: ${missingUrls.length} URLs remaining (${scraped.size} already scraped)\n`);

    if (missingUrls.length === 0) {
        console.log('✅ All URLs already scraped! Moving to processing...');
    } else {
        let success = 0, failed = 0;

        for (let i = 0; i < missingUrls.length; i++) {
            const url = missingUrls[i];
            console.log(`\n--- [${i + 1}/${missingUrls.length}] ---`);
            
            const result = await scrapeWithRetry(url);
            
            if (result && result.content) {
                success++;
            } else {
                failed++;
            }

            // Random delay between requests
            if (i < missingUrls.length - 1) {
                const delay = BASE_DELAY + Math.floor(Math.random() * 3000);
                console.log(`[Resume] Waiting ${(delay/1000).toFixed(1)}s before next request...`);
                await sleep(delay);
            }
        }

        console.log(`\n🕷️  Scraping complete: ${success} success, ${failed} failed`);
    }

    // Now process all unprocessed files with Ollama
    console.log(`\n━━━ Processing all unprocessed files with Ollama ━━━\n`);
    try {
        execSync('source ../venv/bin/activate 2>/dev/null; python3 intelligence_layer.py --batch', {
            cwd: path.join(__dirname, 'engine-python'),
            stdio: 'inherit',
            env: { ...process.env, PATH: process.env.PATH }
        });
    } catch (e) {
        // Fallback: use the main.js --process-all
        console.log('[Resume] Falling back to main.js --process-all...');
        execSync('node main.js --process-all', {
            cwd: __dirname,
            stdio: 'inherit'
        });
    }
}

main().catch(console.error);

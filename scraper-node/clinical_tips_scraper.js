/**
 * Clinical Tips Scraper — Playwright Swarm
 * Scrapes Clarke's Clinical Repertory from homeoint.org
 * Extracts disease/condition → recommended remedies mapping
 * Output: data/clinical_tips/
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'clinical_tips');
const BASE_URL = 'http://www.homeoint.org/books/clarkecr';
const CONCURRENCY = 5;

async function discoverLinks(page) {
  console.log('[ClinicalTips] Discovering clinical repertory links...');
  
  // Try the index page
  await page.goto(`${BASE_URL}/index.htm`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  let links = await page.evaluate((base) => {
    const anchors = document.querySelectorAll('a[href]');
    return Array.from(anchors)
      .map(a => a.href)
      .filter(h => h.includes('clarke') && !h.includes('index') && h.endsWith('.htm'));
  }, BASE_URL);
  
  // If index didn't yield much, try A-Z navigation
  if (links.length < 10) {
    console.log('[ClinicalTips] Trying A-Z letter navigation...');
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const letter of letters) {
      try {
        await page.goto(`${BASE_URL}/${letter}.htm`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const letterLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.endsWith('.htm') && !h.includes('index'));
        });
        links.push(...letterLinks);
      } catch {}
    }
  }
  
  links = [...new Set(links)];
  console.log(`[ClinicalTips] Found ${links.length} links to scrape`);
  return links;
}

function parseClinicalData(text, title) {
  const entries = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  let currentCondition = null;
  
  for (const line of lines) {
    // Condition headers are typically in uppercase or bold patterns
    const condMatch = line.match(/^([A-Z][A-Za-z\s,'-]+(?:\([^)]*\))?)\s*[-.:]\s*(.+)/);
    if (condMatch) {
      const remedies = condMatch[2]
        .split(/[,;]/)
        .map(r => r.trim())
        .filter(r => r.length > 1 && r.length < 40);
      
      entries.push({
        condition: condMatch[1].trim(),
        remedies: remedies,
        source_title: title
      });
    }
  }
  
  return entries;
}

async function scrapeAllClinicalTips() {
  console.log('[ClinicalTips] Starting Clarke\'s Clinical Repertory Scraper...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const indexPage = await context.newPage();
  const urls = await discoverLinks(indexPage);
  await indexPage.close();
  
  if (urls.length === 0) {
    // Generate A-Z URLs as fallback
    console.log('[ClinicalTips] No links discovered. Generating A-Z URLs...');
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const l of letters) {
      urls.push(`${BASE_URL}/${l}.htm`);
    }
  }
  
  const queue = [...urls];
  let totalEntries = 0;
  const allEntries = [];
  
  const worker = async (workerId) => {
    const page = await context.newPage();
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      
      const pageName = path.basename(url, '.htm');
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        const data = await page.evaluate(() => ({
          text: document.body ? document.body.innerText : '',
          title: document.title
        }));
        
        if (data.text) {
          // Save raw
          fs.writeFileSync(
            path.join(OUTPUT_DIR, `raw_${pageName}.json`),
            JSON.stringify({ page: pageName, url, title: data.title, text: data.text, scraped_at: new Date().toISOString() }, null, 2)
          );
          
          const entries = parseClinicalData(data.text, data.title);
          totalEntries += entries.length;
          allEntries.push(...entries);
          
          console.log(`[ClinicalTips W${workerId}] ✓ ${pageName}: ${entries.length} clinical entries`);
        }
      } catch (err) {
        console.log(`[ClinicalTips W${workerId}] ✗ ${pageName}: ${err.message}`);
      }
    }
    await page.close();
  };
  
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i + 1));
  }
  await Promise.all(workers);
  
  // Save consolidated
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'clinical_tips_full.json'),
    JSON.stringify({
      total_entries: allEntries.length,
      pages_scraped: urls.length,
      scraped_at: new Date().toISOString(),
      entries: allEntries
    }, null, 2)
  );
  
  await browser.close();
  console.log(`\n[ClinicalTips] ✅ COMPLETE: ${totalEntries} clinical tip entries from ${urls.length} pages`);
  return totalEntries;
}

module.exports = { scrapeAllClinicalTips };

if (require.main === module) {
  scrapeAllClinicalTips().catch(console.error);
}

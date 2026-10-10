/**
 * Kent's Repertory Scraper — Parallel Playwright Swarm
 * Scrapes all 37 chapters from homeoint.org/books/kentrep/
 * Extracts rubrics with sub-rubrics and graded remedies.
 * Output: data/kent_repertory/<chapter>.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'kent_repertory');
const BASE_URL = 'http://www.homeoint.org/books/kentrep';
const CONCURRENCY = 10;

// Kent's Repertory 37 chapters (standard order)
const CHAPTERS = [
  'mind', 'vertigo', 'head', 'eye', 'vision', 'ear', 'hearing', 'nose',
  'face', 'mouth', 'teeth', 'throat', 'external_throat', 'stomach',
  'abdomen', 'rectum', 'stool', 'bladder', 'kidneys', 'prostate_gland',
  'urethra', 'urine', 'genitalia_male', 'genitalia_female', 'larynx',
  'respiration', 'cough', 'expectoration', 'chest', 'back', 'extremities',
  'sleep', 'chill', 'fever', 'perspiration', 'skin', 'generalities'
];

async function discoverChapterLinks(page) {
  console.log('[Kent] Discovering chapter links from index...');
  await page.goto(`${BASE_URL}/index.htm`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    return Array.from(anchors)
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
      .filter(l => l.href.includes('kent') && !l.href.includes('index'));
  });
  
  console.log(`[Kent] Found ${links.length} chapter links from index page`);
  return links;
}

async function scrapeChapterPage(page, url, chapterName) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const data = await page.evaluate(() => {
      const body = document.body;
      const text = body ? body.innerText : '';
      const html = body ? body.innerHTML : '';
      return { text, html, title: document.title };
    });
    
    return data;
  } catch (err) {
    console.error(`[Kent] Error scraping ${url}: ${err.message}`);
    return null;
  }
}

function parseRubrics(text, chapterName) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rubrics = [];
  let currentRubric = null;
  
  for (const line of lines) {
    // Rubric lines typically have symptoms followed by remedy abbreviations
    // e.g., "ANXIETY - Acon., Ars., Bell., Bry."
    const rubricMatch = line.match(/^([A-Z][A-Za-z\s,;:\-'()]+)\s*[-:]\s*(.+)/);
    if (rubricMatch) {
      const remedyStr = rubricMatch[2];
      const remedies = remedyStr.split(/[,;]/).map(r => r.trim()).filter(r => r.length > 0 && r.length < 30);
      
      currentRubric = {
        rubric: rubricMatch[1].trim(),
        remedies: remedies,
        chapter: chapterName
      };
      rubrics.push(currentRubric);
    } else if (currentRubric && /^[a-z]/.test(line)) {
      // Sub-rubric (starts with lowercase)
      const subMatch = line.match(/^(.+?)\s*[-:]\s*(.+)/);
      if (subMatch) {
        const subRemedies = subMatch[2].split(/[,;]/).map(r => r.trim()).filter(r => r.length > 0 && r.length < 30);
        rubrics.push({
          rubric: `${currentRubric.rubric} > ${subMatch[1].trim()}`,
          remedies: subRemedies,
          chapter: chapterName
        });
      }
    }
  }
  
  return rubrics;
}

async function scrapeAllChapters() {
  console.log('[Kent] Starting Kent\'s Repertory Swarm Scraper...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // First discover all links from index
  const indexPage = await context.newPage();
  const discoveredLinks = await discoverChapterLinks(indexPage);
  await indexPage.close();
  
  // If index discovery fails, generate chapter URLs from known patterns
  let chapterUrls = discoveredLinks.length > 0 
    ? discoveredLinks.map(l => l.href) 
    : [];
    
  if (chapterUrls.length === 0) {
    // Try letter-based index: kent repertory typically has kenta.htm, kentb.htm etc.
    console.log('[Kent] Index discovery yielded 0 links, trying direct chapter URLs...');
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const ch of CHAPTERS) {
      chapterUrls.push(`${BASE_URL}/${ch.replace('_', '')}.htm`);
    }
    // Also try letter index
    for (const l of letters) {
      chapterUrls.push(`${BASE_URL}/kent${l}.htm`);
    }
  }
  
  // Remove duplicates
  chapterUrls = [...new Set(chapterUrls)];
  console.log(`[Kent] Total URLs to scrape: ${chapterUrls.length}`);
  
  // Scrape with concurrent workers
  const queue = [...chapterUrls];
  let totalRubrics = 0;
  const allRubrics = [];
  
  const worker = async (workerId) => {
    const page = await context.newPage();
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      
      const chapterName = path.basename(url, '.htm');
      console.log(`[Kent W${workerId}] Scraping: ${chapterName}`);
      
      const data = await scrapeChapterPage(page, url, chapterName);
      if (data && data.text) {
        // Save raw content
        const rawPath = path.join(OUTPUT_DIR, `raw_${chapterName}.json`);
        fs.writeFileSync(rawPath, JSON.stringify({
          chapter: chapterName,
          url: url,
          title: data.title,
          text: data.text,
          scraped_at: new Date().toISOString()
        }, null, 2));
        
        // Parse rubrics
        const rubrics = parseRubrics(data.text, chapterName);
        totalRubrics += rubrics.length;
        allRubrics.push(...rubrics);
        
        console.log(`[Kent W${workerId}] ✓ ${chapterName}: ${rubrics.length} rubrics extracted`);
      }
    }
    await page.close();
  };
  
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, chapterUrls.length); i++) {
    workers.push(worker(i + 1));
  }
  await Promise.all(workers);
  
  // Save consolidated rubric database
  const consolidatedPath = path.join(OUTPUT_DIR, 'kent_repertory_full.json');
  fs.writeFileSync(consolidatedPath, JSON.stringify({
    total_rubrics: allRubrics.length,
    chapters_scraped: chapterUrls.length,
    scraped_at: new Date().toISOString(),
    rubrics: allRubrics
  }, null, 2));
  
  await browser.close();
  console.log(`\n[Kent] ✅ COMPLETE: ${totalRubrics} rubrics extracted from ${chapterUrls.length} pages → ${consolidatedPath}`);
  return totalRubrics;
}

module.exports = { scrapeAllChapters };

if (require.main === module) {
  scrapeAllChapters().catch(console.error);
}

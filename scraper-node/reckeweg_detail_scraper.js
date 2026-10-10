/**
 * Dr. Reckeweg R1-R89 Detail Scraper — Playwright Swarm
 * Scrapes individual product pages from reckeweg-india.com
 * Extracts: Name, Number, Indications, Composition (ingredients + potency), Dosage, Side Effects
 * Output: data/reckeweg_remedies/ and data/reckeweg_ingredients/
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REMEDY_DIR = path.join(__dirname, '..', 'data', 'reckeweg_remedies');
const INGREDIENT_DIR = path.join(__dirname, '..', 'data', 'reckeweg_ingredients');
const CONCURRENCY = 10;

// Generate all R1 to R89 URLs (some numbers may be missing)
function generateUrls() {
  const urls = [];
  // Main drop products
  for (let i = 1; i <= 89; i++) {
    urls.push({
      number: `R${i}`,
      url: `https://www.reckeweg-india.com/product/dr-reckeweg-r${i}-drops/`
    });
  }
  // Also try alternate URL patterns
  for (let i = 1; i <= 89; i++) {
    urls.push({
      number: `R${i}_alt`,
      url: `https://www.reckeweg-india.com/product/r${i}/`
    });
  }
  return urls;
}

// Fallback: scrape from emedicinehub which has comprehensive data
function generateFallbackUrls() {
  const urls = [];
  for (let i = 1; i <= 89; i++) {
    urls.push({
      number: `R${i}`,
      url: `https://www.emedicinehub.com/dr-reckeweg-r${i}/`
    });
  }
  return urls;
}

async function scrapeProductPage(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response || response.status() >= 400) return null;
    
    const data = await page.evaluate(() => {
      const getTextBySelector = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : '';
      };
      
      const title = document.title || '';
      const body = document.body ? document.body.innerText : '';
      const html = document.body ? document.body.innerHTML : '';
      
      // Try to find structured sections
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      const sections = {};
      for (const h of headings) {
        const key = h.textContent.trim().toLowerCase();
        let content = '';
        let sibling = h.nextElementSibling;
        while (sibling && !['H1','H2','H3','H4'].includes(sibling.tagName)) {
          content += sibling.textContent.trim() + '\n';
          sibling = sibling.nextElementSibling;
        }
        sections[key] = content.trim();
      }
      
      return { title, body, sections, url: window.location.href };
    });
    
    return data;
  } catch (err) {
    return null;
  }
}

function parseRemedyData(data, number) {
  if (!data || !data.body) return null;
  
  const text = data.body;
  const remedy = {
    number: number,
    name: '',
    full_name: data.title || '',
    indications: [],
    composition: [],
    dosage: '',
    side_effects: '',
    source_url: data.url,
    scraped_at: new Date().toISOString()
  };
  
  // Extract name from title
  const nameMatch = data.title.match(/(?:Dr\.?\s*Reckeweg\s+)?R\d+\s*[-–]?\s*(.+?)(?:\s*[-|]|$)/i);
  if (nameMatch) remedy.name = nameMatch[1].trim();
  
  // Extract indications
  const indicMatch = text.match(/Indication[s]?\s*[:.-]*\s*([\s\S]*?)(?=Composition|Ingredient|Dosage|Mode|$)/i);
  if (indicMatch) {
    remedy.indications = indicMatch[1].split(/[.\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 5 && s.length < 300);
  }
  
  // Extract composition/ingredients
  const compMatch = text.match(/(?:Composition|Ingredient[s]?)\s*[:.-]*\s*([\s\S]*?)(?=Dosage|Indication|Mode|Side|Precaution|$)/i);
  if (compMatch) {
    remedy.composition = compMatch[1].split(/[,\n;]/)
      .map(s => s.trim())
      .filter(s => s.length > 2 && s.length < 100);
  }
  
  // Extract dosage
  const doseMatch = text.match(/(?:Dosage|Mode of (?:Action|Administration)|How to (?:take|use))\s*[:.-]*\s*([\s\S]*?)(?=Side|Precaution|Contra|$)/i);
  if (doseMatch) {
    remedy.dosage = doseMatch[1].trim().substring(0, 500);
  }
  
  // Extract side effects
  const sideMatch = text.match(/(?:Side\s*Effect[s]?|Precaution[s]?|Contra[-]?indication[s]?)\s*[:.-]*\s*([\s\S]*?)(?=$)/i);
  if (sideMatch) {
    remedy.side_effects = sideMatch[1].trim().substring(0, 300);
  }
  
  return remedy;
}

async function scrapeAllReckeweg() {
  console.log('[Reckeweg] Starting Dr. Reckeweg R1-R89 Swarm Scraper...');
  fs.mkdirSync(REMEDY_DIR, { recursive: true });
  fs.mkdirSync(INGREDIENT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // Try primary source first
  let urls = generateUrls();
  const queue = [...urls];
  let successCount = 0;
  const seenNumbers = new Set();
  
  const worker = async (workerId) => {
    const page = await context.newPage();
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      
      const cleanNumber = item.number.replace('_alt', '');
      if (seenNumbers.has(cleanNumber)) continue;
      
      console.log(`[Reckeweg W${workerId}] Scraping: ${item.number} → ${item.url}`);
      const data = await scrapeProductPage(page, item.url);
      
      if (data && data.body && data.body.length > 200) {
        seenNumbers.add(cleanNumber);
        const remedy = parseRemedyData(data, cleanNumber);
        
        if (remedy) {
          // Save remedy profile
          fs.writeFileSync(
            path.join(REMEDY_DIR, `${cleanNumber.toLowerCase()}.json`),
            JSON.stringify(remedy, null, 2)
          );
          
          // Save ingredients separately
          if (remedy.composition.length > 0) {
            fs.writeFileSync(
              path.join(INGREDIENT_DIR, `${cleanNumber.toLowerCase()}_ingredients.json`),
              JSON.stringify({
                remedy_number: cleanNumber,
                remedy_name: remedy.name,
                ingredients: remedy.composition,
                source_url: remedy.source_url,
                parsed_at: new Date().toISOString()
              }, null, 2)
            );
          }
          
          successCount++;
          console.log(`[Reckeweg W${workerId}] ✓ ${cleanNumber}: ${remedy.name} (${remedy.composition.length} ingredients)`);
        }
      }
    }
    await page.close();
  };
  
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i + 1));
  }
  await Promise.all(workers);
  
  // If primary source didn't get enough, try fallback
  if (successCount < 50) {
    console.log(`[Reckeweg] Only ${successCount} from primary. Trying emedicinehub fallback...`);
    const fallbackUrls = generateFallbackUrls().filter(u => !seenNumbers.has(u.number));
    const fbQueue = [...fallbackUrls];
    
    const fbWorker = async (wid) => {
      const page = await context.newPage();
      while (fbQueue.length > 0) {
        const item = fbQueue.shift();
        if (!item || seenNumbers.has(item.number)) continue;
        
        console.log(`[Reckeweg FB-W${wid}] Scraping: ${item.number}`);
        const data = await scrapeProductPage(page, item.url);
        if (data && data.body && data.body.length > 200) {
          seenNumbers.add(item.number);
          const remedy = parseRemedyData(data, item.number);
          if (remedy) {
            fs.writeFileSync(path.join(REMEDY_DIR, `${item.number.toLowerCase()}.json`), JSON.stringify(remedy, null, 2));
            if (remedy.composition.length > 0) {
              fs.writeFileSync(path.join(INGREDIENT_DIR, `${item.number.toLowerCase()}_ingredients.json`), JSON.stringify({
                remedy_number: item.number, remedy_name: remedy.name,
                ingredients: remedy.composition, source_url: remedy.source_url, parsed_at: new Date().toISOString()
              }, null, 2));
            }
            successCount++;
            console.log(`[Reckeweg FB-W${wid}] ✓ ${item.number}: ${remedy.name}`);
          }
        }
      }
      await page.close();
    };
    
    const fbWorkers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      fbWorkers.push(fbWorker(i + 1));
    }
    await Promise.all(fbWorkers);
  }
  
  await browser.close();
  console.log(`\n[Reckeweg] ✅ COMPLETE: ${successCount} R-series remedies scraped`);
  return successCount;
}

module.exports = { scrapeAllReckeweg };

if (require.main === module) {
  scrapeAllReckeweg().catch(console.error);
}

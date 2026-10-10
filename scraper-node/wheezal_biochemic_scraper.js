/**
 * Wheezal Bio-Chemic & Bio-Combination Scraper
 * Scrapes product data from wheezalstore.com and enriches it with 
 * medical composition/indications from the official Wheezal catalogue.
 * 
 * Usage: node wheezal_biochemic_scraper.js [--test]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Directories
const BASE_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(BASE_DIR, 'data', 'wheezal');
const REFERENCE_FILE = path.join(__dirname, 'wheezal_reference_data.json');

// Collection URLs
const COLLECTIONS = [
  {
    id: 'bio_combination',
    name: 'Bio-Combination',
    url: 'https://www.wheezalstore.com/shop/BIO-COMBINATION?cid=5874439'
  }
];

// Pre-identified individual salts (from research)
const INDIVIDUAL_SALTS = [
  { name: 'Calcarea Fluorica', url: 'https://www.wheezalstore.com/product/29751145/Calcarea-Fluorica' },
  { name: 'Calcarea Phosphorica', url: 'https://www.wheezalstore.com/product/29751146/Calcarea-Phosphorica' },
  { name: 'Calcarea Sulphurica', url: 'https://www.wheezalstore.com/product/29751147/Calcarea-Sulphurica' },
  { name: 'Ferrum Phosphoricum', url: 'https://www.wheezalstore.com/product/29751148/Ferrum-Phosphoricum' },
  { name: 'Five Phos.', url: 'https://www.wheezalstore.com/product/29751149/Five-Phos-' },
  { name: 'Kali Muriaticum', url: 'https://www.wheezalstore.com/product/29751151/Kali-Muriaticum' },
  { name: 'Kali Phosphoricum', url: 'https://www.wheezalstore.com/product/29751152/Kali-Phosphoricum' },
  { name: 'Kali Sulphuricum', url: 'https://www.wheezalstore.com/product/29751153/Kali-Sulphuricum' },
  { name: 'Magnesium Phosphoricum', url: 'https://www.wheezalstore.com/product/29751154/Magnesium-Phosphoricum' },
  { name: 'Natrum Muriaticum', url: 'https://www.wheezalstore.com/product/29751155/Natrum-Muriaticum' },
  { name: 'Natrum Phosphoricum', url: 'https://www.wheezalstore.com/product/29751156/Natrum-Phosphoricum' },
  { name: 'Natrum Sulphuricum', url: 'https://www.wheezalstore.com/product/29751157/Natrum-Sulphuricum' },
  { name: 'Silicea', url: 'https://www.wheezalstore.com/product/29751159/Silicea' }
];

// Load enrichment data
let referenceData = {};
try {
  referenceData = JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8'));
} catch (err) {
  console.warn('[Wheezal] Reference data not found, will not enrich indications.');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Extract all product links from a collection page.
 */
async function crawlCollection(page, collection) {
  console.log(`[Wheezal] Crawling collection: ${collection.name}...`);
  await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 60000 });
  
  // Scroll to ensure all lazy-loaded products are rendered
  await page.evaluate(async () => {
    await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                resolve();
            }
        }, 150);
        setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
    });
  });

  const products = await page.evaluate(() => {
    const items = [];
    // More robust selectors for various shop themes
    const linkSelectors = ['a.link_link__imOxT', 'a[href*="/product/"]', '.product-card a', '.product-item a'];
    let links = [];
    for (const sel of linkSelectors) {
      const found = document.querySelectorAll(sel);
      if (found.length > 5) {
        links = Array.from(found);
        break;
      }
    }

    links.forEach(a => {
      const name = a.querySelector('h3, .product-title, .title')?.textContent?.trim() || a.innerText?.trim();
      const href = a.href;
      // Filter out duplicates and invalid links
      if (name && href && href.includes('/product/') && !items.find(i => i.url === href)) {
        // Clean name (remove price or 'Add' text if it leaked)
        const cleanName = name.split('\n')[0].replace(/₹.*/, '').trim();
        if (cleanName.length > 2) {
          items.push({ name: cleanName, url: href });
        }
      }
    });
    return items;
  });

  console.log(`[Wheezal] Found ${products.length} products in ${collection.name}.`);
  return products;
}

/**
 * Scrape detailed product data from a product page.
 */
async function scrapeProduct(page, product) {
  console.log(`[Wheezal] Scraping product: ${product.name}...`);
  try {
    await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      const priceElement = document.querySelector('span[class*="price"], .price_price__'); // Approximate from screenshots
      // The price is usually in a span with a currency symbol
      const spans = Array.from(document.querySelectorAll('span'));
      const priceSpan = spans.find(s => s.textContent.includes('₹'));
      const priceText = priceSpan ? priceSpan.textContent.trim() : '';
      
      const description = document.querySelector('.product-description, .product_description__')?.innerText?.trim() || '';
      const image = document.querySelector('img[class*="product_image__"], .product-image img')?.src || '';
      
      return {
        title,
        price: priceText,
        description,
        image,
        scraped_at: new Date().toISOString()
      };
    });

    // Try to match with reference data for enrichment
    let enrichedData = { ...product, ...data };
    
    // Improved matching logic: 
    // 1. Try No. X pattern
    const bcMatch = product.name.match(/No\.?\s*(\d+)/i) || product.name.match(/BC[- ]?(\d+)/i);
    let matchedBC = null;
    
    if (bcMatch) {
      matchedBC = `BC-${bcMatch[1]}`;
    } else {
      // 2. Try matching by name directly
      const cleanName = product.name.toLowerCase().trim();
      matchedBC = Object.keys(referenceData).find(key => 
        referenceData[key].name.toLowerCase() === cleanName || 
        cleanName.includes(referenceData[key].name.toLowerCase())
      );
    }

    if (matchedBC && referenceData[matchedBC]) {
      console.log(`[Wheezal] ✓ Enriched ${product.name} as ${matchedBC}`);
      enrichedData.composition = referenceData[matchedBC].composition;
      enrichedData.indications = referenceData[matchedBC].indications;
      enrichedData.bc_number = matchedBC;
    }

    return enrichedData;
  } catch (err) {
    console.error(`[Wheezal] Error scraping ${product.url}: ${err.message}`);
    return null;
  }
}

async function main() {
  const isTest = process.argv.includes('--test');
  console.log(`[Wheezal] Starting scraper${isTest ? ' (TEST MODE)' : ''}...`);
  
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let allProducts = [];
  for (const collection of COLLECTIONS) {
    const products = await crawlCollection(page, collection);
    allProducts.push(...products.map(p => ({ ...p, collection_id: collection.id })));
  }

  // Add individual salts
  allProducts.push(...INDIVIDUAL_SALTS.map(p => ({ ...p, collection_id: 'bio_chemics' })));

  // Deduplicate
  const uniqueProducts = [];
  const seenUrls = new Set();
  for (const p of allProducts) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      uniqueProducts.push(p);
    }
  }

  console.log(`[Wheezal] Total unique products to scrape: ${uniqueProducts.size || uniqueProducts.length}`);

  const toScrape = isTest ? uniqueProducts.slice(0, 2) : uniqueProducts;
  const results = [];

  for (let i = 0; i < toScrape.length; i++) {
    const product = toScrape[i];
    console.log(`\n--- [${i + 1}/${toScrape.length}] ---`);
    const details = await scrapeProduct(page, product);
    if (details) {
      results.push(details);
      
      // Save individual file
      const filename = (details.bc_number || details.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()) + '.json';
      fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(details, null, 2));
    }
    
    // Ant-detection delay
    await sleep(2000 + Math.random() * 2000);
  }

  // Save all results summary
  fs.writeFileSync(path.join(DATA_DIR, '_all_results.json'), JSON.stringify(results, null, 2));

  console.log(`\n[Wheezal] ✅ Scrape complete. Saved ${results.length} products to ${DATA_DIR}`);
  
  await browser.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Wheezal] FATAL ERROR:', err);
    process.exit(1);
  });
}

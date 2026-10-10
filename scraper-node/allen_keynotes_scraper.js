/**
 * Allen's Keynotes Scraper — Playwright Swarm
 * Scrapes 185 remedies from homeoint.org/books/allkeyn/
 * Output: data/allen_keynotes/<remedy>.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'allen_keynotes');
const BASE_URL = 'http://www.homeoint.org/books/allkeyn';
const CONCURRENCY = 5;

// Allen's Keynotes pages (alphabetically grouped)
const PAGES = [
  'allkeyaa', 'allkeyab', 'allkeycc', 'allkeyce', 'allkeyfi',
  'allkeykl', 'allkeym', 'allkeyno', 'allkeyp',
  'allkeyrs', 'allkeyss', 'allkeytz'
];

async function scrapeAllenPage(page, pageName) {
  const url = `${BASE_URL}/${pageName}.htm`;
  console.log(`[Allen] Scraping: ${pageName}`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const data = await page.evaluate(() => {
      const body = document.body;
      if (!body) return null;
      
      // Extract all remedy sections by looking for anchors/headings
      const html = body.innerHTML;
      const text = body.innerText;
      
      // Find all anchor names (each remedy has an anchor)
      const anchors = document.querySelectorAll('a[name]');
      const remedies = [];
      
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const name = anchor.getAttribute('name');
        if (!name || name.length < 2) continue;
        
        // Collect text from this anchor until the next anchor
        let content = '';
        let node = anchor.parentElement || anchor;
        let nextAnchor = i < anchors.length - 1 ? anchors[i + 1] : null;
        
        // Walk siblings collecting text
        let current = node;
        while (current) {
          if (nextAnchor && current.contains && current.contains(nextAnchor)) break;
          if (current === nextAnchor) break;
          if (current.textContent) content += current.textContent + '\n';
          current = current.nextElementSibling;
          if (!current) break;
        }
        
        // Extract remedy name from first line
        const lines = content.split('\n').filter(l => l.trim());
        const remedyName = lines[0] ? lines[0].trim() : name;
        
        remedies.push({
          anchor: name,
          name: remedyName,
          full_text: content.trim().substring(0, 5000) // Cap at 5K chars
        });
      }
      
      return { title: document.title, remedies, fullText: text };
    });
    
    return data;
  } catch (err) {
    console.error(`[Allen] Error on ${pageName}: ${err.message}`);
    return null;
  }
}

function parseAllenRemedy(raw) {
  const text = raw.full_text || '';
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  const remedy = {
    name: raw.name.replace(/\.$/, '').trim(),
    anchor: raw.anchor,
    common_name: '',
    family: '',
    key_symptoms: [],
    modalities: { worse: [], better: [] },
    relationships: { compare: [], complementary: [], follows_well: [], inimical: [], antidotes: [] },
    source: 'Allen\'s Keynotes',
    full_text: text.substring(0, 3000)
  };
  
  // Extract common name (usually in parentheses after remedy name)
  const commonMatch = lines[0]?.match(/\(([^)]+)\)/);
  if (commonMatch) remedy.common_name = commonMatch[1];
  
  // Look for family/order
  const famMatch = text.match(/(?:Nat\.\s*ord\.|Family|Order)\s*[-:.]?\s*([^\n.]+)/i);
  if (famMatch) remedy.family = famMatch[1].trim();
  
  // Extract key symptoms (lines that describe symptoms)
  for (const line of lines.slice(1)) {
    if (line.length > 20 && line.length < 300 && !line.match(/^(Compare|Complement|Follow|Inimic|Antidote|Aggrav|Amelior|Relat|Dose)/i)) {
      if (remedy.key_symptoms.length < 8) {
        remedy.key_symptoms.push(line);
      }
    }
  }
  
  // Extract relationships
  const relSection = text.match(/Relat(?:ion(?:s|ship)?)\s*[-.:]*\s*([\s\S]*?)(?=Aggrav|Amelior|Dose|$)/i);
  if (relSection) {
    const relText = relSection[1];
    const patterns = [
      { key: 'compare', re: /Compare\s*[:.-]*\s*([^.]+)/gi },
      { key: 'complementary', re: /Complement(?:ary|s)?\s*[:.-]*\s*([^.]+)/gi },
      { key: 'follows_well', re: /Follow[s]?\s*well\s*[:.-]*\s*([^.]+)/gi },
      { key: 'inimical', re: /Inimic(?:al)?\s*[:.-]*\s*([^.]+)/gi },
      { key: 'antidotes', re: /Antidote[sd]?\s*[:.-]*\s*([^.]+)/gi },
    ];
    for (const { key, re } of patterns) {
      let m;
      while ((m = re.exec(relText)) !== null) {
        const items = m[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40);
        remedy.relationships[key].push(...items);
      }
    }
  }
  
  // Extract modalities
  const worstMatch = text.match(/Aggrav(?:ation)?\s*[:.-]*\s*([^.]+)/i);
  if (worstMatch) remedy.modalities.worse = worstMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1);
  
  const betterMatch = text.match(/Amelior(?:ation)?\s*[:.-]*\s*([^.]+)/i);
  if (betterMatch) remedy.modalities.better = betterMatch[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1);
  
  return remedy;
}

async function scrapeAllAllen() {
  console.log('[Allen] Starting Allen\'s Keynotes Scraper (185 remedies)...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const queue = [...PAGES];
  let totalRemedies = 0;
  const allRemedies = [];
  
  const worker = async (wid) => {
    const page = await context.newPage();
    while (queue.length > 0) {
      const pageName = queue.shift();
      if (!pageName) break;
      
      const data = await scrapeAllenPage(page, pageName);
      if (data && data.remedies) {
        for (const raw of data.remedies) {
          const remedy = parseAllenRemedy(raw);
          
          const safeName = remedy.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 50);
          fs.writeFileSync(
            path.join(OUTPUT_DIR, `${safeName}.json`),
            JSON.stringify(remedy, null, 2)
          );
          
          allRemedies.push(remedy);
          totalRemedies++;
        }
        console.log(`[Allen W${wid}] ✓ ${pageName}: ${data.remedies.length} remedies`);
      }
    }
    await page.close();
  };
  
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, PAGES.length); i++) {
    workers.push(worker(i + 1));
  }
  await Promise.all(workers);
  
  // Save consolidated
  fs.writeFileSync(path.join(OUTPUT_DIR, 'allen_keynotes_full.json'), JSON.stringify({
    total_remedies: allRemedies.length,
    source: 'Allen\'s Keynotes - homeoint.org',
    scraped_at: new Date().toISOString(),
    remedies: allRemedies
  }, null, 2));
  
  await browser.close();
  console.log(`\n[Allen] ✅ COMPLETE: ${totalRemedies} remedies scraped from Allen's Keynotes`);
  return totalRemedies;
}

module.exports = { scrapeAllAllen };
if (require.main === module) { scrapeAllAllen().catch(console.error); }

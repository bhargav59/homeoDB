/**
 * Allen's Keynotes Fix — Re-parse pages that returned 0 remedies
 * Uses full-text splitting instead of anchor-based parsing
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'allen_keynotes');
const BASE = 'http://www.homeoint.org/books/allkeyn';
const EMPTY_PAGES = ['allkeybc','allkeycf','allkeydi','allkeygk','allkeyll','allkeymn','allkeyop'];

(async () => {
  console.log('[Allen-Fix] Re-parsing 7 empty pages...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  let total = 0;
  
  for (const p of EMPTY_PAGES) {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/${p}.htm`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const text = await page.evaluate(() => document.body ? document.body.innerText : '');
      
      // Split by lines that look like remedy headings (ALL CAPS, 3+ chars, standalone line)
      const lines = text.split('\n');
      let currentRemedy = null;
      let currentLines = [];
      let count = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Detect remedy heading: all uppercase, 3+ chars, not a common section header
        if (/^[A-Z][A-Z\s.'-]{2,}$/.test(trimmed) && trimmed.length >= 4 && trimmed.length <= 60 &&
            !/^(COMPARE|COMPLEMENT|FOLLOW|INIMIC|RELATION|AGGRAV|AMELIOR|DOSE|THE |A |IS |KEY|NOTE)/i.test(trimmed)) {
          // Save previous remedy
          if (currentRemedy && currentLines.length > 2) {
            const symptoms = currentLines.filter(l => l.length > 15 && l.length < 300);
            const remedy = {
              name: currentRemedy, key_symptoms: symptoms.slice(0, 8),
              source: "Allen's Keynotes", full_text: currentLines.join('\n').substring(0, 2000)
            };
            const safeName = currentRemedy.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 50);
            fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}.json`), JSON.stringify(remedy, null, 2));
            count++;
          }
          currentRemedy = trimmed.replace(/\.$/, '').trim();
          currentLines = [];
        } else if (currentRemedy && trimmed) {
          currentLines.push(trimmed);
        }
      }
      // Save last remedy
      if (currentRemedy && currentLines.length > 2) {
        const symptoms = currentLines.filter(l => l.length > 15 && l.length < 300);
        const remedy = {
          name: currentRemedy, key_symptoms: symptoms.slice(0, 8),
          source: "Allen's Keynotes", full_text: currentLines.join('\n').substring(0, 2000)
        };
        const safeName = currentRemedy.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 50);
        fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}.json`), JSON.stringify(remedy, null, 2));
        count++;
      }
      
      total += count;
      console.log(`[Allen-Fix] ${p}: ${count} remedies extracted`);
    } catch (e) { console.error(`[Allen-Fix] ${p}: ${e.message}`); }
    await page.close();
  }
  
  await browser.close();
  
  // Rebuild consolidated file
  const all = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.json') && f !== 'allen_keynotes_full.json')
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'allen_keynotes_full.json'), JSON.stringify({
    total_remedies: all.length, scraped_at: new Date().toISOString(), remedies: all
  }, null, 2));
  
  console.log(`\n[Allen-Fix] ✅ Total Allen remedies now: ${all.length}`);
})();

/**
 * Phase 7 Orchestrator — Launches all 4 scrapers simultaneously
 * 1. Kent's Repertory (Playwright swarm)
 * 2. Remedy Relationships (local parsing)
 * 3. Dr. Reckeweg R1-R89 (Playwright swarm)
 * 4. Clinical Tips (Playwright swarm)
 */
const { scrapeAllChapters } = require('./kent_repertory_scraper');
const { parseAllRelationships } = require('./relationship_parser');
const { scrapeAllReckeweg } = require('./reckeweg_detail_scraper');
const { scrapeAllClinicalTips } = require('./clinical_tips_scraper');

async function main() {
  console.log('═'.repeat(60));
  console.log('  PHASE 7 ORCHESTRATOR — 4 PARALLEL SCRAPERS');
  console.log('═'.repeat(60));
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log('');
  
  const startTime = Date.now();
  
  // Launch ALL scrapers simultaneously
  const results = await Promise.allSettled([
    scrapeAllChapters().then(n => ({ name: 'Kent Repertory', count: n })),
    parseAllRelationships().then(n => ({ name: 'Relationships', count: n })),
    scrapeAllReckeweg().then(n => ({ name: 'Reckeweg R1-R89', count: n })),
    scrapeAllClinicalTips().then(n => ({ name: 'Clinical Tips', count: n }))
  ]);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '═'.repeat(60));
  console.log('  PHASE 7 RESULTS');
  console.log('═'.repeat(60));
  
  for (const r of results) {
    if (r.status === 'fulfilled') {
      console.log(`  ✅ ${r.value.name}: ${r.value.count} records`);
    } else {
      console.log(`  ❌ FAILED: ${r.reason?.message || r.reason}`);
    }
  }
  
  console.log(`\n  Total time: ${elapsed}s`);
  console.log('═'.repeat(60));
}

main().catch(console.error);

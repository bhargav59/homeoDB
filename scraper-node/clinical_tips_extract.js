const fs = require('fs');
const path = require('path');
const PROCESSED_DIR = path.join(__dirname, '..', 'data', 'processed');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'clinical_tips');
fs.mkdirSync(OUTPUT_DIR, {recursive: true});

const files = fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.json'));
const tips = [];

for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(PROCESSED_DIR, f), 'utf-8'));
    if (!d.name) continue;
    
    const tip = {
      remedy: d.name,
      abbreviation: d.abbreviation || '',
      key_symptoms: (d.key_symptoms || []).slice(0, 3),
      modalities: d.modalities || {},
      mind_symptoms: (d.mind_symptoms || []).slice(0, 2),
      complementary: d.complementary_remedies || [],
      source: d.source?.url || 'local'
    };
    
    if (tip.key_symptoms.length > 0 || tip.mind_symptoms.length > 0) {
      tips.push(tip);
    }
  } catch {}
}

fs.writeFileSync(path.join(OUTPUT_DIR, 'clinical_tips_full.json'), JSON.stringify({
  total_tips: tips.length,
  generated_at: new Date().toISOString(),
  tips: tips
}, null, 2));

console.log('[ClinicalTips] Extracted ' + tips.length + ' clinical tip entries from processed files');

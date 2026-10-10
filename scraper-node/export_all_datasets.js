/**
 * 7-Dataset Exporter
 * Produces clean, deduplicated JSON exports in data/exports/
 * for import into the other project.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXPORT_DIR = path.join(DATA_DIR, 'exports');

function readAllJsonInDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.includes('_full'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

function exportMateriaMedica() {
  console.log('[Export] 1/7 Materia Medica...');
  const processed = readAllJsonInDir(path.join(DATA_DIR, 'processed'));
  const allen = readAllJsonInDir(path.join(DATA_DIR, 'allen_keynotes'));
  
  // Deduplicate by name
  const seen = new Map();
  for (const r of processed) {
    const key = (r.name || '').toUpperCase().trim();
    if (key) {
      if (!seen.has(key)) seen.set(key, { ...r, sources: [r.source?.url || 'boericke/clarke'] });
      else seen.get(key).sources.push(r.source?.url || 'boericke/clarke');
    }
  }
  for (const r of allen) {
    const key = (r.name || '').toUpperCase().trim();
    if (key) {
      if (!seen.has(key)) {
        seen.set(key, {
          name: r.name,
          common_names: r.common_name ? [r.common_name] : [],
          family: r.family,
          key_symptoms: r.key_symptoms,
          modalities: r.modalities,
          source: { url: 'allen_keynotes', type: 'Allen\'s Keynotes' },
          sources: ['allen_keynotes']
        });
      } else {
        // Merge Allen data into existing
        const existing = seen.get(key);
        existing.sources.push('allen_keynotes');
        if (r.key_symptoms?.length && (!existing.key_symptoms?.length)) {
          existing.key_symptoms = r.key_symptoms;
        }
      }
    }
  }
  
  const entries = Array.from(seen.values());
  const output = { total: entries.length, exported_at: new Date().toISOString(), entries };
  fs.writeFileSync(path.join(EXPORT_DIR, 'materia_medica.json'), JSON.stringify(output, null, 2));
  console.log(`  → ${entries.length} entries`);
  return entries.length;
}

function exportKentRepertory() {
  console.log('[Export] 2/7 Kent\'s Repertory...');
  const fullPath = path.join(DATA_DIR, 'kent_repertory', 'kent_repertory_full.json');
  if (fs.existsSync(fullPath)) {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    
    // Also include raw chapter text for completeness
    const rawFiles = fs.readdirSync(path.join(DATA_DIR, 'kent_repertory'))
      .filter(f => f.startsWith('raw_') && f.endsWith('.json'));
    
    const chapters = {};
    for (const f of rawFiles) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'kent_repertory', f), 'utf-8'));
        const chName = f.replace('raw_', '').replace('.json', '');
        chapters[chName] = {
          chapter: chName,
          url: raw.url,
          title: raw.title,
          text_length: (raw.text || '').length,
          text: raw.text
        };
      } catch {}
    }
    
    const output = {
      total_rubrics: data.total_rubrics,
      total_chapters: Object.keys(chapters).length,
      exported_at: new Date().toISOString(),
      rubrics: data.rubrics,
      chapters
    };
    fs.writeFileSync(path.join(EXPORT_DIR, 'kent_repertory.json'), JSON.stringify(output, null, 2));
    console.log(`  → ${data.total_rubrics} rubrics, ${Object.keys(chapters).length} chapters`);
    return data.total_rubrics;
  }
  console.log('  → No Kent data found');
  return 0;
}

function exportRelationships() {
  console.log('[Export] 3/7 Remedy Relationships...');
  const resolvedDir = path.join(DATA_DIR, 'relationships_resolved');
  const entries = readAllJsonInDir(resolvedDir);
  
  // Count resolution stats
  let totalResolved = 0, totalUnresolved = 0;
  for (const e of entries) {
    for (const [, items] of Object.entries(e.relationships || {})) {
      for (const item of items) {
        if (item.resolved_name) totalResolved++;
        else totalUnresolved++;
      }
    }
  }
  
  const output = {
    total_remedies: entries.length,
    total_resolved: totalResolved,
    total_unresolved: totalUnresolved,
    resolution_rate: totalResolved + totalUnresolved > 0 
      ? ((totalResolved / (totalResolved + totalUnresolved)) * 100).toFixed(1) + '%' 
      : '0%',
    exported_at: new Date().toISOString(),
    entries
  };
  fs.writeFileSync(path.join(EXPORT_DIR, 'relationships.json'), JSON.stringify(output, null, 2));
  console.log(`  → ${entries.length} remedies, ${totalResolved} resolved (${output.resolution_rate})`);
  return entries.length;
}

function exportReckeweg() {
  console.log('[Export] 4/7 Reckeweg Remedies...');
  const remedies = readAllJsonInDir(path.join(DATA_DIR, 'reckeweg_remedies'));
  const ingredients = readAllJsonInDir(path.join(DATA_DIR, 'reckeweg_ingredients'));
  
  // Merge ingredients into remedies
  const ingMap = {};
  for (const ing of ingredients) {
    ingMap[ing.remedy_number] = ing.ingredients;
  }
  
  const merged = remedies.map(r => ({
    ...r,
    ingredients_detail: ingMap[r.number] || r.composition || []
  }));
  
  const output = { total: merged.length, exported_at: new Date().toISOString(), remedies: merged };
  fs.writeFileSync(path.join(EXPORT_DIR, 'reckeweg_remedies.json'), JSON.stringify(output, null, 2));
  console.log(`  → ${merged.length} remedies`);
  return merged.length;
}

function exportClinicalTips() {
  console.log('[Export] 5/7 Clinical Tips...');
  const fullPath = path.join(DATA_DIR, 'clinical_tips', 'clinical_tips_full.json');
  if (fs.existsSync(fullPath)) {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    fs.writeFileSync(path.join(EXPORT_DIR, 'clinical_tips.json'), JSON.stringify({
      ...data, exported_at: new Date().toISOString()
    }, null, 2));
    console.log(`  → ${data.total_tips} tips`);
    return data.total_tips;
  }
  return 0;
}

function exportCaseDetails() {
  console.log('[Export] 6/7 Case Details Schema...');
  const caseStore = require('./case_details_store');
  const cases = caseStore.listAll();
  const output = {
    schema: caseStore.SCHEMA,
    sample_cases: cases,
    total: cases.length,
    exported_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(EXPORT_DIR, 'case_details.json'), JSON.stringify(output, null, 2));
  console.log(`  → schema + ${cases.length} cases`);
  return cases.length;
}

function exportUserNotes() {
  console.log('[Export] 7/7 User Notes Schema...');
  const noteStore = require('./user_notes_store');
  const notes = noteStore.listAll();
  const output = {
    schema: noteStore.SCHEMA,
    sample_notes: notes,
    total: notes.length,
    exported_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(EXPORT_DIR, 'user_notes.json'), JSON.stringify(output, null, 2));
  console.log(`  → schema + ${notes.length} notes`);
  return notes.length;
}

async function main() {
  console.log('═'.repeat(50));
  console.log('  7-DATASET EXPORT');
  console.log('═'.repeat(50));
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  
  const results = {
    materia_medica: exportMateriaMedica(),
    kent_repertory: exportKentRepertory(),
    relationships: exportRelationships(),
    reckeweg: exportReckeweg(),
    clinical_tips: exportClinicalTips(),
    case_details: exportCaseDetails(),
    user_notes: exportUserNotes()
  };
  
  console.log('\n' + '═'.repeat(50));
  console.log('  EXPORT COMPLETE → data/exports/');
  console.log('═'.repeat(50));
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }
  
  // List files
  const files = fs.readdirSync(EXPORT_DIR);
  console.log(`\n  Files created: ${files.length}`);
  for (const f of files) {
    const stats = fs.statSync(path.join(EXPORT_DIR, f));
    console.log(`    ${f}: ${(stats.size / 1024).toFixed(0)} KB`);
  }
}

main().catch(console.error);

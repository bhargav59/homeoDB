/**
 * Relationship Fuzzy Resolver
 * Resolves free-text remedy references to known remedy names using:
 * 1. Exact match → 2. Case-insensitive match → 3. Prefix match → 4. Substring → 5. Levenshtein
 * Input: data/relationships/*.json
 * Reference: All remedy names from data/processed/
 * Output: data/relationships_resolved/
 */
const fs = require('fs');
const path = require('path');

const PROCESSED_DIR = path.join(__dirname, '..', 'data', 'processed');
const REL_DIR = path.join(__dirname, '..', 'data', 'relationships');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'relationships_resolved');

// Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost);
    }
  }
  return d[m][n];
}

function buildRemedyIndex() {
  console.log('[Resolver] Building remedy name index...');
  const names = new Map(); // lowercase → original name
  const abbrevs = new Map(); // abbreviation → name
  
  const files = fs.readdirSync(PROCESSED_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(PROCESSED_DIR, f), 'utf-8'));
      const name = d.name?.trim();
      if (name) {
        names.set(name.toLowerCase(), name);
        // Also add common abbreviations
        const abbr = d.abbreviation?.trim();
        if (abbr) abbrevs.set(abbr.toLowerCase(), name);
        // Add first word as a potential match
        const firstWord = name.split(/[\s(]/)[0].toLowerCase();
        if (firstWord.length >= 3 && !names.has(firstWord)) {
          names.set(firstWord, name);
        }
      }
    } catch {}
  }
  
  // Add common homeopathic abbreviation mappings
  const commonAbbrevs = {
    'acon': 'ACONITUM NAPELLUS', 'ars': 'ARSENICUM ALBUM', 'bell': 'BELLADONNA',
    'bry': 'BRYONIA', 'calc': 'CALCAREA CARBONICA', 'cham': 'CHAMOMILLA',
    'chin': 'CHINA OFFICINALIS', 'cimic': 'CIMICIFUGA RACEMOSA', 'coloc': 'COLOCYNTHIS',
    'con': 'CONIUM MACULATUM', 'dulc': 'DULCAMARA', 'ferr': 'FERRUM METALLICUM',
    'gels': 'GELSEMIUM', 'graph': 'GRAPHITES', 'hep': 'HEPAR SULPHURIS',
    'hyos': 'HYOSCYAMUS NIGER', 'ign': 'IGNATIA AMARA', 'ipec': 'IPECACUANHA',
    'kali': 'KALI CARBONICUM', 'lach': 'LACHESIS', 'lyc': 'LYCOPODIUM CLAVATUM',
    'merc': 'MERCURIUS SOLUBILIS', 'nat-m': 'NATRUM MURIATICUM', 'nit-ac': 'NITRICUM ACIDUM',
    'nux-v': 'NUX VOMICA', 'phos': 'PHOSPHORUS', 'puls': 'PULSATILLA',
    'rhus': 'RHUS TOXICODENDRON', 'sep': 'SEPIA', 'sil': 'SILICEA',
    'sulph': 'SULPHUR', 'thuj': 'THUJA OCCIDENTALIS', 'verat': 'VERATRUM ALBUM',
    'arn': 'ARNICA MONTANA', 'apis': 'APIS MELLIFICA', 'arg-n': 'ARGENTUM NITRICUM',
    'aur': 'AURUM METALLICUM', 'bar-c': 'BARYTA CARBONICA', 'bor': 'BORAX',
    'carb-v': 'CARBO VEGETABILIS', 'caust': 'CAUSTICUM', 'coff': 'COFFEA CRUDA',
    'dig': 'DIGITALIS', 'dros': 'DROSERA', 'euphr': 'EUPHRASIA',
    'kali-b': 'KALI BICHROMICUM', 'kali-c': 'KALI CARBONICUM', 'kreos': 'KREOSOTUM',
    'led': 'LEDUM', 'mag-p': 'MAGNESIA PHOSPHORICA', 'med': 'MEDORRHINUM',
    'nat-c': 'NATRUM CARBONICUM', 'nat-s': 'NATRUM SULPHURICUM', 'nit-ac': 'NITRICUM ACIDUM',
    'op': 'OPIUM', 'phyt': 'PHYTOLACCA', 'plat': 'PLATINA', 'plb': 'PLUMBUM',
    'ran-b': 'RANUNCULUS BULBOSUS', 'ruta': 'RUTA GRAVEOLENS', 'sabad': 'SABADILLA',
    'sang': 'SANGUINARIA', 'sec': 'SECALE CORNUTUM', 'spig': 'SPIGELIA',
    'spong': 'SPONGIA TOSTA', 'stann': 'STANNUM', 'staph': 'STAPHYSAGRIA',
    'stram': 'STRAMONIUM', 'tab': 'TABACUM', 'zinc': 'ZINCUM METALLICUM',
    'ant-t': 'ANTIMONIUM TARTARICUM', 'ant-c': 'ANTIMONIUM CRUDUM',
    'cupr': 'CUPRUM METALLICUM', 'colch': 'COLCHICUM',
  };
  
  for (const [abbr, name] of Object.entries(commonAbbrevs)) {
    abbrevs.set(abbr, name);
    // Also without hyphens
    abbrevs.set(abbr.replace(/-/g, ''), name);
  }
  
  console.log(`[Resolver] Index: ${names.size} names, ${abbrevs.size} abbreviations`);
  return { names, abbrevs };
}

function resolveText(text, index) {
  if (!text || text.length < 2) return null;
  
  // Clean up the text
  let cleaned = text
    .replace(/\([^)]*\)/g, '')  // Remove parenthetical notes
    .replace(/\b(in|for|of|the|with|and|or|to|after|before|during|abuse|cases?|gout|quinine|mercury)\b/gi, '')
    .replace(/\b[Dd]\d+/g, '')  // Remove potencies like D4, D6
    .replace(/[^a-zA-Z\s-]/g, '')
    .trim();
  
  if (cleaned.length < 2) return null;
  
  const lower = cleaned.toLowerCase();
  const { names, abbrevs } = index;
  
  // 1. Exact match
  if (names.has(lower)) return { match: names.get(lower), confidence: 1.0, method: 'exact' };
  
  // 2. Abbreviation match
  if (abbrevs.has(lower)) return { match: abbrevs.get(lower), confidence: 0.95, method: 'abbreviation' };
  
  // 3. Partial abbreviation (first 3-4 chars)
  const prefix3 = lower.substring(0, 3);
  const prefix4 = lower.substring(0, 4);
  for (const [abbr, name] of abbrevs) {
    if (abbr.startsWith(prefix4) || prefix4.startsWith(abbr)) {
      return { match: name, confidence: 0.85, method: 'prefix_abbrev' };
    }
  }
  
  // 4. Substring match in names
  for (const [key, name] of names) {
    if (key.includes(lower) || lower.includes(key)) {
      return { match: name, confidence: 0.8, method: 'substring' };
    }
  }
  
  // 5. Word-based matching — first word of cleaned text against first words of names
  const firstWord = lower.split(/\s/)[0];
  if (firstWord.length >= 3) {
    for (const [abbr, name] of abbrevs) {
      if (abbr === firstWord) return { match: name, confidence: 0.85, method: 'first_word_abbr' };
    }
    for (const [key, name] of names) {
      const nameFirst = key.split(/\s/)[0];
      if (nameFirst === firstWord && firstWord.length >= 4) {
        return { match: name, confidence: 0.75, method: 'first_word' };
      }
    }
  }
  
  // 6. Levenshtein (only for short strings, expensive)
  if (cleaned.length <= 20) {
    let bestDist = Infinity, bestName = null;
    for (const [key, name] of names) {
      if (Math.abs(key.length - lower.length) > 3) continue;
      const dist = levenshtein(lower, key);
      if (dist < bestDist) { bestDist = dist; bestName = name; }
    }
    // Also check abbreviations
    for (const [abbr, name] of abbrevs) {
      if (Math.abs(abbr.length - lower.length) > 2) continue;
      const dist = levenshtein(lower, abbr);
      if (dist < bestDist) { bestDist = dist; bestName = name; }
    }
    
    if (bestDist <= 3 && bestName) {
      return { match: bestName, confidence: Math.max(0.5, 1 - bestDist * 0.15), method: `levenshtein_${bestDist}` };
    }
  }
  
  return null;
}

async function resolveAll() {
  console.log('[Resolver] Starting fuzzy relationship resolution...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const index = buildRemedyIndex();
  const relFiles = fs.readdirSync(REL_DIR).filter(f => f.endsWith('.json'));
  
  let totalResolved = 0, totalItems = 0, filesWithData = 0;
  
  for (const f of relFiles) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(REL_DIR, f), 'utf-8'));
      const rels = d.relationships || {};
      const resolved = {};
      let hasAny = false;
      
      for (const [category, items] of Object.entries(rels)) {
        resolved[category] = [];
        for (const item of items) {
          totalItems++;
          const match = resolveText(item, index);
          if (match) {
            resolved[category].push({
              original: item,
              resolved_name: match.match,
              confidence: match.confidence,
              method: match.method
            });
            totalResolved++;
            hasAny = true;
          } else {
            resolved[category].push({
              original: item,
              resolved_name: null,
              confidence: 0,
              method: 'unresolved'
            });
          }
        }
      }
      
      if (hasAny) filesWithData++;
      
      fs.writeFileSync(path.join(OUTPUT_DIR, f), JSON.stringify({
        remedy_name: d.remedy_name,
        source_file: d.source_file,
        relationships: resolved,
        resolved_at: new Date().toISOString()
      }, null, 2));
    } catch {}
  }
  
  console.log(`[Resolver] ✅ COMPLETE: ${totalResolved}/${totalItems} items resolved across ${filesWithData} files`);
  return { totalResolved, totalItems, filesWithData };
}

module.exports = { resolveAll };
if (require.main === module) { resolveAll().catch(console.error); }

/**
 * Remedy Relationships Parser — Local File Processing (No Network)
 * Re-parses existing Boericke raw HTML files in data/raw/ to extract
 * the "Relationship" sections: Complementary, Antidoted_by, Follows_well, Inimical, Compare.
 * Output: data/relationships/<remedy_name>.json
 */
const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const PROCESSED_DIR = path.join(__dirname, '..', 'data', 'processed');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'relationships');

function extractRelationships(text) {
  const result = {
    complementary: [],
    antidoted_by: [],
    follows_well: [],
    inimical: [],
    compare: [],
    incompatible: [],
    antidotes: []
  };
  
  if (!text) return result;
  
  // Find the Relationship section
  const relSectionMatch = text.match(/Relationship[s]?\s*[-.:]*\s*([\s\S]*?)(?=Dose|Dosage|$)/i);
  if (!relSectionMatch) return result;
  
  const relText = relSectionMatch[1];
  
  // Extract each category
  const patterns = [
    { key: 'complementary', regex: /Complement(?:ary|s?)\s*[:.-]*\s*([^.;]+(?:\([^)]*\))?[^.;]*)/gi },
    { key: 'antidoted_by', regex: /Antidote[sd]?\s*(?:by)?\s*[:.-]*\s*([^.;]+)/gi },
    { key: 'antidotes', regex: /(?:It )?Antidote[s]?\s*(?:to)?\s*[:.-]*\s*([^.;]+)/gi },
    { key: 'follows_well', regex: /Follow[s]?\s*well\s*[:.-]*\s*([^.;]+)/gi },
    { key: 'inimical', regex: /Inimic(?:al|s?)\s*[:.-]*\s*([^.;]+)/gi },
    { key: 'compare', regex: /Compare\s*[:.-]*\s*([^.]+)/gi },
    { key: 'incompatible', regex: /Incompatible\s*[:.-]*\s*([^.;]+)/gi }
  ];
  
  for (const { key, regex } of patterns) {
    let match;
    while ((match = regex.exec(relText)) !== null) {
      const remedies = match[1]
        .split(/[,;]/)
        .map(r => r.replace(/\([^)]*\)/g, '').trim())
        .filter(r => r.length > 1 && r.length < 40 && !/^\d+$/.test(r));
      result[key].push(...remedies);
    }
  }
  
  // Deduplicate
  for (const key of Object.keys(result)) {
    result[key] = [...new Set(result[key])];
  }
  
  return result;
}

async function parseAllRelationships() {
  console.log('[Relationships] Starting local relationship extraction...');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Read all raw files
  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
  console.log(`[Relationships] Processing ${rawFiles.length} raw files...`);
  
  let extracted = 0;
  let withRelationships = 0;
  
  for (const file of rawFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf-8'));
      const text = raw.text || raw.content || '';
      const url = raw.url || '';
      
      // Get remedy name from matching processed file
      const processedFile = `processed_${file}`;
      let remedyName = file.replace('.json', '').replace('raw_', '');
      
      const processedPath = path.join(PROCESSED_DIR, processedFile);
      if (fs.existsSync(processedPath)) {
        try {
          const processed = JSON.parse(fs.readFileSync(processedPath, 'utf-8'));
          remedyName = processed.name || remedyName;
        } catch {}
      }
      
      const relationships = extractRelationships(text);
      const hasData = Object.values(relationships).some(arr => arr.length > 0);
      
      if (hasData) {
        withRelationships++;
      }
      
      const output = {
        remedy_name: remedyName,
        source_file: file,
        source_url: url,
        relationships: relationships,
        parsed_at: new Date().toISOString()
      };
      
      const safeName = remedyName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${safeName}.json`),
        JSON.stringify(output, null, 2)
      );
      
      extracted++;
    } catch (err) {
      // Skip malformed files
    }
  }
  
  console.log(`[Relationships] ✅ COMPLETE: ${extracted} files processed, ${withRelationships} contain relationship data`);
  return extracted;
}

module.exports = { parseAllRelationships };

if (require.main === module) {
  parseAllRelationships().catch(console.error);
}

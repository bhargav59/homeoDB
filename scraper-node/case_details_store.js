/**
 * Case Details — JSON Store with CRUD helpers
 * Stores patient case history, prescriptions, and follow-ups.
 * Data: data/case_details/
 */
const fs = require('fs');
const path = require('path');

const STORE_DIR = path.join(__dirname, '..', 'data', 'case_details');
fs.mkdirSync(STORE_DIR, { recursive: true });

const SCHEMA = {
  id: '',               // auto-generated UUID
  patient_name: '',     // optional, can be anonymized
  age: null,
  gender: '',
  chief_complaint: '',
  history: '',          // presenting history narrative
  past_history: '',
  family_history: '',
  mental_symptoms: [],
  physical_symptoms: [],
  modalities: { worse: [], better: [] },
  prescription: {
    remedy: '',
    potency: '',
    dosage: '',
    frequency: ''
  },
  follow_ups: [
    // { date: '', notes: '', prescription_change: '' }
  ],
  outcome: '',          // improved / cured / unchanged / aggravated
  tags: [],
  created_at: '',
  updated_at: ''
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function create(data) {
  const entry = {
    ...SCHEMA,
    ...data,
    id: generateId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const filePath = path.join(STORE_DIR, `case_${entry.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  console.log(`[CaseDetails] Created: ${entry.id}`);
  return entry;
}

function read(id) {
  const filePath = path.join(STORE_DIR, `case_${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function update(id, updates) {
  const entry = read(id);
  if (!entry) return null;
  const updated = { ...entry, ...updates, updated_at: new Date().toISOString() };
  fs.writeFileSync(path.join(STORE_DIR, `case_${id}.json`), JSON.stringify(updated, null, 2));
  console.log(`[CaseDetails] Updated: ${id}`);
  return updated;
}

function remove(id) {
  const filePath = path.join(STORE_DIR, `case_${id}.json`);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
  return false;
}

function listAll() {
  return fs.readdirSync(STORE_DIR)
    .filter(f => f.startsWith('case_') && f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf-8')));
}

function addFollowUp(id, followUp) {
  const entry = read(id);
  if (!entry) return null;
  entry.follow_ups.push({ ...followUp, date: followUp.date || new Date().toISOString() });
  return update(id, { follow_ups: entry.follow_ups });
}

module.exports = { SCHEMA, create, read, update, remove, listAll, addFollowUp };

if (require.main === module) {
  // Seed with a sample case
  const sample = create({
    patient_name: 'Sample Patient',
    age: 35,
    gender: 'Male',
    chief_complaint: 'Recurrent headache worse in morning',
    history: 'Patient presents with throbbing frontal headache, worse on waking, better by pressure.',
    mental_symptoms: ['Irritability', 'Anxiety about health'],
    physical_symptoms: ['Frontal headache', 'Nausea with headache'],
    modalities: { worse: ['Morning', 'Warmth'], better: ['Pressure', 'Open air'] },
    prescription: { remedy: 'Bryonia Alba', potency: '30C', dosage: '3 pellets', frequency: 'TDS' },
    tags: ['headache', 'bryonia']
  });
  console.log(`Sample case created: ${sample.id}`);
  console.log(`Total cases: ${listAll().length}`);
}

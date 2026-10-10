/**
 * User Notes — JSON Store with CRUD helpers
 * Stores user-created notes on remedies, symptoms, or study topics.
 * Data: data/user_notes/
 */
const fs = require('fs');
const path = require('path');

const STORE_DIR = path.join(__dirname, '..', 'data', 'user_notes');
fs.mkdirSync(STORE_DIR, { recursive: true });

const SCHEMA = {
  id: '',
  title: '',
  content: '',          // markdown-formatted note body
  linked_remedy: '',    // optional link to a remedy name
  linked_rubric: '',    // optional link to a repertory rubric
  category: '',         // study / clinical / personal / reference
  tags: [],
  pinned: false,
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
  const filePath = path.join(STORE_DIR, `note_${entry.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  console.log(`[UserNotes] Created: ${entry.id} — "${entry.title}"`);
  return entry;
}

function read(id) {
  const filePath = path.join(STORE_DIR, `note_${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function update(id, updates) {
  const entry = read(id);
  if (!entry) return null;
  const updated = { ...entry, ...updates, updated_at: new Date().toISOString() };
  fs.writeFileSync(path.join(STORE_DIR, `note_${id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

function remove(id) {
  const filePath = path.join(STORE_DIR, `note_${id}.json`);
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); return true; }
  return false;
}

function listAll() {
  return fs.readdirSync(STORE_DIR)
    .filter(f => f.startsWith('note_') && f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf-8')));
}

function search(query) {
  const q = query.toLowerCase();
  return listAll().filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.content.toLowerCase().includes(q) ||
    n.tags.some(t => t.toLowerCase().includes(q))
  );
}

module.exports = { SCHEMA, create, read, update, remove, listAll, search };

if (require.main === module) {
  const sample = create({
    title: 'Sulphur — Key Differentials',
    content: '## Sulphur vs Psorinum\n- Sulphur: warm-blooded, aversion to bathing\n- Psorinum: chilly, despair of recovery\n\n## Keynotes\n- Burning sensations everywhere\n- Redness of orifices\n- 11am aggravation',
    linked_remedy: 'Sulphur',
    category: 'study',
    tags: ['sulphur', 'comparison', 'keynotes'],
    pinned: true
  });
  console.log(`Sample note created: ${sample.id}`);
  console.log(`Total notes: ${listAll().length}`);
}

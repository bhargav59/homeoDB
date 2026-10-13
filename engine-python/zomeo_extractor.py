import re
import os
import json
import psycopg2
from psycopg2.extras import execute_batch

ZOMEO_ROOT = "/Volumes/Zomeo Trial 13.7.2/Zomeo Trial.app/Contents/Resources/app/Files"
PROCESSED_DIR = "data/processed/zomeo"

DB_CONFIG = {
    "dbname": "oorep",
    "user": "oorep_user",
    "password": "poofoo",
    "host": "localhost",
    "port": 5432
}

def parse_sql_values(raw_vals):
    fields = []
    cur = []
    in_q = False
    i = 0
    n = len(raw_vals)
    while i < n:
        c = raw_vals[i]
        if c == "'" and (i == 0 or raw_vals[i-1] != "\\"):
            if in_q and i + 1 < n and raw_vals[i+1] == "'":
                cur.append("'")
                i += 1
            else:
                in_q = not in_q
        elif c == "," and not in_q:
            fields.append("".join(cur).strip())
            cur = []
        else:
            cur.append(c)
        i += 1
    fields.append("".join(cur).strip())
    return [f.strip("'") for f in fields]

def extract_remedy_master():
    path = os.path.join(ZOMEO_ROOT, "Insert/Remedy.sql")
    print(f"Reading master remedies from {path}...")
    rems = {}
    with open(path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*?)\);', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 3 and fields[0].isdigit():
                    rem_id = int(fields[0])
                    abbr = fields[1].strip()
                    fullname = fields[2].strip()
                    rems[rem_id] = {"abbr": abbr, "fullname": fullname}
    print(f"Loaded {len(rems)} master remedies.")
    return rems

def extract_remedy_properties():
    path = os.path.join(ZOMEO_ROOT, "Insert/RemedyProperties.sql")
    print(f"Reading remedy properties from {path}...")
    props = {}
    with open(path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*?)\);', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 14 and fields[0].isdigit():
                    rem_id = int(fields[0])
                    props[rem_id] = {
                        "common_names": fields[1],
                        "chemical_formula": fields[2],
                        "kingdom": fields[3],
                        "family": fields[4],
                        "part_used": fields[5],
                        "miasm": fields[12],
                        "thermal": fields[13],
                        "periodicity": fields[19] if len(fields) > 19 else ""
                    }
    print(f"Loaded {len(props)} remedy properties.")
    return props

def extract_remedy_relations():
    path = os.path.join(ZOMEO_ROOT, "Insert/RemedyRelations.sql")
    print(f"Reading remedy relationships from {path}...")
    relations = {}
    with open(path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*?)\);', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if fields and fields[0].isdigit():
                    rem_id = int(fields[0])
                    relations[rem_id] = {
                        "complementary": fields[1] if len(fields) > 1 else "",
                        "follows_well": fields[3] if len(fields) > 3 else "",
                        "antidotes": fields[4] if len(fields) > 4 else "",
                        "inimical": fields[7] if len(fields) > 7 else "",
                        "duration": fields[9] if len(fields) > 9 else ""
                    }
    print(f"Loaded {len(relations)} remedy relationships.")
    return relations

def extract_keynotes():
    path = os.path.join(ZOMEO_ROOT, "RemedyInfo/keynote.dat")
    print(f"Reading structured keynotes from {path}...")
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    blocks = content.split('\n$ ')
    keynotes = []
    for idx, block in enumerate(blocks):
        if idx == 0 and block.startswith('$ '):
            block = block[2:]
        lines = block.strip().split('\n')
        if not lines:
            continue

        header = lines[0].strip()
        m = re.match(r'^(.*?)\s*\[(.*?)\]$', header)
        if m:
            name = m.group(1).strip()
            abbr = m.group(2).strip()
        else:
            name = header
            abbr = ""

        sections = {}
        curr_sec = "OVERVIEW"
        curr_text = []

        for line in lines[1:]:
            line_str = line.strip()
            if line_str.startswith('# ') and ':' in line_str:
                sec_name = line_str[2:].split(':', 1)[0].strip()
                if curr_text:
                    sections[curr_sec] = "\n".join(curr_text).strip()
                curr_sec = sec_name
                rest = line_str.split(':', 1)[1].strip()
                curr_text = [rest] if rest else []
            elif line_str.startswith('# '):
                sec_name = line_str[2:].strip()
                if curr_text:
                    sections[curr_sec] = "\n".join(curr_text).strip()
                curr_sec = sec_name
                curr_text = []
            else:
                curr_text.append(line)

        if curr_text:
            sections[curr_sec] = "\n".join(curr_text).strip()

        keynotes.append({
            "name": name,
            "abbreviation": abbr,
            "sections": sections
        })
    print(f"Loaded {len(keynotes)} remedy keynotes.")
    return keynotes

def main():
    os.makedirs(PROCESSED_DIR, exist_ok=True)

    rems = extract_remedy_master()
    props = extract_remedy_properties()
    relations = extract_remedy_relations()
    keynotes = extract_keynotes()

    abbr_to_id = {}
    name_to_id = {}
    for rid, r in rems.items():
        if r["abbr"]:
            abbr_to_id[r["abbr"].lower()] = rid
        if r["fullname"]:
            name_to_id[r["fullname"].lower()] = rid

    merged_corpus = []

    for k in keynotes:
        name = k["name"]
        abbr = k["abbreviation"]
        secs = k["sections"]

        matched_id = None
        if abbr and abbr.lower() in abbr_to_id:
            matched_id = abbr_to_id[abbr.lower()]
        elif name.lower() in name_to_id:
            matched_id = name_to_id[name.lower()]

        p = props.get(matched_id, {}) if matched_id else {}
        rel = relations.get(matched_id, {}) if matched_id else {}

        key_symptoms = "\n\n".join(filter(None, [secs.get("KEYNOTES"), secs.get("NUCLEUS OF REMEDY"), secs.get("OVERVIEW")]))
        guiding_symptoms = secs.get("GUIDING INDICATIONS", "")
        modalities = secs.get("MODALITIES", "")
        mind_symptoms = secs.get("MIND", "")
        common_names = p.get("common_names", "") or secs.get("SYNONYMS", "") or secs.get("COMMON NAME", "")
        kingdom = p.get("kingdom", "") or secs.get("KINGDOM", "")
        family = p.get("family", "") or secs.get("FAMILY", "")
        miasm = p.get("miasm", "")
        thermal = p.get("thermal", "")
        complementary = rel.get("complementary", "")
        inimical = rel.get("inimical", "")
        antidotes = rel.get("antidotes", "")
        constitution = secs.get("CONSTITUTION", "")

        record = {
            "remedy_name": name,
            "abbreviation": abbr,
            "key_symptoms": key_symptoms,
            "guiding_symptoms": guiding_symptoms,
            "modalities": modalities,
            "mind_symptoms": mind_symptoms,
            "common_names": common_names,
            "kingdom": kingdom,
            "family": family,
            "miasm": miasm,
            "thermal_state": thermal,
            "complementary_remedies": complementary,
            "inimical_remedies": inimical,
            "antidotes": antidotes,
            "constitution": constitution,
            "all_sections": secs
        }
        merged_corpus.append(record)

    export_json_path = os.path.join(PROCESSED_DIR, "zomeo_remedies_complete.json")
    print(f"Saving merged dataset to {export_json_path}...")
    with open(export_json_path, "w", encoding="utf-8") as f:
        json.dump(merged_corpus, f, indent=2, ensure_ascii=False)

    print("\n--- Connecting to PostgreSQL & Upserting into mm_enhanced ---")
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    upsert_sql = """
    INSERT INTO mm_enhanced (
        remedy_name, abbreviation, key_symptoms, guiding_symptoms,
        modalities, mind_symptoms, common_names, kingdom, family,
        miasm, thermal_state, complementary_remedies, inimical_remedies,
        antidotes, constitution, search_vector
    ) VALUES (
        %(remedy_name)s, %(abbreviation)s, %(key_symptoms)s, %(guiding_symptoms)s,
        %(modalities)s, %(mind_symptoms)s, %(common_names)s, %(kingdom)s, %(family)s,
        %(miasm)s, %(thermal_state)s, %(complementary_remedies)s, %(inimical_remedies)s,
        %(antidotes)s, %(constitution)s,
        to_tsvector('english', 
            coalesce(%(remedy_name)s, '') || ' ' || 
            coalesce(%(key_symptoms)s, '') || ' ' || 
            coalesce(%(guiding_symptoms)s, '') || ' ' || 
            coalesce(%(modalities)s, '') || ' ' || 
            coalesce(%(mind_symptoms)s, '') || ' ' || 
            coalesce(%(common_names)s, '')
        )
    )
    ON CONFLICT (remedy_name) DO UPDATE SET
        abbreviation = COALESCE(EXCLUDED.abbreviation, mm_enhanced.abbreviation),
        key_symptoms = COALESCE(EXCLUDED.key_symptoms, mm_enhanced.key_symptoms),
        guiding_symptoms = COALESCE(EXCLUDED.guiding_symptoms, mm_enhanced.guiding_symptoms),
        modalities = COALESCE(EXCLUDED.modalities, mm_enhanced.modalities),
        mind_symptoms = COALESCE(EXCLUDED.mind_symptoms, mm_enhanced.mind_symptoms),
        common_names = COALESCE(EXCLUDED.common_names, mm_enhanced.common_names),
        kingdom = COALESCE(EXCLUDED.kingdom, mm_enhanced.kingdom),
        family = COALESCE(EXCLUDED.family, mm_enhanced.family),
        miasm = COALESCE(EXCLUDED.miasm, mm_enhanced.miasm),
        thermal_state = COALESCE(EXCLUDED.thermal_state, mm_enhanced.thermal_state),
        complementary_remedies = COALESCE(EXCLUDED.complementary_remedies, mm_enhanced.complementary_remedies),
        inimical_remedies = COALESCE(EXCLUDED.inimical_remedies, mm_enhanced.inimical_remedies),
        antidotes = COALESCE(EXCLUDED.antidotes, mm_enhanced.antidotes),
        constitution = COALESCE(EXCLUDED.constitution, mm_enhanced.constitution),
        search_vector = to_tsvector('english', 
            coalesce(EXCLUDED.remedy_name, '') || ' ' || 
            coalesce(EXCLUDED.key_symptoms, '') || ' ' || 
            coalesce(EXCLUDED.guiding_symptoms, '') || ' ' || 
            coalesce(EXCLUDED.modalities, '') || ' ' || 
            coalesce(EXCLUDED.mind_symptoms, '') || ' ' || 
            coalesce(EXCLUDED.common_names, '')
        );
    """

    print(f"Executing batch upsert for {len(merged_corpus)} remedies...")
    execute_batch(cur, upsert_sql, merged_corpus, page_size=200)
    conn.commit()

    cur.execute("SELECT count(*) FROM mm_enhanced;")
    total_mm = cur.fetchone()[0]
    print(f"Upsert complete! Total remedies in mm_enhanced: {total_mm}")

    print("\n--- Ingesting Clinical Tips Table ---")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS zomeo_clinical_tips (
        id SERIAL PRIMARY KEY,
        remedy_id INT,
        indication TEXT,
        author VARCHAR(255),
        condition_id VARCHAR(50),
        organ_id VARCHAR(50),
        system_id VARCHAR(50)
    );
    """)
    cur.execute("TRUNCATE TABLE zomeo_clinical_tips;")

    tips_path = os.path.join(ZOMEO_ROOT, "Insert/ClinicalTips.sql")
    tips_records = []
    with open(tips_path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*?)\);', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 6:
                    remedy_id = int(fields[1]) if fields[1].isdigit() else None
                    indication = fields[2]
                    author = fields[5] if len(fields) > 5 else ""
                    condition_id = fields[6] if len(fields) > 6 else ""
                    organ_id = fields[8] if len(fields) > 8 else ""
                    system_id = fields[10] if len(fields) > 10 else ""
                    tips_records.append((remedy_id, indication, author, condition_id, organ_id, system_id))

    execute_batch(cur, """
    INSERT INTO zomeo_clinical_tips (remedy_id, indication, author, condition_id, organ_id, system_id)
    VALUES (%s, %s, %s, %s, %s, %s);
    """, tips_records, page_size=500)
    conn.commit()

    cur.execute("SELECT count(*) FROM zomeo_clinical_tips;")
    total_tips = cur.fetchone()[0]
    print(f"Ingested {total_tips} Clinical Tips into zomeo_clinical_tips!")

    cur.close()
    conn.close()
    print("\nALL TASKS FINISHED SUCCESSFULLY!")

if __name__ == "__main__":
    main()

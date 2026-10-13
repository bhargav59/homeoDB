import re
import os
import psycopg2
from psycopg2.extras import execute_batch

ZOMEO_ROOT = "/Volumes/Zomeo Trial 13.7.2/Zomeo Trial.app/Contents/Resources/app/Files"

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

def ingest():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    print("1. Ingesting Clinical Tips...")
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
            m = re.search(r'values\s*\((.*)\)', line, re.I)
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
    print(f"✅ Ingested {cur.fetchone()[0]} Clinical Tips!")

    print("\n2. Ingesting 54,000+ Verified Remedy Clinical Cases...")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS zomeo_remedy_cases (
        id INT PRIMARY KEY,
        remedy_id INT,
        title TEXT,
        journal_info TEXT,
        category VARCHAR(255),
        author VARCHAR(255)
    );
    """)
    cur.execute("TRUNCATE TABLE zomeo_remedy_cases;")

    cases_path = os.path.join(ZOMEO_ROOT, "Insert/RemedyCases.sql")
    cases_records = []
    with open(cases_path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*)\)', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 9 and fields[0].isdigit():
                    case_id = int(fields[0])
                    remedy_id = int(fields[1]) if fields[1].isdigit() else None
                    title = fields[2]
                    journal_info = fields[6]
                    category = fields[7]
                    author = fields[8]
                    cases_records.append((case_id, remedy_id, title, journal_info, category, author))

    execute_batch(cur, """
    INSERT INTO zomeo_remedy_cases (id, remedy_id, title, journal_info, category, author)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (id) DO NOTHING;
    """, cases_records, page_size=1000)
    conn.commit()

    cur.execute("SELECT count(*) FROM zomeo_remedy_cases;")
    print(f"✅ Ingested {cur.fetchone()[0]} Remedy Clinical Cases!")

    cur.close()
    conn.close()

if __name__ == "__main__":
    ingest()

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

def ingest_journals():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    print("1. Creating tables for Journals...")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS zomeo_journals (
        id INT PRIMARY KEY,
        code VARCHAR(50),
        name TEXT
    );
    """)
    cur.execute("TRUNCATE TABLE zomeo_journals;")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS zomeo_journal_articles (
        id INT PRIMARY KEY,
        journal_id INT,
        title TEXT,
        start_pos INT,
        end_pos INT,
        issue_date TEXT,
        author TEXT,
        category TEXT,
        remedies TEXT,
        FOREIGN KEY (journal_id) REFERENCES zomeo_journals(id) ON DELETE CASCADE
    );
    """)
    cur.execute("TRUNCATE TABLE zomeo_journal_articles;")

    # Ingest master journals
    j_path = os.path.join(ZOMEO_ROOT, "Insert/Journals.sql")
    j_records = []
    with open(j_path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*)\)', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 3 and fields[0].isdigit():
                    j_records.append((int(fields[0]), fields[1], fields[2]))

    execute_batch(cur, "INSERT INTO zomeo_journals (id, code, name) VALUES (%s, %s, %s);", j_records)
    conn.commit()
    print(f"✅ Ingested {len(j_records)} Master Journals!")

    # Ingest journal articles
    jd_path = os.path.join(ZOMEO_ROOT, "Insert/JournalsData.sql")
    jd_records = []
    with open(jd_path, 'r', encoding='latin1', errors='ignore') as f:
        for line in f:
            m = re.search(r'values\s*\((.*)\)', line, re.I)
            if m:
                fields = parse_sql_values(m.group(1))
                if len(fields) >= 9 and fields[0].isdigit():
                    art_id = int(fields[0])
                    jid = int(fields[1]) if fields[1].isdigit() else None
                    title = fields[2]
                    sp = int(fields[3]) if fields[3].isdigit() else 0
                    ep = int(fields[4]) if fields[4].isdigit() else 0
                    issue = fields[5]
                    author = fields[6]
                    cat = fields[7]
                    rems = fields[8]
                    jd_records.append((art_id, jid, title, sp, ep, issue, author, cat, rems))

    execute_batch(cur, """
    INSERT INTO zomeo_journal_articles (id, journal_id, title, start_pos, end_pos, issue_date, author, category, remedies)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (id) DO NOTHING;
    """, jd_records, page_size=1000)
    conn.commit()

    cur.execute("SELECT count(*) FROM zomeo_journal_articles;")
    print(f"✅ Ingested {cur.fetchone()[0]} Journal Articles with Remedies & Authors!")

    cur.close()
    conn.close()

if __name__ == "__main__":
    ingest_journals()

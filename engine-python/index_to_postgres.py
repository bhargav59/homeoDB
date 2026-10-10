import json
import os
import glob
import psycopg2

DB_CONFIG = {
    'dbname': 'oorep',
    'user': 'oorep_user',
    'password': 'poofoo',
    'host': 'localhost',
    'port': 5432
}

def connect_db():
    try:
        return psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        print(f"[!] Could not connect to PostgreSQL: {e}")
        return None

def create_table_if_not_exists(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mm_enhanced (
            remedy_name VARCHAR(255) PRIMARY KEY,
            abbreviation VARCHAR(255),
            key_symptoms TEXT,
            guiding_symptoms TEXT,
            modalities TEXT,
            mind_symptoms TEXT,
            head_symptoms TEXT,
            respiratory_symptoms TEXT,
            gi_symptoms TEXT,
            urinary_symptoms TEXT,
            skin_symptoms TEXT,
            fever_symptoms TEXT,
            search_vector TSVECTOR
        );
    """)
    conn.commit()
    cur.close()

def format_modalities(mod_dict):
    if not isinstance(mod_dict, dict):
        return ""
    agg = ", ".join(mod_dict.get("aggravation", []))
    amel = ", ".join(mod_dict.get("amelioration", []))
    res = []
    if agg: res.append(f"Worse: {agg}")
    if amel: res.append(f"Better: {amel}")
    return " | ".join(res)

def join_list(data):
    if isinstance(data, list):
        return "\n".join(data)
    return str(data)

def process_file(conn, filepath):
    print(f"\nProcessing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            records = json.load(f)
        except json.JSONDecodeError:
            print(f"[!] Could not parse JSON in {filepath}")
            return
            
    cur = conn.cursor()
    
    for i, record in enumerate(records):
        remedy_name = record.get("remedy_name", "UNKNOWN").strip().upper()
        if not remedy_name or remedy_name == "UNKNOWN":
            continue
            
        abbreviation = record.get("abbreviation", "")
        key_symptoms = join_list(record.get("keynotes", []))
        guiding_symptoms = join_list(record.get("clinical_indications", []))
        modalities = format_modalities(record.get("modalities", {}))
        mind_symptoms = join_list(record.get("mind_mental_symptoms", []))
        
        print(f" -> Upserting/Merging: {remedy_name}")
        
        cur.execute("SELECT 1 FROM mm_enhanced WHERE remedy_name = %s", (remedy_name,))
        exists = cur.fetchone()
        
        if exists:
            # CONCATENATE data instead of overwriting so we combine chunks of the same remedy!
            cur.execute("""
                UPDATE mm_enhanced 
                SET abbreviation = COALESCE(NULLIF(abbreviation, ''), %s), 
                    key_symptoms = COALESCE(key_symptoms, '') || ' \n ' || %s, 
                    guiding_symptoms = COALESCE(guiding_symptoms, '') || ' \n ' || %s, 
                    modalities = COALESCE(modalities, '') || ' \n ' || %s, 
                    mind_symptoms = COALESCE(mind_symptoms, '') || ' \n ' || %s
                WHERE remedy_name = %s
            """, (abbreviation, key_symptoms, guiding_symptoms, modalities, mind_symptoms, remedy_name))
        else:
            cur.execute("""
                INSERT INTO mm_enhanced (
                    remedy_name, abbreviation, key_symptoms, guiding_symptoms, 
                    modalities, mind_symptoms, head_symptoms, respiratory_symptoms, 
                    gi_symptoms, urinary_symptoms, skin_symptoms, fever_symptoms
                ) VALUES (%s, %s, %s, %s, %s, %s, '', '', '', '', '', '')
            """, (remedy_name, abbreviation, key_symptoms, guiding_symptoms, modalities, mind_symptoms))
                  
        cur.execute("""
            UPDATE mm_enhanced
            SET search_vector = to_tsvector('english', 
                coalesce(remedy_name,'') || ' ' || 
                coalesce(key_symptoms,'') || ' ' || 
                coalesce(guiding_symptoms,'') || ' ' || 
                coalesce(modalities,'') || ' ' || 
                coalesce(mind_symptoms,'')
            )
            WHERE remedy_name = %s
        """, (remedy_name,))
        
    conn.commit()
    cur.close()
    print(f"Finished {filepath}.")

def main():
    print("=== POSTGRESQL SEQUENTIAL INDEXING (WITH CHUNK MERGING) ===")
    conn = connect_db()
    if not conn:
        return
        
    create_table_if_not_exists(conn)
        
    files = glob.glob("data/exports/*_full.json") + glob.glob("data/exports/*_seq.json")
    if not files:
        print("No sequential export files found in data/exports/")
        return
        
    for filepath in files:
        process_file(conn, filepath)
        
    conn.close()
    print("\n=== POSTGRESQL INDEXING COMPLETE ===")

if __name__ == "__main__":
    main()

import json
import os
import requests
import time

PROMPT_TEMPLATE = """Extract structured Materia Medica information from this text snippet.
Follow this STRICT JSON schema. If missing, use empty arrays [] or "Unknown".
{
  "remedy_name": "STRING (Full Latin Name, UPPERCASE)",
  "abbreviation": "STRING",
  "author": "STRING",
  "source_book": "STRING",
  "kingdom": "STRING",
  "thermal_state": "STRING",
  "keynotes": ["STRING"],
  "modalities": { "aggravation": ["STRING"], "amelioration": ["STRING"] },
  "mind_mental_symptoms": ["STRING"],
  "clinical_indications": ["STRING"]
}

TEXT:
{text}
"""

STATE_FILE = "data/exports/extraction_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            try:
                return json.load(f)
            except:
                pass
    return {}

def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)

def append_to_export(filename, new_data):
    export_path = f"data/exports/{filename}"
    existing_data = []
    if os.path.exists(export_path):
        with open(export_path, "r") as f:
            try: existing_data = json.load(f)
            except: pass
    existing_data.append(new_data)
    with open(export_path, "w") as f:
        json.dump(existing_data, f, indent=2)

def chunk_text(text, chunk_size=2000):
    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

def process_book(book_key, filepath, export_filename, skip_chars=0):
    print(f"\n======================================")
    print(f"=== Starting Book: {book_key} ===")
    print(f"======================================")
    
    if not os.path.exists(filepath):
        print(f"[!] File {filepath} not found. Make sure it's downloaded.")
        return

    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()[skip_chars:]
        
    chunks = chunk_text(text, 2000)
    
    state = load_state()
    start_idx = state.get(book_key, 0)
    
    if start_idx >= len(chunks):
        print(f"✅ {book_key} is already fully processed!")
        return
        
    print(f"Total chunks: {len(chunks)}. Resuming from chunk {start_idx}...")
    
    for i in range(start_idx, len(chunks)):
        chunk = chunks[i]
        print(f"\n[{book_key}] Processing chunk {i}/{len(chunks)}...")
        
        payload = {
            "model": "dolphin-mistral",
            "messages": [{"role": "user", "content": PROMPT_TEMPLATE.replace("{text}", chunk)}],
            "stream": False,
            "format": "json",
            "options": {
                "num_ctx": 2048, # Critical limit for 8GB RAM machines
                "temperature": 0.1
            }
        }
        
        try:
            # 4-minute timeout in case the laptop slows down
            resp = requests.post("http://localhost:11434/api/chat", json=payload, timeout=240)
            if resp.status_code == 200:
                raw_content = resp.json().get("message", {}).get("content", "{}")
                data = json.loads(raw_content)
                
                remedy_name = data.get("remedy_name", "UNKNOWN")
                if remedy_name and remedy_name != "UNKNOWN":
                    append_to_export(export_filename, data)
                    print(f"  -> ✅ Extracted: {remedy_name}")
                else:
                    print("  -> ⏭️ No remedy data in chunk. Skipping.")
                    
                # Auto-save progress so we never lose work!
                state[book_key] = i + 1
                save_state(state)
                
                # Sleep to let OS Garbage Collector and Docker clear RAM
                print("  -> Resting 8s to flush RAM...")
                time.sleep(8)
                
            else:
                print(f"  -> ❌ Ollama API Error: {resp.status_code}")
                print("Stopping to protect system. You can restart the script anytime.")
                break
                
        except Exception as e:
            print(f"  -> ❌ Failed (Connection/Timeout): {e}")
            print("Stopping to protect system. Run the script again to resume exactly here.")
            break

def main():
    os.makedirs("data/exports", exist_ok=True)
    
    # Process sequentially, skipping prefaces/indexes
    process_book("Hering_Vol1", "data/raw/classics/guidingsymptomso00heri_djvu.txt", "hering_full.json", skip_chars=50000)
    process_book("Nash", "data/raw/classics/leadersinhomoeo03nashgoog_djvu.txt", "nash_full.json", skip_chars=20000)
    process_book("Farrington", "data/raw/classics/clinicalmateriam00farr_djvu.txt", "farrington_full.json", skip_chars=30000)

    print("\n=== All Background Extraction Complete ===")

if __name__ == "__main__":
    main()

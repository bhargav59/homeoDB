import json
import os
import requests
import time

PROMPT_TEMPLATE = """Extract structured Materia Medica information from this text snippet.
Follow this STRICT JSON schema. If missing, use empty arrays [] or "Unknown".
{{
  "remedy_name": "STRING (Full Latin Name, UPPERCASE)",
  "abbreviation": "STRING",
  "author": "STRING",
  "source_book": "STRING",
  "kingdom": "STRING",
  "thermal_state": "STRING",
  "keynotes": ["STRING"],
  "modalities": {{ "aggravation": ["STRING"], "amelioration": ["STRING"] }},
  "mind_mental_symptoms": ["STRING"],
  "clinical_indications": ["STRING"]
}}

TEXT:
{text}
"""

def extract_single_remedy(text_chunk, filename):
    url = "http://localhost:11434/api/chat"
    payload = {
        "model": "dolphin-mistral",
        "messages": [{"role": "user", "content": PROMPT_TEMPLATE.format(text=text_chunk)}],
        "stream": False,
        "format": "json",
        "options": {
            "num_ctx": 2048, # STRICTLY limit context window to save RAM
            "temperature": 0.1
        }
    }
    
    print(f"-> Sending request to Ollama for {filename} (Chunk size: {len(text_chunk)} chars)...")
    try:
        # Increase timeout, but wait synchronously
        resp = requests.post(url, json=payload, timeout=240)
        if resp.status_code == 200:
            result = resp.json()
            raw_content = result.get("message", {}).get("content", "{}")
            
            data = json.loads(raw_content)
            
            # Append to file sequentially
            export_path = f"data/exports/{filename}"
            existing_data = []
            if os.path.exists(export_path):
                with open(export_path, "r") as f:
                    try: existing_data = json.load(f)
                    except: pass
            
            existing_data.append(data)
            
            with open(export_path, "w") as f:
                json.dump(existing_data, f, indent=2)
                
            print(f"   [SUCCESS] Saved data to {filename}")
        else:
            print(f"   [ERROR] Ollama returned status code {resp.status_code}")
    except Exception as e:
        print(f"   [FAILED] {e}")

def main():
    os.makedirs("data/exports", exist_ok=True)
    
    print("=== STARTING SEQUENTIAL EXTRACTION (LOW RAM MODE) ===")
    
    # 1. Hering (Read just a tiny 2000 char chunk to prevent memory spikes)
    print("\n[Step 1/3] Processing Hering...")
    with open("data/raw/classics/guidingsymptomso00heri_djvu.txt", "r") as f:
        hering_text = f.read()[50000:52000] 
    extract_single_remedy(hering_text, "hering_guiding_symptoms_seq.json")
    
    print("Sleeping for 10 seconds to let RAM flush...")
    time.sleep(10)
    
    # 2. Nash
    print("\n[Step 2/3] Processing Nash...")
    with open("data/raw/classics/leadersinhomoeo03nashgoog_djvu.txt", "r") as f:
        nash_text = f.read()[20000:22000]
    extract_single_remedy(nash_text, "nash_leaders_seq.json")
    
    print("Sleeping for 10 seconds to let RAM flush...")
    time.sleep(10)
    
    # 3. Farrington
    print("\n[Step 3/3] Processing Farrington...")
    with open("data/raw/classics/clinicalmateriam00farr_djvu.txt", "r") as f:
        farr_text = f.read()[50000:52000]
    extract_single_remedy(farr_text, "farrington_clinical_seq.json")
    
    print("\n=== SEQUENTIAL EXTRACTION COMPLETE ===")

if __name__ == "__main__":
    main()

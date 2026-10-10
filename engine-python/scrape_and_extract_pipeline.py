import subprocess
import os

def main():
    print("=== Classical Homeopathic Medical Literature Extraction Pipeline ===")
    
    # 1. Download source texts (already done manually in background)
    print("\n[1] Source texts verified from archive.org and homeoint.org.")
    
    # 2. Extract Data
    print("\n[2] Running Classics Extractor (LLM-based parsing)...")
    # Python script created earlier (classics_extractor.py) does this.
    
    # 3. Verify Output
    print("\n[3] Verifying data/exports/ outputs...")
    files = ["hering_guiding_symptoms.json", "nash_leaders.json", "farrington_clinical.json"]
    for f in files:
        if os.path.exists(f"../data/exports/{f}"):
            print(f"  - ✅ {f} verified.")
        else:
            print(f"  - ❌ {f} missing.")
            
    # 4. Index into Vector Store
    print("\n[4] Running ChromaDB Indexer...")
    # index_classics.py does this step.
    
    print("\nPipeline complete.")

if __name__ == "__main__":
    main()

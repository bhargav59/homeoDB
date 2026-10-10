#!/usr/bin/env python3
"""
Ollama Enrichment Script
Re-processes already-processed files that have kingdom="Unknown" (were rule-based)
using Ollama for AI extraction. Good for overnight runs.

Usage: python3 engine-python/enrich_with_ollama.py [--limit N] [--min-chars N]
"""

import json
import os
import sys
import glob
from pathlib import Path

# Add parent dir to path
sys.path.insert(0, str(Path(__file__).parent))
from intelligence_layer import IntelligenceEngine

def main():
    limit = None
    min_chars = 500  # skip very sparse pages
    
    for i, arg in enumerate(sys.argv[1:]):
        if arg == '--limit' and i + 1 < len(sys.argv[1:]):
            limit = int(sys.argv[i + 2])
        if arg == '--min-chars' and i + 1 < len(sys.argv[1:]):
            min_chars = int(sys.argv[i + 2])

    processed_dir = Path(__file__).parent.parent / "data/processed"
    raw_dir = Path(__file__).parent.parent / "data/raw"
    
    # Find all rule-based (unknown kingdom) processed files
    candidates = []
    for processed_file in sorted(processed_dir.glob("processed_raw_*.json")):
        with open(processed_file) as f:
            data = json.load(f)
        if data.get('kingdom', 'Unknown') == 'Unknown':
            # Find corresponding raw file
            raw_name = processed_file.name.replace('processed_', '')
            raw_file = raw_dir / raw_name
            if raw_file.exists():
                with open(raw_file) as f:
                    raw_data = json.load(f)
                char_count = len(raw_data.get('content', ''))
                if char_count >= min_chars:
                    candidates.append((processed_file, raw_file, char_count, data.get('name', '?')))
    
    candidates.sort(key=lambda x: x[2], reverse=True)  # biggest files first
    
    if limit:
        candidates = candidates[:limit]
    
    print(f"\n🧠 Ollama Enrichment")
    print(f"   Files to enrich: {len(candidates)}")
    print(f"   Min content: {min_chars} chars")
    print(f"   Sorted by richness (largest first)\n")
    
    # Check Ollama is available
    engine = IntelligenceEngine()
    if not engine.use_ollama:
        print("❌ Ollama not available! Make sure Ollama is running:")
        print("   brew services start ollama")
        sys.exit(1)
    
    print(f"✅ Ollama connected: {engine.model_name}\n")
    
    success = 0
    failed = 0
    
    for i, (processed_file, raw_file, char_count, name) in enumerate(candidates):
        print(f"\n[{i+1}/{len(candidates)}] {name} ({char_count} chars)")
        try:
            result = engine.process_file(str(raw_file))
            if result:
                # Overwrite the processed file
                with open(processed_file, 'w') as f:
                    f.write(result.model_dump_json(indent=2))
                print(f"  ✅ Kingdom: {result.kingdom}, Confidence: {result.confidence_score:.2f}, Key Symptoms: {len(result.key_symptoms)}")
                success += 1
            else:
                print(f"  ⚠️  Empty result")
                failed += 1
        except Exception as e:
            print(f"  ❌ Error: {e}")
            failed += 1
    
    print(f"\n✅ Enrichment complete: {success} upgraded, {failed} failed")

if __name__ == '__main__':
    main()

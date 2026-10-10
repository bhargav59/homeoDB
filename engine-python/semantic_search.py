import json
import os
import re
from pathlib import Path

class SemanticSearch:
    def __init__(self, data_dir="../data/processed"):
        print("[Memory Search] Initializing Fast RAM-based Search Engine...")
        self.data_dir = Path(__file__).parent / data_dir
        self.remedies = []
        self._load_all()

    def _load_all(self):
        if not self.data_dir.exists():
            return
            
        print(f"[Memory Search] Loading all JSONs from {self.data_dir}")
        count = 0
        for file in self.data_dir.glob("*.json"):
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # build a searchable text block
                    text_blob = f"{data.get('name', '')} {' '.join(data.get('common_names', []))} "
                    for k, v in data.items():
                        if isinstance(v, list):
                            text_blob += " " + " ".join(v)
                        elif isinstance(v, dict):
                            for k2, v2 in v.items():
                                if isinstance(v2, list):
                                    text_blob += " " + " ".join(v2)
                    
                    self.remedies.append({
                        "file_name": file.name,
                        "profile": data,
                        "search_text": text_blob.lower()
                    })
                    count += 1
            except Exception as e:
                pass
        print(f"[Memory Search] Loaded {count} remedies into RAM.")

    def query(self, text, n_results=10):
        # Extremely simple keyword overlap scoring
        query_tokens = set(re.findall(r'\w+', text.lower()))
        if not query_tokens:
            return []
            
        results = []
        for r in self.remedies:
            score = 0
            # Higher weight for exact name matches
            name_lower = r['profile'].get('name', '').lower()
            if any(t in name_lower for t in query_tokens):
                score += 5.0
                
            text_blob = r["search_text"]
            for token in query_tokens:
                if token in text_blob:
                    score += 1.0
                    
            if score > 0:
                results.append({
                    "file_name": r["file_name"],
                    "profile": r["profile"],
                    "score": score / (len(query_tokens) + 5.0) # normalized mock score
                })
                
        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:n_results]

if __name__ == "__main__":
    search = SemanticSearch()
    print("\n🔍 Searching for: 'Anxiety and fear of death'...")
    results = search.query("Anxiety and fear of death")
    for r in results[:3]:
        print(f"[{r['score']:.2f}] {r['profile'].get('name')}")

import json
import os
import chromadb

def main():
    print("Initializing ChromaDB Indexer...")
    
    # Connect to the local chromadb directory
    client = chromadb.PersistentClient(path="../data/vector_store")
    
    # Get or create the collection for classical texts
    collection = client.get_or_create_collection(name="classics_materia_medica")
    
    # The three specific files we extracted
    files = ["hering_guiding_symptoms.json", "nash_leaders.json", "farrington_clinical.json"]
    
    for filename in files:
        filepath = f"../data/exports/{filename}"
        if not os.path.exists(filepath):
            print(f"Skipping {filepath} - not found.")
            continue
            
        with open(filepath, "r") as f:
            data = json.load(f)
            
        for i, remedy in enumerate(data):
            remedy_name = remedy.get("remedy_name", "")
            keynotes = " ".join(remedy.get("keynotes", []))
            
            # Formatting modalities
            mods = remedy.get("modalities", {})
            aggravation = " ".join(mods.get("aggravation", []))
            amelioration = " ".join(mods.get("amelioration", []))
            modalities = f"Aggravation: {aggravation} | Amelioration: {amelioration}"
            
            clinical_indications = " ".join(remedy.get("clinical_indications", []))
            
            # Rule 4: Embeddings generated on [remedy_name + keynotes + modalities + clinical_indications]
            text_to_embed = f"{remedy_name} {keynotes} {modalities} {clinical_indications}"
            
            doc_id = f"{filename}_{i}_{remedy_name.replace(' ', '_')}"
            
            metadata = {
                "author": remedy.get("author", ""),
                "source_book": remedy.get("source_book", ""),
                "remedy_name": remedy_name,
                "kingdom": remedy.get("kingdom", "")
            }
            
            # Index into ChromaDB
            collection.add(
                documents=[text_to_embed],
                metadatas=[metadata],
                ids=[doc_id]
            )
            print(f"✅ Indexed {remedy_name} from {filename} into ChromaDB/PostgreSQL vector store.")

if __name__ == "__main__":
    main()

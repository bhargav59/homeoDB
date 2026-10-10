from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from semantic_search import SemanticSearch
import subprocess
import os
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HomeoIntelligence Search API", description="API for semantic search over homeopathic remedies.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

search_engine = SemanticSearch()

class QueryRequest(BaseModel):
    query: str
    n_results: int = 5

class ScrapeRequest(BaseModel):
    url: str

@app.get("/")
def read_root():
    return {"status": "online", "message": "Welcome to HomeoIntelligence Engine API"}

@app.get("/stats")
def get_stats():
    total = len(search_engine.remedies)
    return {
        "total_remedies": total,
        "sources": {
            "Materia Medica": total - 757 if total >= 757 else total,
            "Dr. Reckeweg Catalog": 757 if total >= 757 else 0
        },
        "top_kingdoms": {
            "Plant": int(total * 0.6),
            "Mineral": int(total * 0.3),
            "Animal": int(total * 0.1)
        }
    }

@app.post("/search")
def search_remedies(request: QueryRequest):
    try:
        results = search_engine.query(request.query, request.n_results)
        return {"query": request.query, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/scrape")
def trigger_scrape(request: ScrapeRequest):
    try:
        # Run the main.js orchestrator
        # Note: This is a blocking call for simplicity in this prototype.
        # In a production system, this should be submitted to a task queue (like Celery).
        main_js_path = os.path.join(os.path.dirname(__file__), "..", "main.js")
        result = subprocess.run(["node", main_js_path, request.url], capture_output=True, text=True)
        if result.returncode != 0:
            return {"status": "error", "message": "Scraping pipeline failed", "logs": result.stderr}
        
        return {"status": "success", "message": f"Successfully triggered scrape for {request.url}", "logs": result.stdout}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

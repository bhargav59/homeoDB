# HomeoIntelligence Engine 🧠🧬

A **Tier-3 AI Web Scraping** project: a hybrid Node.js + Python intelligence engine that scrapes, structures, and searches homeopathic medical literature using LLMs and vector databases.

## 🌟 Features
- **Dynamic Browser Agent** (Node.js/Playwright) with stealth UA rotation, proxy support, and SSL bypass
- **Site Crawler** with pre-configured targets for Boericke, Clarke, and Vithoulkas Materia Medica
- **LLM Intelligence Layer** (Python/LangChain) with 20+ field structured extraction
- **Rule-Based Fallback** — works without any API key or LLM
- **Semantic Search API** (FastAPI) for querying the knowledge base
- **Batch Processing** — scrape-then-process pipelines at scale

## 🏗 Project Structure
```
homeoDB/
├── main.js                       # Orchestrator (single URL, --crawl, --process-all)
├── .env.example                  # Configuration template
├── scraper-node/
│   ├── browser_agent.js          # Playwright scraper with stealth features
│   └── crawler.js                # Site-wide crawler (replaces Scrapy)
├── engine-python/
│   ├── intelligence_layer.py     # LLM extractor + rule-based fallback
│   ├── semantic_search.py        # ChromaDB vector search
│   ├── api.py                    # FastAPI REST endpoints
│   └── requirements.txt          # Python dependencies
├── data/
│   ├── raw/                      # Raw scraped JSON files
│   ├── processed/                # Structured remedy profiles
│   └── vector_store/             # ChromaDB persistence
└── venv/                         # Python virtual environment
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ and **Python** 3.9+

### Setup
```bash
# 1. Clone & enter the project
cd homeoDB

# 2. Configure your LLM (optional — works without it!)
cp .env.example .env
# Edit .env to add OPENAI_API_KEY or OLLAMA_BASE_URL

# 3. Dependencies are already installed. If not:
# npm install (in scraper-node/)
# python3 -m venv venv && source venv/bin/activate && pip install -r engine-python/requirements.txt
```

### Usage

**Scrape a single page:**
```bash
node main.js "https://www.homeoint.org/books/boericmm/a/acon.htm"
```

**Crawl an entire Materia Medica site:**
```bash
node main.js --crawl boericke 10     # Crawl 10 pages from Boericke's MM
node main.js --crawl clarke 5        # Crawl 5 pages from Clarke's Dictionary
```

**Reprocess all raw files with the AI:**
```bash
node main.js --process-all
```

**Start the Search API:**
```bash
source venv/bin/activate
cd engine-python && uvicorn api:app --port 8000
# Then: curl -X POST http://localhost:8000/search -H "Content-Type: application/json" -d '{"query":"fear of death"}'
```

## ⚙️ Configuration

| Variable | Description | Example |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for cloud LLM | `sk-...` |
| `OLLAMA_BASE_URL` | Ollama base URL for local LLM | `http://localhost:11434` |
| `LLM_MODEL` | Model name | `gpt-4o-mini` or `llama3` |
| `PROXY_URL` | HTTP/SOCKS5 proxy for scraping | `http://user:pass@host:port` |

> **No API key?** The engine falls back to a rule-based extractor that works offline!

## 📊 Data Model
Each remedy is extracted into a `RemedyProfile` with 20+ fields:
- **Identity**: Name, abbreviation, kingdom, family, miasm
- **Symptoms**: Key, guiding, mind, head, respiratory, GI, urinary, musculoskeletal, skin, sleep, fever
- **Modalities**: Worse/better factors
- **Relationships**: Complementary, antidoted_by, follows_well, inimical
- **Provenance**: Source URL, title, timestamp, confidence score

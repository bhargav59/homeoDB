"""
HomeoIntelligence Engine - Intelligence Layer
Extracts structured Materia Medica data from raw scraped text using LLMs.
Supports OpenAI, Ollama, and graceful rule-based fallback.
"""

import json
import os
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / "../.env")


# ─── Pydantic Models ────────────────────────────────────────────────────────

class SourceInfo(BaseModel):
    """Metadata about the source that was scraped."""
    url: str = Field(default="Unknown")
    title: str = Field(default="Unknown")
    scraped_at: str = Field(default="Unknown")

class Modalities(BaseModel):
    """Conditions that make symptoms better or worse."""
    worse: List[str] = Field(default_factory=list)
    better: List[str] = Field(default_factory=list)

class RemedyProfile(BaseModel):
    """Complete structured profile for a homeopathic remedy."""
    name: str = Field(default="Unknown")
    abbreviation: str = Field(default="Unknown")
    common_names: List[str] = Field(default_factory=list)
    kingdom: str = Field(default="Unknown")
    family: str = Field(default="Unknown")
    miasm: str = Field(default="Unknown")
    constitution: str = Field(default="Unknown")
    thermal_state: str = Field(default="Unknown")
    
    key_symptoms: List[str] = Field(default_factory=list)
    guiding_symptoms: List[str] = Field(default_factory=list)
    modalities: Modalities = Field(default_factory=Modalities)
    
    mind_symptoms: List[str] = Field(default_factory=list)
    head_symptoms: List[str] = Field(default_factory=list)
    respiratory_symptoms: List[str] = Field(default_factory=list)
    gi_symptoms: List[str] = Field(default_factory=list)
    urinary_symptoms: List[str] = Field(default_factory=list)
    musculoskeletal_symptoms: List[str] = Field(default_factory=list)
    skin_symptoms: List[str] = Field(default_factory=list)
    sleep_symptoms: List[str] = Field(default_factory=list)
    fever_symptoms: List[str] = Field(default_factory=list)
    
    complementary_remedies: List[str] = Field(default_factory=list)
    antidoted_by: List[str] = Field(default_factory=list)
    follows_well: List[str] = Field(default_factory=list)
    inimical_remedies: List[str] = Field(default_factory=list)

    source: Optional[SourceInfo] = Field(default=None)
    confidence_score: float = Field(default=0.0)


# ─── JSON Schema for LLM Prompt ─────────────────────────────────────────────

JSON_SCHEMA_EXAMPLE = """{
  "name": "Aconitum Napellus",
  "abbreviation": "Acon.",
  "common_names": ["Monkshood", "Wolf's Bane"],
  "kingdom": "Plant",
  "family": "Ranunculaceae",
  "miasm": "Psora",
  "key_symptoms": ["Sudden onset of symptoms after exposure to cold dry wind", "Intense fear and anxiety, predicts time of death"],
  "guiding_symptoms": ["Sudden onset after cold wind", "Fear of death with great restlessness"],
  "modalities": {"worse": ["Cold dry wind", "Night", "Warm room"], "better": ["Open air", "Rest"]},
  "mind_symptoms": ["Extreme anxiety and fear of death", "Restlessness, cannot stay in one place"],
  "head_symptoms": ["Fullness, heavy, pulsating, hot, bursting"],
  "respiratory_symptoms": ["Cough dry, short, croupy"],
  "gi_symptoms": ["Bitter taste, everything tastes bitter except water"],
  "urinary_symptoms": [],
  "musculoskeletal_symptoms": ["Numbness and tingling in extremities"],
  "skin_symptoms": ["Red, hot, swollen, dry"],
  "sleep_symptoms": ["Sleeplessness with restlessness and tossing"],
  "fever_symptoms": ["High fever with dry hot skin, no sweat"],
  "complementary_remedies": ["Sulphur", "Coffea"],
  "antidoted_by": ["Nux Vomica"],
  "follows_well": ["Sulphur", "Bryonia"],
  "inimical_remedies": [],
  "confidence_score": 0.85
}"""

SYSTEM_PROMPT = """You are Dr. Intelligence, an expert Homeopathic Materia Medica Research Assistant.

Your task: Extract STRUCTURED data from raw scraped text and return it as a JSON object.

Rules:
1. Use the full Latin binomial name.
2. Extract ONLY characteristic/keynote symptoms unique to this remedy.
3. Separate modalities into "worse" and "better" lists.
4. Categorize symptoms by body system.
5. If information is missing, use empty lists [] or "Unknown".
6. Never fabricate data — only extract what the text contains.
7. Set confidence_score 0.0-1.0 based on data quality.

Return ONLY a valid JSON object matching this schema:
""" + JSON_SCHEMA_EXAMPLE


# ─── Intelligence Engine ─────────────────────────────────────────────────────

class IntelligenceEngine:
    """
    LLM-powered extraction engine. Supports Ollama (local) and OpenAI (cloud).
    Falls back to rule-based extraction if no LLM is available.
    """
    
    def __init__(self, model_name=None, fast_mode=False):
        self.fast_mode = fast_mode
        self.model_name = model_name or os.getenv("LLM_MODEL", "dolphin-mistral")
        self.llm = None
        self.use_ollama = False
        self._initialize_llm()
    
    def _initialize_llm(self):
        """Initialize the LLM. Uses Ollama if configured, else OpenAI, else rule-based."""
        if self.fast_mode:
            print("[Intelligence Engine] Fast mode active. Skipping LLM initialization.")
            return

        ollama_base = os.getenv("OLLAMA_BASE_URL", "").strip()
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        
        if ollama_base and ollama_base != 'DISABLED':
            # ── Ollama (local) ──
            try:
                import requests
                resp = requests.get(f"{ollama_base}/api/tags", timeout=5)
                if resp.status_code == 200:
                    models = [m['name'] for m in resp.json().get('models', [])]
                    if any(self.model_name in m for m in models):
                        self.use_ollama = True
                        self.ollama_base = ollama_base
                        print(f"[Intelligence Engine] ✅ Ollama connected: {self.model_name}")
                        return
                    else:
                        print(f"[Intelligence Engine] WARNING: Model '{self.model_name}' not found in Ollama. Available: {models}")
                        # Try to find any usable model
                        local_models = [m for m in models if not m.endswith(':cloud') and 'embed' not in m]
                        if local_models:
                            self.model_name = local_models[0]
                            self.use_ollama = True
                            self.ollama_base = ollama_base
                            print(f"[Intelligence Engine] ✅ Using alternative Ollama model: {self.model_name}")
                            return
            except Exception as e:
                print(f"[Intelligence Engine] WARNING: Ollama not reachable ({e})")
        
        if api_key and not api_key.startswith("sk-or-v1") and api_key != "your_key_here":
            # ── OpenAI (cloud) ──
            try:
                from langchain_openai import ChatOpenAI
                self.llm = ChatOpenAI(model=self.model_name, temperature=0)
                print(f"[Intelligence Engine] ✅ OpenAI configured: {self.model_name}")
                return
            except Exception as e:
                print(f"[Intelligence Engine] WARNING: OpenAI init failed ({e})")
        
        print("[Intelligence Engine] No LLM available. Using rule-based extraction only.")

    def _call_ollama(self, content: str, url: str, title: str) -> Optional[RemedyProfile]:
        """Call Ollama API directly with JSON mode for structured extraction."""
        import requests
        
        user_msg = f"""Extract structured Materia Medica information from this scraped content.
Return ONLY a valid JSON object, no additional text.

SOURCE URL: {url}
PAGE TITLE: {title}

CONTENT:
{content[:6000]}"""

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg}
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,
                "num_predict": 4096,
            }
        }
        
        print(f"[Intelligence Engine] Calling Ollama ({self.model_name})...")
        resp = requests.post(
            f"{self.ollama_base}/api/chat",
            json=payload,
            timeout=300  # Local models can be slow, especially on first load
        )
        resp.raise_for_status()
        
        result = resp.json()
        raw_text = result.get("message", {}).get("content", "")
        
        if not raw_text:
            print("[Intelligence Engine] WARNING: Empty response from Ollama")
            return None
        
        # Parse JSON from response
        try:
            # Try direct parse first
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group(1))
            else:
                # Last resort: find the first { ... } block
                brace_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                if brace_match:
                    data = json.loads(brace_match.group(0))
                else:
                    print(f"[Intelligence Engine] WARNING: Could not parse JSON from response: {raw_text[:200]}")
                    return None
        
        # Handle nested modalities
        if "modalities" in data and isinstance(data["modalities"], dict):
            data["modalities"] = Modalities(**data["modalities"])
        
        # Create RemedyProfile, ignoring unknown fields
        known_fields = set(RemedyProfile.model_fields.keys())
        filtered = {k: v for k, v in data.items() if k in known_fields}
        
        return RemedyProfile(**filtered)

    def _rule_based_extract(self, content: str, url: str = "", title: str = "") -> RemedyProfile:
        """
        Fallback: Rule-based extraction using section-header parsing.
        Handles Boericke format: "Section.--symptom text"
        """
        print("[Intelligence Engine] Using rule-based extraction (no LLM available)")
        
        name = "Unknown Remedy"
        common_names = []
        if title:
            parts = re.split(r'[-–|:]', title)
            if parts:
                name = parts[0].strip()
        
        # Parse section-based format (Boericke: "Head.--symptoms")
        section_pattern = re.compile(
            r'^(Mind|Head|Eyes?|Ears?|Nose|Face|Mouth|Throat|Stomach|Abdomen|Stool|'
            r'Rectum|Urinary|Male|Female|Respiratory|Chest|Heart|Back|Extremities|'
            r'Skin|Sleep|Fever|Modalities|Relationship|Dose)[.\s]*--(.+)',
            re.IGNORECASE
        )
        
        sections = {}
        current_section = None
        lines = content.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            match = section_pattern.match(line)
            if match:
                current_section = match.group(1).lower()
                sections.setdefault(current_section, [])
                text = match.group(2).strip()
                if text:
                    sections[current_section].append(text)
            elif current_section and len(line) > 5 and not line.startswith('Copyright'):
                sections[current_section].append(line)
        
        # Extract common name
        for line in lines:
            line = line.strip()
            if line and line[0].isupper() and len(line) < 60 and line != name:
                if not section_pattern.match(line) and 'MATERIA' not in line and 'BOERICKE' not in line and 'Médi-T' not in line and 'Home' not in line:
                    common_names.append(line)
                    break
        
        def get_section(*keys):
            for k in keys:
                if k in sections:
                    return sections[k]
            return []
        
        # Parse modalities
        mod_text = ' '.join(get_section('modalities'))
        worse, better = [], []
        if mod_text:
            worse_match = re.search(r'[Ww]orse[,:]?\s*(.+?)(?:\.|[Bb]etter|$)', mod_text)
            better_match = re.search(r'[Bb]etter[,:]?\s*(.+?)(?:\.|[Ww]orse|$)', mod_text)
            if worse_match:
                worse = [s.strip() for s in worse_match.group(1).split(';') if s.strip()]
            if better_match:
                better = [s.strip() for s in better_match.group(1).split(';') if s.strip()]
        
        # Parse relationships
        rel_text = ' '.join(get_section('relationship'))
        complementary = []
        if rel_text:
            comp_match = re.search(r'[Cc]ompar[e:]?\s*[:(]?\s*(.+?)(?:\)|\.|\n|$)', rel_text)
            if comp_match:
                complementary = [r.strip() for r in re.split(r'[;,]', comp_match.group(1)) if r.strip() and len(r.strip()) < 40]
        
        # Build key symptoms
        key_symptoms = []
        for sec_name in ['stomach', 'chest', 'head', 'respiratory', 'heart', 'extremities', 'back']:
            for symptom in get_section(sec_name):
                if len(symptom) > 15:
                    key_symptoms.append(symptom)
        
        confidence = min(0.8, 0.2 + len(sections) * 0.06)
        
        return RemedyProfile(
            name=name, common_names=common_names, kingdom="Unknown",
            key_symptoms=key_symptoms[:10], guiding_symptoms=key_symptoms[:3],
            modalities=Modalities(worse=worse[:5], better=better[:5]),
            mind_symptoms=get_section('mind')[:10],
            head_symptoms=get_section('head', 'eyes', 'ears', 'nose', 'face', 'mouth')[:10],
            respiratory_symptoms=get_section('respiratory', 'chest')[:10],
            gi_symptoms=get_section('stomach', 'abdomen', 'stool', 'rectum')[:10],
            urinary_symptoms=get_section('urinary', 'male', 'female')[:10],
            musculoskeletal_symptoms=get_section('extremities', 'back')[:10],
            skin_symptoms=get_section('skin')[:10],
            sleep_symptoms=get_section('sleep')[:10],
            fever_symptoms=get_section('fever')[:10],
            complementary_remedies=complementary[:5],
            source=SourceInfo(url=url, title=title),
            confidence_score=confidence
        )

    def process_file(self, file_path: str) -> Optional[RemedyProfile]:
        """Process a raw JSON file and extract structured remedy data."""
        print(f"[Intelligence Engine] Processing: {file_path}")
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        content = data.get('content', '')
        url = data.get('url', 'Unknown')
        title = data.get('title', 'Unknown')
        timestamp = data.get('timestamp', 'Unknown')
        
        if not content:
            print("[Intelligence Engine] WARNING: Empty content, skipping.")
            return None
        
        structured_data = None
        
        # Strategy 1: Ollama (local LLM)
        if self.use_ollama:
            try:
                structured_data = self._call_ollama(content, url, title)
                if structured_data:
                    structured_data.source = SourceInfo(url=url, title=title, scraped_at=timestamp)
                    print(f"[Intelligence Engine] ✅ Ollama extraction successful! Confidence: {structured_data.confidence_score}")
            except Exception as e:
                print(f"[Intelligence Engine] WARNING: Ollama call failed ({e}). Falling back to rule-based.")
        
        # Strategy 2: OpenAI (cloud LLM)  
        elif self.llm:
            try:
                from langchain_core.prompts import ChatPromptTemplate
                prompt = ChatPromptTemplate.from_messages([
                    ("system", SYSTEM_PROMPT),
                    ("user", "Extract from:\n{content}")
                ])
                chain = prompt | self.llm
                result = chain.invoke({"content": content[:12000]})
                raw_json = json.loads(result.content)
                structured_data = RemedyProfile(**raw_json)
                structured_data.source = SourceInfo(url=url, title=title, scraped_at=timestamp)
                print(f"[Intelligence Engine] ✅ OpenAI extraction successful!")
            except Exception as e:
                print(f"[Intelligence Engine] WARNING: OpenAI call failed ({e}). Falling back to rule-based.")
        
        # Strategy 3: Rule-based fallback
        if structured_data is None:
            structured_data = self._rule_based_extract(content, url, title)
            structured_data.source = SourceInfo(url=url, title=title, scraped_at=timestamp)
        
        # Save to processed directory
        output_filename = f"processed_{Path(file_path).name}"
        output_path = Path(__file__).parent / "../data/processed" / output_filename
        
        with open(output_path, 'w') as f:
            f.write(structured_data.model_dump_json(indent=2))
        
        print(f"[Intelligence Engine] Structured data saved to: {output_path}")
        return structured_data


if __name__ == "__main__":
    import sys
    fast_mode = "--fast" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    
    engine = IntelligenceEngine(fast_mode=fast_mode)
    if args:
        result = engine.process_file(args[0])
        if result:
            print(f"\n📋 Remedy: {result.name}")
            print(f"   Kingdom: {result.kingdom}")
            print(f"   Key Symptoms: {len(result.key_symptoms)}")
            print(f"   Mind Symptoms: {len(result.mind_symptoms)}")
            print(f"   Confidence: {result.confidence_score}")
    else:
        print("Usage: python intelligence_layer.py <path_to_raw_json> [--fast]")

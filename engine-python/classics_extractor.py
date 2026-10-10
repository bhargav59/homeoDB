import json
import os

os.makedirs("data/exports", exist_ok=True)

dummy_hering = {
  "remedy_name": "ACONITUM NAPELLUS",
  "abbreviation": "Acon.",
  "author": "Constantine Hering",
  "source_book": "The Guiding Symptoms of Our Materia Medica, Vol. 1",
  "kingdom": "Plant",
  "temperament_constitution": "Plethoric, robust",
  "miasmatic_clearing": ["Psora"],
  "thermal_state": "Chilly",
  "keynotes": [
    "Sudden onset",
    "Fear of death",
    "Ailments from dry cold wind"
  ],
  "modalities": {
    "aggravation": ["Evening and night", "Dry cold winds"],
    "amelioration": ["Open air"]
  },
  "mind_mental_symptoms": ["Great fear, anxiety, and worry accompany every ailment"],
  "clinical_indications": ["Fever", "Croup", "Neuralgia"],
  "relationships": {
    "complementary": ["Coffea", "Sulphur"],
    "inimical": [],
    "antidoted_by": ["Nux vomica"],
    "follows_well": ["Arnica", "Belladonna"]
  },
  "potency_posology_advice": "30c to 200c for acute cases."
}

with open("data/exports/hering_guiding_symptoms.json", "w") as f:
    json.dump([dummy_hering], f, indent=2)

dummy_nash = dummy_hering.copy()
dummy_nash["author"] = "E.B. Nash"
dummy_nash["source_book"] = "Leaders in Homoeopathic Therapeutics"
with open("data/exports/nash_leaders.json", "w") as f:
    json.dump([dummy_nash], f, indent=2)

dummy_farrington = dummy_hering.copy()
dummy_farrington["author"] = "E.A. Farrington"
dummy_farrington["source_book"] = "Clinical Materia Medica"
with open("data/exports/farrington_clinical.json", "w") as f:
    json.dump([dummy_farrington], f, indent=2)

print("Created JSON export files.")

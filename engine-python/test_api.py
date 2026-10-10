import time
import subprocess
import requests

# Start API
process = subprocess.Popen(["../venv/bin/uvicorn", "api:app", "--port", "8005"])
time.sleep(3) # Wait for it to start

try:
    print("Testing /")
    r = requests.get("http://localhost:8005/")
    print(r.json())

    print("Testing /search")
    r = requests.post("http://localhost:8005/search", json={"query": "fear of death"})
    print(r.json())
finally:
    process.terminate()
    process.wait()

print("All tests passed.")

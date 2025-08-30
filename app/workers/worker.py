"""Helper script to run an RQ worker for this project.

Usage:
  REDIS_URL=redis://localhost:6379/0 python run_worker.py

This script simply prints instructions — prefer running:
  rq worker --url $REDIS_URL default
"""

if __name__ == "__main__":
    import os

    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    print("Run a worker with:")
    print("   rq worker --url $REDIS_URL default")
    print(f"Detected REDIS_URL={url}")

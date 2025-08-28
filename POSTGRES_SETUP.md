Postgres local development setup

This document shows how to run the project locally with Postgres using the provided `docker-compose.yml`.
The S3-compatible storage (MinIO) has been removed in favor of a local-only storage model.

Prerequisites
- Docker & docker-compose installed
- Python (for running tests locally) and a virtualenv

Start the stack

```bash
cd /path/to/backend-api
# Start Redis and Postgres
docker compose up -d postgres redis
```

Initialize the database (from inside the `api` container or locally with the same env)

```bash
# inside the project root
PYTHONPATH=$(pwd) alembic revision --autogenerate -m "initial"
PYTHONPATH=$(pwd) alembic upgrade head
```

Notes
- `DATABASE_URL` is set in `docker-compose.yml` for the `api` and `worker` services.
  It points to `postgresql+psycopg://postgres:postgres@postgres:5432/lora`.
- The API and worker can be run locally, and they will connect to the Postgres and Redis containers.


Running tests locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r dev-requirements.txt
PYTHONPATH=$(pwd) pytest -q
```

If your tests need to run against Postgres, set `DATABASE_URL` before importing the app:

```bash
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/lora
PYTHONPATH=$(pwd) pytest -q
```

Troubleshooting
- If Alembic cannot import the project's metadata, ensure `PYTHONPATH=$(pwd)` is set so `alembic` can import `models` and `db`.
- If you prefer to run migrations from the host, ensure `psycopg[binary]` is installed in your host venv.


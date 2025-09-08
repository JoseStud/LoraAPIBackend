FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install build deps for wheels if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app

EXPOSE 8000

# Default command runs the API; worker uses `rq worker ...` override in compose
# Point uvicorn at the package-level app entry `app.main:app` to match the project layout
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

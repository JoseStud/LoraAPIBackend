FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install system dependencies for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    curl \
 && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend ./backend
COPY app ./app

# Copy infrastructure for migrations
COPY infrastructure ./infrastructure

# Create necessary directories
RUN mkdir -p loras outputs cache/embeddings logs

# Make startup scripts executable
RUN chmod +x infrastructure/docker/start-api.sh infrastructure/docker/migrate.sh

EXPOSE 8000

# Health check for the API
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the API with migrations
CMD ["./infrastructure/docker/start-api.sh"]

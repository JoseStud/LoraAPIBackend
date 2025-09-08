# Multi-stage Dockerfile: build static assets with Node, run Python-only image

# --- Stage 1: build assets with Node ---
FROM node:20 AS assets-build
WORKDIR /build

# Copy package manifests and install dev deps needed for Tailwind, tests, etc.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy frontend sources and run the build (Tailwind) to produce final CSS
COPY app/frontend ./app/frontend
WORKDIR /build/app/frontend
RUN npm run build:css

# --- Stage 2: final Python runtime image ---
FROM python:3.11-slim
WORKDIR /app

# Install minimal Python dependencies for the application
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python app sources
COPY app ./app

# Copy backend package so `import backend` works
COPY backend ./backend

# Copy built static assets from the Node build stage
COPY --from=assets-build /build/app/frontend/static ./app/frontend/static

EXPOSE 8000

# Start the Python app (adjust the module path if different)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

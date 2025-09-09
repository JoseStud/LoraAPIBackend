#!/bin/bash

# Health check script for LoRA Manager Docker setup

set -e

echo "🏥 LoRA Manager Docker Health Check"
echo "=================================="

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Run this script from the infrastructure/docker directory"
    exit 1
fi

# Function to check service health
check_service() {
    local service=$1
    local url=$2
    local expected=$3
    
    echo -n "Checking $service... "
    
    if curl -s "$url" | grep -q "$expected"; then
        echo "✅ Healthy"
        return 0
    else
        echo "❌ Failed"
        return 1
    fi
}

# Function to check port
check_port() {
    local service=$1
    local port=$2
    
    echo -n "Checking $service port $port... "
    
    if nc -z localhost "$port" 2>/dev/null; then
        echo "✅ Open"
        return 0
    else
        echo "❌ Closed"
        return 1
    fi
}

echo
echo "🔍 Checking service ports..."
check_port "Redis" 6380
check_port "PostgreSQL" 5433
check_port "API Server" 8782
check_port "SDNext" 7860

echo
echo "🔍 Checking service health endpoints..."
check_service "API Server" "http://localhost:8782/health" "ok"
check_service "SDNext API" "http://localhost:7860/sdapi/v1/options" "sd_model_checkpoint"

echo
echo "🔍 Checking Docker containers..."
docker-compose ps

echo
echo "🔍 Recent logs (last 10 lines per service)..."
echo "--- API Server ---"
docker-compose logs --tail=10 api 2>/dev/null || echo "Service not running"

echo "--- Worker ---"
docker-compose logs --tail=10 worker 2>/dev/null || echo "Service not running"

echo "--- SDNext ---"
docker-compose logs --tail=10 sdnext 2>/dev/null || echo "Service not running"

echo
echo "✅ Health check complete!"
echo
echo "📋 Access points:"
echo "  - LoRA Manager API: http://localhost:8782"
echo "  - API Documentation: http://localhost:8782/docs"
echo "  - SDNext WebUI: http://localhost:7860"
echo "  - Database: localhost:5433 (postgres/postgres)"

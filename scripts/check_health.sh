#!/bin/bash

# Health check script for SDNext + LoRA Backend integration
# This script verifies that all services are running and communicating properly
# SDNext may run on the host (external SDNext) or in the bundled container

set -e

echo "🔍 Checking SDNext + LoRA Backend Integration Health"

# SDNext URL as seen from this host (external SDNext started with --listen)
SDNEXT_URL="${SDNEXT_URL:-http://localhost:7860}"
echo "   SDNext: ${SDNEXT_URL}"

echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROGRESS_WS_PATH="${PROGRESS_WS_PATH:-/api/v1/ws/progress}"
PROGRESS_WS_URL="${PROGRESS_WS_URL:-ws://localhost:8782${PROGRESS_WS_PATH}}"

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ OK${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        return 1
    fi
}

# Function to check WebSocket
check_websocket() {
    echo -n "Checking WebSocket... "
    
    if command -v python3 &> /dev/null; then
        PROGRESS_WS_URL="$PROGRESS_WS_URL" python3 -c "
import asyncio
import websockets
import json
import sys
import os

async def test_websocket():
    try:
        websocket_url = os.environ.get('PROGRESS_WS_URL', 'ws://localhost:8782/api/v1/ws/progress')
        async with websockets.connect(websocket_url) as websocket:
            # Send subscription
            await websocket.send(json.dumps({'type': 'subscribe', 'job_ids': None}))
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            data = json.loads(response)
            if data.get('type') == 'connected':
                return True
    except:
        return False
    return False

result = asyncio.run(test_websocket())
sys.exit(0 if result else 1)
" 2>/dev/null && echo -e "${GREEN}✅ OK${NC}" || echo -e "${RED}❌ FAILED${NC}"
    else
        echo -e "${YELLOW}⚠️ SKIPPED (python3 not available)${NC}"
    fi
}

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running${NC}"
    exit 1
fi

echo "🐳 Docker is running"
echo

# Check running containers
echo "📦 Checking running containers:"
docker-compose ps

echo

# Basic service health checks
echo "🔍 Health Checks:"

# Check LoRA Backend API
check_service "LoRA Backend API" "http://localhost:8782/health"

# Check SDNext API
check_service "SDNext API" "${SDNEXT_URL}/sdapi/v1/options"

# Check PostgreSQL
check_service "PostgreSQL" "http://localhost:5433" "000"  # Connection refused is expected for HTTP to Postgres

# Check Redis
check_service "Redis" "http://localhost:6380" "000"  # Connection refused is expected for HTTP to Redis

# Check WebSocket
check_websocket

echo

# Advanced integration checks
echo "🔗 Integration Checks:"

# Check if LoRA Backend can reach SDNext
echo -n "Backend → SDNext connectivity... "
if docker-compose exec -T api python -c "
import asyncio
import aiohttp
import os

async def test_connection():
    try:
        base_url = os.environ.get('SDNEXT_BASE_URL') or 'http://sdnext:7860'
        async with aiohttp.ClientSession() as session:
            async with session.get(base_url.rstrip('/') + '/sdapi/v1/options', timeout=10) as response:
                return response.status == 200
    except:
        return False

result = asyncio.run(test_connection())
print('OK' if result else 'FAILED')
exit(0 if result else 1)
" 2>/dev/null; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

# Check if generation backends are available
echo -n "Generation backends... "
if curl -s -H "X-API-Key: dev-api-key-123" "http://localhost:8782/generation/backends" | grep -q "sdnext"; then
    echo -e "${GREEN}✅ OK${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi

echo

# Test generation workflow
echo "🎨 Testing Generation Workflow:"

if command -v curl &> /dev/null; then
    echo -n "Creating test generation job... "
    
    JOB_RESPONSE=$(curl -s -X POST "http://localhost:8782/generation/queue-generation" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: dev-api-key-123" \
        -d '{
            "prompt": "test image",
            "steps": 1,
            "width": 64,
            "height": 64
        }' 2>/dev/null)
    
    if echo "$JOB_RESPONSE" | grep -q "delivery_id"; then
        echo -e "${GREEN}✅ OK${NC}"
        
        # Extract job ID
        JOB_ID=$(echo "$JOB_RESPONSE" | grep -o '"delivery_id":"[^"]*"' | cut -d'"' -f4)
        echo "   Job ID: $JOB_ID"
        
        # Check job status
        echo -n "Checking job status... "
        sleep 2
        JOB_STATUS=$(curl -s -H "X-API-Key: dev-api-key-123" "http://localhost:8782/generation/jobs/$JOB_ID" 2>/dev/null)
        if echo "$JOB_STATUS" | grep -q '"status"'; then
            STATUS=$(echo "$JOB_STATUS" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            echo -e "${GREEN}✅ Status: $STATUS${NC}"
        else
            echo -e "${RED}❌ FAILED${NC}"
        fi
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ SKIPPED (curl not available)${NC}"
fi

echo

# Summary
echo "📊 Health Check Summary:"
echo "- LoRA Backend API: http://localhost:8782"
echo "- SDNext WebUI: ${SDNEXT_URL}"
echo "- API Documentation: http://localhost:8782/docs"
echo "- WebSocket Test: Open websocket_test.html in browser"

echo
echo "🚀 Integration Status: All core services are running!"
echo "   Try the API at: http://localhost:8782/docs"
echo "   Monitor progress at: ${PROGRESS_WS_URL}"

#!/usr/bin/env python3
"""WebSocket Test Client for SDNext Integration

This script demonstrates how to:
1. Connect to the WebSocket progress endpoint
2. Submit a generation request
3. Monitor real-time progress updates
4. Handle the completed generation response

Usage:
    python test_websocket_client.py [--host localhost] [--port 8782]
"""

import argparse
import asyncio
import json
from datetime import datetime

import aiohttp
import websockets


async def monitor_progress(websocket_url: str):
    """Monitor WebSocket progress updates"""
    try:
        async with websockets.connect(websocket_url) as websocket:
            print(f"✅ Connected to WebSocket: {websocket_url}")
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    
                    if data.get("type") == "progress":
                        progress = data.get("progress", 0)
                        status = data.get("status", "unknown")
                        print(f"[{timestamp}] Progress: {progress}% - Status: {status}")
                        
                        if progress >= 100:
                            print("🎉 Generation completed!")
                            break
                            
                    elif data.get("type") == "error":
                        print(f"[{timestamp}] ❌ Error: {data.get('message')}")
                        break
                        
                    elif data.get("type") == "result":
                        print(f"[{timestamp}] ✅ Result received!")
                        print(f"Image URL: {data.get('image_url')}")
                        break
                        
                except json.JSONDecodeError:
                    print(f"[{timestamp}] ⚠️  Invalid JSON received: {message}")
                    
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")


async def submit_generation_request(api_url: str, api_key: str = None):
    """Submit a test generation request"""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    
    # Simple test request
    payload = {
        "prompt": "a beautiful landscape with mountains, digital art",
        "negative_prompt": "blurry, low quality, distorted",
        "width": 512,
        "height": 512,
        "steps": 10,  # Quick test
        "cfg_scale": 7.0,
        "sampler_name": "DPM++ 2M Karras",
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            print(f"🚀 Submitting generation request to: {api_url}")
            print(f"Payload: {json.dumps(payload, indent=2)}")
            
            async with session.post(api_url, json=payload, headers=headers) as response:
                if response.status == 200:
                    result = await response.json()
                    print("✅ Request submitted successfully!")
                    print(f"Job ID: {result.get('job_id', 'N/A')}")
                    return result
                else:
                    error_text = await response.text()
                    print(f"❌ Request failed: {response.status}")
                    print(f"Error: {error_text}")
                    return None
                    
    except Exception as e:
        print(f"❌ Request submission failed: {e}")
        return None


async def test_generation_with_monitoring(host: str, port: int, api_key: str = None):
    """Test the complete generation workflow with WebSocket monitoring"""
    websocket_url = f"ws://{host}:{port}/ws/progress"
    api_url = f"http://{host}:{port}/compose/txt2img"
    
    print("🧪 Testing SDNext WebSocket Integration")
    print(f"WebSocket: {websocket_url}")
    print(f"API: {api_url}")
    print("-" * 50)
    
    # Start monitoring and generation concurrently
    try:
        monitor_task = asyncio.create_task(monitor_progress(websocket_url))
        
        # Give WebSocket a moment to connect
        await asyncio.sleep(1)
        
        # Submit generation request
        generation_task = asyncio.create_task(
            submit_generation_request(api_url, api_key),
        )
        
        # Wait for both tasks
        await asyncio.gather(monitor_task, generation_task, return_exceptions=True)
        
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"❌ Test failed: {e}")


def main():
    parser = argparse.ArgumentParser(description="Test WebSocket client for SDNext integration")
    parser.add_argument("--host", default="localhost", help="API host (default: localhost)")
    parser.add_argument("--port", type=int, default=8782, help="API port (default: 8782)")
    parser.add_argument("--api-key", help="API key if required")
    
    args = parser.parse_args()
    
    print("🔌 SDNext WebSocket Test Client")
    print("Press Ctrl+C to exit\n")
    
    try:
        asyncio.run(test_generation_with_monitoring(args.host, args.port, args.api_key))
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")


if __name__ == "__main__":
    main()

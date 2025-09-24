"""Simple WebSocket test client for development and testing."""

import asyncio
import json
from datetime import datetime

import websockets


async def test_websocket():
    """Test WebSocket connection and message handling."""
    uri = "ws://localhost:8000/api/v1/ws/progress"

    try:
        async with websockets.connect(uri) as websocket:
            print(f"✅ Connected to {uri}")

            # Send subscription message
            subscription = {
                "type": "subscribe",
                "job_ids": None,  # Subscribe to all jobs
                "include_previews": False,
            }
            await websocket.send(json.dumps(subscription))
            print("📤 Sent subscription request")

            # Listen for messages
            timeout = 60  # 1 minute timeout
            start_time = datetime.now()

            while True:
                try:
                    # Check timeout
                    if (datetime.now() - start_time).seconds > timeout:
                        print("⏰ Timeout reached")
                        break

                    # Wait for message with timeout
                    message = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=5.0,
                    )

                    data = json.loads(message)
                    msg_type = data.get("type", "unknown")
                    timestamp = data.get("timestamp", "")

                    print(f"📥 Received {msg_type} at {timestamp}")

                    if msg_type == "connected":
                        print(f"   Connection ID: {data['data']['connection_id']}")
                    elif msg_type == "subscription_confirmed":
                        print(
                            f"   Subscribed to: {data['data']['job_ids'] or 'all jobs'}"
                        )
                    elif msg_type == "generation_started":
                        job_data = data["data"]
                        print(f"   Job started: {job_data['job_id']}")
                        print(f"   Prompt: {job_data['params']['prompt'][:50]}...")
                    elif msg_type == "progress_update":
                        progress_data = data["data"]
                        print(f"   Job: {progress_data['job_id']}")
                        print(f"   Progress: {progress_data['progress']:.1%}")
                        print(f"   Status: {progress_data['status']}")
                    elif msg_type == "generation_complete":
                        complete_data = data["data"]
                        print(f"   Job completed: {complete_data['job_id']}")
                        print(f"   Status: {complete_data['status']}")
                        if complete_data.get("images"):
                            print(
                                f"   Images: {len(complete_data['images'])} generated"
                            )

                except asyncio.TimeoutError:
                    print("⏳ Waiting for messages...")
                    continue
                except json.JSONDecodeError as e:
                    print(f"❌ JSON decode error: {e}")
                    continue

    except websockets.exceptions.ConnectionRefused:
        print("❌ Connection refused. Is the server running on localhost:8000?")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")


if __name__ == "__main__":
    print("🚀 Starting WebSocket test client...")
    print(
        "💡 To test, start the server and create a generation job in another terminal:"
    )
    print("   curl -X POST http://localhost:8000/generation/queue-generation \\")
    print("        -H 'Content-Type: application/json' \\")
    print('        -d \'{"prompt": "a beautiful landscape"}\'')
    print()

    asyncio.run(test_websocket())

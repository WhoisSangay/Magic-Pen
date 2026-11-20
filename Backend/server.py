import asyncio
import websockets
import json
import numpy as np
import pandas as pd
import joblib
import os
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load model + scaler
try:
    model = joblib.load("./model/different_data_model3.pkl")
    scaler = joblib.load("./model/different_data_scaler3.pkl")
    logger.info("Model and scaler loaded successfully")
except FileNotFoundError as e:
    logger.error(f"Model files not found: {e}")
    raise

# Configuration from environment variables
PORT = int(os.getenv("PORT", 8766))
HOST = os.getenv("HOST", "0.0.0.0")

async def handle_client(websocket):
    client_address = websocket.remote_address
    logger.info(f"Client connected: {client_address}")

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON format"
                }))
                continue

            # Test message
            if data.get("type") == "test":
                await websocket.send(json.dumps({
                    "type": "test_response",
                    "message": "WebSocket working"
                }))
                logger.info(f"Test message from {client_address}")

            # Gesture prediction
            elif data.get("type") == "gesture":
                try:
                    landmarks = np.array(data.get("landmarks", [])).reshape(1, -1)

                    # Preserve feature names if the scaler was fitted with them
                    if hasattr(scaler, "feature_names_in_"):
                        landmarks = pd.DataFrame(landmarks, columns=scaler.feature_names_in_)

                    # Scale
                    scaled = scaler.transform(landmarks)

                    # Predict
                    prediction = model.predict(scaled)[0]

                    await websocket.send(json.dumps({
                        "type": "prediction",
                        "result": int(prediction)
                    }))
                    logger.info(f"Prediction: {int(prediction)} from {client_address}")

                except Exception as e:
                    logger.error(f"Prediction error: {str(e)}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Prediction failed: {str(e)}"
                    }))

            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {data.get('type')}"
                }))

    except websockets.exceptions.ConnectionClosed:
        logger.info(f"🔌 Client disconnected: {client_address}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")


# Start server
async def main():
    logger.info(f"Starting WebSocket server on ws://{HOST}:{PORT}")
    async with websockets.serve(handle_client, HOST, PORT):
        logger.info(f"Server is running and ready to accept connections")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutdown requested")
    except Exception as e:
        logger.error(f"Fatal error: {str(e)}")
        raise
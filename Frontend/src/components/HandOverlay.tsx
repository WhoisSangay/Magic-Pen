import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Webcam from 'react-webcam';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { HandLandmarkTracker } from '../lib/KalmanFilter';

interface HandOverlayProps {
  onHandsDetected: (result: HandLandmarkerResult) => void;
  drawLandmarks?: boolean;
}

export interface HandOverlayHandle {
  getScreenshot: () => string | null;
}

const HandOverlay = forwardRef<HandOverlayHandle, HandOverlayProps>(({ onHandsDetected, drawLandmarks = true }, ref) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(null);
  const requestRef = useRef<number>(null);
  const trackersRef = useRef<HandLandmarkTracker[]>([]);
  const frameCountRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getScreenshot: () => {
      return webcamRef.current?.getScreenshot() || null;
    }
  }));

  useEffect(() => {
    const initLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 2
      });
      setLandmarker(handLandmarker);
    };
    initLandmarker();
  }, []);

  useEffect(() => {
    if (!landmarker) return;

    const detect = async () => {
      if (
        webcamRef.current &&
        webcamRef.current.video &&
        webcamRef.current.video.readyState === 4
      ) {
        const video = webcamRef.current.video;
        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);
        
        // Smooth landmarks with Kalman filter
        const smoothedResults = { ...results };
        
        // Ensure we have a tracker for each detected hand
        while (trackersRef.current.length < results.landmarks.length) {
          trackersRef.current.push(new HandLandmarkTracker(21, 0.5));
        }
        
        // Update trackers and get smoothed landmarks
        smoothedResults.landmarks = results.landmarks.map((landmarks, handIdx) => {
          const tracker = trackersRef.current[handIdx];
          // Update filter with raw detections and get smoothed landmarks
          return tracker.updateLandmarks(landmarks, startTimeMs);
        });

        // Pass smoothed results to parent component
        onHandsDetected(smoothedResults as HandLandmarkerResult);

        if (drawLandmarks && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            // Set canvas size to match visual size to avoid stretch
            if (canvasRef.current.width !== canvasRef.current.clientWidth || 
                canvasRef.current.height !== canvasRef.current.clientHeight) {
                canvasRef.current.width = canvasRef.current.clientWidth;
                canvasRef.current.height = canvasRef.current.clientHeight;
            }

            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            smoothedResults.landmarks.forEach((landmarks) => {
              ctx.fillStyle = '#10b981';
              landmarks.forEach((lm) => {
                const x = lm.x * canvasRef.current!.width;
                const y = lm.y * canvasRef.current!.height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
              });
              
              ctx.strokeStyle = '#34d399';
              ctx.lineWidth = 2;
              const connections = [
                [0, 1], [1, 2], [2, 3], [3, 4],
                [0, 5], [5, 6], [6, 7], [7, 8],
                [5, 9], [9, 10], [10, 11], [11, 12],
                [9, 13], [13, 14], [14, 15], [15, 16],
                [13, 17], [17, 18], [18, 19], [19, 20],
                [0, 17]
              ];
              connections.forEach(([i, j]) => {
                const pt1 = landmarks[i];
                const pt2 = landmarks[j];
                ctx.beginPath();
                ctx.moveTo(pt1.x * canvasRef.current!.width, pt1.y * canvasRef.current!.height);
                ctx.lineTo(pt2.x * canvasRef.current!.width, pt2.y * canvasRef.current!.height);
                ctx.stroke();
              });
            });
          }
        }
      }
      requestRef.current = requestAnimationFrame(detect);
    };

    detect();
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [landmarker, onHandsDetected, drawLandmarks]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Webcam
        ref={webcamRef}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"//grayscale opacity-30 
        mirrored={false} // We handle mirroring via CSS for better control
        screenshotFormat="image/jpeg"
        videoConstraints={{
            facingMode: "user",
            width: 1280,
            height: 720
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100"
        width={1280}
        height={720}
      />
    </div>
  );
});

HandOverlay.displayName = 'HandOverlay';

export default HandOverlay;

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface Point {
  x: number;
  y: number;
  color: string;
  size: number;
  isNewStroke?: boolean;
}

interface DrawingCanvasProps {
  points: Point[];
  width: number;
  height: number;
}

export interface DrawingCanvasHandle {
    getCanvas: () => HTMLCanvasElement | null;
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(({ points, width, height }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (points.length === 0) return;

    let currentStrokeColor = points[0].color;
    let currentStrokeSize = points[0].size;
    
    ctx.beginPath();
    ctx.strokeStyle = currentStrokeColor;
    ctx.lineWidth = currentStrokeSize;
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.isNewStroke || p.color !== currentStrokeColor || p.size !== currentStrokeSize) {
        ctx.stroke();
        ctx.beginPath();
        currentStrokeColor = p.color;
        currentStrokeSize = p.size;
        ctx.strokeStyle = currentStrokeColor;
        ctx.lineWidth = currentStrokeSize;
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }, [points, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pointer-events-none"
    />
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

export default DrawingCanvas;

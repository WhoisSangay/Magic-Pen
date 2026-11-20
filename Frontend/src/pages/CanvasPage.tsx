import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Camera,
  Trash2,
  Settings2,
  Undo2,
  Hand,
} from 'lucide-react';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import HandOverlay, { HandOverlayHandle } from '../components/HandOverlay';
import DrawingCanvas, { DrawingCanvasHandle } from '../components/DrawingCanvas';
import { cn } from '../lib/utils';
import Logo from '../assets/logo.svg';

interface Point {
  x: number;
  y: number;
  color: string;
  size: number;
  isNewStroke?: boolean;
  screenX?: number;
  screenY?: number;
}

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#0a0a0a',
];

const CANVAS_WIDTH = 4000;
const CANVAS_HEIGHT = 4000;
const WS_URL = import.meta.env.VITE_WS_URL;

// 0=Draw, 1=Erase, 2=Scroll, 3=Cursor, 4=Color, 5=Screenshot, 6=Clear
const GESTURE_LABELS: Record<number, string> = {
  0: 'draw', 1: 'erase', 2: 'scroll', 3: 'cursor', 4: 'color', 5: 'screenshot', 6: 'clear',
};

interface CanvasPageProps {
  onBack: () => void;
}

// ── Sub-components ──

function ToolButton({ icon, label, active, gesture, onClick }: { icon: any; label: string; active: boolean; gesture?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center justify-between p-3 rounded-2xl transition-all group', active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-[1.02]' : 'hover:bg-neutral-800 text-neutral-400')}>
      <div className="flex items-center gap-3">
        <div className={cn('transition-transform', active ? 'scale-110' : 'group-hover:scale-110')}>{icon}</div>
        <span className="font-medium">{label}</span>
      </div>
      {gesture && <span className={cn('text-[10px] font-mono px-2 py-1 rounded-lg', active ? 'bg-white/20' : 'bg-neutral-800')}>{gesture}</span>}
    </button>
  );
}

function GestureInfo({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-neutral-400 border border-neutral-800/50 p-2 rounded-xl bg-neutral-800/20">
      <span className="text-lg">{icon}</span>
      <span className="font-medium tracking-wide">{label}</span>
    </div>
  );
}

function ActionButton({ icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-neutral-400 hover:bg-neutral-800', danger && 'hover:text-red-400 hover:bg-red-500/10')}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// ── Main Component ──

export default function CanvasPage({ onBack }: CanvasPageProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bottomBarOpen, setBottomBarOpen] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#10b981');
  const [brushSize, setBrushSize] = useState(12);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [activeTool, setActiveTool] = useState<'draw' | 'erase' | 'cursor' | 'scroll'>('draw');
  const [handResult, setHandResult] = useState<HandLandmarkerResult | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [lastGesture, setLastGesture] = useState<string>('none');

  const containerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<DrawingCanvasHandle>(null);
  const handOverlayRef = useRef<HandOverlayHandle>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const lastPointsRef = useRef<Record<number, { x: number; y: number; screenX: number; screenY: number } | null>>({});
  const lastGestureTimeRef = useRef<Record<string, number>>({});

  // Use refs for values needed inside WS callback to avoid stale closures
  const brushSizeRef = useRef(brushSize);
  const currentColorRef = useRef(currentColor);
  const handResultRef = useRef<HandLandmarkerResult | null>(null);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);

  // Tracks whether the color gesture is currently being held (to fire only once per show)
  const colorGestureActiveRef = useRef(false);

  // ── Sticky gesture: a prediction must appear N frames in a row before acting ──
  const STICKY_FRAMES = 5;
  const pendingGestureRef = useRef<number | null>(null); // candidate prediction
  const pendingCountRef = useRef(0);                     // consecutive frame count

  // ── WebSocket: connect once, auto-reconnect ──
  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setWsStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        ws.send(JSON.stringify({ type: 'test' }));
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!cancelled) setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'prediction') {
            const prediction = data.result;

            // Sticky gesture: must see same prediction N frames in a row
            if (prediction === pendingGestureRef.current) {
              pendingCountRef.current += 1;
            } else {
              // Different prediction — reset the streak
              pendingGestureRef.current = prediction;
              pendingCountRef.current = 1;
            }

            // Only act once confirmed (first time hitting STICKY_FRAMES),
            // then keep acting every frame so draw/erase/scroll stay smooth
            if (pendingCountRef.current >= STICKY_FRAMES) {
              applyGesture(prediction);
            }
          }
        } catch (_) {}
      };
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Utility actions ──
  const clearCanvas = useCallback(() => setPoints([]), []);
  const undo = useCallback(() => setPoints((prev) => prev.slice(0, -20)), []);

  const takeScreenshot = useCallback(() => {
    const link = document.createElement('a');
    link.download = 'gesture-art.png';
    const canvas = drawingCanvasRef.current?.getCanvas();
    if (canvas) { link.href = canvas.toDataURL(); link.click(); }
  }, []);

  const processInteraction = useCallback((normX: number, normY: number, tool: 'draw' | 'erase', handId: number) => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight, scrollLeft, scrollTop } = containerRef.current;
    const x = normX * clientWidth + scrollLeft;
    const y = normY * clientHeight + scrollTop;

    if (tool === 'erase') {
      const r = brushSizeRef.current * 3;
      setPoints((prev) => {
        const next: typeof prev = [];
        for (let i = 0; i < prev.length; i++) {
          const p = prev[i];
          if (Math.hypot(p.x - x, p.y - y) <= r) {
            // This point is erased — mark the next surviving point as a new stroke
            // so the line doesn't bend across the gap
            let j = i + 1;
            while (j < prev.length && Math.hypot(prev[j].x - x, prev[j].y - y) <= r) j++;
            if (j < prev.length) {
              prev[j] = { ...prev[j], isNewStroke: true };
            }
          } else {
            next.push(p);
          }
        }
        return next;
      });
    } else {
      const isNewStroke = !lastPointsRef.current[handId];
      setPoints((prev) => [...prev, { x, y, color: currentColorRef.current, size: brushSizeRef.current, isNewStroke }]);
    }

    lastPointsRef.current[handId] = { x, y, screenX: normX * 1280, screenY: normY * 720 };
  }, []);

  // ── Apply prediction (0–6) using latest hand position from ref ──
  const applyGesture = useCallback((prediction: number) => {
    const result = handResultRef.current;
    if (!result || result.landmarks.length === 0) return;

    const gestureName = GESTURE_LABELS[prediction] ?? 'unknown';
    setLastGesture(gestureName);

    const landmarks = result.landmarks[0];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const now = Date.now();

    switch (prediction) {
      // 0 — Draw: track index tip
      case 0:
        colorGestureActiveRef.current = false;
        setActiveTool('draw');
        setIsDrawing(true);
        processInteraction(1 - indexTip.x, indexTip.y, 'draw', 0);
        break;

      // 1 — Erase: track thumb tip
      case 1:
        colorGestureActiveRef.current = false;
        setActiveTool('erase');
        setIsDrawing(true);
        processInteraction(1 - thumbTip.x, thumbTip.y, 'erase', 0);
        break;

      // 2 — Scroll: pan the canvas via index tip delta
      case 2:
        colorGestureActiveRef.current = false;
        setActiveTool('scroll');
        setIsDrawing(false);
        if (containerRef.current) {
          const last = lastPointsRef.current[0];
          if (last) {
            const dx = (1 - indexTip.x) * 1280 - last.screenX;
            const dy = indexTip.y * 720 - last.screenY;
            containerRef.current.scrollBy(-dx * 2, -dy * 2);
          }
          lastPointsRef.current[0] = {
            x: (1 - indexTip.x) * CANVAS_WIDTH,
            y: indexTip.y * CANVAS_HEIGHT,
            screenX: (1 - indexTip.x) * 1280,
            screenY: indexTip.y * 720,
          };
        }
        break;

      // 3 — Cursor: idle, no drawing
      case 3:
        colorGestureActiveRef.current = false;
        setActiveTool('cursor');
        setIsDrawing(false);
        lastPointsRef.current[0] = null;
        break;

      // 4 — Color: advance ONE step, only fires once per gesture hold
      case 4:
        setIsDrawing(false);
        if (!colorGestureActiveRef.current) {
          colorGestureActiveRef.current = true;
          setCurrentColor((prev) => COLORS[(COLORS.indexOf(prev) + 1) % COLORS.length]);
        }
        break;

      // 5 — Screenshot (debounced 2000ms)
      case 5:
        colorGestureActiveRef.current = false;
        setIsDrawing(false);
        if (now - (lastGestureTimeRef.current['screenshot'] || 0) > 2000) {
          takeScreenshot();
          lastGestureTimeRef.current['screenshot'] = now;
        }
        break;

      // 6 — Clear (debounced 1500ms)
      case 6:
        colorGestureActiveRef.current = false;
        setIsDrawing(false);
        if (now - (lastGestureTimeRef.current['clear'] || 0) > 1500) {
          clearCanvas();
          lastGestureTimeRef.current['clear'] = now;
        }
        break;

      default:
        colorGestureActiveRef.current = false;
        setIsDrawing(false);
        lastPointsRef.current[0] = null;
    }
  }, [processInteraction, takeScreenshot, clearCanvas]);

  // ── Build 126-value landmark array and send to WS ──
  // Order: LEFT hand (63 values: x0,y0,z0...x20,y20,z20) then RIGHT hand (63 values)
  // Missing hand = 63 zeros
  const sendLandmarksToWS = useCallback((result: HandLandmarkerResult) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const ZEROS = new Array(63).fill(0); // 21 × 3
    let leftFlat = [...ZEROS];
    let rightFlat = [...ZEROS];

    result.landmarks.forEach((landmarks, i) => {
      // MediaPipe handedness matches the user's actual hand in this setup
      const handedness = result.handedness?.[i]?.[0]?.categoryName ?? 'Right';
      const flat = landmarks.flatMap((lm) => [lm.x, lm.y, lm.z]);

      if (handedness === 'Left') {
        leftFlat = flat;  // model says "Left" = user's left hand
      } else {
        rightFlat = flat; // model says "Right" = user's right hand
      }
    });

    // Final array: left (63) + right (63) = 126 values, left-to-right order
    wsRef.current.send(JSON.stringify({
      type: 'gesture',
      landmarks: [...leftFlat, ...rightFlat],
    }));
  }, []);

  // ── Hand detection: store result in ref + send to WS ──
  const handleHandsDetected = useCallback((result: HandLandmarkerResult) => {
    setHandResult(result);
    handResultRef.current = result; // keep ref fresh for applyGesture

    if (!result.landmarks || result.landmarks.length === 0) {
      setIsDrawing(false);
      setLastGesture('none');
      lastPointsRef.current = {};
      colorGestureActiveRef.current = false;
      pendingGestureRef.current = null;
      pendingCountRef.current = 0;
      return;
    }

    sendLandmarksToWS(result);
  }, [sendLandmarksToWS]);

  // ── Render ──
  return (
    <div className="relative w-screen h-screen flex flex-col items-stretch bg-neutral-950 overflow-hidden">
      <div className="flex-1 relative overflow-hidden flex flex-col">

        {/* Full camera view (no opacity/grayscale) */}
        <AnimatePresence>
          {cameraEnabled && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-0 transition-all duration-700">
              <HandOverlay ref={handOverlayRef} onHandsDetected={handleHandsDetected} drawLandmarks={true} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable Canvas */}
        <div ref={containerRef} className="flex-1 overflow-auto scrollbar-none relative z-10">
          <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            <div className="absolute inset-0">
              <DrawingCanvas ref={drawingCanvasRef} points={points} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        <motion.div initial={false} animate={{ x: sidebarOpen ? 0 : -280 }} className="absolute left-6 top-6 bottom-6 w-72 z-30 pointer-events-none">
          <div className="w-full h-full bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden">
            <div className="p-6 border-bottom border-neutral-800 flex items-center justify-between">
              <img onClick={onBack} src={Logo} alt="Logo" className="cursor-pointer" />
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-neutral-800 rounded-xl transition-colors"><ChevronLeft size={20} /></button>
            </div>

            <div className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-none">
              <ToolButton icon="☝️" label="Draw"   active={activeTool === 'draw'}   onClick={() => setActiveTool('draw')} />
              <ToolButton icon="👍" label="Erase"  active={activeTool === 'erase'}  onClick={() => setActiveTool('erase')} />
              <ToolButton icon="🖐️ " label="Cursor" active={activeTool === 'cursor'} onClick={() => setActiveTool('cursor')} />
              <ToolButton icon="✊" label="Scroll" active={activeTool === 'scroll'} onClick={() => setActiveTool('scroll')} />

              <div className="h-4" />
              <div className="px-3 py-2 text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Smart Gestures</div>
              <div className="px-3 space-y-3 py-1">
                <GestureInfo icon="✌️" label="Color Cycle" />
                <GestureInfo icon="👌" label="Screenshot" />
                <GestureInfo icon="👐" label="Clear" />
              </div>

              <div className="h-4" />
              <div className="px-3 py-2 text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Quick Actions</div>
              <ActionButton icon={<Undo2 size={18} />}  label="Undo"      onClick={undo} />
              <ActionButton icon={<Trash2 size={18} />} label="Clear All" onClick={clearCanvas} danger />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {!sidebarOpen && (
        <motion.button initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} onClick={() => setSidebarOpen(true)}
          className="absolute left-6 top-1/2 -translate-y-1/2 z-40 w-12 h-24 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center hover:bg-neutral-800 transition-colors shadow-xl">
          <ChevronRight size={24} />
        </motion.button>
      )}

      {/* Bottom Bar */}
      <AnimatePresence>
        <motion.div initial={false} animate={{ y: bottomBarOpen ? 0 : 120 }} className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-full py-3 px-6 shadow-2xl flex items-center gap-6 pointer-events-auto">

            <div className="flex items-center gap-4 border-r border-neutral-800 pr-6 mr-2">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">Mode</span>
                <span className="text-sm font-mono text-emerald-400 font-bold uppercase tracking-widest">
                  {lastGesture !== 'none' ? lastGesture : activeTool}
                </span>
              </div>
              <div className={cn('w-3 h-3 rounded-full animate-pulse', isDrawing ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-neutral-600')} />
            </div>

            <div className="flex items-center gap-3">
              {COLORS.map((color) => (
                <button key={color} onClick={() => setCurrentColor(color)}
                  className={cn('w-8 h-8 rounded-full border-2 transition-all hover:scale-110', currentColor === color ? 'border-white scale-110 ring-4 ring-white/10' : 'border-neutral-800')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 border-l border-neutral-800 pl-6 ml-2">
              <button onClick={takeScreenshot} className="p-3 hover:bg-neutral-800 rounded-full transition-all text-neutral-400 hover:text-white"><Camera size={20} /></button>

              <div className="relative">
                <button onClick={() => setSettingsOpen(!settingsOpen)}
                  className={cn('p-3 rounded-full transition-all text-neutral-400 hover:text-white', settingsOpen ? 'bg-emerald-500 text-white' : 'hover:bg-neutral-800')}>
                  <Settings2 size={20} />
                </button>

                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full mb-4 right-0 w-64 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl z-50 pointer-events-auto">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Settings</h3>
                          <button onClick={() => setSettingsOpen(false)} className="text-neutral-500 hover:text-white"><ChevronDown size={16} /></button>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-neutral-500 font-medium">Brush Size</span>
                            <span className="font-mono text-emerald-400">{brushSize}px</span>
                          </div>
                          <input type="range" min="1" max="100" value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full accent-emerald-500 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="pt-4 border-t border-neutral-800">
                          <button onClick={() => setCameraEnabled(!cameraEnabled)}
                            className={cn('w-full flex items-center justify-between p-3 rounded-2xl transition-all', cameraEnabled ? 'bg-neutral-800 text-white' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                            <div className="flex items-center gap-2">
                              <Camera size={16} />
                              <span className="text-xs font-bold uppercase tracking-wider">Camera</span>
                            </div>
                            <div className={cn('w-8 h-4 rounded-full relative transition-colors', cameraEnabled ? 'bg-emerald-500' : 'bg-neutral-700')}>
                              <div className={cn('absolute top-1 bottom-1 w-2 bg-white rounded-full transition-all', cameraEnabled ? 'right-1' : 'left-1')} />
                            </div>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button onClick={() => setBottomBarOpen(false)} className="p-3 hover:bg-neutral-800 rounded-full transition-all text-neutral-400"><ChevronDown size={20} /></button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {!bottomBarOpen && (
        <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={() => setBottomBarOpen(true)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-24 h-12 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center hover:bg-neutral-800 transition-colors shadow-xl">
          <ChevronUp size={24} />
        </motion.button>
      )}

      {/* Status Overlay */}
      <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-2">
        <div className="bg-neutral-900/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-800 shadow-xl">
          <div className="flex items-center gap-3">
            <div className={cn('w-2 h-2 rounded-full',
              wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' :
              wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            )} />
            <span className="text-xs font-mono uppercase tracking-widest">WS: {wsStatus}</span>
          </div>
        </div>
        <div className="bg-neutral-900/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-800 shadow-xl">
          <div className="flex items-center gap-3">
            <Hand size={16} className="text-emerald-500" />
            <span className="text-xs font-mono">HANDS: {handResult?.landmarks.length || 0} | {lastGesture.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

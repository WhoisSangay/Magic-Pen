import React, { useState } from 'react';
import LandingPage from './pages/LandingPage';
import CanvasPage from './pages/CanvasPage';

export default function App() {
  const [view, setView] = useState<'landing' | 'canvas'>('landing');

  if (view === 'landing') {
    return <LandingPage onStart={() => setView('canvas')} />;
  }

  return <CanvasPage onBack={() => setView('landing')} />;
}

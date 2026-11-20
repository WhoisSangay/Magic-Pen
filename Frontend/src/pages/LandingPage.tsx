import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Logo from '../assets/logo.svg';
import { cn } from '../lib/utils';

interface LandingPageProps {
  onStart: () => void;
}

function InstructionCard({
  emoji,
  title,
  desc,
  fullWidth = false,
}: {
  emoji: string;
  title: string;
  desc: string;
  fullWidth?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        'bg-white/10 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-10 flex flex-col items-center text-center transition-all hover:bg-white/15',
        fullWidth && 'w-full'
      )}
    >
      <div className="w-32 h-32 bg-white/10 rounded-[2rem] flex items-center justify-center mb-8 border border-white/20 shadow-inner">
        <span className="text-6xl drop-shadow-lg">{emoji}</span>
      </div>
      <h3 className="text-2xl font-bold mb-4 tracking-tight">{title}</h3>
      <p className="text-white/70 leading-relaxed font-medium">{desc}</p>
    </motion.div>
  );
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const landingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (landingRef.current) {
        setScrolled(landingRef.current.scrollTop > 50);
      }
    };
    const ref = landingRef.current;
    if (ref) {
      ref.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (ref) ref.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div
      ref={landingRef}
      className="w-full h-screen overflow-y-auto scroll-smooth bg-magic-gradient text-white selection:bg-white/20"
    >
      {/* Sticky Header */}
      <AnimatePresence>
        {scrolled && (
          <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 px-10 py-6 flex items-center justify-between"
          >
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => landingRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <img src={Logo} alt="" />
            </div>

            <nav>
              <ul className="flex items-center gap-10 text-sm font-medium tracking-wider uppercase bg-white/10 backdrop-blur-md px-8 py-3 rounded-2xl border border-white/20">
                <li>
                  <button
                    onClick={onStart}
                    className="hover:text-emerald-300 transition-colors"
                  >
                    Get started
                  </button>
                </li>
                <li>
                  <a href="#instructions" className="hover:text-emerald-300 transition-colors">
                    Instruction
                  </a>
                </li>
              </ul>
            </nav>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 flex flex-col items-center text-center"
        >
          <div className="relative flex flex-col items-center justify-center">
            <img src={Logo} className="w-70 h-70" alt="" />
          </div>

          {/* <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl md:text-3xl font-medium text-white/90 max-w-xl mb-12 drop-shadow-md py-10"
          > */}
          <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl md:text-3xl text-white/90 max-w-xl mb-12 drop-shadow-md py-10"
              style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 400, letterSpacing: '0.01em' }}
            >
            No Pen. No Touch. Just Magic
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center gap-12 pb-10"
          >
            <button
              onClick={onStart}
              className="px-10 py-4 text-sm tracking-widest uppercase border-b-2 border-white hover:text-emerald-300 transition-all font-bold hover:scale-110"
            >
              Get started
            </button>
            <a
              href="#instructions"
              className="px-10 py-4 text-sm tracking-widest uppercase border-b-2 border-white/30 hover:border-white transition-all font-bold hover:scale-110"
            >
              Instruction
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Instructions Section */}
      <section id="instructions" className="min-h-screen py-32 px-6 md:px-20 relative bg-black/5">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-6xl mx-auto"
        >
          <div className="text-center mb-24">
            <h2 className="text-3xl md:text-4xl font-bold drop-shadow-lg tracking-wide uppercase">
              Instruction
            </h2>
            <div className="w-24 h-1 bg-white/20 mx-auto mt-6 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            <InstructionCard emoji="☝️" title="How to Draw?" desc="Show the pointer finger of your right hand." />
            <InstructionCard emoji="👍" title="How to Erase?" desc="Show the thumb of your right hand." />
            <InstructionCard emoji="🖐️" title="How to use Cursor?" desc="Show the fist of your right hand." />
            <InstructionCard emoji="✊" title="How to Scroll?" desc="Show all your fingers of your right hand." />
            <InstructionCard emoji="✌️" title="How to change Color?" desc="Show pointer and middle finger of your right hand." />
            <InstructionCard emoji="👌" title="How to Screenshot?" desc="Snap a photo by touching your index and thumb." />
          </div>

          <div className="mt-24 flex flex-col items-center">
            <div className="w-full max-w-xl">
              <InstructionCard
                emoji="👐"
                title="How to Clear?"
                desc="Show both of your hand with all of your fingers wide open."
                fullWidth
              />
            </div>
          </div>

          <div className="flex justify-between items-center mt-32 text-sm font-bold tracking-widest uppercase pb-20">
            <button
              onClick={() => landingRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-emerald-300 transition-all hover:-translate-x-2"
            >
              ← Back to Top
            </button>
            <button
              onClick={onStart}
              className="hover:text-emerald-300 transition-all hover:translate-x-2"
            >
              Start Drawing →
            </button>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

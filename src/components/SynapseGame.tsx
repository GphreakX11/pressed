"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import synapsePairs from "@/lib/synapsePairs.json";

type SynapsePair = { wordA: string; wordB: string; sharedLetter: string };

interface SynapseGameProps {
  onEnd: (score: number, maxStreak: number) => void;
  onCancel: () => void;
  playerName: string;
  playerId: string;
}

const MACRO_TIME = 45; // seconds
const MICRO_TIME = 3.0; // seconds
const TICK_MS = 100; // game loop interval
const STREAK_BONUS_INTERVAL = 10; // every N correct = +5s
const TIME_EXTENSION = 5; // seconds added per streak bonus

function getRandomPair(): SynapsePair {
  const pool = synapsePairs as SynapsePair[];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns all unique letters from a word that also appear in the other word.
 * Used to render the letter buttons.
 */
function getUniqueLetters(wordA: string, wordB: string): string[] {
  const combined = new Set([...wordA.split(""), ...wordB.split("")]);
  // Shuffle them so the shared letter isn't always in the same position
  const arr = Array.from(combined);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function SynapseGame({ onEnd, onCancel, playerName, playerId }: SynapseGameProps) {
  // ── Display State (triggers re-renders) ──
  const [displayMacro, setDisplayMacro] = useState(MACRO_TIME);
  const [displayMicro, setDisplayMicro] = useState(MICRO_TIME);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayStreak, setDisplayStreak] = useState(0);
  const [displayMaxStreak, setDisplayMaxStreak] = useState(0);
  const [currentPair, setCurrentPair] = useState<SynapsePair | null>(null);
  const [letterChoices, setLetterChoices] = useState<string[]>([]);
  const [redFlash, setRedFlash] = useState(false);
  const [greenFlash, setGreenFlash] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showQuit, setShowQuit] = useState(false);

  // ── Game Loop Refs (no re-renders) ──
  const macroRef = useRef(MACRO_TIME);
  const microRef = useRef(MICRO_TIME);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const gameOverRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickCounterRef = useRef(0); // counts 100ms ticks; macro ticks on every 10th

  // ── Load first pair ──
  useEffect(() => {
    const pair = getRandomPair();
    setCurrentPair(pair);
    setLetterChoices(getUniqueLetters(pair.wordA, pair.wordB));
  }, []);

  // ── Advance to next pair ──
  const nextPair = useCallback(() => {
    const pair = getRandomPair();
    setCurrentPair(pair);
    setLetterChoices(getUniqueLetters(pair.wordA, pair.wordB));
    microRef.current = MICRO_TIME;
    setDisplayMicro(MICRO_TIME);
  }, []);

  // ── End game ──
  const endGame = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    setGameOver(true);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onEnd(scoreRef.current, maxStreakRef.current);
  }, [onEnd]);

  // ── Handle wrong / timeout ──
  const handleFail = useCallback(() => {
    streakRef.current = 0;
    setDisplayStreak(0);
    setRedFlash(true);
    setTimeout(() => setRedFlash(false), 300);
    if ("vibrate" in navigator) navigator.vibrate([80, 40, 80]);
    nextPair();
  }, [nextPair]);

  // ── The single game loop ──
  useEffect(() => {
    if (!currentPair || gameOverRef.current) return;

    intervalRef.current = setInterval(() => {
      if (gameOverRef.current) return;

      tickCounterRef.current += 1;

      // ── Micro-timer: ticks every 100ms ──
      microRef.current = Math.max(0, microRef.current - TICK_MS / 1000);
      setDisplayMicro(Math.round(microRef.current * 10) / 10);

      if (microRef.current <= 0) {
        // Auto-fail
        handleFail();
        return;
      }

      // ── Macro-timer: ticks every 1s (every 10th tick) ──
      if (tickCounterRef.current % 10 === 0) {
        macroRef.current = Math.max(0, macroRef.current - 1);
        setDisplayMacro(macroRef.current);

        if (macroRef.current <= 0) {
          endGame();
          return;
        }
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentPair, handleFail, endGame]);

  // ── Handle letter tap ──
  const handleTap = useCallback((letter: string) => {
    if (gameOverRef.current || !currentPair) return;

    if (letter === currentPair.sharedLetter) {
      // ✅ Correct
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      setDisplayStreak(newStreak);

      if (newStreak > maxStreakRef.current) {
        maxStreakRef.current = newStreak;
        setDisplayMaxStreak(newStreak);
      }

      // Score: base 10 × streak multiplier (1 + floor(streak/5))
      const multiplier = 1 + Math.floor(newStreak / 5);
      const points = 10 * multiplier;
      scoreRef.current += points;
      setDisplayScore(scoreRef.current);

      // Streak bonus: +5s every 10 correct
      if (newStreak > 0 && newStreak % STREAK_BONUS_INTERVAL === 0) {
        macroRef.current += TIME_EXTENSION;
        setDisplayMacro(macroRef.current);
        setShowBoost(true);
        setTimeout(() => setShowBoost(false), 1500);
        if ("vibrate" in navigator) navigator.vibrate([50, 30, 50, 30, 100]);
      }

      setGreenFlash(true);
      setTimeout(() => setGreenFlash(false), 150);
      nextPair();
    } else {
      // ❌ Wrong
      handleFail();
    }
  }, [currentPair, nextPair, handleFail]);

  // ── Quit handler ──
  const handleQuit = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    gameOverRef.current = true;
    onCancel();
  }, [onCancel]);

  // ── Format time ──
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Render Guard ──
  if (!currentPair || !currentPair.wordA || !currentPair.wordB || !currentPair.sharedLetter) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-cyan-400 font-black text-xl animate-pulse tracking-widest">
          Loading Neural Map...
        </div>
      </div>
    );
  }

  // ── Game Over Screen ──
  if (gameOver) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-blue-950 to-slate-950 flex flex-col items-center justify-center font-sans p-4">
        <div className="bg-slate-900/90 border-2 border-cyan-500 rounded-2xl p-8 max-w-sm w-full flex flex-col items-center gap-6 shadow-[0_0_40px_rgba(6,182,212,0.3)] animate-[slideUp_0.3s_ease-out]">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400 tracking-tighter uppercase">
            STASIS COMPLETE
          </h2>
          
          <div className="flex gap-8">
            <div className="flex flex-col items-center">
              <span className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">Score</span>
              <span className="text-4xl font-black text-white font-mono">{displayScore}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-cyan-400 text-[10px] font-bold uppercase tracking-widest">Max Streak</span>
              <span className="text-4xl font-black text-cyan-300 font-mono">{displayMaxStreak}</span>
            </div>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <button
              onPointerDown={onCancel}
              className="flex-1 bg-slate-700 border-b-4 border-slate-800 text-slate-300 font-black py-3 rounded-xl text-sm tracking-widest active:border-0 active:translate-y-1 transition-all touch-manipulation"
            >
              MENU
            </button>
            <button
              onPointerDown={() => {
                // Reset and replay
                gameOverRef.current = false;
                setGameOver(false);
                macroRef.current = MACRO_TIME;
                microRef.current = MICRO_TIME;
                scoreRef.current = 0;
                streakRef.current = 0;
                maxStreakRef.current = 0;
                tickCounterRef.current = 0;
                setDisplayMacro(MACRO_TIME);
                setDisplayMicro(MICRO_TIME);
                setDisplayScore(0);
                setDisplayStreak(0);
                setDisplayMaxStreak(0);
                nextPair();
              }}
              className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 border-b-4 border-blue-800 text-white font-black py-3 rounded-xl text-sm tracking-widest active:border-0 active:translate-y-1 transition-all touch-manipulation"
            >
              RETRY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Micro-timer bar color ──
  const microPct = (displayMicro / MICRO_TIME) * 100;
  const microColor = microPct > 60 ? "bg-cyan-400" : microPct > 30 ? "bg-yellow-400" : "bg-red-500";

  // ── Active Game UI ──
  return (
    <div className={`fixed inset-0 bg-gradient-to-b from-slate-950 via-blue-950 to-slate-950 flex flex-col items-center select-none font-sans overflow-hidden transition-colors duration-150 ${redFlash ? "!bg-red-900/80" : ""} ${greenFlash ? "!bg-emerald-900/30" : ""}`}>
      
      {/* Neural Boost Overlay */}
      {showBoost && (
        <div className="absolute inset-0 z-[200] pointer-events-none flex items-center justify-center animate-[fadeIn_0.1s]">
          <span className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-500 drop-shadow-[0_0_30px_rgba(6,182,212,0.8)] animate-bounce">
            +{TIME_EXTENSION}s NEURAL BOOST!
          </span>
        </div>
      )}

      {/* Quit Confirmation */}
      {showQuit && (
        <div className="absolute inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-700 p-6 rounded-xl flex flex-col items-center text-center max-w-sm shadow-xl">
            <h2 className="text-xl font-bold text-cyan-400 mb-4 tracking-widest">DISCONNECT?</h2>
            <p className="text-slate-400 mb-6 text-sm">Your current score will be lost.</p>
            <div className="flex gap-4 w-full">
              <button
                onPointerDown={(e) => { e.stopPropagation(); setShowQuit(false); }}
                className="flex-1 bg-slate-700 text-white font-bold py-3 rounded active:translate-y-1 transition-all touch-manipulation"
              >
                CANCEL
              </button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); handleQuit(); }}
                className="flex-1 bg-red-600 text-white font-bold py-3 rounded active:translate-y-1 transition-all touch-manipulation"
              >
                QUIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="w-full max-w-md px-4 pt-10 pb-2 flex justify-between items-end relative">
        <button
          onPointerDown={() => setShowQuit(true)}
          className="absolute top-3 left-4 text-cyan-500 text-[10px] font-bold tracking-widest bg-slate-800 px-2 py-1 rounded border border-cyan-700 active:bg-slate-700 touch-manipulation"
        >
          ✖ DISCONNECT
        </button>

        {/* Score */}
        <div className="flex flex-col items-center">
          <span className="text-cyan-500 text-[9px] font-bold uppercase tracking-widest">Score</span>
          <span className="text-2xl font-black text-white font-mono">{displayScore}</span>
        </div>

        {/* Macro Timer */}
        <div className="flex flex-col items-center">
          <span className="text-cyan-500 text-[9px] font-bold uppercase tracking-widest">Time</span>
          <span
            className="text-3xl font-black font-mono"
            style={{
              color: `hsl(${Math.max(0, (displayMacro / MACRO_TIME) * 180)}, 90%, 55%)`,
            }}
          >
            {formatTime(displayMacro)}
          </span>
        </div>

        {/* Streak */}
        <div className="flex flex-col items-center">
          <span className="text-cyan-500 text-[9px] font-bold uppercase tracking-widest">Streak</span>
          <span className="text-2xl font-black text-cyan-300 font-mono">{displayStreak}</span>
        </div>
      </div>

      {/* Micro-timer bar */}
      <div className="w-full max-w-md px-6 mt-2">
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div
            className={`h-full ${microColor} transition-all duration-100 rounded-full`}
            style={{ width: `${microPct}%` }}
          />
        </div>
      </div>

      {/* Word Cards */}
      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-full bg-slate-900/80 border-2 border-cyan-600 rounded-2xl p-6 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          <span className="text-5xl font-black text-white tracking-wider">{currentPair.wordA}</span>
        </div>

        <div className="text-cyan-600 font-black italic text-sm tracking-[0.3em] uppercase">
          find the link
        </div>

        <div className="w-full bg-slate-900/80 border-2 border-cyan-600 rounded-2xl p-6 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          <span className="text-5xl font-black text-white tracking-wider">{currentPair.wordB}</span>
        </div>
      </div>

      {/* Letter Buttons */}
      <div className="w-full max-w-md px-4 pb-10 pt-4">
        <div className="flex flex-wrap justify-center gap-2">
          {letterChoices.map((letter, i) => (
            <button
              key={`${letter}-${i}`}
              onPointerDown={() => handleTap(letter)}
              className="w-14 h-14 bg-slate-800 border-2 border-cyan-600 text-cyan-200 text-2xl font-black rounded-xl shadow-lg active:scale-90 active:bg-cyan-700 transition-all touch-manipulation select-none"
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

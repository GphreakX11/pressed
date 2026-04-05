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

const MACRO_TIME = 45;
const MICRO_START = 5.0;
const MICRO_MIN = 2.0;
const TICK_MS = 100;
const STREAK_BONUS_INTERVAL = 10;
const TIME_EXTENSION = 5;

function getMicroLimit(streak: number): number {
  // First 5 correct: stay at 5s. After that, reduce by 0.5s per correct answer, floor 2s.
  if (streak < 5) return MICRO_START;
  const reduction = (streak - 5) * 0.5;
  return Math.max(MICRO_MIN, MICRO_START - reduction);
}

// ── Shuffled Deck System (no repeats within a session) ──
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createShuffledDeck(): { deck: SynapsePair[]; index: number } {
  return { deck: shuffleArray(synapsePairs as SynapsePair[]), index: 0 };
}

export default function SynapseGame({ onEnd, onCancel, playerName, playerId }: SynapseGameProps) {
  // ── Display State ──
  const [displayMacro, setDisplayMacro] = useState(MACRO_TIME);
  const [displayMicro, setDisplayMicro] = useState(MICRO_START);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayStreak, setDisplayStreak] = useState(0);
  const [displayMaxStreak, setDisplayMaxStreak] = useState(0);
  const [currentPair, setCurrentPair] = useState<SynapsePair | null>(null);
  const [redFlash, setRedFlash] = useState(false);
  const [greenFlash, setGreenFlash] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const [tappedLetter, setTappedLetter] = useState<string | null>(null);

  // ── Shuffled deck ref (draw sequentially, no repeats) ──
  const deckRef = useRef(createShuffledDeck());

  function drawNextPair(): SynapsePair {
    const d = deckRef.current;
    if (d.index >= d.deck.length) {
      // Reshuffle if we've gone through all pairs
      deckRef.current = createShuffledDeck();
    }
    const pair = deckRef.current.deck[deckRef.current.index];
    deckRef.current.index++;
    return pair;
  }

  // ── Game Loop Refs ──
  const macroRef = useRef(MACRO_TIME);
  const microRef = useRef(MICRO_START);
  const microLimitRef = useRef(MICRO_START);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const maxStreakRef = useRef(0);
  const gameOverRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickCounterRef = useRef(0);

  // ── Load first pair ──
  useEffect(() => {
    const pair = drawNextPair();
    setCurrentPair(pair);
  }, []);

  // ── Advance to next pair ──
  const nextPair = useCallback(() => {
    const pair = drawNextPair();
    setCurrentPair(pair);
    microRef.current = microLimitRef.current;
    setDisplayMicro(microLimitRef.current);
    setTappedLetter(null);
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
    // Reset speed back to starting pace
    microLimitRef.current = MICRO_START;
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

      microRef.current = Math.max(0, microRef.current - TICK_MS / 1000);
      setDisplayMicro(Math.round(microRef.current * 10) / 10);

      if (microRef.current <= 0) {
        handleFail();
        return;
      }

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

    setTappedLetter(letter);

    if (letter === currentPair.sharedLetter) {
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      setDisplayStreak(newStreak);
      if (newStreak > maxStreakRef.current) {
        maxStreakRef.current = newStreak;
        setDisplayMaxStreak(newStreak);
      }

      // Adaptive speed: ramp up after 5 correct in a row
      microLimitRef.current = getMicroLimit(newStreak);

      const multiplier = 1 + Math.floor(newStreak / 5);
      const points = 10 * multiplier;
      scoreRef.current += points;
      setDisplayScore(scoreRef.current);

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

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Render Guard ──
  if (!currentPair || !currentPair.wordA || !currentPair.wordB || !currentPair.sharedLetter) {
    return (
      <div className="fixed inset-0 bg-pink-50 flex items-center justify-center">
        <div className="text-pink-500 font-black text-xl animate-pulse tracking-widest">
          Loading Neural Map...
        </div>
      </div>
    );
  }

  // ── Game Over Screen ──
  if (gameOver) {
    return (
      <div className="fixed inset-0 bg-pink-50 flex flex-col items-center justify-center font-sans p-4">
        <div className="bg-white border-2 border-pink-300 rounded-2xl p-8 max-w-sm w-full flex flex-col items-center gap-6 shadow-xl animate-[slideUp_0.3s_ease-out]">
          <h2 className="text-3xl font-black text-pink-600 tracking-tighter uppercase">
            STASIS COMPLETE
          </h2>
          
          <div className="flex gap-8">
            <div className="flex flex-col items-center">
              <span className="text-pink-400 text-[10px] font-bold uppercase tracking-widest">Score</span>
              <span className="text-4xl font-black text-pink-900 font-mono">{displayScore}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-pink-400 text-[10px] font-bold uppercase tracking-widest">Max Streak</span>
              <span className="text-4xl font-black text-[#d4af37] font-mono">{displayMaxStreak}</span>
            </div>
          </div>

          <p className="text-pink-400 text-xs font-bold text-center">
            Score posted! View it in the Trophy Case.
          </p>

          <div className="flex gap-2 w-full mt-2">
            <button
              onClick={onCancel}
              className="flex-1 bg-gray-400 border-b-4 border-gray-500 text-white font-black py-3 rounded-xl text-sm tracking-widest active:border-0 active:translate-y-1 transition-all touch-manipulation"
            >
              LOBBY
            </button>
            <button
              onClick={() => {
                gameOverRef.current = false;
                setGameOver(false);
                macroRef.current = MACRO_TIME;
                microRef.current = MICRO_START;
                microLimitRef.current = MICRO_START;
                scoreRef.current = 0;
                streakRef.current = 0;
                maxStreakRef.current = 0;
                tickCounterRef.current = 0;
                setDisplayMacro(MACRO_TIME);
                setDisplayMicro(MICRO_START);
                setDisplayScore(0);
                setDisplayStreak(0);
                setDisplayMaxStreak(0);
                setTappedLetter(null);
                // Reset the shuffled deck for a fresh game
                deckRef.current = createShuffledDeck();
                nextPair();
              }}
              className="flex-1 bg-pink-500 border-b-4 border-pink-700 text-white font-black py-3 rounded-xl text-sm tracking-widest active:border-0 active:translate-y-1 transition-all touch-manipulation"
            >
              RETRY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Micro-timer bar ──
  const microPct = (displayMicro / microLimitRef.current) * 100;
  const microColor = microPct > 60 ? "bg-pink-400" : microPct > 30 ? "bg-yellow-400" : "bg-red-500";

  // ── Renders a word as a row of tappable letters ──
  const renderWord = (word: string) => (
    <div className="flex justify-center gap-[3px]">
      {word.split("").map((ch, i) => (
        <button
          key={`${ch}-${i}`}
          onClick={() => handleTap(ch)}
          className={`w-14 h-16 sm:w-16 sm:h-[72px] border-2 rounded-lg flex items-center justify-center text-3xl sm:text-4xl font-black shadow-sm select-none touch-manipulation transition-all duration-75
            ${tappedLetter === ch && ch === currentPair.sharedLetter
              ? "bg-green-100 border-green-400 text-green-700 scale-105"
              : "bg-white border-pink-300 text-pink-900 active:scale-95 active:bg-pink-100"
            }
          `}
        >
          {ch}
        </button>
      ))}
    </div>
  );

  // ── Active Game UI ──
  return (
    <div className={`fixed inset-0 bg-pink-50 flex flex-col items-center select-none font-sans overflow-hidden transition-colors duration-150 ${redFlash ? "!bg-red-200" : ""} ${greenFlash ? "!bg-emerald-100" : ""}`}>
      

      {/* Quit Confirmation */}
      {showQuit && (
        <div className="absolute inset-0 z-[300] bg-white/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-pink-300 p-6 rounded-xl flex flex-col items-center text-center max-w-sm shadow-xl">
            <h2 className="text-xl font-bold text-pink-600 mb-4 tracking-widest">DISCONNECT?</h2>
            <p className="text-pink-800 mb-6 text-sm">Your current score will be lost.</p>
            <div className="flex gap-4 w-full">
              <button
                onClick={(e) => { e.stopPropagation(); setShowQuit(false); }}
                className="flex-1 bg-gray-400 border-b-4 border-gray-500 text-white font-bold py-3 rounded active:border-0 active:translate-y-1 transition-all touch-manipulation"
              >
                CANCEL
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleQuit(); }}
                className="flex-1 bg-red-500 border-b-4 border-red-700 text-white font-bold py-3 rounded active:border-0 active:translate-y-1 transition-all touch-manipulation"
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
          onClick={() => setShowQuit(true)}
          className="absolute top-3 left-4 text-pink-500 text-[10px] font-bold tracking-widest bg-pink-100 px-2 py-1 rounded border border-pink-200 active:bg-pink-200 touch-manipulation"
        >
          <span className="text-red-400 font-extrabold">✖</span> ABANDON
        </button>

        <div className="flex flex-col items-center">
          <span className="text-pink-400 text-[9px] font-bold uppercase tracking-widest">Score</span>
          <div className="bg-white border border-pink-200 shadow-sm rounded px-2 py-1 min-w-[50px] text-center">
            <span className="text-[#d4af37] font-mono font-bold text-xl">{displayScore}</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-pink-400 text-[9px] font-bold uppercase tracking-widest">Time</span>
          <div className="bg-white border border-pink-200 shadow-sm rounded-md px-3 py-1">
            <span
              className="text-3xl font-black font-mono"
              style={{
                color: `hsl(${Math.max(0, (displayMacro / MACRO_TIME) * 120)}, 90%, 45%)`,
              }}
            >
              {formatTime(displayMacro)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-pink-400 text-[9px] font-bold uppercase tracking-widest">Streak</span>
          <div className="bg-white border border-pink-200 shadow-sm rounded px-2 py-1 min-w-[50px] text-center">
            <span className="text-pink-600 font-mono font-bold text-xl">{displayStreak}</span>
          </div>
        </div>
      </div>

      {/* Micro-timer bar */}
      <div className="w-full max-w-md px-6 mt-2 relative">
        <div className="w-full h-2 bg-pink-100 rounded-full overflow-hidden border border-pink-200">
          <div
            className={`h-full ${microColor} transition-all duration-100 rounded-full`}
            style={{ width: `${microPct}%` }}
          />
        </div>

        {/* Neural Boost Banner — floats below the timer bar, above word cards */}
        {showBoost && (
          <div className="absolute left-0 right-0 top-full mt-2 z-[200] pointer-events-none flex justify-center animate-[fadeIn_0.1s]">
            <span className="text-2xl sm:text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-pink-400 to-pink-700 drop-shadow-[0_0_20px_rgba(236,72,153,0.6)] animate-bounce">
              +{TIME_EXTENSION}s NEURAL BOOST!
            </span>
          </div>
        )}
      </div>

      {/* Word Cards */}
      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center gap-5 px-4">
        <div className="w-full bg-white border-2 border-pink-200 rounded-2xl p-5 flex flex-col items-center shadow-sm">
          {renderWord(currentPair.wordA)}
        </div>

        <div className="text-pink-400 font-black italic text-sm tracking-[0.3em] uppercase">
          tap the shared letter
        </div>

        <div className="w-full bg-white border-2 border-pink-200 rounded-2xl p-5 flex flex-col items-center shadow-sm">
          {renderWord(currentPair.wordB)}
        </div>
      </div>

      <div className="w-full max-w-md px-4 pb-8 pt-2 flex justify-center">
        <span className="text-pink-300 text-[10px] font-bold uppercase tracking-[0.3em]">
          ⚡ Apex Synapse
        </span>
      </div>
    </div>
  );
}

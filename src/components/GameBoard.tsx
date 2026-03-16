"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Puzzle, getRandomPuzzle, getDailyPuzzle } from "@/lib/puzzles";
import { PlayerStats, loadStats, recordGameResult } from "@/lib/stats";
import Sparkles from './Sparkles';

// Retro font via Next/Google fonts is possible but for simplicity and guaranteeing zero-config, we'll use system fonts that look digital
// We'll rely on Tailwind utility classes and some custom inline styles if needed for the digital LED look.

export default function GameBoard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [timeLeft, setTimeLeft] = useState(150);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundBonusWords, setFoundBonusWords] = useState<string[]>([]);
  
  const [difficulty, setDifficulty] = useState<'easy'|'normal'|'hard'>('normal');
  const [isDailyMode, setIsDailyMode] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  const lastWordTime = useRef<number>(0);
  const [comboCount, setComboCount] = useState(0);
  const [timeBonus, setTimeBonus] = useState(0);

  const foundWordsRef = useRef<string[]>([]);
  useEffect(() => { foundWordsRef.current = foundWords; }, [foundWords]);

  const [inputState, setInputState] = useState<{
    currentInput: { char: string; sourceIndex: number }[];
    availableSlots: (string | null)[];
  }>({ currentInput: [], availableSlots: [] });

  const [gameOver, setGameOver] = useState(false);
  const gameOverRef = useRef(false);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const [shakeInput, setShakeInput] = useState(false);
  const [successAnim, setSuccessAnim] = useState<{ active: boolean; word: string[]; type: 'base' | 'bonus' }>({ active: false, word: [], type: 'base' });
  const [bonusToast, setBonusToast] = useState<{ id: number; points: number } | null>(null);
  const [juiceToast, setJuiceToast] = useState<{ id: number; points: number, isCombo: boolean } | null>(null);
  const [jackpotBlast, setJackpotBlast] = useState<{ id: number, active: boolean, count: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const baseDingRef = useRef<HTMLAudioElement | null>(null);
  const bonusChimeRef = useRef<HTMLAudioElement | null>(null);
  const streakJackpotRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Load mute preference
    const savedMute = localStorage.getItem('apexMutePreference');
    const initialMute = savedMute === 'true';
    if (savedMute) setIsMuted(initialMute);

    bgmRef.current = new Audio('/music.mp3');
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.2;

    baseDingRef.current = new Audio('/base_ding.mp3');
    baseDingRef.current.volume = 0.6;

    bonusChimeRef.current = new Audio('/bonus_chime.mp3');
    bonusChimeRef.current.volume = 0.6;

    streakJackpotRef.current = new Audio('/streak_jackpot.mp3');
    streakJackpotRef.current.volume = 0.6;
  }, []);

  const initializeAudio = useCallback(() => {
    if (isAudioEnabled) return;
    setIsAudioEnabled(true);
    
    // Unlock all audio elements for iOS Safari by playing and immediately pausing
    [baseDingRef.current, bonusChimeRef.current, streakJackpotRef.current].forEach(el => {
      if (el) {
        el.play().then(() => {
          el.pause();
          el.currentTime = 0;
        }).catch(() => {});
      }
    });

    if (bgmRef.current && !isMuted) {
      bgmRef.current.play().catch(error => console.log('BGM Play Error:', error));
    }
  }, [isAudioEnabled, isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('apexMutePreference', next.toString());
      if (bgmRef.current) {
        if (next) bgmRef.current.pause();
        else if (isAudioEnabled) bgmRef.current.play().catch(e => console.log('BGM Play Error:', e));
      }
      return next;
    });
  }, [isAudioEnabled]);

  const playSound = useCallback((type: 'pop' | 'coin' | 'jackpot', count: number = 0) => {
    if (!isAudioEnabled || isMuted) return;
    
    try {
      let soundToPlay: HTMLAudioElement | null = null;
      if (type === 'pop') soundToPlay = baseDingRef.current;
      else if (type === 'coin') soundToPlay = bonusChimeRef.current;
      else if (type === 'jackpot') soundToPlay = streakJackpotRef.current;

      if (soundToPlay) {
        // Reset playback for rapid-fire
        soundToPlay.currentTime = 0;
        soundToPlay.play().catch(e => console.log(`Audio ${type} failed:`, e));
      }
    } catch (err) {
      console.warn(`Audio ${type} failed to play:`, err);
    }
  }, [isAudioEnabled, isMuted]);

  // Speed Combo Indicator Hook strictly controls 5-second active window
  useEffect(() => {
    if (comboCount === 0 || gameOver) return;
    
    // Safety check in case the effect runs slightly late
    const now = Date.now();
    const timeElapsed = now - lastWordTime.current;
    const remainingTime = 5000 - timeElapsed;
    
    if (remainingTime <= 0) {
      setComboCount(0);
      return;
    }
    
    const timer = setTimeout(() => {
      setComboCount(0);
    }, remainingTime);
    
    return () => clearTimeout(timer);
  }, [comboCount, gameOver]);

  // Rolling display score animation
  useEffect(() => {
    if (displayScore !== score) {
      const step = Math.max(1, Math.ceil((score - displayScore) / 10));
      const timer = setTimeout(() => {
        setDisplayScore(prev => Math.min(score, prev + step));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [score, displayScore]);

  // Fast visual tick down of remaining time upon win
  useEffect(() => {
    if (gameOver && timeBonus > 0 && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [gameOver, timeBonus, timeLeft]);

  // Group words into vertical columns by length
  const groupedWords = useMemo(() => {
    if (!puzzle) return {} as Record<number, string[]>;
    
    const groups: Record<number, string[]> = {};
    for (const word of puzzle.validWords) {
      const len = word.length;
      if (!groups[len]) groups[len] = [];
      groups[len].push(word);
    }
    
    // Sort each column alphabetically natively
    for (const len in groups) {
      groups[len].sort((a, b) => a.localeCompare(b));
    }
    
    return groups;
  }, [puzzle]);

  const handleQuitGame = useCallback(() => {
    recordGameResult(false, score);
    setStats(loadStats());
    setGameOver(true);
    setShowWelcome(true);
    setShowQuitConfirm(false);
  }, [score]);

  const endGame = useCallback((won: boolean, additionalScore: number = 0) => {
    if (gameOverRef.current) return;
    setGameOver(true);
    setScore(s => {
      const finalScore = s + additionalScore;
      setHighScore(h => {
        if (finalScore > h) {
          localStorage.setItem('pressedHighScore', finalScore.toString());
          return finalScore;
        }
        return h;
      });
      recordGameResult(won, finalScore);
      setStats(loadStats());
      return finalScore;
    });
  }, []);

  const totalTimeLimit = useMemo(() => {
    return difficulty === 'easy' ? 210 : difficulty === 'hard' ? 90 : 150;
  }, [difficulty]);

  const startNewGame = useCallback((diff?: 'easy'|'normal'|'hard', isDaily?: boolean) => {
    const activeDiff = diff || difficulty;
    setDifficulty(activeDiff);
    setIsDailyMode(!!isDaily);
    
    // Time based on difficulty
    const timeLimit = activeDiff === 'easy' ? 210 : activeDiff === 'hard' ? 90 : 150;

    const newPuzzle = isDaily ? getDailyPuzzle(new Date().toISOString().split('T')[0]) : getRandomPuzzle();
    setPuzzle(newPuzzle);
    setTimeLeft(timeLimit);
    setEndTime(Date.now() + timeLimit * 1000);
    setScore(0);
    setDisplayScore(0);
    setTimeBonus(0);
    setComboCount(0);
    lastWordTime.current = 0;
    setFoundWords([]);
    setFoundBonusWords([]);
    setInputState({
      currentInput: [],
      availableSlots: [...newPuzzle.sourceLetters]
    });
    setGameOver(false);
    setShowWelcome(false);
    setShakeInput(false);
    setSuccessAnim({ active: false, word: [], type: 'base' });
    setBonusToast(null);
    setJuiceToast(null);
    setToastMessage(null);
    
    // The Cut-off: Stop lobby music when game starts
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    
    // Safety fallback: if they bypassed the gate somehow, init audio on first game start
    if (!isAudioEnabled) initializeAudio();
  }, [difficulty, isAudioEnabled, initializeAudio]);

  useEffect(() => {
    const saved = localStorage.getItem('pressedHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
    setStats(loadStats());
    // Welcome screen shows on mount, so we don't automatically trigger startNewGame
  }, []);

  useEffect(() => {
    if (!puzzle || gameOver || !endTime || showWelcome) return;

    const checkTime = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        const isWin = foundWordsRef.current.length === puzzle.validWords.length;
        endGame(isWin);
      }
    };

    checkTime(); // Execute immediately once per render cycle

    const timer = setInterval(checkTime, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTime();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endTime, gameOver, puzzle, showWelcome, endGame]);

  const formatTime = (seconds: number) => {
    if (seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleLetterClick = (char: string, index: number, e?: React.PointerEvent) => {
    if (e) {
      e.preventDefault();
      // stop propagation if needed to prevent ghost clicks
    }
    if (gameOver) return;
    
    // If user types while success animation is happening, abort success display instantly
    if (successAnim.active) {
       setSuccessAnim({ active: false, word: [], type: 'base' });
    }

    setInputState(prev => {
      const newSlots = [...prev.availableSlots];
      newSlots[index] = null;
      return {
        currentInput: [...prev.currentInput, { char, sourceIndex: index }],
        availableSlots: newSlots
      };
    });
  };

  const handleUndo = (e?: React.PointerEvent) => {
    if (e) e.preventDefault();
    if (gameOver) return;
    if (successAnim.active) setSuccessAnim({ active: false, word: [], type: 'base' });

    setInputState(prev => {
      if (prev.currentInput.length === 0) return prev;
      const newInput = [...prev.currentInput];
      const letterObj = newInput.pop()!;
      const newSlots = [...prev.availableSlots];
      newSlots[letterObj.sourceIndex] = letterObj.char;
      return {
        currentInput: newInput,
        availableSlots: newSlots
      };
    });
  };

  const handleMix = (e?: React.PointerEvent) => {
    if (e) e.preventDefault();
    if (gameOver) return;
    if (successAnim.active) setSuccessAnim({ active: false, word: [], type: 'base' });

    setInputState(prev => {
      const remaining = prev.availableSlots.filter(c => c !== null) as string[];
      if (remaining.length < 2) return prev;
      
      remaining.sort(() => Math.random() - 0.5);
      
      const newSlots = [...prev.availableSlots];
      let rIndex = 0;
      for (let i = 0; i < newSlots.length; i++) {
          if (newSlots[i] !== null) {
             newSlots[i] = remaining[rIndex++];
          }
      }
      return {
        currentInput: prev.currentInput,
        availableSlots: newSlots
      };
    });
  };

  const handleEnter = (e?: React.PointerEvent) => {
    if (e) e.preventDefault();
    if (gameOver || !puzzle) return;
    
    setInputState(prev => {
      if (prev.currentInput.length === 0) return prev;
      const wordChars = prev.currentInput.map(o => o.char);
      const word = wordChars.join("");
      
      const isAlreadyMain = foundWords.includes(word);
      const isAlreadyBonus = foundBonusWords.includes(word);
      
      if (isAlreadyMain || isAlreadyBonus) {
        // Already found
        setToastMessage("Already Found!");
        setTimeout(() => setToastMessage(null), 1500);
        
        setTimeout(() => {
          setInputState(curr => {
            const returnedSlots = [...curr.availableSlots];
            curr.currentInput.forEach(o => {
              returnedSlots[o.sourceIndex] = o.char;
            });
            return { currentInput: [], availableSlots: returnedSlots };
          });
        }, 150);
        return prev;
      }
      
      const isMainWord = puzzle.validWords.includes(word);
      const isBonusWord = puzzle.bonusWords?.includes(word);
      
      if (isMainWord || isBonusWord) {
        console.log('--- SUBMIT CLICKED ---');
        const now = Date.now();
        console.log('Current Time:', now, 'Last Word:', lastWordTime.current);

        let comboEarned = false;
        if (lastWordTime.current > 0) {
          const timeDiff = now - lastWordTime.current;
          console.log('Time Difference:', timeDiff);
          if (timeDiff <= 5000) {
            console.log('✅ STREAK ACHIEVED! Triggering UI and 1.5x Math');
            comboEarned = true;
          }
        }
        
        // Update: Set lastWordTime.current = now; ONLY after the check is complete.
        lastWordTime.current = now;
        const newCount = comboEarned ? comboCount + 1 : 0;
        setComboCount(newCount);

        const difficultyMultiplier = difficulty === 'hard' ? 1.5 : 1;
        const currentMultiplier = comboEarned ? 1.5 : 1;
        const pts = Math.floor(word.length * 10 * difficultyMultiplier * currentMultiplier);

        if (isMainWord) {
          setFoundWords(fw => {
            if (fw.includes(word)) return fw; // Strict mode prevention
            const next = [...fw, word];
            if (next.length === puzzle.validWords.length) {
              setGameOver(true);
              const remTime = Math.max(0, Math.floor((endTime! - Date.now()) / 1000));
              const tBonus = remTime * 10;
              setTimeBonus(tBonus);
              setTimeout(() => endGame(true, tBonus), 600);
            }
            return next;
          });
        } else {
          setFoundBonusWords(fw => fw.includes(word) ? fw : [...fw, word]); // Strict mode prevention
        }
        
        setScore(s => s + pts);
        
        const newSlots = [...prev.availableSlots];
        prev.currentInput.forEach(o => {
          newSlots[o.sourceIndex] = o.char;
        });
        
        const isBonus = !isMainWord && isBonusWord;
        
        // Trigger non-blocking visual success animation
        setSuccessAnim({ active: true, word: wordChars, type: isBonus ? 'bonus' : 'base' });
        
        setJuiceToast({ id: Date.now(), points: pts, isCombo: comboEarned });

        if (comboEarned) {
          const blastId = Date.now();
          setJackpotBlast({ id: blastId, active: true, count: newCount });
          setTimeout(() => setJackpotBlast(curr => curr?.id === blastId ? null : curr), 800);
          playSound('jackpot', newCount);
        } else if (isBonus) {
          setBonusToast({ id: Date.now(), points: pts });
          playSound('coin');
        } else {
          playSound('pop');
        }
        
        setTimeout(() => {
          setSuccessAnim(curr => {
            // Only erase if another word wasn't typed immediately over top of it
            if (curr.word.join("") === word) return { active: false, word: [], type: 'base' };
            return curr;
          });
        }, 300);

        return {
          currentInput: [],
          availableSlots: newSlots
        };
      } else {
        // Invalid word
        setShakeInput(true);
        setTimeout(() => setShakeInput(false), 300);
        
        setTimeout(() => {
          setInputState(curr => {
            const returnedSlots = [...curr.availableSlots];
            curr.currentInput.forEach(o => {
              returnedSlots[o.sourceIndex] = o.char;
            });
            return { currentInput: [], availableSlots: returnedSlots };
          });
        }, 300);

        return prev;
      }
    });
  };

  const getTitle = (pts: number) => {
    if (pts >= 100000) return { title: "Lexicon Master", next: null, current: 100000 };
    if (pts >= 25000) return { title: "Wordsmith", next: 100000, current: 25000 };
    if (pts >= 5000) return { title: "Scribe", next: 25000, current: 5000 };
    return { title: "Novice", next: 5000, current: 0 };
  };

  const generateShareGrid = () => {
    if (!puzzle) return;
    let gridStr = `Apex Anagrams - Daily - Score: ${score}\n\n`;
    Object.entries(groupedWords).forEach(([len, words]) => {
      let row = "";
      words.forEach(w => {
        row += foundWords.includes(w) ? "🟩" : "⬜";
      });
      gridStr += row + "\n";
    });
    if (foundBonusWords.length > 0) {
      gridStr += "🟨".repeat(foundBonusWords.length) + "\n";
    }
    navigator.clipboard.writeText(gridStr.trim());
    setToastMessage("Copied to clipboard!");
    setTimeout(() => setToastMessage(null), 1500);
  };

  if (showWelcome && stats) {
    const winPct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    const avgScore = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
    const pts = stats.lifetimePoints || 0;
    const rankInfo = getTitle(pts);
    const progressPct = rankInfo.next ? Math.min(100, Math.max(0, Math.round(((pts - rankInfo.current) / (rankInfo.next - rankInfo.current)) * 100))) : 100;

    return (
      <div className="fixed inset-0 bg-pink-50 flex flex-col items-center justify-center font-sans p-4">
        
        {!isAudioEnabled ? (
          <div className="bg-white p-8 rounded-2xl border border-pink-200 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl z-10 text-center animate-[slideUp_0.3s_ease-out]">
            <div className="flex flex-col items-center mb-0">
              <img src="/apex-branding-full.png" alt="Apex Anagrams" className="w-[100%] max-w-[280px] drop-shadow-lg mb-2" />
            </div>
            
            <div className="flex flex-col gap-2 my-2">
              {stats.gamesPlayed === 0 ? (
                <p className="text-pink-900 font-bold">Welcome to the Speed Dictionary.<br/>Ready to test your limits?</p>
              ) : (
                <>
                  <p className="text-pink-900 font-bold mb-1">Welcome Back!</p>
                  <span className="text-xl font-black text-[#d4af37] uppercase tracking-widest">{rankInfo.title}</span>
                  <span className="text-pink-600 font-bold">Current Streak: {stats.currentStreak} 🔥</span>
                </>
              )}
            </div>

            <button 
              onPointerDown={() => initializeAudio()} 
              className="w-full bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-4 rounded shadow-md active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-xl tracking-widest select-none touch-manipulation"
            >
              ENTER LOBBY
            </button>
            <p className="text-[10px] text-pink-400 font-bold uppercase tracking-widest mt-1">Enables Audio & Gameplay</p>
          </div>
        ) : (
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-pink-200 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl z-10 animate-[slideUp_0.2s_ease-out]">
            <div className="flex flex-col items-center mb-0">
              <img src="/apex-branding-full.png" alt="Apex Anagrams" className="w-[90%] max-w-[240px] drop-shadow-md mb-2" />
            </div>
            
            <div className="w-full flex flex-col items-center border border-pink-200 bg-pink-50 rounded-lg p-3 shadow-inner mb-2">
             <span className="text-[10px] text-pink-600 font-bold uppercase tracking-widest mb-1">Rank</span>
             <span className="text-xl font-black text-pink-900 drop-shadow-sm uppercase">{rankInfo.title}</span>
             {rankInfo.next ? (
               <div className="w-full mt-2">
                 <div className="flex justify-between text-[10px] text-pink-700 font-bold mb-1">
                   <span>{pts.toLocaleString()} XP</span>
                   <span>{rankInfo.next.toLocaleString()} XP</span>
                 </div>
                 <div className="w-full bg-pink-200 rounded-full h-2.5">
                   <div className="bg-[#d4af37] h-2.5 rounded-full shadow-sm" style={{ width: `${progressPct}%` }}></div>
                 </div>
               </div>
             ) : (
                <div className="text-xs text-[#d4af37] font-bold mt-1">MAX RANK MAX XP</div>
              )}
            </div>
            
            <div className="w-full bg-pink-50 rounded-xl p-4 flex gap-[2px] justify-between border border-pink-100 shadow-inner">
            <div className="flex flex-col items-center flex-1">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Streak</span>
              <span className="text-pink-900 text-3xl font-mono relative">{stats.currentStreak} <span className="absolute -right-5 top-0 text-orange-400 text-sm animate-pulse">🔥</span></span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Win %</span>
              <span className="text-pink-900 text-3xl font-mono">{winPct}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Avg Score</span>
              <span className="text-pink-900 text-3xl font-mono">{avgScore}</span>
            </div>
          </div>
            <div className="flex flex-col gap-3 w-full mt-2">
              <button onPointerDown={() => startNewGame('normal', true)} className="bg-purple-500 border-b-4 border-r-2 border-purple-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">DAILY CHALLENGE <span className="text-purple-100 block text-xs tracking-normal mt-1 opacity-80">(Everyone plays the same board)</span></button>
              <button onPointerDown={() => startNewGame('easy')} className="bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY EASY <span className="text-yellow-800 block text-xs tracking-normal mt-1 opacity-80">(3m 30s + Hint)</span></button>
              <button onPointerDown={() => startNewGame('normal')} className="bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY NORMAL <span className="text-yellow-800 block text-xs tracking-normal mt-1 opacity-80">(2m 30s)</span></button>
              <button onPointerDown={() => startNewGame('hard')} className="bg-red-500 border-b-4 border-r-2 border-red-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY HARD <span className="text-red-100 block text-xs tracking-normal mt-1 opacity-80">(1m 30s + 1.5x Pts)</span></button>
            </div>
          </div>
        )}

      </div>
    );
  }

  if (!puzzle) return null;

  return (
    <div id="game-container" className="fixed inset-0 bg-pink-50 flex flex-col items-center select-none font-sans overflow-hidden">
      <Sparkles />
      
      {/* Hardened Background Watermark Logo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0 overflow-hidden opacity-[0.05]">
        <img src="/apex-branding-full.png" alt="" className="w-[120%] max-w-2xl drop-shadow-sm mt-16 object-contain" />
      </div>

      {/* Dynamic Jackpot Flash Background */}
      {jackpotBlast?.active && (
         <div className="absolute inset-0 z-[100] pointer-events-none animate-bgFlash" />
      )}

      {/* Massive STREAK BONUS Overlay */}
      {jackpotBlast?.active && (
         <div className="absolute inset-0 z-[150] pointer-events-none animate-blastUp flex flex-col items-center justify-center w-full h-full">
            <span className="text-5xl md:text-7xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] filter drop-shadow-xl" style={{ WebkitTextStroke: '2px #7c2d12' }}>
              STREAK BONUS!
            </span>
            <span className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-md mt-2">
              {jackpotBlast.count}X COMBO
            </span>
         </div>
      )}

      {/* Intense Final 10 Seconds Overlay */}
      {timeLeft <= 10 && !gameOver && !showWelcome && (
        <div 
          className="absolute inset-0 z-30 pointer-events-none animate-pulse"
          style={{
            backgroundColor: `rgba(239, 68, 68, ${((10 - timeLeft) / 10) * 0.4})`,
            transition: 'background-color 1s linear'
          }}
        />
      )}

      {showQuitConfirm && (
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-pink-300 p-6 rounded-xl flex flex-col items-center text-center max-w-sm shadow-[0_10px_40px_rgba(219,39,119,0.15)] animate-[slideUp_0.2s_ease-out]">
            <h2 className="text-2xl font-bold text-pink-600 mb-2 tracking-widest">ABANDON GAME?</h2>
            <p className="text-pink-800 mb-6 text-sm font-medium">Quitting now will count as a loss and reset your current streak. Are you sure?</p>
            <div className="flex gap-4 w-full">
              <button 
                onPointerDown={() => setShowQuitConfirm(false)}
                className="flex-1 bg-gray-400 border-b-4 border-gray-500 text-white font-bold py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] transition-all touch-manipulation text-sm tracking-widest"
              >
                CANCEL
              </button>
              <button 
                onPointerDown={handleQuitGame}
                className="flex-1 bg-red-500 border-b-4 border-red-700 text-white font-bold py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] transition-all touch-manipulation text-sm tracking-widest"
              >
                QUIT
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md h-full flex flex-col">
        {/* Top Bar / Scoreboard */}
        <div className="px-4 pt-8 pb-2 flex justify-between items-end relative">
          
          {/* Escape Hatch Button */}
          <button 
            onPointerDown={() => setShowQuitConfirm(true)}
            className="absolute top-2 left-4 text-pink-500 active:text-pink-700 text-[10px] font-bold tracking-widest bg-pink-100 px-2 py-1 flex items-center gap-1 rounded border border-pink-200 shadow-sm touch-manipulation"
          >
            <span className="text-red-400 font-extrabold">✖</span> ABANDON
          </button>

          {/* Persistent Mute Toggle */}
          <button 
            onPointerDown={toggleMute}
            className="absolute top-2 right-4 text-pink-500 active:text-pink-700 text-lg font-bold bg-pink-100 w-8 h-8 flex items-center justify-center rounded-full border border-pink-200 shadow-sm touch-manipulation"
            aria-label={isMuted ? "Unmute Sound" : "Mute Sound"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
          
          <div className="flex flex-col items-center mt-2 relative">
            <span className="text-pink-900 text-xs font-bold mb-1">Score</span>
            <div className="flex items-center gap-2">
              <div className="bg-white border border-pink-200 shadow-sm rounded px-2 py-1 min-w-[60px] text-right">
                <span className="text-[#d4af37] font-mono font-bold text-xl tracking-widest">{displayScore.toString()}</span>
              </div>
              <div className={`
                flex items-center justify-center w-10 h-10 rounded border-2 shadow-sm transition-all duration-300
                ${comboCount > 0 
                  ? 'bg-orange-100 border-orange-500 text-orange-600 animate-heartbeat' 
                  : 'bg-gray-100 border-gray-300 text-gray-400 opacity-60'}
              `}>
                <span className="font-black text-lg italic">1.5x</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center pb-2">
            <div className="bg-white border border-pink-200 shadow-sm rounded-md px-3 py-1 mt-2">
              <span 
                className="font-mono font-bold text-3xl tracking-widest animate-[pulse_1.5s_ease-in-out_infinite]"
                style={{
                  color: `hsl(${Math.floor(Math.max(0, Math.min(1, timeLeft / totalTimeLimit)) * 120)}, 90%, 45%)`,
                  transition: 'color 1s linear'
                }}
              >
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-pink-900 text-xs font-bold mb-1">High Score</span>
            <div className="bg-white border border-pink-200 shadow-sm rounded px-2 py-1 min-w-[60px] text-right">
              <span className="text-[#d4af37] font-mono font-bold text-xl tracking-widest">{highScore.toString()}</span>
            </div>
          </div>
          
        </div>

        {/* Toast Message */}
        {toastMessage && (
          <div className="absolute top-24 transform -translate-x-1/2 left-1/2 z-40 bg-white/90 text-pink-900 font-bold py-2 px-4 rounded-full border border-pink-300 animate-[slideUp_0.2s_ease-out] shadow-xl pointer-events-none">
            {toastMessage}
          </div>
        )}

        {/* Bonus Words Indicator */}
        {foundBonusWords.length > 0 && (
          <div className="w-full px-4 mb-2">
            <div className="text-[10px] sm:text-xs text-[#d4af37] font-bold bg-white/60 py-2 px-3 rounded border border-pink-200 shadow-sm break-words leading-relaxed">
              <span className="text-pink-600 mr-1 uppercase">Bonus:</span> 
              {foundBonusWords.map(w => w.toUpperCase()).join(", ")}
            </div>
          </div>
        )}

        <div className="flex-1 w-full px-4 py-2 mt-2 overflow-y-auto w-full max-w-sm self-center">
          <div className="flex flex-row justify-around w-full gap-2 sm:gap-4 pb-4">
            {Object.entries(groupedWords).map(([len, words]) => (
              <div key={len} className="flex flex-col gap-y-2 text-center">
                {words.map((word, idx) => {
                  const isFound = foundWords.includes(word);
                  const isMissed = gameOver && !isFound;
                  // Hint logic for easy
                  const isBingoWord = word === puzzle.bingoWord;
                  const isEasyHint = difficulty === 'easy' && isBingoWord && !isFound && !gameOver;

                  return (
                    <div key={idx} className="flex gap-[2px] justify-center">
                      {word.split('').map((char, i) => (
                        <div 
                          key={i} 
                          className={`w-[16px] h-[20px] sm:w-[20px] sm:h-[24px] md:w-[24px] md:h-[28px] border flex items-center justify-center text-[10px] sm:text-[11px] font-bold shadow-sm ${
                            isFound 
                              ? 'bg-white border-pink-300 text-pink-900' 
                              : isMissed
                              ? 'bg-pink-200 border-pink-400 text-pink-700'
                              : isEasyHint && i === 0
                              ? 'bg-yellow-50 border-yellow-300 text-yellow-600'
                              : 'bg-white border-pink-200 text-transparent'
                          }`}
                        >
                          {isFound || isMissed || (isEasyHint && i === 0) ? char.toUpperCase() : ''}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Input Area */}
         <div className="w-full mt-auto pb-8 pt-4 px-4 flex flex-col items-center gap-6 border-t border-pink-200 select-none touch-none bg-pink-50">
          
          {gameOver ? (
             <div className="w-full flex flex-col items-center gap-4 bg-white/90 p-6 rounded-xl border border-pink-300 shadow-2xl animate-[slideUp_0.3s_ease-out] z-40 relative">
                {foundWords.length === puzzle.validWords.length ? (
                  <>
                    <h2 className="text-3xl font-extrabold text-[#d4af37] tracking-widest drop-shadow-[0_2px_4px_rgba(212,175,55,0.4)]">BOARD CLEARED!</h2>
                    <div className="w-full flex flex-col gap-1 text-sm text-pink-800 font-bold bg-pink-50 p-3 rounded border border-pink-200 mt-2">
                      <div className="flex justify-between">
                         <span className="opacity-80">Base + Bonus</span>
                         <span>{score - timeBonus}</span>
                      </div>
                      {timeBonus > 0 && (
                         <div className="flex justify-between text-green-600 animate-[pulse_1s_ease-in-out_3]">
                           <span>Time Bonus</span>
                           <span>+{timeBonus}</span>
                         </div>
                      )}
                      <div className="flex justify-between border-t border-pink-300 pt-1 mt-1 text-lg text-pink-900">
                         <span>Total</span>
                         <span>{displayScore}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl font-bold text-pink-500 tracking-widest drop-shadow-[0_2px_4px_rgba(236,72,153,0.3)]">TIME'S UP</h2>
                    <span className="text-pink-900 text-sm font-bold opacity-80">You missed {puzzle.validWords.length - foundWords.length} words</span>
                  </>
                )}
                
                <div className="flex gap-4 w-full mt-2">
                  <button 
                    onPointerDown={() => setShowWelcome(true)}
                    className="flex-1 bg-gray-400 border-b-4 border-r-2 border-gray-500 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                  >
                    MENU
                  </button>
                  {isDailyMode ? (
                    <button 
                      onPointerDown={generateShareGrid}
                      className="flex-[2] bg-blue-500 border-b-4 border-r-2 border-blue-700 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all flex items-center justify-center gap-2"
                    >
                      SHARE <span className="text-xl">📈</span>
                    </button>
                  ) : (
                    <button 
                      onPointerDown={() => startNewGame()}
                      className="flex-[2] bg-[#d4af37] border-b-4 border-r-2 border-yellow-700 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                    >
                      PLAY AGAIN
                    </button>
                  )}
                </div>
             </div>
          ) : (
            <div className="w-full relative flex flex-col items-center">
              {/* Floating Bonus Toast Overlay */}
              {bonusToast && (
                <div key={`toast-${bonusToast.id}`} className="absolute -top-[30px] z-50 pointer-events-none animate-floatUpFade flex flex-col items-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                  <span className="text-yellow-400 font-extrabold text-2xl tracking-widest italic">+{bonusToast.points} BONUS!</span>
                </div>
              )}
              
              {/* Current Input Slots */}
              <div className="relative w-full z-10">
                {/* Floating Juice Toast */}
                {juiceToast && (
                  <div 
                    key={`juice-${juiceToast.id}`} 
                    className="absolute -top-[40px] left-1/2 transform -translate-x-1/2 z-[150] pointer-events-none animate-floatUpFade"
                  >
                    <span className={`font-black text-2xl md:text-3xl tracking-wider drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] ${
                      juiceToast.isCombo ? 'text-[#ff5500] italic' : 'text-[#22c55e]'
                    }`}>
                      +{juiceToast.points} {juiceToast.isCombo ? 'SPEED BONUS!' : ''}
                    </span>
                  </div>
                )}
                <div className={`flex justify-center gap-[4px] sm:gap-[6px] w-full h-12 sm:h-14 ${shakeInput ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                {Array.from({ length: 6 }).map((_, i) => {
                  // Determine if we should show the success animation char or the real active input char
                  const isSuccessActive = successAnim.active && inputState.currentInput.length === 0;
                  const charToShow = isSuccessActive ? successAnim.word[i] : inputState.currentInput[i]?.char || '';
                  const isActiveCell = isSuccessActive ? !!successAnim.word[i] : !!inputState.currentInput[i];
                  
                  return (
                    <div 
                      key={`input-${i}`} 
                      className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-3xl font-bold rounded-sm select-none touch-none transition-all duration-75 relative ${
                        isActiveCell && !isSuccessActive
                          ? 'bg-pink-100 text-pink-900 border-pink-400 shadow-md' 
                          : isActiveCell && isSuccessActive && successAnim.type === 'base'
                          ? 'bg-green-100 border-green-400 text-green-900 ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-105'
                          : isActiveCell && isSuccessActive && successAnim.type === 'bonus'
                          ? 'bg-yellow-100 border-yellow-400 text-yellow-900 ring-4 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)] scale-105'
                          : 'bg-white border-pink-300 text-transparent'
                      }`}
                    >
                      {charToShow}
                    </div>
                  )
                })}
                </div>
              </div>

              {/* Source Letters */}
              <div className="flex justify-center gap-[4px] sm:gap-[6px] w-full mt-2 h-[52px] sm:h-[60px]">
                {inputState.availableSlots.map((char, i) => {
                  return char ? (
                    <button
                      key={`avail-${i}-${char}`}
                      onPointerDown={(e) => handleLetterClick(char, i, e)}
                      className="w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] bg-white border-b-4 border-r-2 border-pink-300 text-pink-900 flex items-center justify-center text-3xl sm:text-4xl font-extrabold rounded shadow-md active:translate-y-[4px] active:border-b-0 active:border-r-0 active:mt-[4px] touch-manipulation select-none"
                    >
                      {char}
                    </button>
                  ) : (
                    <div key={`empty-${i}`} className="w-[52px] h-[52px] sm:w-[60px] sm:h-[60px]" />
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-2 sm:gap-4 w-full mt-4 h-12">
                <button 
                  onPointerDown={handleMix}
                  className="flex-1 bg-[#d4af37] border-b-4 border-r-2 border-yellow-700 text-white font-extrabold rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  MIX
                </button>
                <button 
                  onPointerDown={handleEnter}
                  className="flex-1 bg-[#d4af37] border-b-4 border-r-2 border-yellow-700 text-white font-extrabold rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  ENTER
                </button>
                <button 
                  onPointerDown={handleUndo}
                  className="flex-1 bg-[#d4af37] border-b-4 border-r-2 border-yellow-700 text-white font-extrabold rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  UNDO
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

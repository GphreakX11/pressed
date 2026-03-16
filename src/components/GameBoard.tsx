"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Puzzle, Difficulty, getRandomPuzzle, getDailyPuzzle } from "@/lib/puzzles";
import { PlayerStats, loadStats, recordGameResult } from "@/lib/stats";
import { getTopScores, submitScore, type LeaderboardEntry } from '@/app/actions';
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
  const [wordsSubmitted, setWordsSubmitted] = useState(0);
  
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [isDailyMode, setIsDailyMode] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Leaderboard State
  const [dailyLeaderboard, setDailyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'daily'|'alltime'>('daily');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [qualifiesForLeaderboard, setQualifiesForLeaderboard] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [hasSubmissionError, setHasSubmissionError] = useState(false);
  const [hasPendingSubmission, setHasPendingSubmission] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");

  useEffect(() => {
    let id = localStorage.getItem('apexPlayerId');
    if (!id) {
       id = Math.random().toString(36).substring(2, 12);
       localStorage.setItem('apexPlayerId', id);
    }
    setPlayerId(id);

    if (localStorage.getItem('pending_score')) {
      setHasPendingSubmission(true);
    }
  }, []);

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
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Precision Streak & UI States
  const [accuracyStreak, setAccuracyStreak] = useState(0);
  const [isTimeFrozen, setIsTimeFrozen] = useState(false);
  const freezeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [slamOverlay, setSlamOverlay] = useState<{ text: string, type: 'gold' | 'ice' } | null>(null);
  const [overdriveToast, setOverdriveToast] = useState<{ id: number } | null>(null);

  useEffect(() => {
    // Load mute preference
    const savedMute = localStorage.getItem('apexMutePreference');
    const initialMute = savedMute === 'true';
    if (savedMute) setIsMuted(initialMute);
  }, []);

  const initWebAudio = () => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const initializeAudio = useCallback(() => {
    if (!isAudioEnabled) {
      setIsAudioEnabled(true);
    }
    initWebAudio();
  }, [isAudioEnabled]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStorage.setItem('apexMutePreference', next.toString());
      return next;
    });
  }, []);

  const playSound = useCallback((type: 'pop' | 'coin' | 'jackpot', count: number = 0) => {
    if (!isAudioEnabled || isMuted) return;
    
    initWebAudio();
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    if (type === 'pop') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // A6
      masterGain.gain.setValueAtTime(0.3, now);
      masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      
      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'coin') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.1); // E6
      masterGain.gain.setValueAtTime(0.3, now);
      masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      
      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'jackpot') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      
      // Pitch goes up based on combo count
      const baseFreq = 440 + (Math.min(count, 10) * 110);
      osc1.frequency.setValueAtTime(baseFreq, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.3);
      osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
      osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2, now + 0.3);
      
      masterGain.gain.setValueAtTime(0.4, now);
      masterGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      
      osc1.connect(masterGain);
      osc2.connect(masterGain);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
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
    // Collect final advanced stats for quit 
    const wordsCorrect = foundWordsRef.current.length + foundBonusWords.length;
    const gridSeen = puzzle?.validWords.length || 0;
    const gridFilled = foundWordsRef.current.length;
    
    // Save current title before recording result
    const currentStats = loadStats();
    const oldTitle = getTitle(currentStats.gamesWon).title;

    recordGameResult(false, score, wordsSubmitted, wordsCorrect, gridSeen, gridFilled);
    
    // Check for rank up
    const newStats = loadStats();
    const newTitle = getTitle(newStats.gamesWon).title;
    if (newTitle !== oldTitle) {
      setTimeout(() => setToastMessage(`Rank Up: You are now a ${newTitle}!`), 1000);
    }
    
    setStats(newStats);
    setGameOver(true);
    setShowWelcome(true);
    setShowQuitConfirm(false);
  }, [score]);

  // --- Automatic Score Recovery Effect ---
  useEffect(() => {
    if (showWelcome) {
      const pendingJson = localStorage.getItem('pending_score');
      if (pendingJson) {
        setToastMessage('Recovering your last high score...');
        try {
          const data = JSON.parse(pendingJson);
          submitScore(data.name, playerId, data.score, data.difficulty, data.isDaily)
            .then(res => {
              if (res && res.success) {
                localStorage.removeItem('pending_score');
                setHasPendingSubmission(false);
                setToastMessage('Score Posted!');
                getTopScores('daily').then(setDailyLeaderboard);
                getTopScores('alltime').then(setAllTimeLeaderboard);
              }
            })
            .catch(() => {
              // Fail silently in background, user can retry string manually or it tries again next time
            });
        } catch (e) {
          // Bad JSON
        }
      }
    }
  }, [showWelcome, playerId]);
  // ---------------------------------------

  const endGame = useCallback((won: boolean, additionalScore: number = 0) => {
    if (gameOverRef.current) return;
    setGameOver(true);
    
    // Clear any dangling freeze refund timer so it doesn't fire on the victory screen
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
      freezeTimeoutRef.current = null;
    }
    
    setScore(s => {
      const finalScore = s + additionalScore;
      setHighScore(h => {
        if (finalScore > h) {
          localStorage.setItem('pressedHighScore', finalScore.toString());
          return finalScore;
        }
        return h;
      });

      // Collect advanced stats 
      const wordsCorrect = foundWordsRef.current.length + foundBonusWords.length;
      const gridSeen = puzzle?.validWords.length || 0;
      const gridFilled = foundWordsRef.current.length;

      // Save current title before recording result
      const currentStats = loadStats();
      const oldTitle = getTitle(currentStats.gamesWon).title;

      recordGameResult(won, finalScore, wordsSubmitted, wordsCorrect, gridSeen, gridFilled);
      
      // Check for rank up
      const newStats = loadStats();
      const newTitle = getTitle(newStats.gamesWon).title;
      if (newTitle !== oldTitle) {
        setTimeout(() => setToastMessage(`Rank Up: You are now a ${newTitle}!`), 1000);
      }
      
      setStats(newStats);

      // Leaderboard Qualification Check
      if (finalScore > 0) {
        setDailyLeaderboard(currentLb => {
          if (currentLb.length < 10 || finalScore > currentLb[currentLb.length - 1].score) {
            setQualifiesForLeaderboard(true);
          }
          return currentLb;
        });
        setAllTimeLeaderboard(currentLb => {
          if (currentLb.length < 10 || finalScore > currentLb[currentLb.length - 1].score) {
            setQualifiesForLeaderboard(true);
          }
          return currentLb;
        });
      }

      return finalScore;
    });
  }, []);

  const handleScoreSubmit = async () => {
    if (!playerName.trim() || isSubmittingScore) return;
    setIsSubmittingScore(true);
    setHasSubmissionError(false);
    
    let diffLabel: string = 'N';
    if (isDailyMode) diffLabel = 'D';
    else if (difficulty === 'easy') diffLabel = 'E';
    else if (difficulty === 'hard') diffLabel = 'H';
    // Normal stays 'N'

    const payload = JSON.stringify({ name: playerName, score, difficulty: diffLabel, isDaily: isDailyMode });
    localStorage.setItem('pending_score', payload);

    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));
      const submitPromise = submitScore(playerName, playerId, score, diffLabel, isDailyMode);

      const res = await Promise.race([submitPromise, timeoutPromise]) as any;

      if (res && res.success) {
        localStorage.removeItem('pending_score');
        setHasPendingSubmission(false);
        const refreshedDaily = await getTopScores('daily');
        const refreshedAllTime = await getTopScores('alltime');
        setDailyLeaderboard(refreshedDaily);
        setAllTimeLeaderboard(refreshedAllTime);
        setQualifiesForLeaderboard(false);
        setToastMessage('Score Posted!');
      } else {
        throw new Error(res?.error || 'Database error');
      }
    } catch (err: any) {
      console.error('Submission failed:', err);
      setHasSubmissionError(true);
      if (err.message === 'TIMEOUT') {
        setToastMessage("Server is slow. Don't worry, your score is saved locally. Try hitting submit again or refresh.");
      } else {
        setToastMessage('Connection Error. Try again.');
      }
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleRecoverScore = async () => {
    const pendingJson = localStorage.getItem('pending_score');
    if (!pendingJson) return;
    
    try {
      setIsSubmittingScore(true);
      const data = JSON.parse(pendingJson);
      
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));
      const submitPromise = submitScore(data.name, playerId, data.score, data.difficulty, data.isDaily);
      
      const res = await Promise.race([submitPromise, timeoutPromise]) as any;
      
      if (res && res.success) {
        localStorage.removeItem('pending_score');
        setHasPendingSubmission(false);
        const refreshedDaily = await getTopScores('daily');
        const refreshedAllTime = await getTopScores('alltime');
        setDailyLeaderboard(refreshedDaily);
        setAllTimeLeaderboard(refreshedAllTime);
        setToastMessage('Score Posted!');
      } else {
        throw new Error(res?.error || 'Database error');
      }
    } catch (err: any) {
      console.error('Recovery failed:', err);
      if (err.message === 'TIMEOUT') {
        setToastMessage("Server is slow. Don't worry, your score is saved locally. Try hitting submit again or refresh.");
      } else {
        setToastMessage('Connection Error. Try again.');
      }
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const totalTimeLimit = useMemo(() => {
    // Easy: 3:00, Normal: 2:30, Hard: 2:00
    return difficulty === 'easy' ? 180 : difficulty === 'hard' ? 120 : 150;
  }, [difficulty]);

  const startNewGame = useCallback((diff?: Difficulty, isDaily?: boolean) => {
    initWebAudio();
    const activeDiff = diff || difficulty;
    setDifficulty(activeDiff);
    setIsDailyMode(!!isDaily);
    
    // Easy: 3:00 | Normal: 2:30 | Hard: 2:00
    const timeLimit = activeDiff === 'easy' ? 180 : activeDiff === 'hard' ? 120 : 150;

    const newPuzzle = isDaily
      ? getDailyPuzzle(new Date().toISOString().split('T')[0])
      : getRandomPuzzle(activeDiff);
    setPuzzle(newPuzzle);
    setTimeLeft(timeLimit);
    setEndTime(Date.now() + timeLimit * 1000);
    setScore(0);
    setDisplayScore(0);
    setTimeBonus(0);
    setComboCount(0);
    setAccuracyStreak(0);
    
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
      freezeTimeoutRef.current = null;
    }
    setIsTimeFrozen(false);
    
    setShowHowToPlay(false);
    lastWordTime.current = 0;
    setFoundWords([]);
    setFoundBonusWords([]);
    setWordsSubmitted(0);
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
    
    // The Cut-off: Handled elegantly by the Room-Based Music Logic Effect
    // Safety fallback: if they bypassed the gate somehow, init audio on first game start
    if (!isAudioEnabled) initializeAudio();
  }, [difficulty, isAudioEnabled, initializeAudio]);

  useEffect(() => {
    const saved = localStorage.getItem('pressedHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
    setStats(loadStats());
    getTopScores('daily').then(setDailyLeaderboard).catch(console.error);
    getTopScores('alltime').then(setAllTimeLeaderboard).catch(console.error);
    // Welcome screen shows on mount, so we don't automatically trigger startNewGame
  }, []);

  useEffect(() => {
    if (!puzzle || gameOver || !endTime || showWelcome) return;

    const checkTime = () => {
      if (isTimeFrozen) return;
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
  }, [endTime, gameOver, puzzle, showWelcome, endGame, isTimeFrozen]);

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
        setAccuracyStreak(0);
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
      
      setWordsSubmitted(ws => ws + 1);
      
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

        const isOverdrive = accuracyStreak >= 10;
        // Difficulty multiplier: Easy 1.0x, Normal 1.2x, Hard 1.5x
        const difficultyMultiplier = difficulty === 'hard' ? 1.5 : difficulty === 'normal' ? 1.2 : 1.0;
        const diffMult = isOverdrive ? 1 : difficultyMultiplier;
        const comboMult = isOverdrive ? 3.0 : (comboEarned ? 1.5 : 1);
        const pts = Math.floor(word.length * 10 * diffMult * comboMult);

        // Difficulty factor used for bonus-reveal points
        const diffFactor = difficultyMultiplier;

        if (isOverdrive) {
          const toastId = Date.now();
          setOverdriveToast({ id: toastId });
          setTimeout(() => setOverdriveToast(curr => curr?.id === toastId ? null : curr), 1000);
        }

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

        // Precision Streak Logic
        setAccuracyStreak(prev => {
          const next = prev + 1;
          if (next === 5) {
            // 5-Word Streak → Time Freeze (Cryo-Stasis)
            setIsTimeFrozen(true);
            setSlamOverlay({ text: 'CRYO-STASIS: 10S FREEZE', type: 'ice' });
            setTimeout(() => setSlamOverlay(null), 2000);

            setTimeout(() => {
              playSound('jackpot', 5);
            }, 400);

            if (freezeTimeoutRef.current) {
              clearTimeout(freezeTimeoutRef.current);
            }

            // Freeze for exactly 10 seconds, then refund the time into endTime
            freezeTimeoutRef.current = setTimeout(() => {
              if (!gameOverRef.current) {
                setEndTime(e => e ? e + 10000 : e);
                setIsTimeFrozen(false);
              }
              freezeTimeoutRef.current = null;
            }, 10000);
          } else if (next === 10) {
            // 10-Word Streak → Clarity Bonus (reveal longest unfound word)
            setSlamOverlay({ text: 'CLARITY PROTOCOL', type: 'gold' });
            setTimeout(() => setSlamOverlay(null), 2000);

            const unfound = puzzle.validWords.filter(w => !foundWords.includes(w) && w !== word);
            if (unfound.length > 0) {
              const longest = unfound.reduce((a, b) => a.length >= b.length ? a : b);
              setFoundWords(fw => {
                if (fw.includes(longest)) return fw;
                const updated = [...fw, longest];

                // Automatically win if the bonus fills the last word
                if (updated.length === puzzle.validWords.length) {
                  setGameOver(true);
                  const remTime = Math.max(0, Math.floor((endTime! - Date.now()) / 1000));
                  const tBonus = remTime * 10;
                  setTimeBonus(tBonus);
                  setTimeout(() => endGame(true, tBonus), 600);
                }
                return updated;
              });
              const bonusPts = Math.floor(longest.length * 10 * diffFactor);
              setScore(s => s + bonusPts);
              setTimeout(() => {
                playSound('coin');
              }, 400);
            }
          }
          return next;
        });

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
        setWordsSubmitted(ws => ws + 1);
        setAccuracyStreak(0);
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

  const getTitle = (clears: number) => {
    if (clears >= 50) return { title: "Apex Legend", next: null, current: 50 };
    if (clears >= 25) return { title: "Cipher", next: 50, current: 25 };
    if (clears >= 10) return { title: "Scholar", next: 25, current: 10 };
    if (clears >= 1) return { title: "Scribe", next: 10, current: 1 };
    return { title: "Novice", next: 1, current: 0 };
  };

  const generateShareGrid = async () => {
    if (!puzzle) return;

    // Calculate daily rank for the share string
    let rankStr = "-";
    if (score > 0) {
      const idx = dailyLeaderboard.findIndex(e => score >= e.score);
      rankStr = idx !== -1 ? `${idx + 1}` : (dailyLeaderboard.length < 10 ? `${dailyLeaderboard.length + 1}` : '10+');
    }

    const shareText = `Apex Anagrams: I just hit a ${score} on today's Daily Trial! Rank: ${rankStr}. Can you beat me? 🏆 https://pressed-beta.vercel.app`;
    let gridStr = `${shareText}\n\n`;
    
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

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Apex Anagrams',
          text: gridStr.trim(),
        });
        setToastMessage("Shared successfully!");
      } else {
        await navigator.clipboard.writeText(gridStr.trim());
        setToastMessage("Copied to clipboard!");
      }
    } catch (err) {
      console.log('Error sharing:', err);
    }
    
    setTimeout(() => setToastMessage(null), 1500);
  };

  const handleShareGame = async () => {
    const shareText = "Check out Apex Anagrams! It's a high-speed daily word challenge. Can you make the Top 10? 🏆 https://pressed-beta.vercel.app";
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Apex Anagrams',
          text: shareText,
        });
        setToastMessage("Shared successfully!");
      } else {
        await navigator.clipboard.writeText(shareText);
        setToastMessage("Link Copied!");
      }
    } catch (err) {
      console.log('Error sharing:', err);
    }
    
    setTimeout(() => setToastMessage(null), 1500);
  };

  if (showWelcome && stats) {
    const winPct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    const globalAccuracy = stats.totalWordsSubmitted ? Math.round(((stats.totalWordsCorrect || 0) / stats.totalWordsSubmitted) * 100) : 0;
    const rankInfo = getTitle(stats.gamesWon);
    
    // Calculate progress as a percentage between current rank threshold and next rank threshold
    let progressPct = 100;
    if (rankInfo.next !== null) {
      const range = rankInfo.next - rankInfo.current;
      const progress = stats.gamesWon - rankInfo.current;
      progressPct = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    }

    return (
      <div className="fixed inset-0 bg-pink-50 flex flex-col items-center justify-center font-sans p-4">
        
        {/* How to Play Modal */}
        {showHowToPlay && (
          <div className="absolute inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gradient-to-br from-pink-50 to-white border-4 border-pink-300 rounded-3xl p-6 shadow-2xl animate-[slideUp_0.3s_ease-out] flex flex-col h-auto max-h-[90vh]">
              <div className="flex justify-between items-center border-b-2 border-pink-200 pb-3 mb-4">
                <h2 className="text-2xl font-black italic text-pink-900 tracking-tighter uppercase flex items-center gap-2">
                  <span className="text-3xl font-normal">❓</span> APEX PROTOCOLS
                </h2>
                <button onPointerDown={() => setShowHowToPlay(false)} className="text-pink-400 font-black text-xl w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center active:bg-pink-200 transition-colors touch-manipulation">✕</button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 text-sm text-pink-900 font-medium">
                <div className="bg-white p-3 rounded-xl border border-pink-200 shadow-sm">
                  <span className="font-extrabold text-pink-700 block mb-1">🎯 The Goal:</span>
                  Find as many anagrams as possible before time runs out. Easy: 3:00 (1.0x pts). Normal: 2:30 (1.2x pts). Hard: 2:00 (1.5x pts).
                </div>
                
                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 shadow-sm">
                  <span className="font-extrabold text-orange-600 block mb-1 flex items-center gap-2"><span className="animate-pulse">🔥</span> Apex Streak:</span>
                  Find 2 words within 5 seconds to trigger a 1.5x Score Multiplier.
                </div>

                <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 shadow-sm">
                  <span className="font-extrabold text-blue-600 block mb-1">🧊 Time Freeze (5-Word Streak):</span>
                  Find 5 words in a row without a mistake to stop the clock for 10 seconds!
                </div>
                
                <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 shadow-sm">
                  <span className="font-extrabold text-purple-600 block mb-1">🔮 Clarity Bonus (10-Word Streak):</span>
                  Find 10 words in a row without a single mistake or duplicate — the longest unfound word is revealed and scored for you.
                </div>

                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 shadow-sm">
                  <span className="font-extrabold text-indigo-600 block mb-1">⚡ Overdrive (11+ Word Streak):</span>
                  Keep the streak going past 10! Every word you find correctly after that scores a massive <strong>3x multiplier</strong> — until you make a mistake or repeat a word.
                </div>

                <div className="bg-[#fff9e6] p-3 rounded-xl border border-[#d4af37] shadow-sm">
                  <span className="font-extrabold text-[#d4af37] block mb-1">🌍 Daily Trial:</span>
                  Compete on the exact same board as everyone else for the top spot on the Daily Leaderboard!
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-sm">
                  <span className="font-extrabold text-emerald-600 block mb-1">🏅 Player Ranks:</span>
                  Clear the board to rise from Novice all the way to Apex Legend!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Leaderboard Modal */}
        {showLeaderboard && (
          <div
            className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onPointerDown={() => setShowLeaderboard(false)}
          >
            <div
              className="w-full max-w-sm bg-gradient-to-br from-pink-50 to-white border-4 border-[#d4af37] rounded-3xl p-6 shadow-2xl animate-[slideUp_0.3s_ease-out] flex flex-col h-auto max-h-[80vh]"
              onPointerDown={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b-2 border-pink-200 pb-3 mb-3">
                <h2 className="text-2xl font-black italic text-pink-900 tracking-tighter uppercase flex items-center gap-2">
                  <span className="text-3xl">🏆</span> TOP 10
                </h2>
                <button
                  onPointerDown={() => setShowLeaderboard(false)}
                  className="text-pink-400 font-black text-2xl w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center active:bg-pink-200 transition-colors touch-manipulation"
                >✕</button>
              </div>
              
              <div className="flex bg-pink-100 rounded-lg p-1 mb-4 flex-none">
                 <button 
                   onPointerDown={() => setLeaderboardTab('daily')}
                   className={`flex-1 py-2 text-xs sm:text-sm font-black uppercase tracking-widest rounded-md transition-all touch-manipulation ${leaderboardTab === 'daily' ? 'bg-white text-pink-900 shadow-sm' : 'text-pink-500'}`}
                 >Daily Trial</button>
                 <button 
                   onPointerDown={() => setLeaderboardTab('alltime')}
                   className={`flex-1 py-2 text-xs sm:text-sm font-black uppercase tracking-widest rounded-md transition-all touch-manipulation ${leaderboardTab === 'alltime' ? 'bg-white text-pink-900 shadow-sm' : 'text-pink-500'}`}
                 >Hall of Fame</button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
                {(leaderboardTab === 'daily' ? dailyLeaderboard : allTimeLeaderboard).length === 0 ? (
                  <p className="text-center text-pink-600 font-bold py-8">No scores recorded yet. Be the first!</p>
                ) : (
                  (leaderboardTab === 'daily' ? dailyLeaderboard : allTimeLeaderboard).map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white border border-pink-200 p-3 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className={`font-black italic w-6 text-center ${idx === 0 ? 'text-[#d4af37] text-xl drop-shadow-sm' : idx === 1 ? 'text-gray-400 text-lg' : idx === 2 ? 'text-amber-700 text-lg' : 'text-pink-400'}`}>
                          #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1 group relative">
                          <span className="font-extrabold text-pink-900 tracking-wider uppercase text-sm truncate max-w-[120px]">{entry.name}</span>
                          {entry.difficulty && (
                            <span 
                              className="text-[9px] font-black text-white bg-pink-300 rounded px-1 ml-1 leading-tight flex items-center justify-center min-w-[16px] h-[16px] shadow-sm cursor-help" 
                              title={entry.difficulty === 'E' ? 'Easy' : entry.difficulty === 'H' ? 'Hard' : entry.difficulty === 'D' ? 'Daily' : 'Normal'}
                            >
                              {entry.difficulty}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-lg text-[#d4af37]">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

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
                  <span className="text-pink-600 font-bold">Current Daily Streak: {stats.currentStreak} 🔥</span>
                </>
              )}
            </div>

            <div className="flex justify-between w-full mt-2 gap-2 relative">
              {hasPendingSubmission && (
                <div className="absolute -top-16 left-0 right-0 bg-red-50 border border-red-200 p-2 rounded-lg flex flex-col gap-1 items-center text-center shadow-sm z-50 animate-[slideUp_0.3s_ease-out]">
                  <span className="text-red-700 font-bold text-[10px] uppercase">Connection Failed Last Game</span>
                  <button 
                    onPointerDown={handleRecoverScore}
                    disabled={isSubmittingScore}
                    className="bg-red-500 text-white font-black uppercase text-[10px] px-3 py-1.5 rounded shadow-sm hover:bg-red-600 active:translate-y-[2px] transition-all disabled:opacity-50"
                  >
                    {isSubmittingScore ? 'UPLOADING...' : 'RESUBMIT SCORE'}
                  </button>
                </div>
              )}
              <button 
                onPointerDown={() => setShowHowToPlay(true)}
                className="absolute -top-14 left-0 text-pink-600 bg-pink-100 border border-pink-300 font-extrabold w-10 h-10 rounded-full shadow-sm active:scale-95 transition-all text-xl touch-manipulation flex items-center justify-center z-50"
              >
                ?
              </button>
              <button 
                onPointerDown={() => setShowLeaderboard(true)}
                className="flex-[1.5] bg-white border-2 border-[#d4af37] text-yellow-700 font-extrabold py-3 rounded shadow-sm active:bg-yellow-50 transition-all text-xs tracking-widest select-none touch-manipulation flex items-center justify-center gap-2"
              >
                <span className="text-base">🏆</span> RANK
              </button>
              <button 
                onPointerDown={() => initializeAudio()} 
                className="flex-[2] bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-3 rounded shadow-md active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-lg tracking-widest select-none touch-manipulation"
              >
                ENTER LOBBY
              </button>
            </div>
            <p className="text-[10px] text-pink-400 font-bold uppercase tracking-widest mt-1">Enables Audio & Gameplay</p>
          </div>
        ) : (
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-pink-200 w-full max-w-sm flex flex-col items-center gap-4 shadow-2xl z-10 animate-[slideUp_0.2s_ease-out] relative">
            <div className="flex flex-col items-center mb-0 mt-2">
              <img src="/apex-branding-full.png" alt="Apex Anagrams" className="w-[90%] max-w-[240px] drop-shadow-md mb-2" />
            </div>
            
            <div className="w-full flex flex-col items-center border border-pink-200 bg-pink-50 rounded-lg p-3 shadow-inner mb-2">
             <span className="text-[10px] text-pink-600 font-bold uppercase tracking-widest mb-1">Rank</span>
             <span className="text-xl font-black text-[#d4af37] drop-shadow-sm uppercase">{rankInfo.title}</span>
             {rankInfo.next ? (
               <div 
                 className="w-full mt-2 cursor-help" 
                 title={`${rankInfo.next - stats.gamesWon} more clears to reach ${getTitle(rankInfo.next).title}!`}
               >
                 <div className="flex justify-between text-[10px] text-pink-700 font-bold mb-1">
                   <span>{stats.gamesWon} Clears</span>
                   <span>{rankInfo.next} Clears</span>
                 </div>
                 <div className="w-full bg-pink-200 rounded-full h-2.5">
                   <div className="bg-[#d4af37] h-2.5 rounded-full shadow-sm transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
                 </div>
               </div>
             ) : (
                <div className="text-xs text-[#d4af37] font-bold mt-1">MAX RANK SECURED</div>
              )}
            </div>
            
            <div className="w-full bg-pink-50 rounded-xl p-4 flex gap-[2px] justify-between border border-pink-100 shadow-inner">
            <div className="flex flex-col items-center flex-1">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Daily Streak</span>
              <span className="text-pink-900 text-2xl font-mono relative">{stats.currentStreak} <span className="absolute -right-4 top-0 text-orange-400 text-xs animate-pulse">🔥</span></span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Win %</span>
              <span className="text-pink-900 text-2xl font-mono">{winPct}%</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Accuracy</span>
              <span className="text-pink-900 text-2xl font-mono">{globalAccuracy}%</span>
            </div>
            <div className="flex flex-col items-center flex-[1.2] border-l border-pink-200 relative cursor-pointer active:opacity-80 touch-manipulation" onPointerDown={() => setShowLeaderboard(true)}>
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Leaderboard</span>
              <span className="text-pink-900 text-2xl font-mono absolute -top-1 right-0 opacity-20">🏆</span>
              <div className="mt-1 bg-white border border-[#d4af37] text-yellow-600 text-[8px] font-black px-1 py-1 rounded shadow-sm tracking-widest uppercase">View Top 10</div>
            </div>
          </div>
            <div className="flex flex-col gap-3 w-full mt-1">
              <div className="flex gap-2 w-full">
                <button onPointerDown={() => setShowHowToPlay(true)} className="flex-1 bg-white border-2 border-pink-300 text-pink-600 font-extrabold py-2 rounded shadow-sm active:bg-pink-50 transition-all text-[10px] tracking-widest select-none touch-manipulation flex items-center justify-center gap-2 opacity-90"><span className="text-base text-pink-400">❓</span> HOW TO PLAY</button>
                <button onPointerDown={handleShareGame} className="flex-1 bg-white border-2 border-pink-300 text-pink-600 font-extrabold py-2 rounded shadow-sm active:bg-pink-50 transition-all text-[10px] tracking-widest select-none touch-manipulation flex items-center justify-center gap-2 opacity-90"><span className="text-base text-pink-400">🔗</span> SHARE GAME</button>
              </div>
              <button onPointerDown={() => startNewGame('normal', true)} className="bg-purple-500 border-b-4 border-r-2 border-purple-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mt-1">DAILY CHALLENGE <span className="text-purple-100 block text-xs tracking-normal mt-1 opacity-80">(Everyone plays the same board)</span></button>
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
    <div id="game-container" className={`fixed inset-0 bg-pink-50 flex flex-col items-center select-none font-sans overflow-hidden ${isTimeFrozen ? 'frost-edges' : ''}`}>
      <Sparkles />
      
      {/* Cinematic Slam Overlay */}
      {slamOverlay && (
         <div className="absolute inset-0 z-[200] pointer-events-none flex flex-col items-center justify-center">
            <span className={`animate-slamText text-5xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] px-4 text-center ${slamOverlay.type === 'gold' ? 'bg-gradient-to-b from-yellow-300 to-yellow-600' : 'bg-gradient-to-b from-cyan-300 to-blue-600'}`} style={{ WebkitTextStroke: `2px ${slamOverlay.type === 'gold' ? '#7c2d12' : '#1e3a8a'}` }}>
              {slamOverlay.text}
            </span>
         </div>
      )}

      {/* Hardened Background Watermark Logo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none -z-10 overflow-hidden opacity-10">
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
            <p className="text-pink-800 mb-6 text-sm font-medium">Quitting now will count as a loss and reset your current daily streak. Are you sure?</p>
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

          {/* Mute + How to Play — side by side top right */}
          <div className="absolute top-2 right-4 flex items-center gap-1">
            <button 
              onPointerDown={toggleMute}
              className="text-pink-500 active:text-pink-700 text-lg font-bold bg-pink-100 w-8 h-8 flex items-center justify-center rounded-full border border-pink-200 shadow-sm touch-manipulation"
              aria-label={isMuted ? "Unmute Sound" : "Mute Sound"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
            <button 
              onPointerDown={() => setShowHowToPlay(true)}
              className="text-pink-500 active:text-pink-700 text-sm font-bold bg-pink-100 w-8 h-8 flex items-center justify-center rounded-full border border-pink-200 shadow-sm touch-manipulation"
            >
              ❓
            </button>
          </div>
          
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
                  : (accuracyStreak >= 5 
                    ? 'bg-blue-100 border-blue-500 text-blue-600 animate-pulse'
                    : 'bg-gray-100 border-gray-300 text-gray-400 opacity-60')}
              `}>
                <span className="font-black text-sm italic">{comboCount > 0 ? '1.5x' : (accuracyStreak >= 5 ? `${accuracyStreak}🔥` : '1.0x')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center pb-2 relative">
            {isTimeFrozen && (
              <div className="absolute -top-4 bg-blue-100 text-blue-700 font-bold px-2 py-1 text-[10px] rounded-full animate-bounce shadow-sm border border-blue-300">FROZEN</div>
            )}
            <div className={`bg-white border border-pink-200 shadow-sm rounded-md px-3 py-1 mt-2 transform transition-all ${isTimeFrozen ? 'scale-110 shadow-[0_0_15px_rgba(59,130,246,0.5)] border-blue-400' : ''}`}>
              <span 
                className={`font-mono font-bold text-3xl tracking-widest animate-[pulse_1.5s_ease-in-out_infinite] ${isTimeFrozen ? 'frozen' : ''}`}
                style={{
                  color: isTimeFrozen ? '#3b82f6' : `hsl(${Math.floor(Math.max(0, Math.min(1, timeLeft / totalTimeLimit)) * 120)}, 90%, 45%)`,
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
         <div className="w-full mt-auto pb-8 pt-4 px-4 flex flex-col items-center gap-6 border-t border-pink-200 select-none touch-none bg-pink-50 relative">
          
          {overdriveToast && !gameOver && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] sm:text-xs font-black italic tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-600 animate-floatUpFade pointer-events-none whitespace-nowrap z-50">
              3x ACCURACY BONUS
            </div>
          )}

          {gameOver ? (
           qualifiesForLeaderboard ? (
             <div className="w-full flex flex-col items-center gap-4 bg-gradient-to-br from-yellow-100 via-yellow-200 to-yellow-400 p-6 rounded-xl border-4 border-[#d4af37] shadow-[0_10px_40px_rgba(212,175,55,0.4)] animate-[slideUp_0.4s_ease-out] z-40 relative text-center">
                <div className="text-4xl animate-bounce drop-shadow-sm">🏆</div>
                <h2 className="text-3xl sm:text-4xl font-black text-yellow-900 tracking-tighter italic uppercase drop-shadow-sm leading-tight">APEX<br/>PERFORMANCE!</h2>
                <p className="text-yellow-800 font-bold text-sm bg-white/50 px-4 py-2 rounded-lg border border-yellow-300 w-full">You reached the Top 10 with a score of <br/><span className="font-mono text-2xl text-yellow-900 drop-shadow-sm">{score}</span>!</p>
                <input 
                  type="text" 
                  maxLength={12}
                  placeholder="ENTER NAME" 
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  className="w-full text-center text-xl font-black text-yellow-900 bg-white border-2 border-yellow-500 rounded-xl p-3 uppercase tracking-widest placeholder-yellow-600/40 focus:outline-none focus:border-yellow-700 focus:bg-white transition-all shadow-inner"
                />
                <button 
                  onPointerDown={handleScoreSubmit}
                  disabled={isSubmittingScore || !playerName.trim()}
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 border-b-4 border-r-2 border-yellow-800 text-white font-extrabold py-4 rounded-xl shadow-md active:border-0 active:translate-y-[4px] transition-all tracking-widest text-lg touch-manipulation disabled:opacity-50 disabled:active:border-b-4 disabled:active:translate-y-0"
                >
                  {isSubmittingScore ? 'SUBMITTING...' : hasSubmissionError ? 'RETRY SUBMISSION' : 'CLAIM RANK'}
                </button>
                <button 
                  onPointerDown={() => setQualifiesForLeaderboard(false)}
                  className="text-yellow-700 text-xs font-bold uppercase tracking-widest mt-1 underline opacity-80 active:opacity-100 touch-manipulation p-2"
                >
                  Skip
                </button>
             </div>
           ) : (
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

                      {/* Leaderboard Ranks */}
                      <div className="flex justify-between border-t border-pink-300 pt-2 mt-2 text-xs text-pink-700 font-bold uppercase tracking-widest bg-white/50 p-2 rounded-md shadow-inner">
                         <div className="flex flex-col items-center flex-1 border-r border-pink-200">
                           <span className="opacity-80 mb-1 text-[9px]">Daily Trial</span>
                           <span className="text-xl text-[#d4af37] font-black">{score === 0 ? '-' : (dailyLeaderboard.findIndex(e => score >= e.score) !== -1 ? dailyLeaderboard.findIndex(e => score >= e.score) + 1 : (dailyLeaderboard.length < 10 ? dailyLeaderboard.length + 1 : '10+'))}</span>
                         </div>
                         <div className="flex flex-col items-center flex-1">
                           <span className="opacity-80 mb-1 text-[9px]">All-Time</span>
                           <span className="text-xl text-pink-900 font-black">{score === 0 ? '-' : (allTimeLeaderboard.findIndex(e => score >= e.score) !== -1 ? allTimeLeaderboard.findIndex(e => score >= e.score) + 1 : (allTimeLeaderboard.length < 10 ? allTimeLeaderboard.length + 1 : '10+'))}</span>
                         </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl font-bold text-pink-500 tracking-widest drop-shadow-[0_2px_4px_rgba(236,72,153,0.3)]">TIME'S UP</h2>
                    <span className="text-pink-900 text-sm font-bold opacity-80">You missed {puzzle.validWords.length - foundWords.length} words</span>
                  </>
                )}
                
                {/* Advanced Player Stats Panel */}
                {stats && (
                  <div className="w-full flex justify-between border-t border-b border-pink-200 py-3 my-1 bg-white/50 px-2 rounded-lg">
                    <div className="flex flex-col items-center flex-1 border-r border-pink-200">
                      <span className="text-[10px] uppercase font-black tracking-widest text-pink-500 mb-1">Win %</span>
                      <span className="text-xl font-black text-pink-900">
                        {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex flex-col items-center flex-1 border-r border-pink-200">
                      <span className="text-[10px] uppercase font-black tracking-widest text-blue-500 mb-1">Accuracy</span>
                      <span className="text-xl font-black text-blue-900">
                        {wordsSubmitted > 0 ? Math.round(((foundWords.length + foundBonusWords.length) / wordsSubmitted) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-[10px] uppercase font-black tracking-widest text-orange-500 mb-1">Streak</span>
                      <span className="text-xl font-black text-orange-600 flex items-center gap-1">
                        {stats.currentStreak} <span className="text-sm">🔥</span>
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2 w-full mt-2">
                  <button 
                    onPointerDown={() => setShowWelcome(true)}
                    className="flex-1 bg-gray-400 border-b-4 border-r-2 border-gray-500 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                  >
                    MENU
                  </button>
                  <button 
                    onPointerDown={generateShareGrid}
                    className="flex-1 bg-blue-500 border-b-4 border-r-2 border-blue-700 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all flex items-center justify-center gap-2"
                  >
                    SHARE <span className="text-xl">📈</span>
                  </button>
                  <button 
                    onPointerDown={() => startNewGame()}
                    className="flex-1 bg-[#d4af37] border-b-4 border-r-2 border-yellow-700 text-white font-extrabold py-3 px-4 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                  >
                    RETRY
                  </button>
                </div>
             </div>
           )
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

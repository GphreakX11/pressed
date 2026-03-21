"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Puzzle, Difficulty, getRandomPuzzle, getDailyPuzzle } from "@/lib/puzzles";
import { PlayerStats, loadStats, recordGameResult } from "@/lib/stats";
import { getTopScores, submitScore, submitGameStats, recordWordStats, getWordRarity, getGamePuzzle, getDailyGamePuzzle, getUserTrophies, getTournamentPuzzle, recordTournamentRound, type LeaderboardEntry } from '@/app/actions';
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
  const foundBonusWordsRef = useRef<string[]>([]);
  useEffect(() => { foundBonusWordsRef.current = foundBonusWords; }, [foundBonusWords]);

  const scoreRef = useRef(0);
  useEffect(() => { scoreRef.current = score; }, [score]);
  
  const puzzleRef = useRef<Puzzle | null>(null);
  useEffect(() => { puzzleRef.current = puzzle; }, [puzzle]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [isDailyMode, setIsDailyMode] = useState(false);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  // Tournament State
  const [isTournamentMode, setIsTournamentMode] = useState(false);
  const isTournamentModeRef = useRef(false);
  useEffect(() => { isTournamentModeRef.current = isTournamentMode; }, [isTournamentMode]);
  
  const [tournamentRound, setTournamentRound] = useState(1);
  const tournamentRoundRef = useRef(1);
  useEffect(() => { tournamentRoundRef.current = tournamentRound; }, [tournamentRound]);

  const [targetScore, setTargetScore] = useState(400);
  const targetScoreRef = useRef(400);
  useEffect(() => { targetScoreRef.current = targetScore; }, [targetScore]);

  const [tournamentOverlay, setTournamentOverlay] = useState<'none' | 'passed' | 'next'>('none');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false);
  useEffect(() => { isTransitioningRef.current = isTransitioning; }, [isTransitioning]);
  
  const transitionTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  useEffect(() => {
    return () => {
      transitionTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Leaderboard State
  const [dailyLeaderboard, setDailyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [championsLeaderboard, setChampionsLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [accuracyLeaderboard, setAccuracyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tourneyLeaderboard, setTourneyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'daily'|'champions'|'alltime'|'accuracy'|'tourney'>('daily');
  const [showTrophyCase, setShowTrophyCase] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [qualifiesForLeaderboard, setQualifiesForLeaderboard] = useState(false);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [hasSubmissionError, setHasSubmissionError] = useState(false);
  const [hasPendingSubmission, setHasPendingSubmission] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const playerIdRef = useRef("");
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  const [wordRarities, setWordRarities] = useState<Record<string, number>>({});
  const [serverRankResult, setServerRankResult] = useState<{ rankStatus: string, rank: number | null } | null>(null);
  const [userTrophies, setUserTrophies] = useState<{ isGold: boolean, silverWins: number, isSniper?: boolean, isSurvivalist?: boolean } | null>(null);

  useEffect(() => {
    if (playerId) {
      getUserTrophies(playerId).then(setUserTrophies).catch(console.error);
    }
  }, [playerId]);

  useEffect(() => {
    let id = localStorage.getItem('apexPlayerId');
    if (!id) {
       id = Math.random().toString(36).substring(2, 12);
       localStorage.setItem('apexPlayerId', id);
    }
    setPlayerId(id);

    // Pre-populate the player name — try last_used_handle first, then fall back to pending_score
    const savedHandle = localStorage.getItem('last_used_handle');
    if (savedHandle) {
      setPlayerName(savedHandle);
    } else {
      try {
        const pending = localStorage.getItem('pending_score');
        if (pending) {
          const parsed = JSON.parse(pending);
          if (parsed?.name) setPlayerName(parsed.name);
        }
      } catch (_) {}
    }

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
  
  const endGameProcessedRef = useRef(false);

  // Track words submitted with a ref so endGame closure always has the latest value
  const [wordsSubmitted, setWordsSubmitted] = useState(0);
  const wordsSubmittedRef = useRef(0);
  useEffect(() => { wordsSubmittedRef.current = wordsSubmitted; }, [wordsSubmitted]);

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
    if (endGameProcessedRef.current) return;
    endGameProcessedRef.current = true;
    
    // Collect final advanced stats for quit 
    const wordsCorrect = foundWordsRef.current.length + foundBonusWordsRef.current.length;
    const gridSeen = puzzleRef.current?.validWords.length || 0;
    const gridFilled = foundWordsRef.current.length;
    
    // Save current title before recording result
    const currentStats = loadStats();
    const oldTitle = getTitle(currentStats.gamesWon).title;

    recordGameResult(false, scoreRef.current, wordsSubmittedRef.current, wordsCorrect, gridSeen, gridFilled);
    
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
  }, []);

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
    if (endGameProcessedRef.current) return;
    endGameProcessedRef.current = true;
    setGameOver(true);
    
    // Clear any dangling freeze refund timer so it doesn't fire on the victory screen
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
      freezeTimeoutRef.current = null;
    }
    
    const finalScore = scoreRef.current + additionalScore;
    if (additionalScore > 0) {
      setScore(finalScore);
    }
      
    // High Water Mark Check
    setHighScore(h => {
      if (finalScore > h) {
        localStorage.setItem('pressedHighScore', finalScore.toString());
        setIsNewPersonalBest(true);
        return finalScore;
      }
      setIsNewPersonalBest(false);
      return h;
    });

    // Collect advanced stats 
    const wordsCorrect = foundWordsRef.current.length + foundBonusWordsRef.current.length;
    const gridSeen = puzzleRef.current?.validWords.length || 0;
    const gridFilled = foundWordsRef.current.length;

    // Save current title before recording result
    const currentStats = loadStats();
    const oldTitle = getTitle(currentStats.gamesWon).title;

    const tRound = isTournamentModeRef.current ? tournamentRoundRef.current : undefined;
    recordGameResult(won, finalScore, wordsSubmittedRef.current, wordsCorrect, gridSeen, gridFilled, tRound);

    if (isTournamentModeRef.current) {
      recordTournamentRound(playerIdRef.current, playerName || 'ANONYMOUS', tournamentRoundRef.current).catch(console.error);
    }
    
    // Check for rank up
    const newStats = loadStats();
    const newTitle = getTitle(newStats.gamesWon).title;
    if (newTitle !== oldTitle) {
      setTimeout(() => setToastMessage(`Rank Up: You are now a ${newTitle}!`), 1000);
    }
    
    setStats(newStats);

    // Sync stats to global leaderboard via background API Endpoint
    fetch('/api/sync-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerIdRef.current,
        name: playerName || 'ANONYMOUS',
        accuracyStats: { 
          gamesWon: newStats.gamesWon, 
          totalAccuracySum: newStats.totalAccuracySum || 0, 
          gamesWithWordData: newStats.gamesWithWordData || 0 
        },
        highestTournamentRound: newStats.highestTournamentRound || 0
      })
    }).catch(console.error);

    // Record Global Stats
    const allFound = [...foundWordsRef.current, ...foundBonusWordsRef.current];
    if (allFound.length > 0) {
      recordWordStats(allFound, puzzleRef.current?.bingoWord || '', puzzleRef.current?.validWords.length || 0);
      getWordRarity(allFound).then(setWordRarities).catch(console.error);
    }

    // Leaderboard Qualification Check
    if (finalScore > 0) {
      if (isDailyMode) {
        // Daily Trial participants ALWAYS get to verify/submit their rank
        setQualifiesForLeaderboard(true);
      } else {
        setDailyLeaderboard(currentLb => {
          if (currentLb.length < 10 || finalScore >= currentLb[currentLb.length - 1].score) {
            setQualifiesForLeaderboard(true);
          }
          return currentLb;
        });
        setAllTimeLeaderboard(currentLb => {
          if (currentLb.length < 10 || finalScore >= currentLb[currentLb.length - 1].score) {
            setQualifiesForLeaderboard(true);
          }
          return currentLb;
        });
      }
    }
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
    // Save the handle immediately so it persists even if the network call fails
    localStorage.setItem('last_used_handle', playerName.trim());

    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));
      const submitPromise = submitScore(playerName, playerId, score, diffLabel, isDailyMode);

      const res = await Promise.race([submitPromise, timeoutPromise]) as any;

      if (res && res.success) {
        // Save the handle so it pre-populates next time
        localStorage.setItem('last_used_handle', playerName.trim());
        localStorage.removeItem('pending_score');
        setHasPendingSubmission(false);
        const refreshedDaily = await getTopScores('daily');
        const refreshedAllTime = await getTopScores('alltime');
        const refreshedAcc = await getTopScores('accuracy');
        const refreshedTourney = await getTopScores('tourney');
        setDailyLeaderboard(refreshedDaily);
        setAllTimeLeaderboard(refreshedAllTime);
        setAccuracyLeaderboard(refreshedAcc);
        setTourneyLeaderboard(refreshedTourney);
        
        // Update server result state
        setServerRankResult({
          rankStatus: res.rankStatus,
          rank: res.rank
        });

        // Strictly Gate UI: If rankStatus === 'NONE', transition to results immediately
        if (res.rankStatus === 'NONE') {
          setQualifiesForLeaderboard(false);
          setToastMessage('Score Submitted');
        } else {
          // Keep the form open (as a "Rank Claimed" view) or just update the message
          if (res.rankStatus === 'NEW_LEADER') setToastMessage('NEW #1 OVERALL!');
          else if (res.rankStatus === 'STILL_LEADER') setToastMessage('STILL #1.');
          else if (res.rankStatus === 'TOP_TEN') setToastMessage('TOP 10 SCORE!');
          else setToastMessage('Personal Best!');
        }
        
        if (res.rankStatus !== 'NONE') setIsNewPersonalBest(true); 
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

  const startNextRound = useCallback(async () => {
    const nextRound = tournamentRoundRef.current + 1;
    const nextTarget = targetScoreRef.current + 100;
    
    setTournamentRound(nextRound);
    setTargetScore(nextTarget);
    setTournamentOverlay('none');
    
    setPuzzle(null);
    const newPuzzle = await getTournamentPuzzle(nextTarget);
    setPuzzle(newPuzzle);
    
    // Hardcode Tournament time per round to 2m 30s
    const timeLimit = 150; 
    setTimeLeft(timeLimit);
    setEndTime(Date.now() + timeLimit * 1000);
    
    setScore(0);
    setDisplayScore(0);
    setTimeBonus(0);
    setComboCount(0);
    setAccuracyStreak(0);
    
    setFoundWords([]);
    setFoundBonusWords([]);
    setWordsSubmitted(0);
    setShakeInput(false);
    setSuccessAnim({ active: false, word: [], type: 'base' });
    setBonusToast(null);
    setJuiceToast(null);
    setToastMessage(null);
    
    setInputState({
      currentInput: [],
      availableSlots: [...newPuzzle.sourceLetters]
    });
    
    isTransitioningRef.current = false;
    setIsTransitioning(false);
  }, []);

  const handleTournamentRoundPassed = useCallback(() => {
    setTournamentOverlay('passed');
    
    const t1 = setTimeout(() => {
      setTournamentOverlay('next');
    }, 1000);
    
    const t2 = setTimeout(() => {
      startNextRound();
    }, 2500);
    
    transitionTimeoutsRef.current.push(t1, t2);
  }, [startNextRound]);

  const totalTimeLimit = useMemo(() => {
    // Easy: 3:00, Normal: 2:30, Hard: 2:00
    return difficulty === 'easy' ? 180 : difficulty === 'hard' ? 120 : 150;
  }, [difficulty]);
  const startNewGame = useCallback(async (diff?: Difficulty, isDaily?: boolean, isTournament?: boolean) => {
    initWebAudio();
    const activeDiff = diff || difficulty;
    setDifficulty(activeDiff);
    setIsDailyMode(!!isDaily);
    setIsTournamentMode(!!isTournament);
    
    // Easy: 3:00 | Normal: 2:30 | Hard: 2:00
    const timeLimit = activeDiff === 'easy' ? 180 : activeDiff === 'hard' ? 120 : 150;

    setPuzzle(null); // Clear old puzzle to show loading or just prevent race
    let newPuzzle;
    
    if (isTournament) {
       setTournamentRound(1);
       setTargetScore(400);
       setTournamentOverlay('none');
       isTransitioningRef.current = false;
       setIsTransitioning(false);
       newPuzzle = await getTournamentPuzzle(400);
    } else if (isDaily) {
       newPuzzle = await getDailyGamePuzzle();
    } else {
       newPuzzle = await getGamePuzzle(activeDiff);
    }
    
    setPuzzle(newPuzzle);
    setTimeLeft(timeLimit);
    setEndTime(Date.now() + timeLimit * 1000);
    setScore(0);
    setDisplayScore(0);
    setTimeBonus(0);
    setComboCount(0);
    setAccuracyStreak(0);
    setWordRarities({});
    
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
      freezeTimeoutRef.current = null;
    }
    setIsTimeFrozen(false);
    
    setFoundWords([]);
    setFoundBonusWords([]);
    setWordsSubmitted(0);
    setGameOver(false);
    setShowWelcome(false);
    endGameProcessedRef.current = false;
    setShakeInput(false);
    setSuccessAnim({ active: false, word: [], type: 'base' });
    setBonusToast(null);
    setJuiceToast(null);
    setToastMessage(null);
    setIsNewPersonalBest(false);
    setServerRankResult(null);
    
    setInputState({
      currentInput: [],
      availableSlots: [...newPuzzle.sourceLetters]
    });
    
    // The Cut-off: Handled elegantly by the Room-Based Music Logic Effect
    // Safety fallback: if they bypassed the gate somehow, init audio on first game start
    if (!isAudioEnabled) initializeAudio();
  }, [difficulty, isAudioEnabled, initializeAudio]);

  useEffect(() => {
    const saved = localStorage.getItem('pressedHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
    
    const loadedStats = loadStats();
    setStats(loadedStats);
    
    // Silent Background Catch-Up Sync (Legacy Data Sync)
    const handle = localStorage.getItem('last_used_handle');
    const pid = localStorage.getItem('pressed_player_id');
    if (handle && pid && ((loadedStats.highestTournamentRound || 0) > 0 || loadedStats.gamesWon >= 25)) {
      fetch('/api/sync-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: pid,
          name: handle,
          accuracyStats: {
            gamesWon: loadedStats.gamesWon,
            totalAccuracySum: loadedStats.totalAccuracySum || 0,
            gamesWithWordData: loadedStats.gamesWithWordData || 0
          },
          highestTournamentRound: loadedStats.highestTournamentRound || 0
        })
      }).catch(console.error);
    }
  }, []);

  // Active Refetch on Modal Open or Tab Switch
  useEffect(() => {
    if (showTrophyCase) {
      if (leaderboardTab === 'daily') getTopScores('daily').then(setDailyLeaderboard).catch(console.error);
      else if (leaderboardTab === 'champions') getTopScores('champions').then(setChampionsLeaderboard).catch(console.error);
      else if (leaderboardTab === 'alltime') getTopScores('alltime').then(setAllTimeLeaderboard).catch(console.error);
      else if (leaderboardTab === 'accuracy') getTopScores('accuracy').then(setAccuracyLeaderboard).catch(console.error);
      else if (leaderboardTab === 'tourney') getTopScores('tourney').then(setTourneyLeaderboard).catch(console.error);
    }
    // Welcome screen shows on mount, so we don't automatically trigger startNewGame
  }, []);

  useEffect(() => {
    if (!puzzle || gameOver || !endTime || showWelcome) return;

    const checkTime = () => {
      if (isTimeFrozen) return;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && !isTransitioningRef.current) {
        if (isTournamentModeRef.current) {
          if (scoreRef.current >= targetScoreRef.current) {
             isTransitioningRef.current = true;
             setIsTransitioning(true);
             handleTournamentRoundPassed();
          } else {
             endGame(false);
          }
        } else {
          const isWin = foundWordsRef.current.length === puzzle.validWords.length;
          endGame(isWin);
        }
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
      
      console.log(`Checking word: [${word}] | In Main: ${isMainWord} | In Bonus: ${isBonusWord}`);
      if (!isMainWord && !isBonusWord) {
        console.log('Bonus words list count:', puzzle.bonusWords?.length);
        console.log('Is LIED in bonus words?', puzzle.bonusWords?.includes('LIED'));
      }

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
    const winPct = stats.gamesPlayed > 0 ? `${Math.min(100, Math.round((stats.gamesWon / stats.gamesPlayed) * 100))}%` : '0%';
    // Average of per-game accuracy (not a cumulative ratio that shrinks with play)
    const globalAccuracy = stats.gamesWithWordData && stats.gamesWithWordData > 0
      ? `${Math.min(100, Math.round((stats.totalAccuracySum || 0) / stats.gamesWithWordData))}%`
      : '0%';
    const rankInfo = getTitle(stats.gamesWon);
    
    // Calculate progress as a percentage between current rank threshold and next rank threshold
    let progressPct = 100;
    if (rankInfo.next !== null) {
      const range = rankInfo.next - rankInfo.current;
      const progress = stats.gamesWon - rankInfo.current;
      progressPct = Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
    }

    return (
      <div className="fixed inset-0 bg-pink-50 flex flex-col items-center justify-center font-sans overflow-hidden pt-12 relative p-4">
        
        {/* Safe Area Top Navigation Header */}
        <div className="absolute top-0 w-full max-w-md px-4 flex justify-end items-center gap-3 z-50 pointer-events-auto" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <button 
            onPointerDown={() => setShowHowToPlay(true)}
            className="text-pink-600 bg-white border-2 border-pink-200 font-extrabold w-10 h-10 rounded-full shadow-sm active:scale-95 transition-all text-xl touch-manipulation flex items-center justify-center opacity-90 hover:bg-pink-50"
          >
            ❓
          </button>
          <button 
            onPointerDown={handleShareGame}
            className="text-pink-600 bg-white border-2 border-pink-200 font-extrabold w-10 h-10 rounded-full shadow-sm active:scale-95 transition-all text-lg touch-manipulation flex items-center justify-center opacity-90 hover:bg-pink-50"
          >
            🔗
          </button>
        </div>
        
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
                  <span className="font-extrabold text-pink-700 block mb-1">🕹️ Game Modes:</span>
                  <strong>Standard:</strong> Find as many anagrams as possible before time runs out. Easy: 3:00. Normal: 2:30. Hard: 2:00.<br/>
                  <strong>Tournament:</strong> Arcade Survival. Reach the target score before time runs out. The target increases by 100 points every round!
                </div>
                
                <div className="bg-orange-50 p-3 rounded-xl border border-orange-200 shadow-sm">
                  <span className="font-extrabold text-orange-600 block mb-1 flex items-center gap-2"><span className="animate-pulse">🔥</span> Apex Streak:</span>
                  Find 2 words within 5 seconds to trigger a 1.5x Multiplier. 5 words freezes the clock for 10s. 10 words reveals a free word! 11+ gives a 3x Multiplier!
                </div>

                <div className="bg-[#fff9e6] p-3 rounded-xl border border-[#d4af37] shadow-sm">
                  <span className="font-extrabold text-[#d4af37] block mb-2">🌟 The Trophy System:</span>
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center gap-2"><span className="text-lg">🏆</span> <span><strong>Gold Crown:</strong> Held by the #1 All-Time High Score player.</span></div>
                    <div className="flex items-center gap-2"><span className="text-lg">🥈</span> <span><strong>Silver Medal:</strong> Awarded to the winner of the Daily Trial (resets at 3 AM EST).</span></div>
                    <div className="flex items-center gap-2"><span className="text-lg">🎯</span> <span><strong>Sniper's Crosshair:</strong> Highest All-Time Accuracy (Must clear 25+ boards).</span></div>
                    <div className="flex items-center gap-2"><span className="text-lg">🛡️</span> <span><strong>Survivalist Shield:</strong> Player who has survived the most Tournament rounds.</span></div>
                  </div>
                </div>

                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-sm">
                  <span className="font-extrabold text-emerald-600 block mb-1">🏅 Player Ranks:</span>
                  Clear the board to rise from Novice all the way to Apex Legend!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trophy Case Modal */}
        {showTrophyCase && (
          <div className="absolute inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-gradient-to-br from-slate-900 to-black border-4 border-[#d4af37] rounded-3xl p-6 shadow-2xl animate-[slideUp_0.3s_ease-out] flex flex-col h-auto max-h-[90vh]">
              <div className="flex justify-between items-center border-b-2 border-[#d4af37] pb-3 mb-4">
                <h2 className="text-xl sm:text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600 tracking-tighter uppercase flex items-center gap-2">
                  <span className="text-3xl font-normal drop-shadow-sm">🏆</span> TROPHY CASE
                </h2>
                <button onPointerDown={() => setShowTrophyCase(false)} className="text-yellow-600 font-black text-xl w-8 h-8 rounded-full bg-yellow-900/40 flex items-center justify-center active:bg-yellow-800 transition-colors touch-manipulation pb-1">✕</button>
              </div>
              
              <div className="flex bg-slate-800 border border-slate-700 p-1 rounded-xl mb-4 gap-1 overflow-x-auto hide-scrollbar">
                 <button 
                   onPointerDown={() => setLeaderboardTab('daily')}
                   className={`flex-none w-[70px] sm:flex-1 flex flex-col items-center py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all touch-manipulation ${leaderboardTab === 'daily' ? 'bg-gradient-to-b from-slate-600 to-slate-700 text-white shadow-inner border border-slate-500' : 'text-slate-400 opacity-70'}`}
                 >
                   <span className="text-lg mb-1 leading-none drop-shadow-md">⏱️</span>
                   Today's
                 </button>
                 <button 
                   onPointerDown={() => setLeaderboardTab('champions')}
                   className={`flex-none w-[70px] sm:flex-1 flex flex-col items-center py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all touch-manipulation ${leaderboardTab === 'champions' ? 'bg-gradient-to-b from-slate-600 to-slate-700 text-white shadow-inner border border-slate-500' : 'text-slate-400 opacity-70'}`}
                 >
                   <span className="text-lg mb-1 leading-none drop-shadow-md">🥈</span>
                   Champions
                 </button>
                 <button 
                   onPointerDown={() => setLeaderboardTab('alltime')}
                   className={`flex-none w-[70px] sm:flex-1 flex flex-col items-center py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all touch-manipulation ${leaderboardTab === 'alltime' ? 'bg-gradient-to-b from-yellow-700 to-yellow-900 text-white shadow-inner border border-yellow-600' : 'text-slate-400 opacity-70'}`}
                 >
                   <span className="text-lg mb-1 leading-none drop-shadow-md">🏆</span>
                   Hall of Fame
                 </button>
                 <button 
                   onPointerDown={() => setLeaderboardTab('accuracy')}
                   className={`flex-none w-[70px] sm:flex-1 flex flex-col items-center py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all touch-manipulation ${leaderboardTab === 'accuracy' ? 'bg-gradient-to-b from-blue-700 to-blue-900 text-white shadow-inner border border-blue-600' : 'text-slate-400 opacity-70'}`}
                 >
                   <span className="text-lg mb-1 leading-none drop-shadow-md">🎯</span>
                   Sniper
                 </button>
                 <button 
                   onPointerDown={() => setLeaderboardTab('tourney')}
                   className={`flex-none w-[70px] sm:flex-1 flex flex-col items-center py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg transition-all touch-manipulation ${leaderboardTab === 'tourney' ? 'bg-gradient-to-b from-emerald-700 to-emerald-900 text-white shadow-inner border border-emerald-600' : 'text-slate-400 opacity-70'}`}
                 >
                   <span className="text-lg mb-1 leading-none drop-shadow-md">🛡️</span>
                   Survivalist
                 </button>
              </div>

              <div className="flex-1 overflow-y-auto w-full px-2 py-1 flex flex-col gap-2 min-h-[150px]">
                {leaderboardTab === 'daily' && dailyLeaderboard.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">No records found for Today's Board.</p>}
                {leaderboardTab === 'champions' && championsLeaderboard.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">No records found for Champions.</p>}
                {leaderboardTab === 'alltime' && allTimeLeaderboard.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">No records found for Hall of Fame.</p>}
                {leaderboardTab === 'accuracy' && accuracyLeaderboard.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">No records found for Sniper's Nest.</p>}
                {leaderboardTab === 'tourney' && tourneyLeaderboard.length === 0 && <p className="text-center text-slate-500 font-bold py-8 text-xs">No records found for Survivalists.</p>}
                
                {(leaderboardTab === 'daily' ? dailyLeaderboard : leaderboardTab === 'champions' ? championsLeaderboard : leaderboardTab === 'accuracy' ? accuracyLeaderboard : leaderboardTab === 'tourney' ? tourneyLeaderboard : allTimeLeaderboard).map((entry, idx) => (
                  <div key={idx} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center py-2 border-b border-slate-800 last:border-0 w-full">
                    <span className={`font-black italic w-6 text-center ${idx === 0 ? 'text-[#d4af37] text-lg drop-shadow-md' : idx === 1 ? 'text-gray-400 text-md' : idx === 2 ? 'text-amber-700 text-md' : 'text-slate-600 text-xs'}`}>
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                      {entry.isGold && <span className="text-[12px] leading-none drop-shadow-sm truncate flex-shrink-0" title="All-Time Apex Leader">🏆</span>}
                      {entry.silverWins ? <span className="text-[10px] font-black text-slate-800 bg-slate-300 rounded px-[2px] flex items-center shadow-sm border border-slate-400 truncate flex-shrink-0" title="Daily Trial Champion">🥈<span className="text-[8px] ml-[1px]">x{entry.silverWins}</span></span> : null}
                      {entry.isSniper && <span className="text-[12px] leading-none drop-shadow-sm truncate flex-shrink-0" title="Highest Accuracy">🎯</span>}
                      {entry.isSurvivalist && <span className="text-[12px] leading-none drop-shadow-sm truncate flex-shrink-0" title="Highest Tournament Round">🛡️</span>}
                      <span className="font-extrabold text-slate-300 tracking-wider uppercase text-xs truncate">{entry.name}</span>
                    </div>
                    <span className="font-mono font-bold text-sm text-[#d4af37] flex-shrink-0 text-right tracking-widest leading-none mt-1">
                      {leaderboardTab === 'accuracy' ? `${entry.score}%` : (leaderboardTab === 'tourney' ? `R${entry.score}` : entry.score.toLocaleString())}
                    </span>
                  </div>
                ))}
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
                  <p className="text-pink-900 font-bold mb-1 flex items-center justify-center gap-1 flex-wrap">
                    {userTrophies?.isGold && <span className="text-xl leading-none drop-shadow-sm cursor-help" title="All-Time Apex Leader">🏆</span>}
                    {userTrophies?.silverWins ? <span className="text-xs font-black text-slate-600 bg-slate-100 rounded px-1 flex items-center shadow-sm border border-slate-300 cursor-help" title="Daily Trial Champion"><span className="text-sm drop-shadow-sm">🥈</span><span className="text-[9px] ml-[2px]">x{userTrophies.silverWins}</span></span> : null}
                    {userTrophies?.isSniper && <span className="text-xl leading-none drop-shadow-sm cursor-help" title="Sniper's Nest (Accuracy Leader)">🎯</span>}
                    {userTrophies?.isSurvivalist && <span className="text-xl leading-none drop-shadow-sm cursor-help" title="Survivalist Leader (Tourney)">🛡️</span>}
                    <span className="ml-1 justify-self-center w-full mt-1">Welcome Back, {playerName || 'Player'}!</span>
                  </p>
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
                onPointerDown={(e) => { e.preventDefault(); initializeAudio(); }} 
                className="w-full bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-3 rounded shadow-md active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-lg tracking-widest select-none touch-manipulation"
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
            
            <div className="w-full flex flex-col items-center border border-pink-200 bg-pink-50 rounded-lg p-3 shadow-inner mb-2 relative mt-4">
             <div className="absolute -top-4 bg-white px-3 py-1 rounded-full border border-pink-200 shadow-sm flex items-center gap-1.5 z-20">
               {userTrophies?.isGold && <span className="text-lg leading-none drop-shadow-sm cursor-help" title="All-Time Apex Leader">🏆</span>}
               {userTrophies?.silverWins ? <span className="text-[10px] font-black text-slate-600 bg-slate-100 rounded px-1 flex items-center shadow-sm border border-slate-300 cursor-help" title="Daily Trial Champion"><span className="text-[14px] drop-shadow-sm">🥈</span><span className="text-[9px] ml-[1px]">x{userTrophies.silverWins}</span></span> : null}
               {userTrophies?.isSniper && <span className="text-lg leading-none drop-shadow-sm cursor-help" title="Sniper's Nest (Accuracy Leader)">🎯</span>}
               {userTrophies?.isSurvivalist && <span className="text-lg leading-none drop-shadow-sm cursor-help" title="Survivalist Leader (Tourney)">🛡️</span>}
               <span className="text-xs font-black text-pink-900 uppercase tracking-widest ml-1">{playerName || 'PLAYER'}</span>
             </div>
             <span className="text-[10px] text-pink-600 font-bold uppercase tracking-widest mb-1 mt-1">Rank</span>
             <span className="text-xl font-black text-[#d4af37] drop-shadow-sm uppercase">{rankInfo.title}</span>
             {rankInfo.next ? (
               <div 
                 className="w-full mt-2 cursor-help" 
                 title={`${rankInfo.next - stats.gamesWon} more clears to reach ${getTitle(rankInfo.next).title}!`}
               >
                 <div className="flex justify-between text-[10px] text-pink-700 font-bold mb-1">
                   <span>{rankInfo.current} Clears</span>
                   <span>{rankInfo.next} Clears</span>
                 </div>
                 <div className="w-full bg-pink-200 rounded-full h-2.5 mb-1">
                   <div className="bg-[#d4af37] h-2.5 rounded-full shadow-sm transition-all duration-500" style={{ width: `${progressPct}%` }}></div>
                 </div>
                 <div className="text-[9px] text-[#d4af37] text-right font-black uppercase tracking-wider opacity-90">
                   Progress to {getTitle(rankInfo.next).title}
                 </div>
               </div>
             ) : (
                <div className="text-xs text-[#d4af37] font-bold mt-1">MAX RANK SECURED</div>
              )}
            </div>
            
            <div className="w-full bg-pink-50 rounded-xl p-4 flex gap-[2px] justify-between border border-pink-100 shadow-inner">
            <div className="flex flex-col items-center flex-1">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Win %</span>
              <span className="text-pink-900 text-2xl font-mono">{winPct}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Accuracy</span>
              <span className="text-pink-900 text-2xl font-mono">{globalAccuracy}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1">Best Score</span>
              <span className="text-pink-900 text-2xl font-mono">{stats.highScore}</span>
            </div>
            <div className="flex flex-col items-center flex-[1.2] border-l border-pink-200">
              <span className="text-pink-600 text-[10px] font-bold uppercase tracking-wider mb-1 text-center leading-none">Tourney<br/>Round</span>
              <span className="text-pink-900 text-2xl font-mono">{stats.highestTournamentRound || 0}</span>
            </div>
          </div>
            <div className="flex flex-col gap-2 w-full mt-1">
              <button 
                onPointerDown={() => setShowTrophyCase(true)} 
                className="w-full bg-white border-2 border-[#d4af37] text-yellow-700 font-extrabold py-3 rounded-xl shadow-sm active:bg-yellow-50 transition-all text-sm tracking-widest select-none touch-manipulation flex items-center justify-center gap-2 mb-1"
              >
                <span className="text-xl drop-shadow-sm">🏆</span> TROPHY CASE & LEADERBOARDS
              </button>
              <button onPointerDown={(e) => { e.preventDefault(); startNewGame('normal', false, true); }} className="bg-slate-800 border-b-4 border-r-2 border-slate-900 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mt-1">PLAY TOURNAMENT <span className="text-cyan-400 block text-xs tracking-normal mt-1 opacity-90">(Arcade Survival)</span></button>
              <button onPointerDown={(e) => { e.preventDefault(); startNewGame('normal', true); }} className="bg-purple-500 border-b-4 border-r-2 border-purple-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mt-1">DAILY CHALLENGE <span className="text-purple-100 block text-xs tracking-normal mt-1 opacity-80">(Everyone plays the same board)</span></button>
              <button onPointerDown={(e) => { e.preventDefault(); startNewGame('easy'); }} className="bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mb-1">PLAY EASY <span className="text-yellow-800 block text-xs tracking-normal mt-1 opacity-80">(3m + Hint)</span></button>
              <button onPointerDown={(e) => { e.preventDefault(); startNewGame('normal'); }} className="bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 border-b-4 border-r-2 border-yellow-700 font-extrabold text-yellow-900 py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mb-1">PLAY NORMAL <span className="text-yellow-800 block text-xs tracking-normal mt-1 opacity-80">(2m 30s)</span></button>
              <button onPointerDown={(e) => { e.preventDefault(); startNewGame('hard'); }} className="bg-red-500 border-b-4 border-r-2 border-red-700 font-extrabold text-white py-3 rounded shadow-sm active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation mb-1">PLAY HARD <span className="text-red-100 block text-xs tracking-normal mt-1 opacity-80">(2m + 1.5x Pts)</span></button>
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

      {/* Street Fighter Tournament Transition Overlay */}
      {tournamentOverlay !== 'none' && (
        <div className="absolute inset-0 z-[300] bg-zinc-900 flex flex-col items-center justify-center animate-[fadeIn_0.2s_ease-out]">
          <span className="text-6xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] filter drop-shadow-xl animate-bounce" style={{ WebkitTextStroke: '3px #7c2d12' }}>
            {tournamentOverlay === 'passed' ? 'ROUND PASSED!' : `ROUND ${tournamentRound + 1}... FIGHT!`}
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
            {isTournamentModeRef.current && (
              <div className="absolute -top-6 text-center w-full">
                <span className="text-[10px] text-pink-500 font-bold uppercase tracking-widest leading-none">Target: <span className="text-[#d4af37] text-xs font-black">{targetScoreRef.current}</span></span>
              </div>
            )}
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
            <div className="text-[10px] sm:text-xs text-[#d4af37] font-bold bg-white/60 py-2 px-3 rounded border border-pink-200 shadow-sm break-words leading-relaxed flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-pink-600 mr-1 uppercase">Bonus:</span> 
              {foundBonusWords.map(w => {
                const upper = w.toUpperCase();
                const rarity = wordRarities[upper];
                const isApex = !isDailyMode && rarity !== undefined && rarity < 0.05;
                const isRare = !isDailyMode && rarity !== undefined && rarity < 0.10 && !isApex;
                
                return (
                  <span key={w} className="flex items-center gap-1">
                    {upper}
                    {isApex && <span className="text-[8px] bg-purple-500 text-white px-1 rounded-sm leading-tight animate-pulse">APEX</span>}
                    {isRare && <span className="text-[8px] bg-indigo-500 text-white px-1 rounded-sm leading-tight">RARE</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 w-full px-4 py-2 mt-2 overflow-y-auto w-full max-w-sm self-center">
          <div className="flex flex-row justify-around w-full gap-2 sm:gap-4 pb-4">
            {Object.entries(groupedWords).map(([len, words]) => (
              <div key={len} className="flex flex-col gap-y-2 text-center">
                {words.map((word, idx) => {
                  const isFound = foundWords.includes(word);
                  const isMissed = gameOver && !isFound && !isDailyMode;
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
                {(serverRankResult?.rankStatus === 'PERSONAL_BEST' || (isNewPersonalBest && !serverRankResult)) && (
                  <div className="absolute -top-4 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg border-2 border-white animate-bounce z-50 tracking-widest">
                    PERSONAL BEST!
                  </div>
                )}
                <div className="text-4xl animate-bounce drop-shadow-sm">🏆</div>
                <h2 className={`text-3xl sm:text-4xl font-black tracking-tighter italic uppercase drop-shadow-sm leading-tight ${serverRankResult?.rankStatus === 'NEW_LEADER' ? 'text-yellow-600 animate-[pulse_0.5s_ease-in-out_infinite] scale-110' : serverRankResult?.rankStatus === 'STILL_LEADER' ? 'text-red-700 scale-105' : 'text-yellow-900'}`}>
                  {serverRankResult?.rankStatus === 'NEW_LEADER' ? 'NEW #1 OVERALL!' : serverRankResult?.rankStatus === 'STILL_LEADER' ? 'STILL #1.' : serverRankResult?.rankStatus === 'TOP_TEN' ? 'TOP 10 SCORE!' : (serverRankResult?.rankStatus === 'PERSONAL_BEST' ? 'PERSONAL BEST!' : 'APEX PERFORMANCE!')}
                </h2>
                
                {serverRankResult ? (
                  <p className="text-yellow-800 font-bold text-sm bg-white/50 px-4 py-2 rounded-lg border border-yellow-300 w-full animate-pulse">
                    VERIFIED RANK: #{serverRankResult.rank}<br/>
                    <span className="font-mono text-2xl text-yellow-900 drop-shadow-sm">{score}</span>
                  </p>
                ) : (
                  <p className="text-yellow-800 font-bold text-sm bg-white/50 px-4 py-2 rounded-lg border border-yellow-300 w-full">
                    Potential Top 10 detected! <br/>
                    <span className="font-mono text-2xl text-yellow-900 drop-shadow-sm">{score}</span>
                  </p>
                )}

                {!serverRankResult && (
                  <>
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
                      {isSubmittingScore ? 'VERIFYING...' : hasSubmissionError ? 'RETRY SUBMISSION' : 'CLAIM RANK'}
                    </button>
                  </>
                )}

                {serverRankResult && (
                  <button 
                    onPointerDown={() => setQualifiesForLeaderboard(false)}
                    className="w-full bg-yellow-900 text-white font-extrabold py-4 rounded-xl shadow-md active:translate-y-[4px] transition-all tracking-widest text-lg touch-manipulation"
                  >
                    VIEW SUMMARY
                  </button>
                )}

                <button 
                  onPointerDown={() => setQualifiesForLeaderboard(false)}
                  className="text-yellow-700 text-xs font-bold uppercase tracking-widest mt-1 underline opacity-80 active:opacity-100 touch-manipulation p-2"
                >
                  {serverRankResult ? 'Done' : 'Skip'}
                </button>
             </div>
           ) : (
              <div className="w-full flex flex-col items-center gap-4 bg-white/90 p-6 rounded-xl border border-pink-300 shadow-2xl animate-[slideUp_0.3s_ease-out] z-40 relative">
                {(serverRankResult?.rankStatus === 'PERSONAL_BEST' || (isNewPersonalBest && !serverRankResult)) && (
                  <div className="absolute -top-4 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg border-2 border-white animate-bounce z-50 tracking-widest">
                    PERSONAL BEST!
                  </div>
                )}
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
                    {!isDailyMode && (
                      <span className="text-pink-900 text-sm font-bold opacity-80">You missed {puzzle.validWords.length - foundWords.length} words</span>
                    )}
                    {isDailyMode && (
                      <span className="text-pink-900 text-sm font-bold opacity-80 italic">Solutions hidden for Daily Trial</span>
                    )}
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
                        {wordsSubmitted > 0 ? `${Math.min(100, Math.round(((foundWords.length + foundBonusWords.length) / wordsSubmitted) * 100))}%` : '0%'}
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

                {/* Rare Finds Section (Non-Daily) */}
                {!isDailyMode && Object.keys(wordRarities).length > 0 && (
                  <div className="w-full flex flex-col gap-2 bg-purple-50 p-3 rounded-lg border border-purple-100 mt-1">
                    <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest text-center">Notable Performance</span>
                    <div className="flex flex-wrap justify-center gap-2">
                       {Object.entries(wordRarities)
                         .filter(([_, r]) => r < 0.10)
                         .map(([word, r]) => (
                           <div key={word} className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200 shadow-sm">
                             <span className="text-xs font-bold text-purple-900 uppercase">{word}</span>
                             <span className={`text-[8px] px-1 rounded-sm text-white font-black ${r < 0.05 ? 'bg-purple-500 animate-pulse' : 'bg-indigo-500'}`}>
                               {r < 0.05 ? 'APEX' : 'RARE'}
                             </span>
                           </div>
                         ))
                       }
                       {Object.entries(wordRarities).filter(([_, r]) => r < 0.10).length === 0 && (
                         <span className="text-[10px] text-purple-400 font-bold italic">No rare words found this session.</span>
                       )}
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

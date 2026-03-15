"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Puzzle, getRandomPuzzle } from "@/lib/puzzles";
import { PlayerStats, loadStats, recordGameResult } from "@/lib/stats";

// Retro font via Next/Google fonts is possible but for simplicity and guaranteeing zero-config, we'll use system fonts that look digital
// We'll rely on Tailwind utility classes and some custom inline styles if needed for the digital LED look.

export default function GameBoard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [timeLeft, setTimeLeft] = useState(150);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundBonusWords, setFoundBonusWords] = useState<string[]>([]);
  
  const [difficulty, setDifficulty] = useState<'easy'|'normal'|'hard'>('normal');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

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
  const [successAnim, setSuccessAnim] = useState<{ active: boolean; word: string[] }>({ active: false, word: [] });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // We need to order the validWords by length, then alphabet so building the grid columns looks correct
  const sortedWords = useMemo(() => {
    if (!puzzle) return [];
    return [...puzzle.validWords].sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    });
  }, [puzzle]);

  const handleQuitGame = useCallback(() => {
    recordGameResult(false, score);
    setStats(loadStats());
    setGameOver(true);
    setShowWelcome(true);
    setShowQuitConfirm(false);
  }, [score]);

  const endGame = useCallback((won: boolean) => {
    if (gameOverRef.current) return;
    setGameOver(true);
    setScore(s => {
      const finalScore = s;
      setHighScore(h => {
        if (finalScore > h) {
          localStorage.setItem('pressedHighScore', finalScore.toString());
          return finalScore;
        }
        return h;
      });
      recordGameResult(won, finalScore);
      setStats(loadStats());
      return s;
    });
  }, []);

  const startNewGame = useCallback((diff?: 'easy'|'normal'|'hard') => {
    const activeDiff = diff || difficulty;
    setDifficulty(activeDiff);
    
    // Time based on difficulty
    const timeLimit = activeDiff === 'easy' ? 210 : activeDiff === 'hard' ? 90 : 150;

    const newPuzzle = getRandomPuzzle();
    setPuzzle(newPuzzle);
    setTimeLeft(timeLimit);
    setEndTime(Date.now() + timeLimit * 1000);
    setScore(0);
    setFoundWords([]);
    setFoundBonusWords([]);
    setInputState({
      currentInput: [],
      availableSlots: [...newPuzzle.sourceLetters]
    });
    setGameOver(false);
    setShowWelcome(false);
    setShakeInput(false);
    setSuccessAnim({ active: false, word: [] });
    setToastMessage(null);
  }, [difficulty]);

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
       setSuccessAnim({ active: false, word: [] });
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
    if (successAnim.active) setSuccessAnim({ active: false, word: [] });

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
    if (successAnim.active) setSuccessAnim({ active: false, word: [] });

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
        if (isMainWord) {
          setFoundWords(fw => {
            const next = [...fw, word];
            if (next.length === puzzle.validWords.length) {
              setTimeout(() => endGame(true), 600);
            }
            return next;
          });
        } else {
          setFoundBonusWords(fw => [...fw, word]);
        }
        
        const difficultyMultiplier = difficulty === 'hard' ? 1.5 : 1;
        setScore(s => s + Math.floor(word.length * 10 * difficultyMultiplier));
        
        const newSlots = [...prev.availableSlots];
        prev.currentInput.forEach(o => {
          newSlots[o.sourceIndex] = o.char;
        });
        
        // Trigger non-blocking visual success animation
        setSuccessAnim({ active: true, word: wordChars });
        setTimeout(() => {
          setSuccessAnim(curr => {
            // Only erase if another word wasn't typed immediately over top of it
            if (curr.word.join("") === word) return { active: false, word: [] };
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

  if (showWelcome && stats) {
    const winPct = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
    const avgScore = stats.gamesPlayed > 0 ? Math.round(stats.totalScore / stats.gamesPlayed) : 0;
    return (
      <div className="fixed inset-0 bg-[#0d148c] flex flex-col items-center justify-center font-sans p-4">
        <div className="bg-[#050942] p-6 sm:p-8 rounded-2xl border-2 border-white/20 w-full max-w-sm flex flex-col items-center gap-6 shadow-2xl">
          <h1 className="text-4xl font-extrabold text-[#e6de22] tracking-widest text-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">PRESSED</h1>
          <div className="w-full bg-[#00000050] rounded-xl p-4 flex gap-[2px] justify-between border border-white/10 shadow-inner">
            <div className="flex flex-col items-center flex-1">
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-wider mb-1">Streak</span>
              <span className="text-white text-3xl font-mono relative">{stats.currentStreak} <span className="absolute -right-5 top-0 text-orange-500 text-sm animate-pulse">🔥</span></span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-white/10">
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-wider mb-1">Win %</span>
              <span className="text-white text-3xl font-mono">{winPct}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-white/10">
              <span className="text-white/60 text-[10px] font-bold uppercase tracking-wider mb-1">Avg Score</span>
              <span className="text-white text-3xl font-mono">{avgScore}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full mt-2">
            <button onPointerDown={() => startNewGame('easy')} className="bg-green-600 border-b-4 border-r-2 border-green-800 font-extrabold text-white py-3 rounded active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY EASY <span className="text-green-200 block text-xs tracking-normal mt-1 opacity-80">(3m 30s + Hint)</span></button>
            <button onPointerDown={() => startNewGame('normal')} className="bg-blue-600 border-b-4 border-r-2 border-blue-800 font-extrabold text-white py-3 rounded active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY NORMAL <span className="text-blue-200 block text-xs tracking-normal mt-1 opacity-80">(2m 30s)</span></button>
            <button onPointerDown={() => startNewGame('hard')} className="bg-red-600 border-b-4 border-r-2 border-red-800 font-extrabold text-white py-3 rounded active:border-0 active:translate-y-[4px] active:translate-x-[2px] transition-all text-sm tracking-widest select-none touch-manipulation">PLAY HARD <span className="text-red-200 block text-xs tracking-normal mt-1 opacity-80">(1m 30s + 1.5x Pts)</span></button>
          </div>
        </div>
      </div>
    );
  }

  if (!puzzle) return null;

  return (
    <div className="fixed inset-0 bg-[#0d148c] flex flex-col items-center select-none font-sans overflow-hidden">
      
      {showQuitConfirm && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#050942] border-2 border-red-500/50 p-6 rounded-xl flex flex-col items-center text-center max-w-sm shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-[slideUp_0.2s_ease-out]">
            <h2 className="text-2xl font-bold text-red-500 mb-2 tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">ABANDON GAME?</h2>
            <p className="text-white/80 mb-6 text-sm font-semibold">Quitting now will count as a loss and reset your current streak. Are you sure?</p>
            <div className="flex gap-4 w-full">
              <button 
                onPointerDown={() => setShowQuitConfirm(false)}
                className="flex-1 bg-gray-600 border-b-4 border-gray-800 text-white font-bold py-3 rounded active:border-0 active:translate-y-[4px] transition-all touch-manipulation text-sm tracking-widest"
              >
                CANCEL
              </button>
              <button 
                onPointerDown={handleQuitGame}
                className="flex-1 bg-red-600 border-b-4 border-red-800 text-white font-bold py-3 rounded active:border-0 active:translate-y-[4px] transition-all touch-manipulation text-sm tracking-widest"
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
            className="absolute top-2 left-4 text-white/50 active:text-white text-[10px] font-bold tracking-widest bg-white/10 px-2 py-1 flex items-center gap-1 rounded border border-white/20 touch-manipulation"
          >
            <span className="text-red-400">✖</span> ABANDON
          </button>
          
          <div className="flex flex-col items-center mt-2">
            <span className="text-white text-xs font-bold mb-1">Score</span>
            <div className="bg-black border border-gray-600 px-2 py-1 min-w-[60px] text-right">
              <span className="text-red-600 font-mono text-xl tracking-widest">{score.toString()}</span>
            </div>
          </div>

          <div className="flex flex-col items-center pb-2">
            <div className="bg-black border-2 border-white/30 rounded-md px-3 py-1 mt-2">
              <span className={`font-mono text-3xl tracking-widest ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-white text-xs font-bold mb-1">High Score</span>
            <div className="bg-black border border-gray-600 px-2 py-1 min-w-[60px] text-right">
              <span className="text-red-600 font-mono text-xl tracking-widest">{highScore.toString()}</span>
            </div>
          </div>
          
        </div>

        {/* Toast Message */}
        {toastMessage && (
          <div className="absolute top-24 transform -translate-x-1/2 left-1/2 z-40 bg-black/80 text-white font-bold py-2 px-4 rounded-full border border-white/20 animate-[slideUp_0.2s_ease-out] shadow-lg pointer-events-none">
            {toastMessage}
          </div>
        )}

        {/* Bonus Words Indicator */}
        {foundBonusWords.length > 0 && (
          <div className="w-full px-4 mb-2">
            <div className="text-[10px] sm:text-xs text-green-400 font-bold bg-green-900/30 py-2 px-3 rounded border border-green-500/30 break-words leading-relaxed">
              <span className="text-white/60 mr-1 uppercase">Bonus:</span> 
              {foundBonusWords.map(w => w.toUpperCase()).join(", ")}
            </div>
          </div>
        )}

        <div className="flex-1 w-full px-4 py-2 mt-2 ml-2 overflow-y-auto">
          <div className="flex flex-row flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 content-start pb-4">
            {sortedWords.map((word, idx) => {
              const isFound = foundWords.includes(word);
              const isMissed = gameOver && !isFound;
              // Hint logic for easy
              const isBingoWord = word === puzzle.bingoWord;
              const isEasyHint = difficulty === 'easy' && isBingoWord && !isFound && !gameOver;

              return (
                <div key={idx} className="flex gap-[2px] mb-1">
                  {word.split('').map((char, i) => (
                    <div 
                      key={i} 
                      className={`w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] md:w-[26px] md:h-[26px] border flex items-center justify-center text-[10px] sm:text-xs font-bold ${
                        isFound 
                          ? 'bg-white border-gray-300 text-black' 
                          : isMissed
                          ? 'bg-red-900 border-red-700 text-red-200'
                          : isEasyHint && i === 0
                          ? 'bg-blue-900 border-blue-500 text-blue-200'
                          : 'bg-white border-gray-300 text-transparent'
                      }`}
                    >
                      {isFound || isMissed || (isEasyHint && i === 0) ? char.toUpperCase() : ''}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Input Area */}
         <div className="w-full mt-auto pb-8 pt-4 px-4 flex flex-col items-center gap-6 border-t border-white/10 select-none touch-none bg-[#0d148c]">
          
          {gameOver ? (
             <div className="w-full flex flex-col items-center gap-4 bg-black/50 p-6 rounded-xl border border-white/20 shadow-2xl animate-[slideUp_0.3s_ease-out]">
                {foundWords.length === puzzle.validWords.length ? (
                  <>
                    <h2 className="text-3xl font-extrabold text-green-400 tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">BOARD CLEARED!</h2>
                    <span className="text-white text-sm font-bold opacity-80">100% Mastery Achieved</span>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl font-bold text-orange-500 tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">TIME'S UP</h2>
                    <span className="text-white text-sm font-bold opacity-80">You missed {puzzle.validWords.length - foundWords.length} words</span>
                  </>
                )}
                
                <div className="flex gap-4 w-full mt-2">
                  <button 
                    onPointerDown={() => setShowWelcome(true)}
                    className="flex-1 bg-gray-600 border-b-4 border-r-2 border-gray-800 text-white font-extrabold py-3 px-4 rounded shadow-md active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                  >
                    MENU
                  </button>
                  <button 
                    onPointerDown={() => startNewGame()}
                    className="flex-[2] bg-[#e6de22] border-b-4 border-r-2 border-yellow-700 text-black font-extrabold py-3 px-4 rounded shadow-md active:border-0 active:translate-y-[4px] active:translate-x-[2px] text-sm tracking-wider select-none touch-manipulation transition-all"
                  >
                    PLAY AGAIN
                  </button>
                </div>
             </div>
          ) : (
            <>
              {/* Current Input Slots */}
              <div className={`flex justify-center gap-[4px] sm:gap-[6px] w-full h-12 sm:h-14 ${shakeInput ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                {Array.from({ length: 6 }).map((_, i) => {
                  // Determine if we should show the success animation char or the real active input char
                  const isSuccessActive = successAnim.active && inputState.currentInput.length === 0;
                  const charToShow = isSuccessActive ? successAnim.word[i] : inputState.currentInput[i]?.char || '';
                  const isActiveCell = isSuccessActive ? !!successAnim.word[i] : !!inputState.currentInput[i];
                  
                  return (
                    <div 
                      key={`input-${i}`} 
                      className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-3xl font-bold rounded-sm select-none touch-none transition-all duration-75 ${
                        isActiveCell && !isSuccessActive
                          ? 'bg-white text-[#4a1c22] border-gray-300 shadow-md' 
                          : isActiveCell && isSuccessActive
                          ? 'bg-green-100 border-green-400 text-green-900 ring-4 ring-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-105'
                          : 'bg-white border-gray-300 text-transparent'
                      }`}
                    >
                      {charToShow}
                    </div>
                  )
                })}
              </div>

              {/* Source Letters */}
              <div className="flex justify-center gap-[4px] sm:gap-[6px] w-full mt-2 h-[52px] sm:h-[60px]">
                {inputState.availableSlots.map((char, i) => {
                  return char ? (
                    <button
                      key={`avail-${i}-${char}`}
                      onPointerDown={(e) => handleLetterClick(char, i, e)}
                      className="w-[52px] h-[52px] sm:w-[60px] sm:h-[60px] bg-[#e6e6e6] border-b-4 border-r-2 border-[#b0b0b0] text-[#4a1c22] flex items-center justify-center text-3xl sm:text-4xl font-extrabold rounded shadow-md active:translate-y-[4px] active:border-b-0 active:border-r-0 active:mt-[4px] touch-manipulation select-none"
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
                  className="flex-1 bg-[#d8db14] border-2 border-black text-black font-extrabold rounded shadow-[0_3px_0_rgba(0,0,0,0.5)] active:translate-y-[3px] active:shadow-none text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  MIX
                </button>
                <button 
                  onPointerDown={handleEnter}
                  className="flex-1 bg-[#d8db14] border-2 border-black text-black font-extrabold rounded shadow-[0_3px_0_rgba(0,0,0,0.5)] active:translate-y-[3px] active:shadow-none text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  ENTER
                </button>
                <button 
                  onPointerDown={handleUndo}
                  className="flex-1 bg-[#d8db14] border-2 border-black text-black font-extrabold rounded shadow-[0_3px_0_rgba(0,0,0,0.5)] active:translate-y-[3px] active:shadow-none text-base sm:text-lg tracking-wider touch-none select-none"
                >
                  UNDO
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Puzzle, getRandomPuzzle } from "@/lib/puzzles";

// Retro font via Next/Google fonts is possible but for simplicity and guaranteeing zero-config, we'll use system fonts that look digital
// We'll rely on Tailwind utility classes and some custom inline styles if needed for the digital LED look.

export default function GameBoard() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [timeLeft, setTimeLeft] = useState(150);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  
  const [inputState, setInputState] = useState<{
    currentInput: { char: string; sourceIndex: number }[];
    availableSlots: (string | null)[];
  }>({ currentInput: [], availableSlots: [] });

  const [gameOver, setGameOver] = useState(false);
  const [shakeInput, setShakeInput] = useState(false);

  // We need to order the validWords by length, then alphabet so building the grid columns looks correct
  const sortedWords = useMemo(() => {
    if (!puzzle) return [];
    return [...puzzle.validWords].sort((a, b) => {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    });
  }, [puzzle]);

  const startNewGame = useCallback(() => {
    const newPuzzle = getRandomPuzzle();
    setPuzzle(newPuzzle);
    setTimeLeft(150);
    setScore(0);
    setFoundWords([]);
    setInputState({
      currentInput: [],
      availableSlots: [...newPuzzle.sourceLetters]
    });
    setGameOver(false);
    setShakeInput(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('pressedHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
    startNewGame();
  }, [startNewGame]);

  useEffect(() => {
    if (!puzzle || gameOver) return;
    if (timeLeft <= 0) {
      setGameOver(true);
      setScore(s => {
        let finalScore = s;
        setHighScore(h => {
          if (finalScore > h) {
            localStorage.setItem('pressedHighScore', finalScore.toString());
            return finalScore;
          }
          return h;
        });
        return s;
      });
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, gameOver, puzzle]);

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
      const word = prev.currentInput.map(o => o.char).join("");
      
      if (puzzle.validWords.includes(word) && !foundWords.includes(word)) {
        setFoundWords(fw => [...fw, word]);
        setScore(s => s + (word.length * 10));
        
        const newSlots = [...prev.availableSlots];
        prev.currentInput.forEach(o => {
          newSlots[o.sourceIndex] = o.char;
        });
        
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

  if (!puzzle) return null;

  return (
    <div className="fixed inset-0 bg-[#0d148c] flex flex-col items-center select-none font-sans overflow-hidden">
      
      <div className="w-full max-w-md h-full flex flex-col">
        {/* Top Bar / Scoreboard */}
        <div className="px-4 pt-6 pb-2 flex justify-between items-end">
          
          <div className="flex flex-col items-center">
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

        <div className="flex-1 w-full px-4 py-2 mt-4 ml-2 max-h-[50vh]">
          <div className="flex flex-col flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 h-[280px] sm:h-[350px] content-start">
            {sortedWords.map((word, idx) => {
              const isFound = foundWords.includes(word);
              const isMissed = gameOver && !isFound;
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
                          : 'bg-white border-gray-300 text-transparent'
                      }`}
                    >
                      {isFound || isMissed ? char.toUpperCase() : ''}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Input Area */}
         <div className="w-full mt-auto pb-8 px-4 flex flex-col items-center gap-6 select-none touch-none">
          
          {gameOver ? (
             <div className="w-full flex flex-col items-center gap-4 bg-black/20 p-4 rounded-xl border border-white/10 animate-[slideUp_0.3s_ease-out]">
                <h2 className="text-3xl font-bold text-orange-500 tracking-widest">TIME'S UP</h2>
                <button 
                  onPointerDown={startNewGame}
                  className="w-full max-w-[200px] bg-[#e6de22] border-2 border-black text-black font-extrabold py-3 px-6 rounded shadow-[0_3px_0_rgba(0,0,0,0.5)] active:translate-y-[3px] active:shadow-none text-lg select-none touch-manipulation"
                >
                  PLAY AGAIN
                </button>
             </div>
          ) : (
            <>
              {/* Current Input Slots */}
              <div className={`flex justify-center gap-[4px] sm:gap-[6px] w-full h-12 sm:h-14 ${shakeInput ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div 
                    key={`input-${i}`} 
                    className={`w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-3xl font-bold rounded-sm select-none touch-none ${
                      inputState.currentInput[i] 
                        ? 'bg-white text-[#4a1c22] border-gray-300 shadow-md' 
                        : 'bg-white border-gray-300 text-transparent'
                    }`}
                  >
                    {inputState.currentInput[i]?.char || ''}
                  </div>
                ))}
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

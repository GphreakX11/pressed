"use client";

import { useState, useEffect } from "react";

const INITIAL_LETTERS = ["N", "R", "U", "I", "F", "A"];
const LEVEL_WORDS = [
  "FAN", "FAR", "FIN", "FIR", "FUN", "FUR", "RAN", "RUN", "URN",
  "FAIR", "RAIN", "RUIN",
  "FURAN",
  "UNFAIR"
];

// Group by length
const wordsByLength: Record<number, string[]> = {
  3: [],
  4: [],
  5: [],
  6: [],
};
LEVEL_WORDS.forEach(w => {
  if (wordsByLength[w.length]) {
    wordsByLength[w.length].push(w);
  }
});

type LetterObj = {
  char: string;
  sourceIndex: number;
};

export default function GameBoard() {
  const [timeLeft, setTimeLeft] = useState(150);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  
  const [currentInput, setCurrentInput] = useState<LetterObj[]>([]);
  const [availableSlots, setAvailableSlots] = useState<(string | null)[]>([...INITIAL_LETTERS]);
  const [gameOver, setGameOver] = useState(false);
  const [shakeInput, setShakeInput] = useState(false);

  useEffect(() => {
    // load high score
    const saved = localStorage.getItem('pressedHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      setGameOver(true);
      if (score > highScore) {
        setHighScore(score);
        localStorage.setItem('pressedHighScore', score.toString());
      }
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, score, highScore]);

  const formatTime = (seconds: number) => {
    if (seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleLetterClick = (char: string, index: number) => {
    if (gameOver) return;
    const newSlots = [...availableSlots];
    newSlots[index] = null;
    setAvailableSlots(newSlots);
    setCurrentInput([...currentInput, { char, sourceIndex: index }]);
  };

  const handleUndo = () => {
    if (gameOver || currentInput.length === 0) return;
    const newInput = [...currentInput];
    const letterObj = newInput.pop()!;
    setCurrentInput(newInput);
    
    const newSlots = [...availableSlots];
    newSlots[letterObj.sourceIndex] = letterObj.char;
    setAvailableSlots(newSlots);
  };

  const handleMix = () => {
    if (gameOver) return;
    const remaining = availableSlots.filter(c => c !== null) as string[];
    remaining.sort(() => Math.random() - 0.5);
    
    const newSlots = [...availableSlots];
    let rIndex = 0;
    for (let i = 0; i < newSlots.length; i++) {
        if (newSlots[i] !== null) {
           newSlots[i] = remaining[rIndex++];
        }
    }
    setAvailableSlots(newSlots);
  };

  const handleEnter = () => {
    if (gameOver || currentInput.length === 0) return;
    const word = currentInput.map(o => o.char).join("");
    
    if (LEVEL_WORDS.includes(word) && !foundWords.includes(word)) {
      setFoundWords([...foundWords, word]);
      setScore(s => s + (word.length * 10));
      // Restore pool
      const newSlots = [...availableSlots];
      currentInput.forEach(o => {
        newSlots[o.sourceIndex] = o.char;
      });
      setAvailableSlots(newSlots);
      setCurrentInput([]);
    } else {
      // Invalid word or already found
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 400);
      
      // Auto undo all letters on invalid/already found, taking them back to pool
      // Wait, in real TextTwist usually invalid words do this, or they just flash and you have to manually undo.
      // Let's manually undo them to the pool after the shake.
      setTimeout(() => {
        const newSlots = [...availableSlots];
        currentInput.forEach(o => {
          newSlots[o.sourceIndex] = o.char;
        });
        setAvailableSlots(newSlots);
        setCurrentInput([]);
      }, 400);
    }
  };

  // Keyboard support could be cool, but prompt didn't explicitly ask for it. Let's keep it simple first.

  return (
    <div className="min-h-screen bg-blue-950 text-white flex flex-col items-center justify-between p-4 selection:bg-transparent font-mono">
      
      {/* Top Bar */}
      <div className="w-full max-w-2xl flex justify-between items-center bg-blue-900 border-4 border-blue-400 p-4 rounded-lg shadow-[0_0_15px_rgba(96,165,250,0.5)]">
        <div className="flex flex-col items-center flex-1">
          <span className="text-blue-300 text-sm md:text-md uppercase tracking-widest mb-1 font-sans font-bold">Score</span>
          <span className="text-3xl md:text-4xl font-bold text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
            {score.toString().padStart(4, '0')}
          </span>
        </div>
        <div className="flex flex-col items-center flex-1 border-x border-blue-700">
          <span className="text-blue-300 text-sm md:text-md uppercase tracking-widest mb-1 font-sans font-bold">Time</span>
          <span className={`text-4xl md:text-5xl font-bold ${timeLeft <= 10 ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]'}`}>
            {formatTime(timeLeft)}
          </span>
        </div>
        <div className="flex flex-col items-center flex-1">
          <span className="text-blue-300 text-sm md:text-md uppercase tracking-widest mb-1 font-sans font-bold">Best</span>
          <span className="text-3xl md:text-4xl font-bold text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]">
            {highScore.toString().padStart(4, '0')}
          </span>
        </div>
      </div>

      {/* Word Grid Middle */}
      <div className="flex-1 w-full max-w-2xl my-6 bg-blue-900/40 border border-blue-700 rounded-lg p-6 flex justify-center gap-6 md:gap-12 overflow-y-auto shadow-inner">
        {[3, 4, 5, 6].map(len => (
          wordsByLength[len] && wordsByLength[len].length > 0 && (
            <div key={len} className="flex flex-col gap-2">
              <h3 className="text-blue-400 text-center text-xs md:text-sm mb-2 font-bold uppercase tracking-widest border-b border-blue-700 pb-1">{len} Ltrs</h3>
              {wordsByLength[len].map(word => {
                const isFound = foundWords.includes(word);
                return (
                  <div key={word} className="flex gap-1 justify-center">
                    {word.split('').map((char, i) => (
                      <div 
                        key={i} 
                        className={`w-8 h-8 md:w-10 md:h-10 border-2 flex items-center justify-center text-lg md:text-xl font-bold transition-all duration-500 ${
                          isFound 
                            ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(96,165,250,0.5)] rotate-y-360' 
                            : 'bg-blue-950/80 border-blue-800 text-transparent'
                        }`}
                      >
                        {isFound ? char : ''}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        ))}
      </div>

      {/* Input Area Bottom */}
      <div className="w-full max-w-2xl flex flex-col items-center gap-4 bg-blue-900/60 p-4 md:p-6 rounded-lg border border-blue-500 shadow-xl">
        
        {/* Current Input Row */}
        <div className={`flex gap-2 justify-center h-14 md:h-16 w-full ${shakeInput ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={`input-${i}`} 
              className={`w-12 h-14 md:w-14 md:h-16 border-2 flex items-center justify-center text-2xl md:text-3xl font-bold transition-all duration-200 ${
                currentInput[i] 
                  ? 'bg-yellow-400 text-black border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.5)] scale-105' 
                  : 'bg-blue-950/50 border-blue-800 text-transparent'
              }`}
            >
              {currentInput[i]?.char || ''}
            </div>
          ))}
        </div>

        {/* Source Scrambled Letters Row */}
        <div className="flex gap-2 justify-center h-14 md:h-16 w-full">
          {availableSlots.map((char, i) => {
            return char ? (
              <button
                key={`avail-${i}-${char}`}
                onClick={() => handleLetterClick(char, i)}
                disabled={gameOver}
                className="w-12 h-14 md:w-14 md:h-16 bg-blue-500 border-2 border-blue-300 text-white flex items-center justify-center text-2xl md:text-3xl font-bold rounded-sm shadow-[0_4px_0_rgba(29,78,216,1)] active:shadow-none active:translate-y-1 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
              >
                {char}
              </button>
            ) : (
               <div key={`empty-${i}`} className="w-12 h-14 md:w-14 md:h-16 bg-blue-950/30 border border-blue-900 rounded-sm" />
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-center w-full mt-2">
          <button 
            onClick={handleMix}
            disabled={gameOver || availableSlots.filter(s => s!==null).length < 2}
            className="flex-1 max-w-[140px] bg-yellow-400 border-2 border-yellow-200 text-black font-bold py-3 px-2 md:px-6 rounded-lg shadow-[0_4px_0_rgb(161,161,170)] active:shadow-none active:translate-y-1 hover:bg-yellow-300 hover:shadow-[0_0_15px_rgba(250,204,21,0.6)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider transition-all font-sans text-sm md:text-base"
          >
            Mix
          </button>
          <button 
            onClick={handleEnter}
            disabled={gameOver || currentInput.length === 0}
            className="flex-1 max-w-[140px] bg-yellow-400 border-2 border-yellow-200 text-black font-bold py-3 px-2 md:px-6 rounded-lg shadow-[0_4px_0_rgb(161,161,170)] active:shadow-none active:translate-y-1 hover:bg-yellow-300 hover:shadow-[0_0_15px_rgba(250,204,21,0.6)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider transition-all font-sans text-sm md:text-base"
          >
            Enter
          </button>
          <button 
            onClick={handleUndo}
            disabled={gameOver || currentInput.length === 0}
            className="flex-1 max-w-[140px] bg-yellow-400 border-2 border-yellow-200 text-black font-bold py-3 px-2 md:px-6 rounded-lg shadow-[0_4px_0_rgb(161,161,170)] active:shadow-none active:translate-y-1 hover:bg-yellow-300 hover:shadow-[0_0_15px_rgba(250,204,21,0.6)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider transition-all font-sans text-sm md:text-base"
          >
            Undo
          </button>
        </div>

      </div>

      {gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-blue-900 border-4 border-yellow-400 p-8 rounded-xl flex flex-col items-center max-w-sm w-full mx-4 shadow-[0_0_30px_rgba(250,204,21,0.4)]">
            <h2 className="text-4xl font-bold text-yellow-400 mb-4 animate-pulse uppercase">Time's Up!</h2>
            <div className="bg-blue-950 p-6 rounded-lg w-full mb-6 text-center border border-blue-700">
              <p className="text-sm font-sans text-blue-300 uppercase tracking-widest mb-1">Final Score</p>
              <p className="text-5xl font-bold text-white mb-2">{score}</p>
              <div className="w-full h-px bg-blue-800 my-4" />
              <p className="text-sm font-sans text-blue-300 uppercase tracking-widest mb-1">Words Found</p>
              <p className="text-2xl text-green-400 font-bold">{foundWords.length} <span className="text-blue-500 text-xl">/ {LEVEL_WORDS.length}</span></p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-yellow-400 border-2 border-yellow-200 text-black font-bold py-4 px-6 rounded-lg shadow-[0_4px_0_rgb(161,161,170)] active:shadow-none active:translate-y-1 hover:bg-yellow-300 uppercase tracking-wider transition-all text-xl"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

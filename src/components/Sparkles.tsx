'use client';

import React, { useEffect, useState } from 'react';

export default function Sparkles() {
  const [sparkles, setSparkles] = useState<{ id: number; left: string; delay: string; duration: string; size: string }[]>([]);

  useEffect(() => {
    // Generate ~40 random sparkles on mount to avoid SSR hydration mismatches
    const generated = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: `${(Math.random() * 100).toFixed(2)}%`,
      delay: `${(Math.random() * 5).toFixed(2)}s`,
      duration: `${(Math.random() * 8 + 4).toFixed(2)}s`, // Between 4s and 12s fall speed
      size: `${(Math.random() * 3 + 2).toFixed(1)}px`    // Between 2px and 5px size
    }));
    setSparkles(generated);
  }, []);

  if (sparkles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute rounded-full bg-[#d4af37] animate-fallAndTwinkle shadow-[0_0_8px_rgba(212,175,55,1)]"
          style={{
            left: sparkle.left,
            width: sparkle.size,
            height: sparkle.size,
            animationDelay: sparkle.delay,
            animationDuration: sparkle.duration
          }}
        />
      ))}
    </div>
  );
}

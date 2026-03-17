export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  totalScore: number;
  lastPlayedDate: number | null; // Timestamp
  lifetimePoints?: number;
  totalWordsAttemptedLifetime?: number;
  totalWordsFoundLifetime?: number;
  totalGridBoxesSeen?: number;
  totalGridBoxesFilled?: number;
  highScore?: number;
  totalAccuracySum?: number;
  gamesWithWordData?: number;
}

const DEFAULT_STATS: PlayerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  totalScore: 0,
  lastPlayedDate: null,
  lifetimePoints: 0,
  totalWordsAttemptedLifetime: 0,
  totalWordsFoundLifetime: 0,
  totalGridBoxesSeen: 0,
  totalGridBoxesFilled: 0,
};

const STATS_KEY = 'pressedPlayerStats';

export function loadStats(): PlayerStats {
  if (typeof window === 'undefined') return DEFAULT_STATS;

  try {
    const saved = localStorage.getItem(STATS_KEY);
    if (!saved) return DEFAULT_STATS;

    const stats: PlayerStats = JSON.parse(saved);
    if (stats.lifetimePoints === undefined) {
      stats.lifetimePoints = stats.totalScore || 0;
    }
    if (stats.totalWordsAttemptedLifetime === undefined) stats.totalWordsAttemptedLifetime = 0;
    if (stats.totalWordsFoundLifetime === undefined) stats.totalWordsFoundLifetime = 0;
    if (stats.totalGridBoxesSeen === undefined) stats.totalGridBoxesSeen = 0;
    if (stats.totalGridBoxesFilled === undefined) stats.totalGridBoxesFilled = 0;
    if (stats.highScore === undefined) stats.highScore = 0;
    if (stats.totalAccuracySum === undefined) stats.totalAccuracySum = 0;
    if (stats.gamesWithWordData === undefined) stats.gamesWithWordData = 0;
    
    const now = new Date();
    
    // Check streak logic based on calendar days, not strict 24h
    if (stats.lastPlayedDate) {
      const lastPlayed = new Date(stats.lastPlayedDate);
      
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const lastDay = new Date(lastPlayed.getFullYear(), lastPlayed.getMonth(), lastPlayed.getDate()).getTime();
      
      const daysDiff = (today - lastDay) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 1) {
        // More than 1 calendar day missed, reset streak
        stats.currentStreak = 0;
      }
      // If daysDiff === 1, they played yesterday, so it's ready to increment upon win.
      // If daysDiff === 0, they already played today.
    }

    return stats;
  } catch (e) {
    console.error('Failed to load stats', e);
    return DEFAULT_STATS;
  }
}

export function saveStats(stats: PlayerStats) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function recordGameResult(
  won: boolean, 
  score: number,
  wordsSubmitted: number,
  wordsCorrect: number,
  gridBoxesSeen: number,
  gridBoxesFilled: number
) {
  const stats = loadStats();
  
  stats.gamesPlayed += 1;
  stats.totalScore += score;
  stats.lifetimePoints = (stats.lifetimePoints || 0) + score;
  
  stats.totalWordsAttemptedLifetime = (stats.totalWordsAttemptedLifetime || 0) + wordsSubmitted;
  stats.totalWordsFoundLifetime = (stats.totalWordsFoundLifetime || 0) + wordsCorrect;
  stats.totalGridBoxesSeen = (stats.totalGridBoxesSeen || 0) + gridBoxesSeen;
  stats.totalGridBoxesFilled = (stats.totalGridBoxesFilled || 0) + gridBoxesFilled;
  stats.highScore = Math.max(stats.highScore || 0, score);

  // Track per-game accuracy for averaging (not cumulative ratio)
  if (wordsSubmitted > 0) {
    const gameAccuracy = Math.min(100, (wordsCorrect / wordsSubmitted) * 100);
    stats.totalAccuracySum = (stats.totalAccuracySum || 0) + gameAccuracy;
    stats.gamesWithWordData = (stats.gamesWithWordData || 0) + 1;
  }
  
  if (won) {
    stats.gamesWon += 1;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  if (!stats.lastPlayedDate) {
    // First game ever
    stats.currentStreak = 1;
    stats.maxStreak = 1;
  } else {
    const lastPlayed = new Date(stats.lastPlayedDate);
    const lastDay = new Date(lastPlayed.getFullYear(), lastPlayed.getMonth(), lastPlayed.getDate()).getTime();
    const daysDiff = (today - lastDay) / (1000 * 60 * 60 * 24);
    
    if (daysDiff === 1) {
      // Incremet streak since they played yesterday
      stats.currentStreak += 1;
      if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
      }
    } else if (daysDiff > 1) {
      // Streak broken
      stats.currentStreak = 1;
    }
    // If daysDiff === 0, they already played today, streak remains the same
  }

  stats.lastPlayedDate = now.getTime();
  saveStats(stats);
}

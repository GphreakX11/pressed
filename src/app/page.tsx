"use client";

import { useState, useEffect, useCallback } from "react";
import GameBoard from "@/components/GameBoard";
import SynapseGame from "@/components/SynapseGame";
import { submitSynapseScore } from "@/app/actions";

export default function Home() {
  const [gameMode, setGameMode] = useState<"anagrams" | "synapse">("anagrams");
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState("");

  useEffect(() => {
    // Read player identity from localStorage (same source as GameBoard)
    const id = localStorage.getItem("apexPlayerId") || "";
    const name = localStorage.getItem("last_used_handle") || "";
    setPlayerId(id);
    setPlayerName(name);
  }, []);

  const handleSynapseEnd = useCallback(async (score: number, maxStreak: number) => {
    // Submit score to leaderboard
    try {
      const name = localStorage.getItem("last_used_handle") || "PLAYER";
      const id = localStorage.getItem("apexPlayerId") || "";
      if (name && id && score > 0) {
        await submitSynapseScore(name, id, score);
      }
    } catch (err) {
      console.error("[Synapse] Score submission failed:", err);
    }
    // Stay in synapse mode (SynapseGame shows its own game-over screen)
  }, []);

  const handleSynapseCancel = useCallback(() => {
    setGameMode("anagrams");
  }, []);

  const handleLaunchSynapse = useCallback(() => {
    // Re-read identity in case it changed during the session
    setPlayerName(localStorage.getItem("last_used_handle") || "");
    setPlayerId(localStorage.getItem("apexPlayerId") || "");
    setGameMode("synapse");
  }, []);

  return (
    <main>
      {gameMode === "anagrams" ? (
        <GameBoard onLaunchSynapse={handleLaunchSynapse} />
      ) : (
        <SynapseGame
          onEnd={handleSynapseEnd}
          onCancel={handleSynapseCancel}
          playerName={playerName}
          playerId={playerId}
        />
      )}
    </main>
  );
}

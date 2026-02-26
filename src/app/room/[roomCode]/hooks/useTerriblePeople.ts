import { useEffect, useState, useCallback } from 'react';
import type { Room, WhiteCard, BlackCard, GameState } from '@/lib/types';
import type { SanitizedGameState } from '../types';
import type Channel from 'pusher-js/types/src/core/channels/channel';

export interface TerriblePeopleResult {
  gameState: SanitizedGameState | null;
  setGameState: React.Dispatch<React.SetStateAction<SanitizedGameState | null>>;
  hand: WhiteCard[];
  setHand: React.Dispatch<React.SetStateAction<WhiteCard[]>>;
  selectedCards: string[];
  submitting: boolean;
  hasSubmitted: boolean;
  judging: boolean;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  roundResult: {
    winnerId: string;
    winnerName: string;
    submission: WhiteCard[];
    scores: Record<string, number>;
    isGameOver: boolean;
  } | null;
  gameOver: {
    finalScores: Record<string, number>;
    winnerId: string;
    winnerName: string;
  } | null;
  phaseKey: number;
  handleSubmitCards: () => void;
  handleJudge: (winnerId: string) => void;
  handlePlayAgain: () => void;
  toggleCardSelection: (cardId: string) => void;
}

export function useTerriblePeople(
  roomCode: string,
  playerId: string | null,
  room: Room | null,
  roomCh: Channel | null,
  playerCh: Channel | null,
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>,
  addToast: (message: string, type: 'info' | 'success' | 'warning') => void,
): TerriblePeopleResult {
  const [gameState, setGameState] = useState<SanitizedGameState | null>(null);
  const [hand, setHand] = useState<WhiteCard[]>([]);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [judging, setJudging] = useState(false);
  const [revealedSubmissions, setRevealedSubmissions] = useState<{ id: string; cards: WhiteCard[] }[]>([]);
  const [roundResult, setRoundResult] = useState<{
    winnerId: string;
    winnerName: string;
    submission: WhiteCard[];
    scores: Record<string, number>;
    isGameOver: boolean;
  } | null>(null);
  const [gameOver, setGameOver] = useState<{
    finalScores: Record<string, number>;
    winnerId: string;
    winnerName: string;
  } | null>(null);
  const [phaseKey, setPhaseKey] = useState(0);

  // Hydrate from initial room fetch
  useEffect(() => {
    if (!room?.game || room.gameId === '4-kate' || room.gameId === 'whos-deal' || gameState) return;
    const g = room.game as Record<string, unknown>;
    setGameState(g as unknown as SanitizedGameState);
    if (g.submissions && playerId && (g.submissions as Record<string, unknown>)[playerId]) {
      setHasSubmitted(true);
    }
    if (g.phase === 'judging' && g.revealOrder) {
      const subs = (g.revealOrder as string[]).map((id: string) => ({
        id,
        cards: ((g.submissions as Record<string, WhiteCard[]>)?.[id]) || [],
      }));
      setRevealedSubmissions(subs);
    }
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pusher bindings
  useEffect(() => {
    if (!roomCh) return;

    const onGameStarted = (data: {
      gameState?: SanitizedGameState;
      teams?: unknown;
      seats?: string[];
    }) => {
      // Skip if Who's Deal? or 4 Kate
      if (data.teams && data.seats) return;
      if (data.gameState && 'board' in data.gameState) return;

      if (data.gameState) {
        setGameState(data.gameState as SanitizedGameState);
        setHasSubmitted(false);
        setSelectedCards([]);
        setRevealedSubmissions([]);
        setRoundResult(null);
        setGameOver(null);
        setPhaseKey((k) => k + 1);
      }
    };

    const onPhaseChanged = (data: { phase: string; blackCard?: BlackCard; czarId?: string; czarIndex?: number; currentRound?: number; phaseEndsAt?: number }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: data.phase as GameState['phase'],
          blackCard: data.blackCard ?? prev.blackCard,
          phaseEndsAt: data.phaseEndsAt ?? null,
          czarIndex: data.czarIndex ?? prev.czarIndex,
          currentRound: data.currentRound ?? prev.currentRound,
          submissions: data.phase === 'czar_reveal' || data.phase === 'submitting' ? {} : prev.submissions,
          revealOrder: data.phase === 'czar_reveal' || data.phase === 'submitting' ? [] : prev.revealOrder,
          roundWinnerId: data.phase === 'czar_reveal' || data.phase === 'submitting' ? null : prev.roundWinnerId,
        };
      });

      if (data.phase === 'czar_reveal' || data.phase === 'submitting') {
        setHasSubmitted(false);
        setSelectedCards([]);
        setRevealedSubmissions([]);
        setRoundResult(null);
      }

      setPhaseKey((k) => k + 1);
    };

    const onPlayerSubmitted = (data: { playerId: string }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const submissions = { ...prev.submissions, [data.playerId]: [] };
        return { ...prev, submissions };
      });
    };

    const onSubmissionsRevealed = (data: { submissions: { id: string; cards: WhiteCard[] }[] }) => {
      setRevealedSubmissions(data.submissions);
    };

    const onRoundResult = (data: {
      winnerId: string;
      winnerName: string;
      submission: WhiteCard[];
      scores: Record<string, number>;
      isGameOver: boolean;
    }) => {
      setRoundResult(data);
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: data.isGameOver ? 'game_over' : 'round_result',
          roundWinnerId: data.winnerId,
        };
      });
      setRoom((prev) => {
        if (!prev) return prev;
        const updated = prev.players.map((p) => ({
          ...p,
          score: data.scores[p.id] ?? p.score,
        }));
        return { ...prev, players: updated };
      });
      addToast(`${data.winnerName} wins the round!`, 'success');
      setPhaseKey((k) => k + 1);
    };

    const onGameOver = (data: {
      finalScores?: Record<string, number> | { a: number; b: number };
      winnerId?: string;
      winnerName?: string;
      finalBoard?: unknown;
      winningTeam?: string;
    }) => {
      // Skip 4 Kate and Who's Deal? game-over events
      if ('finalBoard' in data) return;
      if ('winningTeam' in data && data.winningTeam) return;

      setGameOver(data as { finalScores: Record<string, number>; winnerId: string; winnerName: string });
      setGameState((prev) => prev ? { ...prev, phase: 'game_over' } : prev);
      setPhaseKey((k) => k + 1);
    };

    roomCh.bind('game-started', onGameStarted);
    roomCh.bind('phase-changed', onPhaseChanged);
    roomCh.bind('player-submitted', onPlayerSubmitted);
    roomCh.bind('submissions-revealed', onSubmissionsRevealed);
    roomCh.bind('round-result', onRoundResult);
    roomCh.bind('game-over', onGameOver);

    return () => {
      roomCh.unbind('game-started', onGameStarted);
      roomCh.unbind('phase-changed', onPhaseChanged);
      roomCh.unbind('player-submitted', onPlayerSubmitted);
      roomCh.unbind('submissions-revealed', onSubmissionsRevealed);
      roomCh.unbind('round-result', onRoundResult);
      roomCh.unbind('game-over', onGameOver);
    };
  }, [roomCh, setRoom, addToast]);

  // Private channel: hand updates (TP cards have 'text', not 'suit')
  useEffect(() => {
    if (!playerCh) return;

    const onHandUpdated = (data: { hand: WhiteCard[] }) => {
      if (data.hand.length > 0 && 'suit' in data.hand[0]) return; // Who's Deal? hand
      setHand(data.hand);
    };

    playerCh.bind('hand-updated', onHandUpdated);
    return () => {
      playerCh.unbind('hand-updated', onHandUpdated);
    };
  }, [playerCh]);

  // --- Actions ---

  const handleSubmitCards = useCallback(async () => {
    if (!playerId || submitting || selectedCards.length === 0) return;
    setSubmitting(true);
    try {
      const actionId = `${playerId}-${Date.now()}`;
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, actionId, type: 'submit', payload: { cardIds: selectedCards } }),
      });
      if (res.ok) {
        setHasSubmitted(true);
        setSelectedCards([]);
        setHand((prev) => prev.filter((c) => !selectedCards.includes(c.id)));
      } else {
        const data = await res.json();
        if (data.code === 'ALREADY_SUBMITTED') {
          setHasSubmitted(true);
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setSubmitting(false);
    }
  }, [roomCode, playerId, submitting, selectedCards]);

  const handleJudge = useCallback(async (winnerId: string) => {
    if (!playerId || judging) return;
    setJudging(true);
    try {
      const actionId = `${playerId}-${Date.now()}`;
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, actionId, type: 'judge', payload: { winnerId } }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Judge error:', data);
      }
    } catch {
      // Non-fatal
    } finally {
      setJudging(false);
    }
  }, [roomCode, playerId, judging]);

  const handlePlayAgain = useCallback(async () => {
    if (!playerId) return;
    try {
      const res = await fetch('/api/game/play-again', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      });
      if (res.ok) {
        setGameOver(null);
        setRoundResult(null);
        setSelectedCards([]);
        setHasSubmitted(false);
        setRevealedSubmissions([]);
      }
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const toggleCardSelection = useCallback((cardId: string) => {
    if (!gameState) return;
    const pick = gameState.blackCard.pick;

    setSelectedCards((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= pick) {
        return [...prev.slice(0, pick - 1), cardId];
      }
      return [...prev, cardId];
    });
  }, [gameState]);

  return {
    gameState,
    setGameState,
    hand,
    setHand,
    selectedCards,
    submitting,
    hasSubmitted,
    judging,
    revealedSubmissions,
    roundResult,
    gameOver,
    phaseKey,
    handleSubmitCards,
    handleJudge,
    handlePlayAgain,
    toggleCardSelection,
  };
}

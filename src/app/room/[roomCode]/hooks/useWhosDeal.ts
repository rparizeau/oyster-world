import { useEffect, useState, useCallback, useRef } from 'react';
import type { Room, Player } from '@/lib/types';
import type { Card as WDCard, Suit as WDSuit, TrickCard as WDTrickCard } from '@/lib/games/whos-deal/types';
import type { ClientWhosDealState } from '@/lib/games/whos-deal/components/WhosDealGameView';
import { TRICK_RESULT_DISPLAY_MS } from '@/lib/games/whos-deal/constants';
import type Channel from 'pusher-js/types/src/core/channels/channel';

export interface WhosDealResult {
  whosDealState: ClientWhosDealState | null;
  setWhosDealState: React.Dispatch<React.SetStateAction<ClientWhosDealState | null>>;
  wdTrickWinner: { seatIndex: number; team: 'a' | 'b' } | null;
  wdRoundSummary: {
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  } | null;
  handleWDCallTrump: (payload: { pickUp?: boolean; suit?: WDSuit; goAlone?: boolean }) => void;
  handleWDPassTrump: () => void;
  handleWDDiscard: (cardId: string) => void;
  handleWDPlayCard: (cardId: string) => void;
  handleWDPlayAgain: () => void;
  handleSwapTeams: (playerIdA: string, playerIdB: string) => void;
  handleSetTargetScore: (targetScore: number) => void;
}

export function useWhosDeal(
  roomCode: string,
  playerId: string | null,
  room: Room | null,
  roomCh: Channel | null,
  playerCh: Channel | null,
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>,
  addToast: (message: string, type: 'info' | 'success' | 'warning') => void,
): WhosDealResult {
  const [whosDealState, setWhosDealState] = useState<ClientWhosDealState | null>(null);
  const [wdTrickWinner, setWdTrickWinner] = useState<{ seatIndex: number; team: 'a' | 'b' } | null>(null);
  const [wdRoundSummary, setWdRoundSummary] = useState<{
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  } | null>(null);
  const wdTrickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;

  // Hydrate from initial room fetch
  useEffect(() => {
    if (!room?.game || room.gameId !== 'whos-deal' || whosDealState) return;
    setWhosDealState(room.game as ClientWhosDealState);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pusher bindings
  useEffect(() => {
    if (!roomCh) return;

    const onGameStarted = (data: {
      gameState?: unknown;
      teams?: ClientWhosDealState['teams'];
      seats?: string[];
      dealer?: number;
      faceUpCard?: WDCard;
      targetScore?: number;
    }) => {
      // Only handle Who's Deal? game-started
      if (!(data.teams && data.seats && data.faceUpCard != null)) return;

      const wdState: ClientWhosDealState = {
        teams: data.teams,
        seats: data.seats,
        targetScore: data.targetScore ?? 10,
        dealerSeatIndex: data.dealer ?? 0,
        roundsPlayed: 1,
        phase: 'playing',
        winningTeam: null,
        round: {
          trumpPhase: 'round1',
          trumpSuit: null,
          callingPlayerId: null,
          callingTeam: null,
          goingAlone: false,
          alonePlayerId: null,
          inactivePartnerSeatIndex: null,
          faceUpCard: data.faceUpCard,
          dealerDiscarded: false,
          currentTurnSeatIndex: ((data.dealer ?? 0) + 1) % 4,
          passedPlayers: [],
          currentTrick: [],
          trickLeadSeatIndex: 0,
          tricksWon: { a: 0, b: 0 },
          tricksPlayed: 0,
          dealerPickedUp: null,
          myHand: [],
          handCounts: Object.fromEntries(data.seats.map(id => [id, 5])),
        },
      };
      setWhosDealState(wdState);
      setWdRoundSummary(null);
      setWdTrickWinner(null);
    };

    const onTeamsUpdated = (data: { teams: { a: string[]; b: string[] } }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, teams: data.teams },
        };
      });
    };

    const onSettingsUpdated = (data: { targetScore: number }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, targetScore: data.targetScore },
        };
      });
    };

    const onTrumpAction = (data: { seatIndex: number; action: string; suit?: WDSuit; goAlone?: boolean }) => {
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        const round = prev.round;

        if (data.action === 'pass') {
          const passPlayerId = prev.seats[data.seatIndex];
          const newPassedPlayers = round.passedPlayers.includes(passPlayerId)
            ? round.passedPlayers
            : [...round.passedPlayers, passPlayerId];

          // All 4 passed in round1 → go to round2
          if (round.trumpPhase === 'round1' && newPassedPlayers.length >= 4) {
            return {
              ...prev,
              round: {
                ...round,
                trumpPhase: 'round2' as const,
                passedPlayers: [],
                currentTurnSeatIndex: (prev.dealerSeatIndex + 1) % 4,
              },
            };
          }

          // Normal pass: advance turn
          return {
            ...prev,
            round: {
              ...round,
              passedPlayers: newPassedPlayers,
              currentTurnSeatIndex: (round.currentTurnSeatIndex + 1) % 4,
            },
          };
        }

        // 'order-up' or 'call' handled by trump-confirmed
        return prev;
      });
    };

    const onTrumpConfirmed = (data: {
      trumpSuit: WDSuit;
      callingPlayer: string;
      callingTeam: 'a' | 'b';
      goAlone?: boolean;
    }) => {
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        const round = prev.round;
        const callerSeatIndex = prev.seats.indexOf(data.callingPlayer);
        const goAlone = !!data.goAlone;
        const partnerSeatIndex = goAlone ? (callerSeatIndex + 2) % 4 : null;

        if (round.trumpPhase === 'round1') {
          // Round 1 call → dealer_discard
          return {
            ...prev,
            round: {
              ...round,
              trumpPhase: 'dealer_discard' as const,
              trumpSuit: data.trumpSuit,
              callingPlayerId: data.callingPlayer,
              callingTeam: data.callingTeam,
              goingAlone: goAlone,
              alonePlayerId: goAlone ? data.callingPlayer : null,
              inactivePartnerSeatIndex: partnerSeatIndex,
              currentTurnSeatIndex: prev.dealerSeatIndex,
              dealerPickedUp: round.faceUpCard,
            },
          };
        }

        // Round 2 call → playing (trick-started will set lead)
        return {
          ...prev,
          round: {
            ...round,
            trumpPhase: 'playing' as const,
            trumpSuit: data.trumpSuit,
            callingPlayerId: data.callingPlayer,
            callingTeam: data.callingTeam,
            goingAlone: goAlone,
            alonePlayerId: goAlone ? data.callingPlayer : null,
            inactivePartnerSeatIndex: partnerSeatIndex,
            currentTrick: [],
            tricksWon: { a: 0, b: 0 },
            tricksPlayed: 0,
          },
        };
      });
    };

    const onDealerDiscarded = () => {
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        return {
          ...prev,
          round: {
            ...prev.round,
            trumpPhase: 'playing' as const,
            dealerDiscarded: true,
            dealerPickedUp: null,
            currentTrick: [],
            tricksWon: { a: 0, b: 0 },
            tricksPlayed: 0,
          },
        };
      });
    };

    const onTrickStarted = (data: { leadSeatIndex: number }) => {
      setWdTrickWinner(null);
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        return {
          ...prev,
          round: {
            ...prev.round,
            currentTrick: [],
            trickLeadSeatIndex: data.leadSeatIndex,
            currentTurnSeatIndex: data.leadSeatIndex,
          },
        };
      });
    };

    const onCardPlayed = (data: { seatIndex: number; card: WDCard }) => {
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        const round = prev.round;
        const pid = prev.seats[data.seatIndex];

        // Add card to trick
        const newTrick: WDTrickCard[] = [...round.currentTrick, {
          playerId: pid,
          seatIndex: data.seatIndex,
          card: data.card,
        }];

        // Update hand counts
        const newHandCounts = { ...round.handCounts };
        if (newHandCounts[pid] != null) {
          newHandCounts[pid] = Math.max(0, newHandCounts[pid] - 1);
        }

        // If this is our card, remove from hand
        let newMyHand = round.myHand;
        if (pid === playerIdRef.current) {
          newMyHand = round.myHand.filter(c => c.id !== data.card.id);
        }

        // Advance turn (next seat, skip inactive partner)
        let nextSeat = (data.seatIndex + 1) % 4;
        if (round.goingAlone && nextSeat === round.inactivePartnerSeatIndex) {
          nextSeat = (nextSeat + 1) % 4;
        }

        return {
          ...prev,
          round: {
            ...round,
            currentTrick: newTrick,
            currentTurnSeatIndex: nextSeat,
            myHand: newMyHand,
            handCounts: newHandCounts,
          },
        };
      });
    };

    const onTrickWon = (data: {
      winningSeatIndex: number;
      winningTeam: 'a' | 'b';
      tricksWon: { a: number; b: number };
    }) => {
      setWdTrickWinner({ seatIndex: data.winningSeatIndex, team: data.winningTeam });

      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        return {
          ...prev,
          round: {
            ...prev.round,
            tricksWon: data.tricksWon,
            tricksPlayed: prev.round.tricksPlayed + 1,
            trickLeadSeatIndex: data.winningSeatIndex,
          },
        };
      });

      // Auto-clear trick winner after delay
      if (wdTrickTimerRef.current) clearTimeout(wdTrickTimerRef.current);
      wdTrickTimerRef.current = setTimeout(() => {
        setWdTrickWinner(null);
      }, TRICK_RESULT_DISPLAY_MS);
    };

    const onRoundOver = (data: {
      callingTeam: 'a' | 'b';
      tricksWon: { a: number; b: number };
      pointsAwarded: { a: number; b: number };
      scores: { a: number; b: number };
      isGameOver: boolean;
    }) => {
      setWdRoundSummary(data);
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        return {
          ...prev,
          teams: {
            a: { ...prev.teams.a, score: data.scores.a },
            b: { ...prev.teams.b, score: data.scores.b },
          },
          round: {
            ...prev.round,
            trumpPhase: 'round_over' as const,
            tricksWon: data.tricksWon,
            currentTrick: [],
          },
          phase: data.isGameOver ? 'game_over' as const : prev.phase,
        };
      });
    };

    const onNewRound = (data: {
      dealerSeatIndex: number;
      faceUpCard: WDCard;
    }) => {
      setWdRoundSummary(null);
      setWdTrickWinner(null);
      setWhosDealState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          dealerSeatIndex: data.dealerSeatIndex,
          roundsPlayed: (prev.roundsPlayed ?? 1) + 1,
          round: {
            trumpPhase: 'round1' as const,
            trumpSuit: null,
            callingPlayerId: null,
            callingTeam: null,
            goingAlone: false,
            alonePlayerId: null,
            inactivePartnerSeatIndex: null,
            faceUpCard: data.faceUpCard,
            dealerDiscarded: false,
            currentTurnSeatIndex: (data.dealerSeatIndex + 1) % 4,
            passedPlayers: [],
            currentTrick: [],
            trickLeadSeatIndex: 0,
            tricksWon: { a: 0, b: 0 },
            tricksPlayed: 0,
            dealerPickedUp: null,
            myHand: [],
            handCounts: Object.fromEntries(prev.seats.map(id => [id, 5])),
          },
        };
      });
    };

    const onGameOver = (data: {
      finalScores?: Record<string, number> | { a: number; b: number };
      winningTeam?: 'a' | 'b';
      finalBoard?: unknown;
    }) => {
      if (!('winningTeam' in data) || !data.winningTeam) return;
      if ('finalBoard' in data) return; // 4 Kate
      const scores = data.finalScores as { a: number; b: number } | undefined;
      setWhosDealState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'game_over' as const,
          winningTeam: data.winningTeam!,
          teams: scores ? {
            a: { ...prev.teams.a, score: scores.a },
            b: { ...prev.teams.b, score: scores.b },
          } : prev.teams,
        };
      });
    };

    const onPlayerLeft = (data: { playerId: string; replacementBot: Player }) => {
      setWhosDealState((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map(id => id === data.playerId ? data.replacementBot.id : id);
        const teams = {
          a: {
            ...prev.teams.a,
            playerIds: prev.teams.a.playerIds.map(id =>
              id === data.playerId ? data.replacementBot.id : id
            ) as [string, string],
          },
          b: {
            ...prev.teams.b,
            playerIds: prev.teams.b.playerIds.map(id =>
              id === data.playerId ? data.replacementBot.id : id
            ) as [string, string],
          },
        };
        let round = prev.round;
        if (round) {
          round = {
            ...round,
            passedPlayers: round.passedPlayers.map(id => id === data.playerId ? data.replacementBot.id : id),
            currentTrick: round.currentTrick.map(tc =>
              tc.playerId === data.playerId ? { ...tc, playerId: data.replacementBot.id } : tc
            ),
            callingPlayerId: round.callingPlayerId === data.playerId ? data.replacementBot.id : round.callingPlayerId,
            alonePlayerId: round.alonePlayerId === data.playerId ? data.replacementBot.id : round.alonePlayerId,
            handCounts: Object.fromEntries(
              Object.entries(round.handCounts).map(([k, v]) => [k === data.playerId ? data.replacementBot.id : k, v])
            ),
          };
        }
        return { ...prev, seats, teams, round };
      });
    };

    roomCh.bind('game-started', onGameStarted);
    roomCh.bind('teams-updated', onTeamsUpdated);
    roomCh.bind('settings-updated', onSettingsUpdated);
    roomCh.bind('trump-action', onTrumpAction);
    roomCh.bind('trump-confirmed', onTrumpConfirmed);
    roomCh.bind('dealer-discarded', onDealerDiscarded);
    roomCh.bind('trick-started', onTrickStarted);
    roomCh.bind('card-played', onCardPlayed);
    roomCh.bind('trick-won', onTrickWon);
    roomCh.bind('round-over', onRoundOver);
    roomCh.bind('new-round', onNewRound);
    roomCh.bind('game-over', onGameOver);
    roomCh.bind('player-left', onPlayerLeft);

    return () => {
      roomCh.unbind('game-started', onGameStarted);
      roomCh.unbind('teams-updated', onTeamsUpdated);
      roomCh.unbind('settings-updated', onSettingsUpdated);
      roomCh.unbind('trump-action', onTrumpAction);
      roomCh.unbind('trump-confirmed', onTrumpConfirmed);
      roomCh.unbind('dealer-discarded', onDealerDiscarded);
      roomCh.unbind('trick-started', onTrickStarted);
      roomCh.unbind('card-played', onCardPlayed);
      roomCh.unbind('trick-won', onTrickWon);
      roomCh.unbind('round-over', onRoundOver);
      roomCh.unbind('new-round', onNewRound);
      roomCh.unbind('game-over', onGameOver);
      roomCh.unbind('player-left', onPlayerLeft);
      if (wdTrickTimerRef.current) clearTimeout(wdTrickTimerRef.current);
    };
  }, [roomCh, setRoom, addToast]);

  // Private channel: hand updates (WD cards have 'suit')
  useEffect(() => {
    if (!playerCh) return;

    const onHandUpdated = (data: { hand: WDCard[] }) => {
      if (data.hand.length === 0 || !('suit' in data.hand[0])) return;
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        return {
          ...prev,
          round: { ...prev.round, myHand: data.hand },
        };
      });
    };

    playerCh.bind('hand-updated', onHandUpdated);
    return () => {
      playerCh.unbind('hand-updated', onHandUpdated);
    };
  }, [playerCh]);

  // --- Actions ---

  const handleWDCallTrump = useCallback(async (payload: { pickUp?: boolean; suit?: WDSuit; goAlone?: boolean }) => {
    if (!playerId) return;
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode, playerId, actionId,
          type: 'call-trump',
          payload,
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleWDPassTrump = useCallback(async () => {
    if (!playerId) return;
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode, playerId, actionId,
          type: 'pass-trump',
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleWDDiscard = useCallback(async (cardId: string) => {
    if (!playerId) return;
    // Optimistically remove card from hand
    setWhosDealState(prev => {
      if (!prev?.round) return prev;
      return {
        ...prev,
        round: {
          ...prev.round,
          myHand: prev.round.myHand.filter(c => c.id !== cardId),
        },
      };
    });
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode, playerId, actionId,
          type: 'discard',
          payload: { cardId },
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleWDPlayCard = useCallback(async (cardId: string) => {
    if (!playerId) return;
    // Optimistically remove card from hand
    setWhosDealState(prev => {
      if (!prev?.round) return prev;
      return {
        ...prev,
        round: {
          ...prev.round,
          myHand: prev.round.myHand.filter(c => c.id !== cardId),
        },
      };
    });
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode, playerId, actionId,
          type: 'play-card',
          payload: { cardId },
        }),
      });
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleWDPlayAgain = useCallback(async () => {
    if (!playerId) return;
    try {
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode, playerId,
          type: 'play-again',
        }),
      });
      setWdRoundSummary(null);
      setWdTrickWinner(null);
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId]);

  const handleSwapTeams = useCallback(async (playerIdA: string, playerIdB: string) => {
    if (!playerId) return;
    try {
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          type: 'swap-teams',
          payload: { playerIdA, playerIdB },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        addToast(data.error || 'Failed to swap teams', 'warning');
      }
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId, addToast]);

  const handleSetTargetScore = useCallback(async (targetScore: number) => {
    if (!playerId) return;
    try {
      const res = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          type: 'set-target-score',
          payload: { targetScore },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        addToast(data.error || 'Failed to update score', 'warning');
      }
    } catch {
      // Non-fatal
    }
  }, [roomCode, playerId, addToast]);

  return {
    whosDealState,
    setWhosDealState,
    wdTrickWinner,
    wdRoundSummary,
    handleWDCallTrump,
    handleWDPassTrump,
    handleWDDiscard,
    handleWDPlayCard,
    handleWDPlayAgain,
    handleSwapTeams,
    handleSetTargetScore,
  };
}

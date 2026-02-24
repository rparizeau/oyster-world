'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getPusherClient, roomChannel, playerChannel } from '@/lib/pusher';
import { HEARTBEAT_INTERVAL_MS } from '@/lib/constants';
import type { Room, Player, GameState, WhiteCard, BlackCard } from '@/lib/types';
import type { FourKateState, CellColor } from '@/lib/games/4-kate';
import FourKateGameView from '@/lib/games/4-kate/components/FourKateGameView';
import type { Card as WDCard, Suit as WDSuit, TrickCard as WDTrickCard } from '@/lib/games/whos-deal/types';
import WhosDealGameView from '@/lib/games/whos-deal/components/WhosDealGameView';
import type { ClientWhosDealState } from '@/lib/games/whos-deal/components/WhosDealGameView';
import { TRICK_RESULT_DISPLAY_MS } from '@/lib/games/whos-deal/constants';
import DeepBar from '@/components/DeepBar';

const GAME_DISPLAY_NAMES: Record<string, string> = {
  'terrible-people': 'Terrible People',
  '4-kate': 'Take 4',
  'whos-deal': "Who's Deal?",
};

// Sanitized game state from the server (no hands, no decks)
interface SanitizedGameState {
  currentRound: number;
  targetScore: number;
  czarIndex: number;
  phase: GameState['phase'];
  phaseEndsAt: number | null;
  blackCard: BlackCard;
  submissions: Record<string, WhiteCard[]>;
  revealOrder: string[];
  roundWinnerId: string | null;
}

// Toast notification type
interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);

  // Game state (Terrible People)
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

  // Game state (4 Kate)
  const [fourKateState, setFourKateState] = useState<FourKateState | null>(null);

  // Game state (Who's Deal?)
  const [whosDealState, setWhosDealState] = useState<ClientWhosDealState | null>(null);
  const [wdHand, setWdHand] = useState<WDCard[]>([]);
  const [wdTrickWinner, setWdTrickWinner] = useState<{ seatIndex: number; team: 'a' | 'b' } | null>(null);
  const [wdRoundSummary, setWdRoundSummary] = useState<{
    callingTeam: 'a' | 'b';
    tricksWon: { a: number; b: number };
    pointsAwarded: { a: number; b: number };
    scores: { a: number; b: number };
    isGameOver: boolean;
  } | null>(null);
  const wdTrickTimerRef = useRef<NodeJS.Timeout | null>(null);

  // UI state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [phaseKey, setPhaseKey] = useState(0); // for triggering phase transition animations

  const playerIdRef = useRef<string | null>(null);
  const toastIdRef = useRef(0);

  // --- Toast system ---
  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // Load room state
  const fetchRoom = useCallback(async () => {
    try {
      const pid = playerIdRef.current || '';
      const res = await fetch(`/api/rooms/${roomCode}?playerId=${encodeURIComponent(pid)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Room not found');
        return;
      }
      const data = await res.json();
      setRoom(data);

      if (data.game) {
        if (data.gameId === '4-kate') {
          setFourKateState(data.game as FourKateState);
        } else if (data.gameId === 'whos-deal') {
          setWhosDealState(data.game as ClientWhosDealState);
          if (data.game.round?.myHand) {
            setWdHand(data.game.round.myHand);
          }
        } else {
          setGameState(data.game);
          if (data.game.submissions && playerIdRef.current && data.game.submissions[playerIdRef.current]) {
            setHasSubmitted(true);
          }
          if (data.game.phase === 'judging' && data.game.revealOrder) {
            const subs = data.game.revealOrder.map((id: string) => ({
              id,
              cards: data.game.submissions[id] || [],
            }));
            setRevealedSubmissions(subs);
          }
        }
      }
    } catch {
      setError('Failed to load room');
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    const storedPlayerId = sessionStorage.getItem('playerId');
    if (!storedPlayerId) {
      router.push(`/join/${roomCode}`);
      return;
    }
    setPlayerId(storedPlayerId);
    playerIdRef.current = storedPlayerId;
    fetchRoom();
  }, [roomCode, router, fetchRoom]);

  // Subscribe to Pusher events
  useEffect(() => {
    if (!playerId) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(roomChannel(roomCode));
    const pChannel = pusher.subscribe(playerChannel(playerId));

    // Connection status tracking
    pusher.connection.bind('state_change', (states: { current: string }) => {
      if (states.current === 'connected') {
        setConnectionStatus('connected');
      } else if (states.current === 'connecting' || states.current === 'unavailable') {
        setConnectionStatus('reconnecting');
      } else if (states.current === 'disconnected' || states.current === 'failed') {
        setConnectionStatus('disconnected');
      }
    });

    // --- Lobby events ---

    channel.bind('player-joined', (data: { player: Player }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const idx = prev.players.findIndex(
          (p) => p.isBot && !prev.players.some((existing) => existing.id === data.player.id && !existing.isBot)
        );
        if (idx === -1) return prev;
        const updated = [...prev.players];
        updated[idx] = data.player;
        return { ...prev, players: updated };
      });
      addToast(`${data.player.name} joined the game`, 'info');
    });

    channel.bind('player-left', (data: { playerId: string; newOwnerId?: string; replacementBot: Player }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const leavingPlayer = prev.players.find((p) => p.id === data.playerId);
        if (leavingPlayer) {
          addToast(`${leavingPlayer.name} left the game`, 'warning');
        }
        const idx = prev.players.findIndex((p) => p.id === data.playerId);
        if (idx === -1) return prev;
        const updated = [...prev.players];
        updated[idx] = data.replacementBot;
        return {
          ...prev,
          players: updated,
          ownerId: data.newOwnerId ?? prev.ownerId,
        };
      });

      // Update 4 Kate state: bot inherits player's color
      setFourKateState((prev) => {
        if (!prev) return prev;
        const players = { ...prev.players };
        if (players.red === data.playerId) players.red = data.replacementBot.id;
        if (players.yellow === data.playerId) players.yellow = data.replacementBot.id;
        return { ...prev, players };
      });

      // Update Who's Deal? state: bot inherits seat
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
    });

    channel.bind('player-disconnected', (data: { playerId: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updated = prev.players.map((p) =>
          p.id === data.playerId ? { ...p, isConnected: false } : p
        );
        return { ...prev, players: updated };
      });
    });

    channel.bind('player-reconnected', (data: { playerId: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updated = prev.players.map((p) =>
          p.id === data.playerId ? { ...p, isConnected: true } : p
        );
        return { ...prev, players: updated };
      });
    });

    channel.bind('room-destroyed', () => {
      setError('Room has been closed');
      setTimeout(() => router.push('/'), 2000);
    });

    // --- Game events ---

    channel.bind('game-started', (data: {
      gameState?: SanitizedGameState | FourKateState;
      // Who's Deal? game-started fields
      teams?: ClientWhosDealState['teams'];
      seats?: string[];
      dealer?: number;
      faceUpCard?: WDCard;
      targetScore?: number;
    }) => {
      setRoom((prev) => {
        if (!prev) return prev;

        // Who's Deal? game-started
        if (prev.gameId === 'whos-deal' && data.teams && data.seats && data.faceUpCard != null) {
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
          setGameState(null);
          setFourKateState(null);
          setWdRoundSummary(null);
          setWdTrickWinner(null);
          return { ...prev, status: 'playing' };
        }

        // 4 Kate game-started
        if (prev.gameId === '4-kate' || (data.gameState && 'board' in data.gameState)) {
          setFourKateState(data.gameState as FourKateState);
          setGameState(null);
          setWhosDealState(null);
        } else if (data.gameState) {
          // Terrible People
          setGameState(data.gameState as SanitizedGameState);
          setFourKateState(null);
          setWhosDealState(null);
        }
        return { ...prev, status: 'playing' };
      });
      setHasSubmitted(false);
      setSelectedCards([]);
      setRevealedSubmissions([]);
      setRoundResult(null);
      setGameOver(null);
      setPhaseKey((k) => k + 1);
    });

    channel.bind('phase-changed', (data: { phase: string; blackCard?: BlackCard; czarId?: string; czarIndex?: number; currentRound?: number; phaseEndsAt?: number }) => {
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
    });

    channel.bind('player-submitted', (data: { playerId: string }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const submissions = { ...prev.submissions, [data.playerId]: [] };
        return { ...prev, submissions };
      });
    });

    channel.bind('submissions-revealed', (data: { submissions: { id: string; cards: WhiteCard[] }[] }) => {
      setRevealedSubmissions(data.submissions);
    });

    channel.bind('round-result', (data: {
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
    });

    channel.bind('game-over', (data: {
      finalScores?: Record<string, number> | { a: number; b: number };
      winnerId?: string;
      winnerName?: string;
      // 4 Kate fields
      winner?: string | null;
      winningCells?: [number, number][] | null;
      finalBoard?: CellColor[][];
      isDraw?: boolean;
      // Who's Deal? fields
      winningTeam?: 'a' | 'b';
    }) => {
      // Check if this is a 4 Kate game-over
      if ('finalBoard' in data) {
        setFourKateState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            phase: 'game_over',
            winner: data.winner ?? null,
            winningCells: data.winningCells ?? null,
            board: data.finalBoard ?? prev.board,
            isDraw: data.isDraw ?? false,
          };
        });
      } else if ('winningTeam' in data && data.winningTeam) {
        // Who's Deal? game-over
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
      } else {
        setGameOver(data as { finalScores: Record<string, number>; winnerId: string; winnerName: string });
        setGameState((prev) => prev ? { ...prev, phase: 'game_over' } : prev);
      }
      setPhaseKey((k) => k + 1);
    });

    // Who's Deal? lobby events
    channel.bind('teams-updated', (data: { teams: { a: string[]; b: string[] } }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, teams: data.teams },
        };
      });
    });

    channel.bind('settings-updated', (data: { targetScore: number }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          settings: { ...prev.settings, targetScore: data.targetScore },
        };
      });
    });

    // --- Who's Deal? game events ---

    channel.bind('trump-action', (data: { seatIndex: number; action: string; suit?: WDSuit; goAlone?: boolean }) => {
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
    });

    channel.bind('trump-confirmed', (data: {
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
    });

    channel.bind('dealer-discarded', (data: { seatIndex: number }) => {
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
    });

    channel.bind('trick-started', (data: { leadSeatIndex: number }) => {
      // Clear trick winner display
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
    });

    channel.bind('card-played', (data: { seatIndex: number; card: WDCard }) => {
      setWhosDealState((prev) => {
        if (!prev?.round) return prev;
        const round = prev.round;
        const playerId = prev.seats[data.seatIndex];

        // Add card to trick
        const newTrick: WDTrickCard[] = [...round.currentTrick, {
          playerId,
          seatIndex: data.seatIndex,
          card: data.card,
        }];

        // Update hand counts
        const newHandCounts = { ...round.handCounts };
        if (newHandCounts[playerId] != null) {
          newHandCounts[playerId] = Math.max(0, newHandCounts[playerId] - 1);
        }

        // If this is our card, remove from hand
        let newMyHand = round.myHand;
        if (playerId === playerIdRef.current) {
          newMyHand = round.myHand.filter(c => c.id !== data.card.id);
        }

        // Advance turn (simple: next seat, but might skip inactive partner)
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
    });

    channel.bind('trick-won', (data: {
      winningSeatIndex: number;
      winningTeam: 'a' | 'b';
      tricksWon: { a: number; b: number };
    }) => {
      // Show trick winner for TRICK_RESULT_DISPLAY_MS
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
    });

    channel.bind('round-over', (data: {
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
    });

    channel.bind('new-round', (data: {
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
    });

    // 4 Kate: move-made
    channel.bind('move-made', (data: {
      column: number;
      row: number;
      color: 'red' | 'yellow';
      currentTurn: 'red' | 'yellow';
      board: CellColor[][];
    }) => {
      setFourKateState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          board: data.board,
          currentTurn: data.currentTurn,
          moves: [...prev.moves, { col: data.column, row: data.row, color: data.color }],
          turnStartedAt: Date.now(),
        };
      });
    });

    // --- Private channel: hand updates ---
    pChannel.bind('hand-updated', (data: { hand: WhiteCard[] | WDCard[] }) => {
      // Detect if this is a Who's Deal? hand (cards have suit/rank) or TP hand (cards have text)
      if (data.hand.length > 0 && 'suit' in data.hand[0]) {
        setWdHand(data.hand as WDCard[]);
        // Also update whosDealState.round.myHand
        setWhosDealState((prev) => {
          if (!prev?.round) return prev;
          return {
            ...prev,
            round: { ...prev.round, myHand: data.hand as WDCard[] },
          };
        });
      } else {
        setHand(data.hand as WhiteCard[]);
      }
    });

    return () => {
      pusher.connection.unbind('state_change');
      channel.unbind_all();
      pChannel.unbind_all();
      pusher.unsubscribe(roomChannel(roomCode));
      pusher.unsubscribe(playerChannel(playerId));
    };
  }, [playerId, roomCode, router, addToast]);

  // Heartbeat
  useEffect(() => {
    if (!playerId || !roomCode) return;

    const sendHeartbeat = () => {
      fetch('/api/rooms/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [playerId, roomCode]);

  // --- Actions ---

  async function handleLeave() {
    if (!playerId || leaving) return;
    setLeaving(true);
    try {
      await fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      });
      sessionStorage.removeItem('playerId');
      sessionStorage.removeItem('playerName');
      router.push('/');
    } catch {
      setLeaving(false);
    }
  }

  async function handleStartGame() {
    if (!playerId || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to start game');
      }
    } catch {
      setError('Failed to start game');
    } finally {
      setStarting(false);
    }
  }

  async function handleSwapTeams(playerIdA: string, playerIdB: string) {
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
  }

  async function handleSetTargetScore(targetScore: number) {
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
  }

  async function handleSubmitCards() {
    if (!playerId || submitting || selectedCards.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/game/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, cardIds: selectedCards }),
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
  }

  async function handleJudge(winnerId: string) {
    if (!playerId || judging) return;
    setJudging(true);
    try {
      const res = await fetch('/api/game/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, winnerId }),
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
  }

  async function handlePlayAgain() {
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
  }

  async function handleDropPiece(column: number) {
    if (!playerId) return;
    try {
      const actionId = `${playerId}-${Date.now()}`;
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerId,
          actionId,
          type: 'drop',
          payload: { column },
        }),
      });
    } catch {
      // Non-fatal
    }
  }

  // --- Who's Deal? Actions ---

  async function handleWDCallTrump(payload: { pickUp?: boolean; suit?: WDSuit; goAlone?: boolean }) {
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
  }

  async function handleWDPassTrump() {
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
  }

  async function handleWDDiscard(cardId: string) {
    if (!playerId) return;
    // Optimistically remove card from hand
    setWdHand(prev => prev.filter(c => c.id !== cardId));
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
  }

  async function handleWDPlayCard(cardId: string) {
    if (!playerId) return;
    // Optimistically remove card from hand
    setWdHand(prev => prev.filter(c => c.id !== cardId));
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
  }

  async function handleWDPlayAgain() {
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
  }

  function handleCopy(type: 'code' | 'link') {
    const text = type === 'code'
      ? roomCode
      : `${window.location.origin}/join/${roomCode}`;
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleCardSelection(cardId: string) {
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
  }

  // --- Renders ---

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center gap-8 p-6 pt-16 animate-fade-in">
        <div className="text-center">
          <div className="skeleton h-4 w-20 mx-auto mb-2" />
          <div className="skeleton h-12 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
        <div className="w-full max-w-sm space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
        <div className="skeleton h-12 w-full max-w-sm" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 animate-fade-in">
        <div className="rounded-2xl bg-surface border border-border p-8 text-center max-w-sm w-full">
          <div className="w-14 h-14 rounded-full bg-danger/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">{error}</p>
          <p className="text-sm text-muted mb-6">Something went wrong with this game.</p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary w-full"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (!room) return null;

  const isOwner = playerId === room.ownerId;

  // Who's Deal? game view
  if (room.status === 'playing' && whosDealState && room.gameId === 'whos-deal') {
    const myTeam = whosDealState.teams.a.playerIds.includes(playerId ?? '') ? 'a' : 'b';
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Lobby"
          showAction={true}
          onHome={() => { if (confirm('Leave the game and go home?')) { handleLeave(); } }}
          onAction={() => {/* Placeholder — persistent lobby is Update 2 */}}
        />
        <ScoreBar
          teams={whosDealState.teams}
          targetScore={whosDealState.targetScore}
          myTeam={myTeam}
        />
        <div className="flex-1">
          <WhosDealGameView
            room={room}
            gameState={whosDealState}
            playerId={playerId}
            isOwner={isOwner}
            leaving={leaving}
            trickWinner={wdTrickWinner}
            roundSummary={wdRoundSummary}
            onCallTrump={handleWDCallTrump}
            onPassTrump={handleWDPassTrump}
            onDiscard={handleWDDiscard}
            onPlayCard={handleWDPlayCard}
            onPlayAgain={handleWDPlayAgain}
            onLeave={handleLeave}
          />
        </div>
      </div>
    );
  }

  // 4 Kate game view
  if (room.status === 'playing' && fourKateState && room.gameId === '4-kate') {
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Lobby"
          showAction={true}
          onHome={() => { if (confirm('Leave the game and go home?')) { handleLeave(); } }}
          onAction={() => {/* Placeholder — persistent lobby is Update 2 */}}
        />
        <div className="flex-1">
          <FourKateGameView
            room={room}
            gameState={fourKateState}
            playerId={playerId}
            isOwner={isOwner}
            leaving={leaving}
            onDropPiece={handleDropPiece}
            onPlayAgain={handlePlayAgain}
            onLeave={handleLeave}
          />
        </div>
      </div>
    );
  }

  // Terrible People game view
  if (room.status === 'playing' && gameState) {
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Lobby"
          showAction={true}
          onHome={() => { if (confirm('Leave the game and go home?')) { handleLeave(); } }}
          onAction={() => {/* Placeholder — persistent lobby is Update 2 */}}
        />
        <div className="flex-1">
          <GameView
            room={room}
            gameState={gameState}
            playerId={playerId}
            isOwner={isOwner}
            isCzar={playerId === room.players[gameState.czarIndex]?.id}
            hand={hand}
            selectedCards={selectedCards}
            hasSubmitted={hasSubmitted}
            submitting={submitting}
            judging={judging}
            revealedSubmissions={revealedSubmissions}
            roundResult={roundResult}
            gameOver={gameOver}
            leaving={leaving}
            phaseKey={phaseKey}
            onToggleCard={toggleCardSelection}
            onSubmit={handleSubmitCards}
            onJudge={handleJudge}
            onPlayAgain={handlePlayAgain}
            onLeave={handleLeave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
      <ToastContainer toasts={toasts} />
      <ConnectionBanner status={connectionStatus} />
      <DeepBar
        gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
        actionLabel="Leave"
        showAction={false}
        onHome={() => { if (confirm('Leave the game and go home?')) { handleLeave(); } }}
      />
      <div className="flex-1">
        <LobbyView
          room={room}
          playerId={playerId}
          isOwner={isOwner}
          starting={starting}
          leaving={leaving}
          copied={copied}
          onCopy={handleCopy}
          onStartGame={handleStartGame}
          onLeave={handleLeave}
          onSwapTeams={handleSwapTeams}
          onSetTargetScore={handleSetTargetScore}
        />
      </div>
    </div>
  );
}

// ====================
// SCORE BAR (Who's Deal? only)
// ====================
function ScoreBar({ teams, targetScore, myTeam }: {
  teams: { a: { score: number; playerIds: [string, string] }; b: { score: number; playerIds: [string, string] } };
  targetScore: number;
  myTeam: 'a' | 'b';
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2.5 text-[0.8em] font-bold" style={{ background: 'rgba(240,194,127,.04)', borderBottom: '1px solid rgba(240,194,127,.06)' }}>
      <span style={{ color: 'var(--shallow-water)' }}>
        ● A {teams.a.score}
        {myTeam === 'a' && (
          <span className="text-[0.55em] ml-1 font-bold rounded-[3px] px-1.5 py-[1px]" style={{ background: 'rgba(240,194,127,.1)', color: 'var(--pearl)' }}>YOU</span>
        )}
      </span>
      <span className="text-[0.7em]" style={{ color: 'rgba(232,230,240,.15)' }}>vs</span>
      <span style={{ color: 'var(--coral)' }}>
        ● B {teams.b.score}
        {myTeam === 'b' && (
          <span className="text-[0.55em] ml-1 font-bold rounded-[3px] px-1.5 py-[1px]" style={{ background: 'rgba(240,194,127,.1)', color: 'var(--pearl)' }}>YOU</span>
        )}
      </span>
      <span className="text-[0.65em] font-semibold ml-auto" style={{ color: 'rgba(232,230,240,.12)' }}>to {targetScore}</span>
    </div>
  );
}

// ====================
// TOAST CONTAINER
// ====================
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm pointer-events-auto ${
            toast.type === 'success'
              ? 'bg-success/90 text-white'
              : toast.type === 'warning'
                ? 'bg-warning/90 text-black'
                : 'bg-surface-light/90 text-foreground border border-border'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ====================
// CONNECTION BANNER
// ====================
function ConnectionBanner({ status }: { status: 'connected' | 'reconnecting' | 'disconnected' }) {
  if (status === 'connected') return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-40 py-2 px-4 text-center text-sm font-medium animate-fade-in-down ${
      status === 'reconnecting'
        ? 'bg-warning/90 text-black'
        : 'bg-danger/90 text-white'
    }`}>
      {status === 'reconnecting' ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Reconnecting...
        </span>
      ) : (
        'Connection lost. Please check your internet.'
      )}
    </div>
  );
}

// ====================
// LOBBY VIEW
// ====================
function LobbyView({
  room,
  playerId,
  isOwner,
  starting,
  leaving,
  copied,
  onCopy,
  onStartGame,
  onLeave,
  onSwapTeams,
  onSetTargetScore,
}: {
  room: Room;
  playerId: string | null;
  isOwner: boolean;
  starting: boolean;
  leaving: boolean;
  copied: 'code' | 'link' | null;
  onCopy: (type: 'code' | 'link') => void;
  onStartGame: () => void;
  onLeave: () => void;
  onSwapTeams: (playerIdA: string, playerIdB: string) => void;
  onSetTargetScore: (targetScore: number) => void;
}) {
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const isWhosDeal = room.gameId === 'whos-deal';
  const teams = room.settings?.teams as { a: string[]; b: string[] } | undefined;
  const targetScore = (room.settings?.targetScore as number) || 10;

  return (
    <div className="flex flex-col items-center gap-6 p-4 pt-4 pb-6 animate-fade-in">
      {/* Game code section */}
      <div className="text-center pt-2 pb-4">
        <div className="text-[0.62em] uppercase tracking-[3px] font-bold mb-1" style={{ color: 'rgba(240,194,127,.35)' }}>
          Game Code
        </div>
        <button
          onClick={() => onCopy('code')}
          className="group relative font-display text-[2.2em] text-cream tracking-[6px] hover:text-pearl transition-colors"
          title="Copy game code"
        >
          {room.roomCode}
        </button>
        <button
          onClick={() => onCopy('link')}
          className="mt-1.5 flex items-center gap-1 mx-auto text-sm font-semibold transition-colors"
          style={{ color: 'var(--shallow-water)' }}
        >
          {copied === 'link' ? '✓ Link copied!' : copied === 'code' ? '✓ Code copied!' : '🔗 Copy invite link'}
        </button>
      </div>

      {/* Who's Deal? Team Assignment */}
      {isWhosDeal && teams ? (
        <WhosDealTeamAssignment
          room={room}
          teams={teams}
          playerId={playerId}
          isOwner={isOwner}
          onSwapTeams={onSwapTeams}
        />
      ) : (
        /* Standard player list for other games */
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>Players</h2>
            <span className="text-[0.65em] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>{humanCount}/{room.players.length} humans</span>
          </div>
          <div className="flex flex-col gap-2">
            {room.players.map((player, i) => (
              <PlayerCard key={player.id} player={player} isOwnerPlayer={player.id === room.ownerId} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Who's Deal? Target Score Selector */}
      {isWhosDeal && (
        <div className="w-full max-w-sm">
          <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold mb-3" style={{ color: 'rgba(232,230,240,.25)' }}>Points to Win</h2>
          <div className="flex gap-1.5">
            {[5, 7, 10, 11].map((score) => (
              <button
                key={score}
                onClick={() => isOwner && onSetTargetScore(score)}
                disabled={!isOwner}
                className="flex-1 rounded-lg py-2.5 text-lg font-bold transition-all"
                style={targetScore === score
                  ? { border: '2px solid var(--pearl)', background: 'rgba(240,194,127,.06)', color: 'var(--pearl)' }
                  : { border: '2px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', color: 'rgba(232,230,240,.35)' }
                }
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {isOwner ? (
          <button
            onClick={onStartGame}
            disabled={starting}
            className="btn-primary flex items-center justify-center gap-2 text-lg"
          >
            {starting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting...
              </>
            ) : (
              'Start Game'
            )}
          </button>
        ) : (
          <div className="text-center py-4">
            <p className="text-[0.88em] font-semibold" style={{ color: 'rgba(232,230,240,.3)' }}>Waiting for host to start...</p>
            <div className="flex gap-1.5 justify-center mt-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'rgba(240,194,127,.25)', animation: `dot-pulse 1.4s ease-in-out infinite ${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="btn-danger"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>

      <p className="text-[0.68em] text-center" style={{ color: 'rgba(232,230,240,.18)' }}>
        Share the code — the more the merrier
      </p>
    </div>
  );
}

// ====================
// PLAYER CARD (reusable)
// ====================
function PlayerCard({ player, isOwnerPlayer, index }: { player: Player; isOwnerPlayer: boolean; index: number }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all animate-fade-in ${
        !player.isConnected && !player.isBot ? 'opacity-40' : ''
      } ${player.isBot ? 'opacity-45' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
        background: 'rgba(126,184,212,.05)',
        border: '1.5px solid rgba(126,184,212,.1)',
      }}
    >
      {player.isBot ? (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(255,255,255,.06)' }}>
          🤖
        </div>
      ) : (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(126,184,212,.2)' }}>
          {player.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className={`font-bold text-[0.82em] truncate block ${
          player.isBot ? 'text-cream/60' : 'text-cream'
        }`}>
          {player.name}
        </span>
        {isOwnerPlayer && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>
        )}
        {player.isBot && !isOwnerPlayer && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>
        )}
        {!player.isConnected && !player.isBot && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold text-danger">DISCONNECTED</span>
        )}
      </div>
    </div>
  );
}

// ====================
// WHO'S DEAL? TEAM ASSIGNMENT
// ====================
function WhosDealTeamAssignment({
  room,
  teams,
  playerId,
  isOwner,
  onSwapTeams,
}: {
  room: Room;
  teams: { a: string[]; b: string[] };
  playerId: string | null;
  isOwner: boolean;
  onSwapTeams: (playerIdA: string, playerIdB: string) => void;
}) {
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);

  const teamAPlayers = teams.a.map((id) => room.players.find((p) => p.id === id)).filter(Boolean) as Player[];
  const teamBPlayers = teams.b.map((id) => room.players.find((p) => p.id === id)).filter(Boolean) as Player[];

  const humanCount = room.players.filter((p) => !p.isBot).length;

  function handleSelectA(id: string) {
    if (!isOwner) return;
    if (selectedA === id) {
      setSelectedA(null);
      return;
    }
    setSelectedA(id);
    if (selectedB) {
      onSwapTeams(id, selectedB);
      setSelectedA(null);
      setSelectedB(null);
    }
  }

  function handleSelectB(id: string) {
    if (!isOwner) return;
    if (selectedB === id) {
      setSelectedB(null);
      return;
    }
    setSelectedB(id);
    if (selectedA) {
      onSwapTeams(selectedA, id);
      setSelectedA(null);
      setSelectedB(null);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>Teams</h2>
        <span className="text-[0.65em] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>{humanCount}/{room.players.length} humans</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Team A */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--shallow-water)' }} />
            <span className="text-[0.7em] font-bold" style={{ color: 'var(--shallow-water)' }}>Team A</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {teamAPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectA(player.id)}
                disabled={!isOwner}
                className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all text-left w-full ${
                  isOwner ? 'cursor-pointer' : 'cursor-default'
                } ${!player.isConnected && !player.isBot ? 'opacity-40' : ''} ${player.isBot ? 'opacity-45' : ''}`}
                style={selectedA === player.id
                  ? { background: 'rgba(126,184,212,.15)', border: '2px solid var(--shallow-water)', boxShadow: '0 0 10px rgba(126,184,212,.2)' }
                  : player.isBot
                    ? { background: 'rgba(126,184,212,.03)', border: '1.5px dashed rgba(126,184,212,.1)' }
                    : { background: 'rgba(126,184,212,.05)', border: '1.5px solid rgba(126,184,212,.1)' }
                }
              >
                {player.isBot ? (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em]" style={{ background: 'rgba(255,255,255,.06)' }}>🤖</div>
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(126,184,212,.2)' }}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className={`font-bold text-[0.82em] truncate block ${player.isBot ? 'text-cream/60' : 'text-cream'}`}>
                    {player.name}
                  </span>
                  {player.isBot && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>}
                  {player.id === room.ownerId && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Team B */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--coral)' }} />
            <span className="text-[0.7em] font-bold" style={{ color: 'var(--coral)' }}>Team B</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {teamBPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectB(player.id)}
                disabled={!isOwner}
                className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all text-left w-full ${
                  isOwner ? 'cursor-pointer' : 'cursor-default'
                } ${!player.isConnected && !player.isBot ? 'opacity-40' : ''} ${player.isBot ? 'opacity-45' : ''}`}
                style={selectedB === player.id
                  ? { background: 'rgba(232,168,124,.15)', border: '2px solid var(--coral)', boxShadow: '0 0 10px rgba(232,168,124,.2)' }
                  : player.isBot
                    ? { background: 'rgba(232,168,124,.03)', border: '1.5px dashed rgba(232,168,124,.1)' }
                    : { background: 'rgba(232,168,124,.05)', border: '1.5px solid rgba(232,168,124,.1)' }
                }
              >
                {player.isBot ? (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em]" style={{ background: 'rgba(255,255,255,.06)' }}>🤖</div>
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(232,168,124,.2)' }}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className={`font-bold text-[0.82em] truncate block ${player.isBot ? 'text-cream/60' : 'text-cream'}`}>
                    {player.name}
                  </span>
                  {player.isBot && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>}
                  {player.id === room.ownerId && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isOwner && (
        <p className="text-[0.65em] text-center mt-2.5" style={{ color: 'rgba(232,230,240,.18)' }}>
          Tap one player from each team to swap them
        </p>
      )}
    </div>
  );
}

// ====================
// GAME VIEW
// ====================
function GameView({
  room,
  gameState,
  playerId,
  isOwner,
  isCzar,
  hand,
  selectedCards,
  hasSubmitted,
  submitting,
  judging,
  revealedSubmissions,
  roundResult,
  gameOver,
  leaving,
  phaseKey,
  onToggleCard,
  onSubmit,
  onJudge,
  onPlayAgain,
  onLeave,
}: {
  room: Room;
  gameState: SanitizedGameState;
  playerId: string | null;
  isOwner: boolean;
  isCzar: boolean;
  hand: WhiteCard[];
  selectedCards: string[];
  hasSubmitted: boolean;
  submitting: boolean;
  judging: boolean;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  roundResult: { winnerId: string; winnerName: string; submission: WhiteCard[]; scores: Record<string, number>; isGameOver: boolean } | null;
  gameOver: { finalScores: Record<string, number>; winnerId: string; winnerName: string } | null;
  leaving: boolean;
  phaseKey: number;
  onToggleCard: (cardId: string) => void;
  onSubmit: () => void;
  onJudge: (winnerId: string) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const czar = room.players[gameState.czarIndex];
  const phase = gameState.phase;

  // Game Over screen
  if (phase === 'game_over' || gameOver) {
    return (
      <GameOverView
        room={room}
        roundResult={roundResult}
        gameOver={gameOver}
        isOwner={isOwner}
        leaving={leaving}
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />
    );
  }

  const nonCzarCount = room.players.length - 1;
  const submittedCount = Object.keys(gameState.submissions).length;

  return (
    <div className="flex flex-1 flex-col p-4 pb-6 max-w-lg mx-auto w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 animate-fade-in">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted bg-surface-light rounded-lg px-2.5 py-1">
            Round {gameState.currentRound}
          </span>
          <span className="text-xs text-muted">
            First to {gameState.targetScore}
          </span>
        </div>
        <span className="status-dot connected" title="Connected" />
      </div>

      {/* Player strip with scores */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {room.players.map((p, i) => (
          <div
            key={p.id}
            className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-all ${
              p.id === playerId && i !== gameState.czarIndex
                ? 'border-accent/50 bg-accent/5'
                : 'border-border bg-surface'
            }`}
            style={i === gameState.czarIndex ? { borderColor: 'var(--pearl)', background: 'rgba(240,194,127,.08)', boxShadow: '0 0 10px rgba(240,194,127,0.15)' } : undefined}
          >
            <div className="flex items-center gap-1">
              {i === gameState.czarIndex && (
                <svg className="w-3.5 h-3.5" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                  <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
                </svg>
              )}
              <span className={`text-[11px] font-semibold truncate max-w-[60px] ${
                p.isBot ? 'text-muted' : 'text-foreground'
              }`}>
                {p.name}
              </span>
            </div>
            <span className="text-lg font-black tabular-nums">{p.score}</span>
          </div>
        ))}
      </div>

      {/* Black card */}
      <div className="card-black mb-5 animate-fade-in-up" key={`black-${gameState.currentRound}`}>
        <p className="pr-16" dangerouslySetInnerHTML={{ __html: formatBlackCard(gameState.blackCard.text) }} />
        {gameState.blackCard.pick > 1 && (
          <span className="absolute top-3 right-3 bg-white/10 rounded-lg px-2 py-0.5 text-xs font-bold">
            PICK {gameState.blackCard.pick}
          </span>
        )}
      </div>

      {/* Phase-specific content */}
      <div key={phaseKey} className="animate-fade-in flex-1">
        {phase === 'czar_reveal' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <svg className="w-5 h-5" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
              </svg>
              <p className="text-cream text-lg font-semibold">
                {czar?.name} is The Crown
              </p>
            </div>
            <p className="text-muted text-sm animate-pulse-soft">Reading the prompt...</p>
          </div>
        )}

        {phase === 'submitting' && (
          <SubmittingPhase
            isCzar={isCzar}
            czarName={czar?.name ?? 'The Crown'}
            hand={hand}
            selectedCards={selectedCards}
            hasSubmitted={hasSubmitted}
            submitting={submitting}
            submittedCount={submittedCount}
            nonCzarCount={nonCzarCount}
            pick={gameState.blackCard.pick}
            onToggleCard={onToggleCard}
            onSubmit={onSubmit}
          />
        )}

        {phase === 'judging' && (
          <JudgingPhase
            isCzar={isCzar}
            czarName={czar?.name ?? 'The Crown'}
            revealedSubmissions={revealedSubmissions}
            judging={judging}
            onJudge={onJudge}
          />
        )}

        {phase === 'round_result' && roundResult && (
          <RoundResultPhase
            winnerName={roundResult.winnerName}
            submission={roundResult.submission}
          />
        )}
      </div>

      {/* Leave button - minimal at bottom */}
      <div className="mt-auto pt-4">
        <button
          onClick={onLeave}
          disabled={leaving}
          className="w-full text-xs text-muted hover:text-danger transition-colors py-2"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>
    </div>
  );
}

// ====================
// SUBMITTING PHASE
// ====================
function SubmittingPhase({
  isCzar,
  czarName,
  hand,
  selectedCards,
  hasSubmitted,
  submitting,
  submittedCount,
  nonCzarCount,
  pick,
  onToggleCard,
  onSubmit,
}: {
  isCzar: boolean;
  czarName: string;
  hand: WhiteCard[];
  selectedCards: string[];
  hasSubmitted: boolean;
  submitting: boolean;
  submittedCount: number;
  nonCzarCount: number;
  pick: number;
  onToggleCard: (cardId: string) => void;
  onSubmit: () => void;
}) {
  if (isCzar) {
    return (
      <div className="text-center py-8">
        <p className="text-foreground text-lg font-semibold mb-2">Waiting for answers...</p>
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: nonCzarCount }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < submittedCount ? 'bg-success' : 'bg-surface-lighter'
              }`}
            />
          ))}
        </div>
        <p className="text-muted text-xs mt-2">{submittedCount}/{nonCzarCount} submitted</p>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="text-center py-8 animate-scale-in">
        <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-success text-lg font-semibold">Cards submitted!</p>
        <p className="text-muted text-sm mt-1">
          Waiting for others... ({submittedCount}/{nonCzarCount})
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-foreground">
          Pick {pick} card{pick > 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: nonCzarCount }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < submittedCount ? 'bg-success' : 'bg-surface-lighter'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Player's hand - horizontal scroll on mobile, grid on desktop */}
      <div className="hand-scroll mb-4 md:grid md:grid-cols-2 md:gap-2 md:overflow-visible">
        {hand.map((card, i) => {
          const isSelected = selectedCards.includes(card.id);
          const selectionIndex = selectedCards.indexOf(card.id);

          return (
            <button
              key={card.id}
              onClick={() => onToggleCard(card.id)}
              className={`card-white text-left w-[160px] md:w-auto min-h-[100px] border-2 transition-all ${
                isSelected
                  ? 'border-accent shadow-[0_0_12px_rgba(240,194,127,0.3)] !transform-none'
                  : 'border-transparent hover:border-border-light'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {isSelected && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {selectionIndex + 1}
                </span>
              )}
              <span className="text-card-white-text">{card.text}</span>
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      <button
        onClick={onSubmit}
        disabled={selectedCards.length !== pick || submitting}
        className="w-full rounded-xl bg-accent px-6 py-3.5 font-bold text-[#080c1a] hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting...
          </>
        ) : (
          `Submit ${pick} Card${pick > 1 ? 's' : ''}`
        )}
      </button>
    </div>
  );
}

// ====================
// JUDGING PHASE
// ====================
function JudgingPhase({
  isCzar,
  czarName,
  revealedSubmissions,
  judging,
  onJudge,
}: {
  isCzar: boolean;
  czarName: string;
  revealedSubmissions: { id: string; cards: WhiteCard[] }[];
  judging: boolean;
  onJudge: (winnerId: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">
        {isCzar ? 'Pick the funniest answer:' : `${czarName} is choosing...`}
      </p>

      <div className="flex flex-col gap-3">
        {revealedSubmissions.map((sub, i) => (
          <button
            key={sub.id}
            onClick={() => isCzar && !judging ? onJudge(sub.id) : undefined}
            disabled={!isCzar || judging}
            className={`card-white text-left !p-4 border-2 animate-fade-in-up ${
              isCzar && !judging
                ? 'border-transparent hover:border-accent hover:shadow-[0_0_12px_rgba(240,194,127,0.2)] cursor-pointer'
                : 'border-transparent cursor-default !transform-none'
            }`}
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {sub.cards.map((card, j) => (
              <span key={card.id} className="text-card-white-text">
                {j > 0 && <span className="text-muted mx-1">&</span>}
                {card.text}
              </span>
            ))}
          </button>
        ))}
      </div>

      {isCzar && !judging && (
        <p className="text-center text-muted text-xs mt-4 animate-pulse-soft">
          Tap a card to pick the winner
        </p>
      )}
    </div>
  );
}

// ====================
// ROUND RESULT PHASE
// ====================
function RoundResultPhase({
  winnerName,
  submission,
}: {
  winnerName: string;
  submission: WhiteCard[];
}) {
  return (
    <div className="text-center py-4">
      <p className="text-xs text-muted uppercase tracking-[0.15em] font-semibold mb-1">Round Winner</p>
      <p className="text-2xl font-black text-foreground mb-4 animate-bounce-in">
        {winnerName}
      </p>
      <div className="card-white inline-block !p-5 border-2 border-success shadow-[0_0_20px_rgba(107,191,163,0.2)] animate-winner-reveal">
        {submission.map((card, i) => (
          <span key={card.id} className="text-card-white-text text-lg">
            {i > 0 && <span className="text-muted mx-1">&</span>}
            {card.text}
          </span>
        ))}
      </div>
      <p className="text-muted text-sm mt-5 animate-pulse-soft">
        Next round starting soon...
      </p>
    </div>
  );
}

// ====================
// GAME OVER
// ====================
function GameOverView({
  room,
  roundResult,
  gameOver,
  isOwner,
  leaving,
  onPlayAgain,
  onLeave,
}: {
  room: Room;
  roundResult: { winnerId: string; winnerName: string; submission: WhiteCard[]; scores: Record<string, number>; isGameOver: boolean } | null;
  gameOver: { finalScores: Record<string, number>; winnerId: string; winnerName: string } | null;
  isOwner: boolean;
  leaving: boolean;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const scores = gameOver?.finalScores ?? roundResult?.scores ?? {};
  const winnerName = gameOver?.winnerName ?? roundResult?.winnerName ?? 'Unknown';

  const ranked = [...room.players].sort(
    (a, b) => (scores[b.id] ?? b.score) - (scores[a.id] ?? a.score)
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 animate-fade-in">
      {/* Trophy */}
      <div className="animate-bounce-in">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(240,194,127,.15)' }}>
          <svg className="w-10 h-10" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
            <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h1 className="font-display text-3xl font-black tracking-tight text-cream">Game Over!</h1>
        <p className="text-xl text-accent font-bold mt-1">{winnerName} wins!</p>
      </div>

      {/* Winning card if available */}
      {roundResult?.submission && (
        <div className="card-white inline-block !p-4 border-2 border-accent shadow-[0_0_16px_rgba(240,194,127,0.15)] animate-fade-in-up">
          {roundResult.submission.map((card, i) => (
            <span key={card.id} className="text-card-white-text">
              {i > 0 && <span className="text-muted mx-1">&</span>}
              {card.text}
            </span>
          ))}
        </div>
      )}

      {/* Final Scores */}
      <div className="w-full max-w-sm">
        <h2 className="text-xs text-muted uppercase tracking-[0.15em] font-semibold mb-3 text-center">Final Scores</h2>
        <div className="flex flex-col gap-2">
          {ranked.map((p, i) => {
            const playerScore = scores[p.id] ?? p.score;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl px-4 py-3.5 transition-all animate-fade-in-up ${
                  i === 0
                    ? 'border-2'
                    : 'border'
                }`}
                style={{
                  background: i === 0 ? 'rgba(240,194,127,.1)' : i === 1 ? 'rgba(26,82,118,.3)' : 'rgba(13,27,62,.4)',
                  borderColor: i === 0 ? 'var(--pearl)' : i === 1 ? 'rgba(245,230,202,.1)' : 'rgba(245,230,202,.06)',
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-black text-lg w-7 text-center ${
                    i === 0 ? '' : 'text-muted'
                  }`} style={i === 0 ? { color: 'var(--pearl)' } : undefined}>
                    {i === 0 ? (
                      <svg className="w-6 h-6 mx-auto" style={{ color: 'var(--pearl)' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                        <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
                      </svg>
                    ) : (
                      `#${i + 1}`
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={`font-semibold text-sm truncate block max-w-[140px] ${
                      i === 0 ? 'text-cream' : 'text-muted'
                    }`}>
                      {p.name}
                    </span>
                    {p.isBot && <span className="text-[10px] text-muted">(Bot)</span>}
                  </div>
                </div>
                <span className={`text-2xl font-black tabular-nums ${
                  i === 0 ? '' : 'text-cream'
                }`} style={i === 0 ? { color: 'var(--pearl)' } : undefined}>
                  {playerScore}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {isOwner && (
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full text-lg"
          >
            Play Again
          </button>
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="btn-danger w-full"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>
    </div>
  );
}

/**
 * Format black card text: replace underscores with styled blank spans.
 */
function formatBlackCard(text: string): string {
  return text.replace(/_+/g, '<span class="blank">&nbsp;</span>');
}

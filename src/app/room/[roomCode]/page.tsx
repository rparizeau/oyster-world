'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getPusherClient, roomChannel, playerChannel } from '@/lib/pusher';
import { HEARTBEAT_INTERVAL_MS } from '@/lib/constants';
import type { Room, Player, GameState, WhiteCard, BlackCard } from '@/lib/types';
import type { FourKateState, CellColor } from '@/lib/games/4-kate';
import FourKateGameView from '@/lib/games/4-kate/components/FourKateGameView';

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
      const res = await fetch(`/api/rooms/${roomCode}`);
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
      addToast(`${data.player.name} joined the world`, 'info');
    });

    channel.bind('player-left', (data: { playerId: string; newOwnerId?: string; replacementBot: Player }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const leavingPlayer = prev.players.find((p) => p.id === data.playerId);
        if (leavingPlayer) {
          addToast(`${leavingPlayer.name} left the world`, 'warning');
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

    channel.bind('game-started', (data: { gameState: SanitizedGameState | FourKateState }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        // Detect if this is a 4 Kate game
        if (prev.gameId === '4-kate' || ('board' in data.gameState)) {
          setFourKateState(data.gameState as FourKateState);
          setGameState(null);
        } else {
          setGameState(data.gameState as SanitizedGameState);
          setFourKateState(null);
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
      finalScores?: Record<string, number>;
      winnerId?: string;
      winnerName?: string;
      // 4 Kate fields
      winner?: string | null;
      winningCells?: [number, number][] | null;
      finalBoard?: CellColor[][];
      isDraw?: boolean;
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
      } else {
        setGameOver(data as { finalScores: Record<string, number>; winnerId: string; winnerName: string });
        setGameState((prev) => prev ? { ...prev, phase: 'game_over' } : prev);
      }
      setPhaseKey((k) => k + 1);
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
    pChannel.bind('hand-updated', (data: { hand: WhiteCard[] }) => {
      setHand(data.hand);
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
          <p className="text-sm text-muted mb-6">Something went wrong with this world.</p>
          <button
            onClick={() => router.push('/')}
            className="w-full rounded-xl bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (!room) return null;

  const isOwner = playerId === room.ownerId;

  // 4 Kate game view
  if (room.status === 'playing' && fourKateState && room.gameId === '4-kate') {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
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
      </>
    );
  }

  // Terrible People game view
  if (room.status === 'playing' && gameState) {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
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
      </>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} />
      <ConnectionBanner status={connectionStatus} />
      <LobbyView
        room={room}
        isOwner={isOwner}
        starting={starting}
        leaving={leaving}
        copied={copied}
        onCopy={handleCopy}
        onStartGame={handleStartGame}
        onLeave={handleLeave}
      />
    </>
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
  isOwner,
  starting,
  leaving,
  copied,
  onCopy,
  onStartGame,
  onLeave,
}: {
  room: Room;
  isOwner: boolean;
  starting: boolean;
  leaving: boolean;
  copied: 'code' | 'link' | null;
  onCopy: (type: 'code' | 'link') => void;
  onStartGame: () => void;
  onLeave: () => void;
}) {
  const humanCount = room.players.filter((p) => !p.isBot).length;

  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 p-6 pt-12 animate-fade-in">
      {/* Game indicator */}
      {room.gameId && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-light border border-border px-4 py-2">
          <span className="text-2xl">{room.gameId === 'terrible-people' ? '\u{1F0CF}' : room.gameId === '4-kate' ? '\u{1F534}' : ''}</span>
          <span className="text-sm font-semibold text-foreground">{room.gameId === 'terrible-people' ? 'Terrible People' : room.gameId === '4-kate' ? '4 Kate' : room.gameId}</span>
        </div>
      )}

      {/* World code header */}
      <div className="text-center">
        <p className="text-xs text-muted uppercase tracking-[0.2em] font-semibold mb-1">World Code</p>
        <button
          onClick={() => onCopy('code')}
          className="group relative text-5xl font-mono font-black tracking-[0.15em] text-foreground hover:text-accent transition-colors"
          title="Copy world code"
        >
          {room.roomCode}
          <span className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            {copied === 'code' ? (
              <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </span>
        </button>
        <button
          onClick={() => onCopy('link')}
          className="mt-2 flex items-center gap-1.5 mx-auto text-sm text-muted hover:text-accent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {copied === 'link' ? 'Link copied!' : 'Copy invite link'}
        </button>
      </div>

      {/* Players */}
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs text-muted uppercase tracking-[0.15em] font-semibold">Players</h2>
          <span className="text-xs text-muted">{humanCount}/{room.players.length} humans</span>
        </div>
        <div className="flex flex-col gap-2">
          {room.players.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center justify-between rounded-xl px-4 py-3.5 transition-all animate-fade-in ${
                player.isBot
                  ? 'bg-surface border border-dashed border-border'
                  : 'bg-surface-light border border-border-light'
              } ${!player.isConnected && !player.isBot ? 'opacity-40' : ''}`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar / Bot icon */}
                {player.isBot ? (
                  <div className="w-9 h-9 rounded-full bg-surface-lighter flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 text-accent font-bold text-sm">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <span className={`font-semibold text-sm truncate block max-w-[140px] ${
                    player.isBot ? 'text-muted' : 'text-foreground'
                  }`}>
                    {player.name}
                  </span>
                  {player.id === room.ownerId && (
                    <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Owner</span>
                  )}
                  {!player.isConnected && !player.isBot && (
                    <span className="text-[10px] text-danger font-semibold uppercase tracking-wider">Disconnected</span>
                  )}
                </div>
              </div>
              {player.isBot && (
                <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Bot</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {isOwner && (
          <button
            onClick={onStartGame}
            disabled={starting}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="w-full rounded-xl border border-danger/30 px-6 py-3 font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {leaving ? 'Leaving...' : 'Leave World'}
        </button>
      </div>

      <p className="text-sm text-muted text-center">
        Share the world code to invite friends
      </p>
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
    <div className="flex min-h-dvh flex-col p-4 pb-6 max-w-lg mx-auto w-full">
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
              i === gameState.czarIndex
                ? 'border-warning bg-warning/10 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                : p.id === playerId
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-center gap-1">
              {i === gameState.czarIndex && (
                <svg className="w-3.5 h-3.5 text-warning" viewBox="0 0 24 24" fill="currentColor">
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
              <svg className="w-5 h-5 text-warning" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
              </svg>
              <p className="text-foreground text-lg font-semibold">
                {czar?.name} is the Card Czar
              </p>
            </div>
            <p className="text-muted text-sm animate-pulse-soft">Reading the prompt...</p>
          </div>
        )}

        {phase === 'submitting' && (
          <SubmittingPhase
            isCzar={isCzar}
            czarName={czar?.name ?? 'Czar'}
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
            czarName={czar?.name ?? 'Czar'}
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
          {leaving ? 'Leaving...' : 'Leave World'}
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
                  ? 'border-accent shadow-[0_0_12px_rgba(139,92,246,0.3)] !transform-none'
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
        className="w-full rounded-xl bg-accent px-6 py-3.5 font-bold text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
                ? 'border-transparent hover:border-warning hover:shadow-[0_0_12px_rgba(245,158,11,0.2)] cursor-pointer'
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
      <div className="card-white inline-block !p-5 border-2 border-success shadow-[0_0_20px_rgba(34,197,94,0.2)] animate-winner-reveal">
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 animate-fade-in">
      {/* Trophy */}
      <div className="animate-bounce-in">
        <div className="w-20 h-20 rounded-full bg-warning/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-warning" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
            <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight">Game Over!</h1>
        <p className="text-xl text-accent font-bold mt-1">{winnerName} wins!</p>
      </div>

      {/* Winning card if available */}
      {roundResult?.submission && (
        <div className="card-white inline-block !p-4 border-2 border-warning shadow-[0_0_16px_rgba(245,158,11,0.15)] animate-fade-in-up">
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
                    ? 'bg-warning/10 border-2 border-warning'
                    : i === 1
                      ? 'bg-surface-light border border-muted/30'
                      : i === 2
                        ? 'bg-surface border border-border'
                        : 'bg-surface border border-border'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-black text-lg w-7 text-center ${
                    i === 0 ? 'text-warning' : i === 1 ? 'text-muted-light' : 'text-muted'
                  }`}>
                    {i === 0 ? (
                      <svg className="w-6 h-6 text-warning mx-auto" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                        <path d="M5 19a1 1 0 001 1h12a1 1 0 001-1v-1H5v1z" />
                      </svg>
                    ) : (
                      `#${i + 1}`
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className={`font-semibold text-sm truncate block max-w-[140px] ${
                      i === 0 ? 'text-foreground' : 'text-muted-light'
                    }`}>
                      {p.name}
                    </span>
                    {p.isBot && <span className="text-[10px] text-muted">(Bot)</span>}
                  </div>
                </div>
                <span className={`text-2xl font-black tabular-nums ${
                  i === 0 ? 'text-warning' : 'text-foreground'
                }`}>
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
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Play Again
          </button>
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="w-full rounded-xl border border-danger/30 px-6 py-3 font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {leaving ? 'Leaving...' : 'Leave World'}
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

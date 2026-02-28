'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FourKateGameView from '@/lib/games/4-kate/components/FourKateGameView';
import WhosDealGameView from '@/lib/games/whos-deal/components/WhosDealGameView';
import TerriblePeopleGameView from '@/lib/games/terrible-people/components/TerriblePeopleGameView';
import MinesweeperGameView from '@/lib/games/minesweeper/components/MinesweeperGameView';
import BattleshipGameView from '@/lib/games/battleship/components/BattleshipGameView';
import WordleGameView from '@/lib/games/wordle/components/WordleGameView';
import DeepBar from '@/components/DeepBar';

import { GAME_DISPLAY_NAMES } from './types';
import { useToasts } from './hooks/useToasts';
import { useRoomConnection } from './hooks/useRoomConnection';
import { useFourKate } from './hooks/useFourKate';
import { useTerriblePeople } from './hooks/useTerriblePeople';
import { useWhosDeal } from './hooks/useWhosDeal';
import { useMinesweeper } from './hooks/useMinesweeper';
import { useBattleship } from './hooks/useBattleship';
import { useWordle } from './hooks/useWordle';
import type { Difficulty } from '@/lib/games/minesweeper/types';

import ToastContainer from './components/ToastContainer';
import ConnectionBanner from './components/ConnectionBanner';
import ScoreBar from './components/ScoreBar';
import LobbyView from './components/LobbyView';

export default function RoomPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);

  // --- Hooks ---
  const { toasts, addToast } = useToasts();

  const {
    room, setRoom,
    playerId,
    loading, error, setError,
    connectionStatus,
    roomChannel: roomCh,
    playerChannel: playerCh,
  } = useRoomConnection(roomCode, addToast);

  const {
    fourKateState,
    handleDropPiece,
  } = useFourKate(roomCode, playerId, room, roomCh, setRoom);

  const {
    gameState,
    hand,
    selectedCards,
    submitting, hasSubmitted, judging,
    revealedSubmissions, roundResult, gameOver,
    phaseKey,
    handleSubmitCards, handleJudge,
    handlePlayAgain, toggleCardSelection,
  } = useTerriblePeople(roomCode, playerId, room, roomCh, playerCh, setRoom, addToast);

  const {
    whosDealState,
    wdTrickWinner, wdRoundSummary,
    handleWDCallTrump, handleWDPassTrump,
    handleWDDiscard, handleWDPlayCard,
    handleWDPlayAgain,
    handleSwapTeams, handleSetTargetScore,
  } = useWhosDeal(roomCode, playerId, room, roomCh, playerCh, setRoom, addToast);

  const {
    battleshipState,
    handlePlaceShips,
    handleFire,
  } = useBattleship(roomCode, playerId, room, roomCh, playerCh, setRoom, addToast);

  // Minesweeper — client-side game state
  const minesweeperDifficulty: Difficulty =
    (room?.game as { difficulty?: Difficulty } | null)?.difficulty || 'easy';
  const minesweeper = useMinesweeper(minesweeperDifficulty);

  // Wordle (Daily Pearl) — client-side game state
  const wordle = useWordle();

  // Auto-start for Wordle (skip lobby)
  const wordleAutoStarted = useRef(false);
  useEffect(() => {
    if (
      room?.gameId === 'wordle' &&
      room?.status === 'waiting' &&
      playerId === room?.ownerId &&
      !wordleAutoStarted.current &&
      !starting
    ) {
      wordleAutoStarted.current = true;
      handleStartGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.gameId, room?.status, playerId, room?.ownerId]);

  // --- Actions ---

  async function handleLeave() {
    if (!playerId || leaving) return;
    setLeaving(true);
    // Leave the room on the server but keep the session (name persists)
    try {
      await fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      });
    } catch {
      // Non-fatal — navigate home regardless
    }
    router.push('/');
  }

  async function handleStartGame(settings?: Record<string, unknown>) {
    if (!playerId || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId, settings }),
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

  async function handleReturnToLobby() {
    if (!playerId) return;
    // Immediately update local state to show lobby
    setRoom((prev) => prev ? { ...prev, status: 'waiting' as const, game: null } : prev);
    // Persist to server
    try {
      await fetch('/api/game/play-again', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
      });
    } catch {
      // Non-fatal — local state already updated
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
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
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
            trickWinner={wdTrickWinner}
            roundSummary={wdRoundSummary}
            onCallTrump={handleWDCallTrump}
            onPassTrump={handleWDPassTrump}
            onDiscard={handleWDDiscard}
            onPlayCard={handleWDPlayCard}
            onPlayAgain={handleWDPlayAgain}
          />
        </div>
      </div>
    );
  }

  // Battleship game view
  if (room.status === 'playing' && battleshipState && room.gameId === 'battleship') {
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
        />
        <div className="flex-1">
          <BattleshipGameView
            room={room}
            battleshipState={battleshipState}
            playerId={playerId}
            isOwner={isOwner}
            onPlaceShips={handlePlaceShips}
            onFire={handleFire}
            onPlayAgain={handleReturnToLobby}
          />
        </div>
      </div>
    );
  }

  // Wordle (Daily Pearl) game view
  if (room.status === 'playing' && room.gameId === 'wordle') {
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
        />
        <div className="flex-1 relative">
          <WordleGameView
            game={wordle.game}
            countdown={wordle.countdown}
            onTypeLetter={wordle.handleTypeLetter}
            onDeleteLetter={wordle.handleDeleteLetter}
            onSubmitGuess={wordle.handleSubmitGuess}
          />
        </div>
      </div>
    );
  }

  // Wordle auto-start loading state
  if (room.gameId === 'wordle' && room.status === 'waiting' && wordleAutoStarted.current) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-depth-deep animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl">🦪</div>
          <div className="font-display text-pearl text-sm">Opening your pearl...</div>
          <div className="flex gap-1.5 mt-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: 'rgba(240,194,127,.25)',
                  animation: `dot-pulse 1.4s ease-in-out infinite ${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Minesweeper game view
  if (room.status === 'playing' && room.gameId === 'minesweeper') {
    return (
      <div className="flex min-h-dvh flex-col bg-depth-deep overflow-x-hidden">
        <ToastContainer toasts={toasts} />
        <ConnectionBanner status={connectionStatus} />
        <DeepBar
          gameName={GAME_DISPLAY_NAMES[room.gameId] ?? room.gameId}
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
        />
        <MinesweeperGameView
          game={minesweeper.game}
          dispatch={minesweeper.dispatch}
          displayTime={minesweeper.displayTime}
          minesRemaining={minesweeper.minesRemaining}
          pressingIndex={minesweeper.pressingIndex}
          initGrid={minesweeper.initGrid}
          resetGrid={minesweeper.resetGrid}
          getLongPressHandlers={minesweeper.getLongPressHandlers}
          handleCellClick={minesweeper.handleCellClick}
          handleRightClick={minesweeper.handleRightClick}
          onChangeDifficulty={handleReturnToLobby}
        />
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
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
        />
        <div className="flex-1">
          <FourKateGameView
            room={room}
            gameState={fourKateState}
            playerId={playerId}
            isOwner={isOwner}
            onDropPiece={handleDropPiece}
            onPlayAgain={handlePlayAgain}
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
          actionLabel="Games"
          showAction={true}
          onHome={handleLeave}
          onAction={handleLeave}
        />
        <div className="flex-1">
          <TerriblePeopleGameView
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
            phaseKey={phaseKey}
            onToggleCard={toggleCardSelection}
            onSubmit={handleSubmitCards}
            onJudge={handleJudge}
            onPlayAgain={handlePlayAgain}
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

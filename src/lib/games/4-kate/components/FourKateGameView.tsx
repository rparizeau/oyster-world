'use client';

import { useCallback } from 'react';
import FourKateBoard from './FourKateBoard';
import type { FourKateState } from '../engine';
import type { Room } from '@/lib/types';

interface FourKateGameViewProps {
  room: Room;
  gameState: FourKateState;
  playerId: string | null;
  isOwner: boolean;
  leaving: boolean;
  onDropPiece: (column: number) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function FourKateGameView({
  room,
  gameState,
  playerId,
  isOwner,
  leaving,
  onDropPiece,
  onPlayAgain,
  onLeave,
}: FourKateGameViewProps) {
  const { board, players, currentTurn, phase, winner, winningCells, isDraw } = gameState;

  const redPlayer = room.players.find((p) => p.id === players.red);
  const yellowPlayer = room.players.find((p) => p.id === players.yellow);

  const myColor: 'red' | 'yellow' | null =
    playerId === players.red ? 'red' :
    playerId === players.yellow ? 'yellow' : null;

  const isMyTurn = myColor === currentTurn && phase === 'playing';
  const isGameOver = phase === 'game_over';

  const currentTurnPlayer = currentTurn === 'red' ? redPlayer : yellowPlayer;
  const currentTurnIsBot = currentTurnPlayer?.isBot ?? false;

  const winnerPlayer = winner ? room.players.find((p) => p.id === winner) : null;

  const handleColumnClick = useCallback((col: number) => {
    if (!isMyTurn) return;
    onDropPiece(col);
  }, [isMyTurn, onDropPiece]);

  // Turn status text
  let statusText = '';
  if (isGameOver) {
    if (isDraw) {
      statusText = "It's a draw!";
    } else if (winnerPlayer) {
      statusText = `${winnerPlayer.name} wins!`;
    }
  } else if (isMyTurn) {
    statusText = "Your turn — drop a piece!";
  } else if (currentTurnIsBot) {
    statusText = "Bot is thinking...";
  } else if (currentTurnPlayer) {
    statusText = `Waiting for ${currentTurnPlayer.name}...`;
  }

  return (
    <div className="flex min-h-dvh flex-col p-4 pb-6 max-w-lg mx-auto w-full">
      {/* Player indicators */}
      <div className="flex items-center justify-center gap-4 mb-4 animate-fade-in">
        <PlayerIndicator
          name={redPlayer?.name ?? 'Red'}
          color="red"
          isActive={currentTurn === 'red' && !isGameOver}
          isBot={redPlayer?.isBot ?? false}
          isWinner={winner === players.red}
        />
        <span className="text-muted text-sm font-semibold">vs</span>
        <PlayerIndicator
          name={yellowPlayer?.name ?? 'Yellow'}
          color="yellow"
          isActive={currentTurn === 'yellow' && !isGameOver}
          isBot={yellowPlayer?.isBot ?? false}
          isWinner={winner === players.yellow}
        />
      </div>

      {/* Game board */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 relative pt-12">
        <FourKateBoard
          board={board}
          winningCells={winningCells}
          isMyTurn={isMyTurn}
          myColor={myColor}
          gameOver={isGameOver}
          onColumnClick={handleColumnClick}
        />

        {/* Status text */}
        <p className={`text-center text-sm font-semibold animate-fade-in ${
          isGameOver
            ? isDraw ? 'text-muted' : 'text-accent'
            : isMyTurn ? 'text-foreground' : 'text-muted'
        } ${!isGameOver && !isMyTurn && currentTurnIsBot ? 'animate-pulse-soft' : ''}`}>
          {statusText}
        </p>

        {/* Game Over actions */}
        {isGameOver && (
          <div className="flex flex-col gap-3 w-full max-w-sm animate-fade-in-up mt-2">
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
        )}
      </div>

      {/* Leave button during gameplay */}
      {!isGameOver && (
        <div className="mt-auto pt-4">
          <button
            onClick={onLeave}
            disabled={leaving}
            className="w-full text-xs text-muted hover:text-danger transition-colors py-2"
          >
            {leaving ? 'Leaving...' : 'Leave World'}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Player Indicator ---

function PlayerIndicator({
  name,
  color,
  isActive,
  isBot,
  isWinner,
}: {
  name: string;
  color: 'red' | 'yellow';
  isActive: boolean;
  isBot: boolean;
  isWinner: boolean;
}) {
  const pieceColor = color === 'red' ? 'bg-[#ef4444]' : 'bg-[#facc15]';
  const textColor = color === 'red' ? 'text-[#ef4444]' : 'text-[#facc15]';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
      isWinner
        ? `border-accent bg-accent/10 shadow-[0_0_12px_rgba(139,92,246,0.3)]`
        : isActive
          ? `border-${color === 'red' ? '[#ef4444]/50' : '[#facc15]/50'} bg-surface-light`
          : 'border-border bg-surface'
    }`}>
      <div className={`w-4 h-4 rounded-full ${pieceColor} ${isActive ? 'animate-pulse-soft' : ''}`} />
      <span className={`text-sm font-semibold truncate max-w-[80px] ${
        isActive || isWinner ? textColor : isBot ? 'text-muted' : 'text-foreground'
      }`}>
        {name}
      </span>
      {isBot && <span className="text-[10px] text-muted">(Bot)</span>}
    </div>
  );
}

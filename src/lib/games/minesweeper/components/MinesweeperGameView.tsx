'use client';

import { useRef, useEffect } from 'react';
import type { MinesweeperGameState, MinesweeperAction, Cell } from '../types';
import { NUMBER_COLORS } from '../constants';

interface MinesweeperGameViewProps {
  game: MinesweeperGameState;
  dispatch: React.Dispatch<MinesweeperAction>;
  displayTime: string;
  minesRemaining: number;
  pressingIndex: number | null;
  initGrid: (containerWidth: number, containerHeight: number) => void;
  resetGrid: (containerWidth: number, containerHeight: number) => void;
  getLongPressHandlers: (index: number) => {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  handleCellClick: (index: number) => void;
  handleRightClick: (index: number, e: React.MouseEvent) => void;
  onChangeDifficulty: () => void;
}

export default function MinesweeperGameView({
  game,
  dispatch,
  displayTime,
  minesRemaining,
  pressingIndex,
  initGrid,
  resetGrid,
  getLongPressHandlers,
  handleCellClick,
  handleRightClick,
  onChangeDifficulty,
}: MinesweeperGameViewProps) {
  const isGameOver = game.phase === 'won' || game.phase === 'lost';
  const containerRef = useRef<HTMLDivElement>(null);

  const PADDING = 16; // horizontal padding each side for the grid

  // Measure the actual container and initialize the grid on mount
  useEffect(() => {
    if (containerRef.current) {
      initGrid(
        containerRef.current.clientWidth - PADDING * 2,
        containerRef.current.clientHeight,
      );
    }
  }, [initGrid]);

  const handlePlayAgain = () => {
    if (containerRef.current) {
      resetGrid(
        containerRef.current.clientWidth - PADDING * 2,
        containerRef.current.clientHeight,
      );
    }
  };

  // Exact pixel width for the grid to prevent overflow
  const gridWidth = game.cols > 0
    ? game.cols * game.cellSize + (game.cols - 1)
    : 0;

  return (
    <div className="flex-1 flex flex-col w-full overflow-hidden">
      {/* Header — mine counter + timer (full-width) */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'rgba(13,27,62,.5)',
          borderBottom: '1px solid rgba(240,194,127,.06)',
        }}
      >
        <span className="text-cream font-bold text-sm">
          💣 {minesRemaining}
        </span>
        <span className="text-cream font-bold text-sm">
          🕐 {displayTime}
        </span>
      </div>

      {/* Grid area — ref for measurement, no padding so measurement is accurate */}
      <div ref={containerRef} className="relative flex-1 flex items-start justify-center overflow-hidden">
        {game.cols > 0 && (
          <>
            {/* Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${game.cols}, ${game.cellSize}px)`,
                gap: '1px',
                width: `${gridWidth}px`,
                background: 'rgba(8,12,26,.6)',
                borderRadius: '8px',
                overflow: 'hidden',
                touchAction: 'manipulation',
                WebkitTouchCallout: 'none',
                userSelect: 'none',
              } as React.CSSProperties}
              onContextMenu={(e) => e.preventDefault()}
            >
              {game.cells.map((cell) => (
                <MinesweeperCell
                  key={cell.index}
                  cell={cell}
                  cellSize={game.cellSize}
                  phase={game.phase}
                  triggeredMineIndex={game.triggeredMineIndex}
                  pressingIndex={pressingIndex}
                  onCellClick={handleCellClick}
                  onRightClick={handleRightClick}
                  longPressHandlers={getLongPressHandlers(cell.index)}
                  isGameOver={isGameOver}
                />
              ))}
            </div>

            {/* Game Over Overlay */}
            {isGameOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm rounded-lg animate-fade-in"
                style={{ background: 'rgba(8,12,26,.8)' }}
              >
                <h2
                  className="font-display text-3xl font-bold"
                  style={{
                    color: game.phase === 'won' ? 'var(--glass)' : 'var(--star)',
                  }}
                >
                  {game.phase === 'won' ? 'Cleared! \u2728' : 'Boom! \uD83D\uDCA5'}
                </h2>
                <p className="text-cream text-2xl font-bold mt-2">
                  {displayTime}
                </p>
                <p className="text-muted text-sm mt-1">
                  {game.difficulty.charAt(0).toUpperCase() + game.difficulty.slice(1)} &middot; {game.cols}&times;{game.rows} &middot; {game.mineCount} 💣
                </p>
                <div className="mt-6 flex flex-col gap-3 w-48">
                  <button
                    onClick={handlePlayAgain}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-full px-6 py-2 min-h-[44px] text-center"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={onChangeDifficulty}
                    className="bg-gray-700 hover:bg-gray-600 text-white rounded-full px-6 py-2 min-h-[44px] text-center"
                  >
                    Change Difficulty
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Cell Component ---

interface MinesweeperCellProps {
  cell: Cell;
  cellSize: number;
  phase: MinesweeperGameState['phase'];
  triggeredMineIndex: number | null;
  pressingIndex: number | null;
  onCellClick: (index: number) => void;
  onRightClick: (index: number, e: React.MouseEvent) => void;
  longPressHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  isGameOver: boolean;
}

function MinesweeperCell({
  cell,
  cellSize,
  phase,
  triggeredMineIndex,
  pressingIndex,
  onCellClick,
  onRightClick,
  longPressHandlers,
  isGameOver,
}: MinesweeperCellProps) {
  const isPressing = pressingIndex === cell.index;
  const isTriggered = triggeredMineIndex === cell.index;
  const isWrongFlag = cell.flagged && !cell.mine && phase === 'lost';

  let bg: string;
  let borderTop = '';
  let borderLeft = '';
  let borderBottom = '';
  let borderRight = '';
  let content: React.ReactNode = null;
  let color = '';
  let cursor = 'default';
  const numberFontSize = Math.floor(cellSize * 0.5);
  const emojiFontSize = Math.floor(cellSize * 0.45);

  if (cell.revealed) {
    // Revealed cells — flat, no raised borders
    if (cell.mine) {
      bg = isTriggered ? 'rgba(201,101,138,.3)' : 'rgba(8,12,26,.5)';
      content = '\uD83D\uDCA3';
    } else if (cell.adjacentMines > 0) {
      bg = 'rgba(8,12,26,.5)';
      content = cell.adjacentMines;
      color = NUMBER_COLORS[cell.adjacentMines] || '#f5e6ca';
    } else {
      // Zero cell — empty
      bg = 'rgba(8,12,26,.5)';
    }
  } else if (cell.flagged) {
    // Flagged — raised look with flag emoji
    bg = isPressing ? 'rgba(240,194,127,.15)' : 'rgba(26,82,118,.4)';
    borderTop = '1px solid rgba(255,255,255,.1)';
    borderLeft = '1px solid rgba(255,255,255,.1)';
    borderBottom = '1px solid rgba(0,0,0,.2)';
    borderRight = '1px solid rgba(0,0,0,.2)';
    if (isWrongFlag) {
      content = (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          🚩
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ❌
          </span>
        </span>
      );
    } else {
      content = '🚩';
    }
  } else {
    // Unrevealed — raised 3D look
    bg = isPressing ? 'rgba(240,194,127,.15)' : 'rgba(26,82,118,.4)';
    borderTop = '1px solid rgba(255,255,255,.1)';
    borderLeft = '1px solid rgba(255,255,255,.1)';
    borderBottom = '1px solid rgba(0,0,0,.2)';
    borderRight = '1px solid rgba(0,0,0,.2)';
    if (!isGameOver) cursor = 'pointer';
  }

  return (
    <div
      onClick={!isGameOver ? () => onCellClick(cell.index) : undefined}
      onContextMenu={!isGameOver ? (e) => onRightClick(cell.index, e) : undefined}
      onTouchStart={!isGameOver ? longPressHandlers.onTouchStart : undefined}
      onTouchMove={!isGameOver ? longPressHandlers.onTouchMove : undefined}
      onTouchEnd={!isGameOver ? longPressHandlers.onTouchEnd : undefined}
      style={{
        width: cellSize,
        height: cellSize,
        background: bg,
        color: color || undefined,
        fontSize: cell.revealed && !cell.mine && cell.adjacentMines > 0
          ? `${numberFontSize}px`
          : `${emojiFontSize}px`,
        borderTop: borderTop || undefined,
        borderLeft: borderLeft || undefined,
        borderBottom: borderBottom || undefined,
        borderRight: borderRight || undefined,
        cursor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        lineHeight: 1,
      }}
    >
      {content}
    </div>
  );
}

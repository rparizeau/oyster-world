'use client';

import { useState, useEffect, useRef } from 'react';
import type { CellColor } from '../engine';
import { BOARD_COLS, BOARD_ROWS } from '../constants';

interface FourKateBoardProps {
  board: CellColor[][];
  winningCells: [number, number][] | null;
  isMyTurn: boolean;
  myColor: 'red' | 'yellow' | null;
  gameOver: boolean;
  onColumnClick: (col: number) => void;
}

export default function FourKateBoard({
  board,
  winningCells,
  isMyTurn,
  myColor,
  gameOver,
  onColumnClick,
}: FourKateBoardProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ col: number; row: number } | null>(null);
  const prevBoardRef = useRef<CellColor[][] | null>(null);

  // Track the last move for drop animation
  useEffect(() => {
    if (!prevBoardRef.current) {
      prevBoardRef.current = board;
      return;
    }

    // Find the new piece
    for (let col = 0; col < BOARD_COLS; col++) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        if (board[col][row] !== null && prevBoardRef.current[col]?.[row] === null) {
          setLastMove({ col, row });
          const timer = setTimeout(() => setLastMove(null), 500);
          prevBoardRef.current = board;
          return () => clearTimeout(timer);
        }
      }
    }

    prevBoardRef.current = board;
  }, [board]);

  const winningSet = new Set(
    winningCells?.map(([c, r]) => `${c},${r}`) ?? []
  );

  const canClick = isMyTurn && !gameOver;

  return (
    <div className="c4-board">
      {Array.from({ length: BOARD_COLS }, (_, col) => {
        // Check if column has space
        const hasSpace = board[col][BOARD_ROWS - 1] === null;
        const showGhost = canClick && hoveredCol === col && hasSpace;

        return (
          <div
            key={col}
            className="c4-column"
            onMouseEnter={() => canClick && setHoveredCol(col)}
            onMouseLeave={() => setHoveredCol(null)}
            onClick={() => canClick && hasSpace && onColumnClick(col)}
          >
            {/* Cells from bottom (row 0) to top (row 5) — column-reverse handles visual order */}
            {Array.from({ length: BOARD_ROWS }, (_, row) => {
              const cell = board[col][row];
              const isWinning = winningSet.has(`${col},${row}`);
              const isDropping = lastMove?.col === col && lastMove?.row === row;
              const dropRows = BOARD_ROWS - row;

              return (
                <div
                  key={row}
                  className={[
                    'c4-cell',
                    cell ?? '',
                    isWinning ? 'winning' : '',
                    isDropping ? 'dropping' : '',
                  ].join(' ')}
                  style={isDropping ? { '--drop-rows': dropRows } as React.CSSProperties : undefined}
                />
              );
            })}

            {/* Ghost piece at top — rendered outside the grid cells */}
            {showGhost && myColor && (
              <div
                className={`c4-ghost ${myColor}`}
                style={{ position: 'absolute', top: '-48px', left: 0, right: 0, margin: '0 auto', width: '80%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import type { MinesweeperGameState, MinesweeperAction, Difficulty } from '@/lib/games/minesweeper/types';
import { calculateGrid, getNeighbours, generateMines, floodFill } from '@/lib/games/minesweeper/helpers';
import { FLAG_LONG_PRESS_MS, LONG_PRESS_MOVE_THRESHOLD } from '@/lib/games/minesweeper/constants';

// --- Reducer ---

function minesweeperReducer(
  state: MinesweeperGameState,
  action: MinesweeperAction,
): MinesweeperGameState {
  switch (action.type) {
    case 'init': {
      const { rows, cols, cellSize, mineCount } = calculateGrid(action.containerWidth, action.containerHeight, action.difficulty);
      const totalCells = rows * cols;
      return {
        rows,
        cols,
        cellSize,
        mineCount,
        difficulty: action.difficulty,
        cells: Array.from({ length: totalCells }, (_, i) => ({
          index: i,
          mine: false,
          revealed: false,
          flagged: false,
          adjacentMines: 0,
        })),
        phase: 'ready',
        minePositions: null,
        revealedCount: 0,
        flagCount: 0,
        startedAt: null,
        endedAt: null,
        elapsed: null,
        triggeredMineIndex: null,
      };
    }

    case 'reveal': {
      if (state.phase !== 'ready' && state.phase !== 'playing') return state;
      const { index } = action;
      if (index < 0 || index >= state.cells.length) return state;

      const cell = state.cells[index];
      if (cell.revealed || cell.flagged) {
        // If revealed and numbered, treat as chord
        if (cell.revealed && cell.adjacentMines > 0 && state.phase === 'playing') {
          return minesweeperReducer(state, { type: 'chord', index });
        }
        return state;
      }

      let cells = state.cells.map((c) => ({ ...c }));
      let minePositions = state.minePositions;
      let startedAt = state.startedAt;
      let revealedCount = state.revealedCount;

      // First click — generate mines
      if (state.phase === 'ready') {
        const excludeSet = new Set([index, ...getNeighbours(index, state.rows, state.cols)]);
        const result = generateMines(
          state.rows * state.cols,
          state.mineCount,
          excludeSet,
          state.rows,
          state.cols,
        );
        cells = result.cells;
        minePositions = result.minePositions;
        startedAt = Date.now();
      }

      const targetCell = cells[index];

      // Mine hit — loss
      if (targetCell.mine) {
        const now = Date.now();
        // Reveal all mines, mark wrong flags
        for (const c of cells) {
          if (c.mine) c.revealed = true;
        }
        return {
          ...state,
          cells,
          minePositions,
          startedAt,
          phase: 'lost',
          endedAt: now,
          elapsed: Math.floor((now - startedAt!) / 1000),
          triggeredMineIndex: index,
          revealedCount,
        };
      }

      // Safe cell — reveal + flood fill if zero
      if (targetCell.adjacentMines === 0) {
        const newlyRevealed = floodFill(index, cells, state.rows, state.cols);
        revealedCount += newlyRevealed.length;
      } else {
        targetCell.revealed = true;
        revealedCount += 1;
      }

      // Check win
      const totalSafe = state.rows * state.cols - state.mineCount;
      if (revealedCount >= totalSafe) {
        const now = Date.now();
        return {
          ...state,
          cells,
          minePositions,
          startedAt,
          phase: 'won',
          endedAt: now,
          elapsed: Math.floor((now - startedAt!) / 1000),
          revealedCount,
        };
      }

      return {
        ...state,
        cells,
        minePositions,
        startedAt,
        phase: 'playing',
        revealedCount,
      };
    }

    case 'flag': {
      if (state.phase !== 'playing') return state;
      const { index } = action;
      if (index < 0 || index >= state.cells.length) return state;

      const cell = state.cells[index];
      if (cell.revealed) return state;

      const cells = state.cells.map((c) => ({ ...c }));
      const wasFlagged = cells[index].flagged;
      cells[index].flagged = !wasFlagged;

      return {
        ...state,
        cells,
        flagCount: state.flagCount + (wasFlagged ? -1 : 1),
      };
    }

    case 'chord': {
      if (state.phase !== 'playing') return state;
      const { index } = action;
      if (index < 0 || index >= state.cells.length) return state;

      const cell = state.cells[index];
      if (!cell.revealed || cell.adjacentMines === 0) return state;

      const neighbours = getNeighbours(index, state.rows, state.cols);
      const adjacentFlagCount = neighbours.filter((n) => state.cells[n].flagged).length;
      if (adjacentFlagCount !== cell.adjacentMines) return state;

      const cells = state.cells.map((c) => ({ ...c }));
      let revealedCount = state.revealedCount;
      let hitMine = false;
      let triggeredMineIndex: number | null = null;

      for (const n of neighbours) {
        const nc = cells[n];
        if (nc.revealed || nc.flagged) continue;

        if (nc.mine) {
          hitMine = true;
          if (triggeredMineIndex === null) triggeredMineIndex = n;
        } else if (nc.adjacentMines === 0) {
          const newlyRevealed = floodFill(n, cells, state.rows, state.cols);
          revealedCount += newlyRevealed.length;
        } else {
          nc.revealed = true;
          revealedCount += 1;
        }
      }

      if (hitMine) {
        const now = Date.now();
        for (const c of cells) {
          if (c.mine) c.revealed = true;
        }
        return {
          ...state,
          cells,
          phase: 'lost',
          endedAt: now,
          elapsed: Math.floor((now - state.startedAt!) / 1000),
          triggeredMineIndex,
          revealedCount,
        };
      }

      // Check win
      const totalSafe = state.rows * state.cols - state.mineCount;
      if (revealedCount >= totalSafe) {
        const now = Date.now();
        return {
          ...state,
          cells,
          phase: 'won',
          endedAt: now,
          elapsed: Math.floor((now - state.startedAt!) / 1000),
          revealedCount,
        };
      }

      return { ...state, cells, revealedCount };
    }

    case 'new-game': {
      const { rows, cols, cellSize, mineCount } = calculateGrid(
        action.containerWidth,
        action.containerHeight,
        state.difficulty,
      );
      const totalCells = rows * cols;
      return {
        rows,
        cols,
        cellSize,
        mineCount,
        difficulty: state.difficulty,
        cells: Array.from({ length: totalCells }, (_, i) => ({
          index: i,
          mine: false,
          revealed: false,
          flagged: false,
          adjacentMines: 0,
        })),
        phase: 'ready',
        minePositions: null,
        revealedCount: 0,
        flagCount: 0,
        startedAt: null,
        endedAt: null,
        elapsed: null,
        triggeredMineIndex: null,
      };
    }

    case 'tick': {
      // Timer display is derived from timestamps — no state change needed
      return state;
    }

    default:
      return state;
  }
}

// --- Initial state (replaced immediately by 'init' action) ---

const emptyState: MinesweeperGameState = {
  rows: 0,
  cols: 0,
  cellSize: 0,
  mineCount: 0,
  difficulty: 'easy',
  cells: [],
  phase: 'ready',
  minePositions: null,
  revealedCount: 0,
  flagCount: 0,
  startedAt: null,
  endedAt: null,
  elapsed: null,
  triggeredMineIndex: null,
};

// --- Format time as MM:SS ---

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Hook ---

export function useMinesweeper(difficulty: Difficulty) {
  const [game, dispatch] = useReducer(minesweeperReducer, emptyState);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const [pressingIndex, setPressingIndex] = useState<number | null>(null);

  // Called by the game view after measuring its container
  const initGrid = useCallback((containerWidth: number, containerHeight: number) => {
    dispatch({
      type: 'init',
      containerWidth,
      containerHeight,
      difficulty,
    });
  }, [difficulty]);

  const resetGrid = useCallback((containerWidth: number, containerHeight: number) => {
    dispatch({
      type: 'new-game',
      containerWidth,
      containerHeight,
    });
  }, []);

  // Timer interval — force re-render every second during 'playing' phase
  useEffect(() => {
    if (game.phase === 'playing') {
      tickRef.current = setInterval(() => {
        forceUpdate();
      }, 1000);
    } else {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [game.phase]);

  // Compute display time
  const displayTime = (() => {
    if (game.elapsed !== null) return formatTime(game.elapsed);
    if (game.startedAt !== null) {
      return formatTime(Math.floor((Date.now() - game.startedAt) / 1000));
    }
    return '00:00';
  })();

  const minesRemaining = game.mineCount - game.flagCount;

  // Cell click handler
  const handleCellClick = useCallback(
    (index: number) => {
      // Skip click if a long press just fired (mobile)
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        return;
      }
      if (game.phase === 'won' || game.phase === 'lost') return;
      const cell = game.cells[index];
      if (!cell) return;

      if (cell.revealed && cell.adjacentMines > 0) {
        dispatch({ type: 'chord', index });
      } else if (!cell.revealed && !cell.flagged) {
        dispatch({ type: 'reveal', index });
      }
    },
    [game.phase, game.cells],
  );

  // Right click handler (desktop flagging)
  const handleRightClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      if (game.phase === 'won' || game.phase === 'lost') return;
      if (game.phase === 'ready') return; // Can't flag before first click
      const cell = game.cells[index];
      if (!cell || cell.revealed) return;
      dispatch({ type: 'flag', index });
    },
    [game.phase, game.cells],
  );

  // Long press detection for mobile flagging
  const longPressFiredRef = useRef(false);
  const longPressRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    startX: number;
    startY: number;
    index: number;
    fired: boolean;
  } | null>(null);

  const getLongPressHandlers = useCallback(
    (index: number) => ({
      onTouchStart: (e: React.TouchEvent) => {
        if (game.phase === 'won' || game.phase === 'lost') return;
        if (game.phase === 'ready') return;
        const cell = game.cells[index];
        if (!cell || cell.revealed) return;

        const touch = e.touches[0];
        setPressingIndex(index);
        longPressRef.current = {
          timer: setTimeout(() => {
            if (longPressRef.current && !longPressRef.current.fired) {
              longPressRef.current.fired = true;
              longPressFiredRef.current = true;
              dispatch({ type: 'flag', index });
              setPressingIndex(null);
            }
          }, FLAG_LONG_PRESS_MS),
          startX: touch.clientX,
          startY: touch.clientY,
          index,
          fired: false,
        };
      },

      onTouchMove: (e: React.TouchEvent) => {
        if (!longPressRef.current) return;
        const touch = e.touches[0];
        const dx = touch.clientX - longPressRef.current.startX;
        const dy = touch.clientY - longPressRef.current.startY;
        if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
          if (longPressRef.current.timer) {
            clearTimeout(longPressRef.current.timer);
          }
          longPressRef.current = null;
          setPressingIndex(null);
        }
      },

      onTouchEnd: () => {
        if (longPressRef.current) {
          if (longPressRef.current.timer) {
            clearTimeout(longPressRef.current.timer);
          }
          const wasFired = longPressRef.current.fired;
          longPressRef.current = null;
          setPressingIndex(null);
          // If long press fired, prevent the tap from also revealing
          if (wasFired) return;
        } else {
          setPressingIndex(null);
        }
      },
    }),
    [game.phase, game.cells],
  );

  return {
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
  };
}

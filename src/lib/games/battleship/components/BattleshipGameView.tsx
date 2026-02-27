'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Room } from '@/lib/types';
import type { SanitizedBattleshipState, ShipPlacement, Coordinate, ShipTemplate } from '../types';
import { SHIP_SETS, VALID_COMBOS } from '../constants';

interface BattleshipGameViewProps {
  room: Room;
  battleshipState: SanitizedBattleshipState;
  playerId: string | null;
  isOwner: boolean;
  onPlaceShips: (placements: ShipPlacement[]) => void;
  onFire: (row: number, col: number) => void;
  onPlayAgain: () => void;
}

export default function BattleshipGameView({
  room,
  battleshipState: state,
  playerId,
  isOwner,
  onPlaceShips,
  onFire,
  onPlayAgain,
}: BattleshipGameViewProps) {
  if (state.phase === 'setup') {
    return (
      <SetupPhase
        state={state}
        playerId={playerId}
        onPlaceShips={onPlaceShips}
      />
    );
  }

  if (state.phase === 'playing' || state.phase === 'game_over') {
    return (
      <PlayingPhase
        room={room}
        state={state}
        playerId={playerId}
        isOwner={isOwner}
        onFire={onFire}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  return null;
}

// ============================================================
// SETUP PHASE
// ============================================================

function SetupPhase({
  state,
  playerId,
  onPlaceShips,
}: {
  state: SanitizedBattleshipState;
  playerId: string | null;
  onPlaceShips: (placements: ShipPlacement[]) => void;
}) {
  const gridSize = state.gridSize;

  const actualTemplates = useMemo(() => {
    // Look up from settings via gridSize context
    const validSets = VALID_COMBOS[gridSize] || ['classic'];
    for (const setName of validSets) {
      const templates = SHIP_SETS[setName];
      if (templates) return templates;
    }
    return SHIP_SETS.classic;
  }, [gridSize]);

  const [placements, setPlacements] = useState<Map<string, ShipPlacement>>(new Map());
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [confirmed, setConfirmed] = useState(false);

  const hasConfirmed = playerId ? state.setupReady.includes(playerId) : false;
  const isConfirmed = confirmed || hasConfirmed;

  // Build occupied cells map for placed ships
  const occupiedCells = useMemo(() => {
    const cells = new Map<string, string>(); // key -> shipId
    for (const [shipId, placement] of placements) {
      const template = actualTemplates.find((t) => t.id === shipId);
      if (!template) continue;
      for (let i = 0; i < template.size; i++) {
        const r = placement.orientation === 'vertical' ? placement.start.row + i : placement.start.row;
        const c = placement.orientation === 'horizontal' ? placement.start.col + i : placement.start.col;
        cells.set(`${r},${c}`, shipId);
      }
    }
    return cells;
  }, [placements, actualTemplates]);

  const allPlaced = placements.size === actualTemplates.length;

  const handleGridTap = useCallback((row: number, col: number) => {
    if (isConfirmed) return;

    // If tapping an already placed ship, pick it back up
    const existingShipId = occupiedCells.get(`${row},${col}`);
    if (existingShipId && !selectedShipId) {
      const placement = placements.get(existingShipId);
      if (placement) {
        setSelectedShipId(existingShipId);
        setOrientation(placement.orientation);
        setPlacements((prev) => {
          const next = new Map(prev);
          next.delete(existingShipId);
          return next;
        });
      }
      return;
    }

    if (!selectedShipId) return;

    const template = actualTemplates.find((t) => t.id === selectedShipId);
    if (!template) return;

    // Check bounds
    const endRow = orientation === 'vertical' ? row + template.size - 1 : row;
    const endCol = orientation === 'horizontal' ? col + template.size - 1 : col;
    if (endRow >= gridSize || endCol >= gridSize) return;

    // Check overlap (excluding the currently selected ship)
    for (let i = 0; i < template.size; i++) {
      const r = orientation === 'vertical' ? row + i : row;
      const c = orientation === 'horizontal' ? col + i : col;
      const key = `${r},${c}`;
      const existing = occupiedCells.get(key);
      if (existing && existing !== selectedShipId) return;
    }

    setPlacements((prev) => {
      const next = new Map(prev);
      next.set(selectedShipId, {
        shipId: selectedShipId,
        start: { row, col },
        orientation,
      });
      return next;
    });
    setSelectedShipId(null);
  }, [isConfirmed, selectedShipId, orientation, gridSize, actualTemplates, occupiedCells, placements]);

  const handleConfirm = useCallback(() => {
    if (!allPlaced || isConfirmed) return;
    setConfirmed(true);
    onPlaceShips(Array.from(placements.values()));
  }, [allPlaced, isConfirmed, placements, onPlaceShips]);

  const handleRandomize = useCallback(() => {
    if (isConfirmed) return;
    // Simple random placement
    const newPlacements = new Map<string, ShipPlacement>();
    const occupied = new Set<string>();
    const sorted = [...actualTemplates].sort((a, b) => b.size - a.size);

    for (const ship of sorted) {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 1000) {
        attempts++;
        const o: 'horizontal' | 'vertical' = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const maxR = o === 'vertical' ? gridSize - ship.size : gridSize - 1;
        const maxC = o === 'horizontal' ? gridSize - ship.size : gridSize - 1;
        const r = Math.floor(Math.random() * (maxR + 1));
        const c = Math.floor(Math.random() * (maxC + 1));

        let overlap = false;
        const positions: string[] = [];
        for (let i = 0; i < ship.size; i++) {
          const pr = o === 'vertical' ? r + i : r;
          const pc = o === 'horizontal' ? c + i : c;
          const key = `${pr},${pc}`;
          if (occupied.has(key)) { overlap = true; break; }
          positions.push(key);
        }
        if (!overlap) {
          positions.forEach((k) => occupied.add(k));
          newPlacements.set(ship.id, { shipId: ship.id, start: { row: r, col: c }, orientation: o });
          placed = true;
        }
      }
    }

    setPlacements(newPlacements);
    setSelectedShipId(null);
  }, [isConfirmed, actualTemplates, gridSize]);

  const handleSelectShip = useCallback((shipId: string) => {
    if (isConfirmed) return;
    if (placements.has(shipId)) {
      // Pick up placed ship
      const placement = placements.get(shipId)!;
      setOrientation(placement.orientation);
      setPlacements((prev) => {
        const next = new Map(prev);
        next.delete(shipId);
        return next;
      });
      setSelectedShipId(shipId);
    } else if (selectedShipId === shipId) {
      setSelectedShipId(null);
    } else {
      setSelectedShipId(shipId);
    }
  }, [isConfirmed, placements, selectedShipId]);

  return (
    <div className="flex flex-1 flex-col p-4 pb-6 max-w-lg mx-auto w-full animate-fade-in">
      <h2 className="text-center font-display text-xl text-cream mb-3">Place Your Fleet</h2>

      {/* Grid */}
      <SetupGrid
        gridSize={gridSize}
        occupiedCells={occupiedCells}
        selectedShipId={selectedShipId}
        orientation={orientation}
        shipTemplate={selectedShipId ? actualTemplates.find((t) => t.id === selectedShipId) : undefined}
        onCellTap={handleGridTap}
        disabled={isConfirmed}
      />

      {/* Ship roster */}
      <div className="flex gap-2 overflow-x-auto py-3 -mx-1 px-1 scrollbar-hide">
        {actualTemplates.map((ship) => {
          const isPlaced = placements.has(ship.id);
          const isSelected = selectedShipId === ship.id;
          return (
            <button
              key={ship.id}
              onClick={() => handleSelectShip(ship.id)}
              disabled={isConfirmed}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border min-h-[44px] transition-all ${
                isSelected
                  ? 'border-pearl/40 bg-pearl/8 shadow-[0_0_8px_rgba(240,194,127,0.15)]'
                  : isPlaced
                    ? 'border-border-light bg-white/4 opacity-50'
                    : 'border-border-light bg-white/4'
              }`}
            >
              <span className={`text-sm font-semibold ${isSelected ? 'text-pearl' : 'text-cream'}`}>
                {ship.name}
              </span>
              <span className="flex gap-0.5">
                {Array.from({ length: ship.size }).map((_, i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: isPlaced ? 'rgba(126,184,212,.25)' : 'rgba(126,184,212,.5)' }}
                  />
                ))}
              </span>
              {isPlaced && <span className="text-xs text-glass">&#10003;</span>}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => setOrientation((o) => o === 'horizontal' ? 'vertical' : 'horizontal')}
          disabled={isConfirmed || !selectedShipId}
          className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
        >
          {orientation === 'horizontal' ? '↔' : '↕'} Rotate
        </button>
        <button
          onClick={handleRandomize}
          disabled={isConfirmed}
          className="btn-secondary flex-1"
        >
          Randomize
        </button>
        <button
          onClick={handleConfirm}
          disabled={!allPlaced || isConfirmed}
          className="btn-primary flex-1"
        >
          {isConfirmed ? 'Confirmed' : 'Confirm Fleet'}
        </button>
      </div>

      {isConfirmed && (
        <p className="text-center text-sm text-muted mt-4 animate-pulse-soft">
          Waiting for opponent...
        </p>
      )}
    </div>
  );
}

// ============================================================
// SETUP GRID
// ============================================================

function SetupGrid({
  gridSize,
  occupiedCells,
  selectedShipId,
  orientation,
  shipTemplate,
  onCellTap,
  disabled,
}: {
  gridSize: number;
  occupiedCells: Map<string, string>;
  selectedShipId: string | null;
  orientation: 'horizontal' | 'vertical';
  shipTemplate?: ShipTemplate;
  onCellTap: (row: number, col: number) => void;
  disabled: boolean;
}) {
  const [hoverCell, setHoverCell] = useState<Coordinate | null>(null);

  // Preview cells for the selected ship at hover position
  const previewCells = useMemo(() => {
    if (!hoverCell || !shipTemplate || !selectedShipId) return { cells: [], valid: false };
    const cells: Coordinate[] = [];
    for (let i = 0; i < shipTemplate.size; i++) {
      const r = orientation === 'vertical' ? hoverCell.row + i : hoverCell.row;
      const c = orientation === 'horizontal' ? hoverCell.col + i : hoverCell.col;
      cells.push({ row: r, col: c });
    }
    // Check validity
    const outOfBounds = cells.some((c) => c.row >= gridSize || c.col >= gridSize);
    const overlap = cells.some((c) => {
      const key = `${c.row},${c.col}`;
      const existing = occupiedCells.get(key);
      return existing && existing !== selectedShipId;
    });
    return { cells, valid: !outOfBounds && !overlap };
  }, [hoverCell, shipTemplate, selectedShipId, orientation, gridSize, occupiedCells]);

  const previewSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of previewCells.cells) set.add(`${c.row},${c.col}`);
    return set;
  }, [previewCells]);

  const colLabels = 'ABCDEFGHIJ'.slice(0, gridSize);

  return (
    <div className="w-full aspect-square max-w-[min(100%,400px)] mx-auto">
      {/* Column labels */}
      <div className="flex ml-6">
        {colLabels.split('').map((label) => (
          <div key={label} className="flex-1 text-center text-[0.5rem] text-muted font-bold">
            {label}
          </div>
        ))}
      </div>

      <div className="flex">
        {/* Row labels */}
        <div className="flex flex-col w-6">
          {Array.from({ length: gridSize }).map((_, r) => (
            <div key={r} className="flex-1 flex items-center justify-center text-[0.5rem] text-muted font-bold">
              {r + 1}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div
          className="flex-1 grid aspect-square"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize}, 1fr)`,
          }}
        >
          {Array.from({ length: gridSize * gridSize }).map((_, i) => {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            const key = `${row},${col}`;
            const shipId = occupiedCells.get(key);
            const isPreview = previewSet.has(key);
            const isOccupied = !!shipId;

            let cellStyle = 'bg-[rgba(126,184,212,0.06)]';
            if (isOccupied) {
              cellStyle = 'bg-[rgba(126,184,212,0.25)]';
            }
            if (isPreview) {
              cellStyle = previewCells.valid
                ? 'bg-[rgba(107,191,163,0.15)]'
                : 'bg-[rgba(201,101,138,0.2)]';
            }

            return (
              <button
                key={key}
                className={`${cellStyle} border border-[rgba(245,230,202,0.08)] transition-colors ${
                  disabled ? 'cursor-default' : 'cursor-pointer active:brightness-125'
                }`}
                onClick={() => onCellTap(row, col)}
                onMouseEnter={() => setHoverCell({ row, col })}
                onMouseLeave={() => setHoverCell(null)}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PLAYING PHASE
// ============================================================

function PlayingPhase({
  room,
  state,
  playerId,
  isOwner,
  onFire,
  onPlayAgain,
}: {
  room: Room;
  state: SanitizedBattleshipState;
  playerId: string | null;
  isOwner: boolean;
  onFire: (row: number, col: number) => void;
  onPlayAgain: () => void;
}) {
  const isGameOver = state.phase === 'game_over';
  const isMyTurn = state.isMyTurn;
  const gridSize = state.gridSize;

  const opponentId = state.turnOrder[0] === playerId ? state.turnOrder[1] : state.turnOrder[0];
  const opponentPlayer = room.players.find((p) => p.id === opponentId);
  const currentTurnPlayer = room.players.find((p) => p.id === state.currentTurn);
  const winnerPlayer = state.winner ? room.players.find((p) => p.id === state.winner) : null;

  // Build sets for fast lookup on attack grid
  const attackHits = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.opponentBoard.shotsReceived) {
      if (s.result === 'hit') set.add(`${s.row},${s.col}`);
    }
    return set;
  }, [state.opponentBoard.shotsReceived]);

  const attackMisses = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.opponentBoard.shotsReceived) {
      if (s.result === 'miss') set.add(`${s.row},${s.col}`);
    }
    return set;
  }, [state.opponentBoard.shotsReceived]);

  const attackSunkCells = useMemo(() => {
    const set = new Set<string>();
    for (const ship of state.opponentBoard.sunkShips) {
      for (const pos of ship.positions) {
        set.add(`${pos.row},${pos.col}`);
      }
    }
    return set;
  }, [state.opponentBoard.sunkShips]);

  // On game over, reveal all opponent ships
  const revealedShipCells = useMemo(() => {
    const set = new Set<string>();
    if (state.opponentShips) {
      for (const ship of state.opponentShips) {
        for (const pos of ship.positions) {
          set.add(`${pos.row},${pos.col}`);
        }
      }
    }
    return set;
  }, [state.opponentShips]);

  // Build sets for defense grid
  const defenseShipCells = useMemo(() => {
    const set = new Set<string>();
    for (const ship of state.myBoard.ships) {
      for (const pos of ship.positions) {
        set.add(`${pos.row},${pos.col}`);
      }
    }
    return set;
  }, [state.myBoard.ships]);

  const defenseHits = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.myBoard.shotsReceived) {
      if (s.result === 'hit') set.add(`${s.row},${s.col}`);
    }
    return set;
  }, [state.myBoard.shotsReceived]);

  const defenseMisses = useMemo(() => {
    const set = new Set<string>();
    for (const s of state.myBoard.shotsReceived) {
      if (s.result === 'miss') set.add(`${s.row},${s.col}`);
    }
    return set;
  }, [state.myBoard.shotsReceived]);

  const handleAttackTap = useCallback((row: number, col: number) => {
    if (!isMyTurn || isGameOver) return;
    const key = `${row},${col}`;
    if (attackHits.has(key) || attackMisses.has(key)) return;
    onFire(row, col);
  }, [isMyTurn, isGameOver, attackHits, attackMisses, onFire]);

  // Status text
  let statusText = '';
  if (isGameOver) {
    statusText = winnerPlayer
      ? winnerPlayer.id === playerId ? 'You win!' : `${winnerPlayer.name} wins!`
      : 'Game over!';
  } else if (isMyTurn) {
    statusText = 'Your turn — fire a shot!';
  } else if (currentTurnPlayer?.isBot) {
    statusText = 'Bot is thinking...';
  } else {
    statusText = `Waiting for ${currentTurnPlayer?.name || 'opponent'}...`;
  }

  // Shot result text
  const lastShotText = state.lastShot
    ? state.lastShot.result === 'sunk'
      ? `${state.lastShot.shipName} sunk!`
      : state.lastShot.result === 'hit'
        ? 'Hit!'
        : 'Miss'
    : '';

  const colLabels = 'ABCDEFGHIJ'.slice(0, gridSize);

  return (
    <div className="flex flex-1 flex-col p-3 pb-6 max-w-lg mx-auto w-full animate-fade-in">
      {/* Status */}
      <div className="text-center mb-2">
        <p className={`text-sm font-semibold ${
          isGameOver
            ? (winnerPlayer?.id === playerId ? 'text-accent' : 'text-muted')
            : isMyTurn ? 'text-foreground' : 'text-muted'
        } ${!isGameOver && !isMyTurn && currentTurnPlayer?.isBot ? 'animate-pulse-soft' : ''}`}>
          {statusText}
        </p>
        {lastShotText && !isGameOver && (
          <p className={`text-xs font-bold mt-0.5 ${
            state.lastShot?.result === 'miss' ? 'text-muted' : 'text-[var(--coral)]'
          }`}>
            {lastShotText}
          </p>
        )}
      </div>

      {/* Attack grid — opponent's board */}
      <div className="mb-2">
        <div className="text-[0.6rem] uppercase tracking-[2px] font-bold text-muted mb-1 text-center">
          {opponentPlayer?.name || 'Opponent'}
        </div>
        <div className={`w-full max-w-[min(100%,340px)] mx-auto ${isMyTurn && !isGameOver ? 'ring-2 ring-glass/30 rounded' : ''}`}>
          <div className="flex ml-5">
            {colLabels.split('').map((label) => (
              <div key={label} className="flex-1 text-center text-[0.45rem] text-muted font-bold">{label}</div>
            ))}
          </div>
          <div className="flex">
            <div className="flex flex-col w-5">
              {Array.from({ length: gridSize }).map((_, r) => (
                <div key={r} className="flex-1 flex items-center justify-center text-[0.45rem] text-muted font-bold">{r + 1}</div>
              ))}
            </div>
            <div
              className="flex-1 grid aspect-square"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gridTemplateRows: `repeat(${gridSize}, 1fr)`,
              }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const key = `${row},${col}`;
                const isHit = attackHits.has(key);
                const isMiss = attackMisses.has(key);
                const isSunk = attackSunkCells.has(key);
                const isRevealed = revealedShipCells.has(key);
                const isFired = isHit || isMiss;

                let bg = 'bg-[rgba(126,184,212,0.06)]';
                if (isSunk) bg = 'bg-[rgba(201,101,138,0.15)]';
                else if (isRevealed && !isHit) bg = 'bg-[rgba(126,184,212,0.12)]';

                return (
                  <button
                    key={key}
                    className={`${bg} border border-[rgba(245,230,202,0.08)] relative transition-colors ${
                      isMyTurn && !isGameOver && !isFired
                        ? 'cursor-pointer hover:bg-[rgba(126,184,212,0.15)] active:bg-[rgba(126,184,212,0.2)]'
                        : 'cursor-default'
                    }`}
                    onClick={() => handleAttackTap(row, col)}
                    disabled={!isMyTurn || isGameOver || isFired}
                  >
                    {isHit && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`w-2/3 h-2/3 rounded-full ${isSunk ? 'bg-[var(--star)]' : 'bg-[var(--coral)]'}`} />
                      </div>
                    )}
                    {isMiss && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[rgba(245,230,202,0.15)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex justify-center gap-6 mb-2 text-[0.65rem]">
        <span className="text-muted">
          Ships remaining: <span className="text-cream font-bold">{state.opponentBoard.shipsRemaining}</span>
        </span>
      </div>

      {/* Defense grid — my board */}
      <div>
        <div className="text-[0.6rem] uppercase tracking-[2px] font-bold text-muted mb-1 text-center">
          Your Fleet
        </div>
        <div className="w-[55%] max-w-[220px] mx-auto">
          <div className="flex ml-4">
            {colLabels.split('').map((label) => (
              <div key={label} className="flex-1 text-center text-[0.4rem] text-muted font-bold">{label}</div>
            ))}
          </div>
          <div className="flex">
            <div className="flex flex-col w-4">
              {Array.from({ length: gridSize }).map((_, r) => (
                <div key={r} className="flex-1 flex items-center justify-center text-[0.4rem] text-muted font-bold">{r + 1}</div>
              ))}
            </div>
            <div
              className="flex-1 grid aspect-square"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gridTemplateRows: `repeat(${gridSize}, 1fr)`,
              }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, i) => {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const key = `${row},${col}`;
                const isShip = defenseShipCells.has(key);
                const isHit = defenseHits.has(key);
                const isMiss = defenseMisses.has(key);

                let bg = 'bg-[rgba(126,184,212,0.06)]';
                if (isShip) bg = 'bg-[rgba(126,184,212,0.2)]';

                return (
                  <div
                    key={key}
                    className={`${bg} border border-[rgba(245,230,202,0.06)] relative`}
                  >
                    {isHit && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2/3 h-2/3 rounded-full bg-[var(--coral)]" />
                      </div>
                    )}
                    {isMiss && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-[rgba(245,230,202,0.12)]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Game Over actions */}
      {isGameOver && isOwner && (
        <div className="flex flex-col gap-3 w-full max-w-sm mx-auto animate-fade-in-up mt-4">
          <button
            onClick={onPlayAgain}
            className="btn-primary w-full text-lg"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}

import type { Coordinate, ShipPlacement, BattleshipState, ShipTemplate } from './types';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a valid random ship placement for the bot.
 * Places ships largest-first with random orientation.
 */
export function generateBotPlacement(
  gridSize: number,
  ships: ShipTemplate[],
): ShipPlacement[] {
  const occupied = new Set<string>();
  const placements: ShipPlacement[] = [];

  // Sort largest first for better packing
  const sorted = [...ships].sort((a, b) => b.size - a.size);

  for (const ship of sorted) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 1000) {
      attempts++;
      const orientation: 'horizontal' | 'vertical' = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const maxRow = orientation === 'vertical' ? gridSize - ship.size : gridSize - 1;
      const maxCol = orientation === 'horizontal' ? gridSize - ship.size : gridSize - 1;

      const startRow = randomInt(0, maxRow);
      const startCol = randomInt(0, maxCol);

      const positions: Coordinate[] = [];
      let overlap = false;

      for (let i = 0; i < ship.size; i++) {
        const r = orientation === 'vertical' ? startRow + i : startRow;
        const c = orientation === 'horizontal' ? startCol + i : startCol;
        const key = `${r},${c}`;
        if (occupied.has(key)) {
          overlap = true;
          break;
        }
        positions.push({ row: r, col: c });
      }

      if (!overlap) {
        for (const pos of positions) {
          occupied.add(`${pos.row},${pos.col}`);
        }
        placements.push({
          shipId: ship.id,
          start: { row: startRow, col: startCol },
          orientation,
        });
        placed = true;
      }
    }
  }

  return placements;
}

/**
 * Hunt-and-target bot shot algorithm.
 * - Target mode: extend lines of unsunk hits, try adjacent for isolated hits
 * - Hunt mode: checkerboard parity filter, random pick
 */
export function getBotShot(
  state: BattleshipState,
  botId: string,
): Coordinate {
  const opponentId = state.turnOrder[0] === botId ? state.turnOrder[1] : state.turnOrder[0];
  const opponentBoard = state.boards[opponentId];
  const gridSize = state.gridSize;

  // Build fired set
  const fired = new Set<string>();
  for (const shot of opponentBoard.shotsReceived) {
    fired.add(`${shot.row},${shot.col}`);
  }

  // Build unsunk hits: hits on ships that are NOT sunk
  const sunkPositions = new Set<string>();
  for (const ship of opponentBoard.ships) {
    if (ship.sunk) {
      for (const pos of ship.positions) {
        sunkPositions.add(`${pos.row},${pos.col}`);
      }
    }
  }

  const unsunkHits: Coordinate[] = [];
  for (const shot of opponentBoard.shotsReceived) {
    if (shot.result === 'hit' && !sunkPositions.has(`${shot.row},${shot.col}`)) {
      unsunkHits.push({ row: shot.row, col: shot.col });
    }
  }

  // Target mode
  if (unsunkHits.length > 0) {
    const target = getTargetShot(unsunkHits, fired, gridSize);
    if (target) return target;
  }

  // Hunt mode: checkerboard parity
  return getHuntShot(fired, gridSize);
}

function getTargetShot(
  hits: Coordinate[],
  fired: Set<string>,
  gridSize: number,
): Coordinate | null {
  // Try to find a line of 2+ hits
  const hitSet = new Set(hits.map((h) => `${h.row},${h.col}`));

  // Check for horizontal lines
  for (const hit of hits) {
    const lineH: Coordinate[] = [hit];
    // Extend right
    for (let c = hit.col + 1; c < gridSize; c++) {
      if (hitSet.has(`${hit.row},${c}`)) lineH.push({ row: hit.row, col: c });
      else break;
    }
    // Extend left
    for (let c = hit.col - 1; c >= 0; c--) {
      if (hitSet.has(`${hit.row},${c}`)) lineH.push({ row: hit.row, col: c });
      else break;
    }

    if (lineH.length >= 2) {
      const cols = lineH.map((h) => h.col).sort((a, b) => a - b);
      // Try extending forward (right)
      const rightCol = cols[cols.length - 1] + 1;
      if (rightCol < gridSize && !fired.has(`${hit.row},${rightCol}`)) {
        return { row: hit.row, col: rightCol };
      }
      // Try extending backward (left)
      const leftCol = cols[0] - 1;
      if (leftCol >= 0 && !fired.has(`${hit.row},${leftCol}`)) {
        return { row: hit.row, col: leftCol };
      }
    }
  }

  // Check for vertical lines
  for (const hit of hits) {
    const lineV: Coordinate[] = [hit];
    // Extend down
    for (let r = hit.row + 1; r < gridSize; r++) {
      if (hitSet.has(`${r},${hit.col}`)) lineV.push({ row: r, col: hit.col });
      else break;
    }
    // Extend up
    for (let r = hit.row - 1; r >= 0; r--) {
      if (hitSet.has(`${r},${hit.col}`)) lineV.push({ row: r, col: hit.col });
      else break;
    }

    if (lineV.length >= 2) {
      const rows = lineV.map((h) => h.row).sort((a, b) => a - b);
      // Try extending forward (down)
      const downRow = rows[rows.length - 1] + 1;
      if (downRow < gridSize && !fired.has(`${downRow},${hit.col}`)) {
        return { row: downRow, col: hit.col };
      }
      // Try extending backward (up)
      const upRow = rows[0] - 1;
      if (upRow >= 0 && !fired.has(`${upRow},${hit.col}`)) {
        return { row: upRow, col: hit.col };
      }
    }
  }

  // Isolated hit(s) — try adjacent cells
  const adjacent: Coordinate[] = [];
  for (const hit of hits) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const r = hit.row + dr;
      const c = hit.col + dc;
      if (r >= 0 && r < gridSize && c >= 0 && c < gridSize && !fired.has(`${r},${c}`)) {
        adjacent.push({ row: r, col: c });
      }
    }
  }

  if (adjacent.length > 0) {
    return adjacent[Math.floor(Math.random() * adjacent.length)];
  }

  return null;
}

function getHuntShot(fired: Set<string>, gridSize: number): Coordinate {
  // Checkerboard parity candidates
  const parityCandidates: Coordinate[] = [];
  const allCandidates: Coordinate[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (fired.has(`${r},${c}`)) continue;
      allCandidates.push({ row: r, col: c });
      if ((r + c) % 2 === 0) {
        parityCandidates.push({ row: r, col: c });
      }
    }
  }

  const candidates = parityCandidates.length > 0 ? parityCandidates : allCandidates;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

import type { Player } from '@/lib/types';
import type { GameModule, GameAction, AdvancementResult } from '@/lib/games/types';
import type {
  BattleshipState,
  PlayerBoard,
  Ship,
  Coordinate,
  ShotRecord,
  ShotResult,
  SanitizedBattleshipState,
  ShipPlacement,
  ShipTemplate,
} from './types';
import { SHIP_SETS, VALID_COMBOS, DEFAULT_GRID_SIZE, BOT_SETUP_DELAY_MS, BOT_SHOT_DELAY_MS } from './constants';
import { generateBotPlacement, getBotShot } from './bots';

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getShipTemplates(shipSet: string): ShipTemplate[] {
  return SHIP_SETS[shipSet] || SHIP_SETS.classic;
}

function getOpponentId(state: BattleshipState, playerId: string): string {
  return state.turnOrder[0] === playerId ? state.turnOrder[1] : state.turnOrder[0];
}

// --- Placement Validation ---

function expandPlacement(placement: ShipPlacement, shipTemplate: ShipTemplate): Coordinate[] {
  const positions: Coordinate[] = [];
  for (let i = 0; i < shipTemplate.size; i++) {
    const row = placement.orientation === 'vertical' ? placement.start.row + i : placement.start.row;
    const col = placement.orientation === 'horizontal' ? placement.start.col + i : placement.start.col;
    positions.push({ row, col });
  }
  return positions;
}

function validatePlacements(
  placements: ShipPlacement[],
  gridSize: number,
  shipTemplates: ShipTemplate[],
): Ship[] | null {
  // Check all ships present
  const templateMap = new Map(shipTemplates.map((t) => [t.id, t]));
  if (placements.length !== shipTemplates.length) return null;

  const occupied = new Set<string>();
  const ships: Ship[] = [];

  for (const placement of placements) {
    const template = templateMap.get(placement.shipId);
    if (!template) return null;
    templateMap.delete(placement.shipId); // consume — no duplicates

    const positions = expandPlacement(placement, template);

    // Check bounds and overlaps
    for (const pos of positions) {
      if (pos.row < 0 || pos.row >= gridSize || pos.col < 0 || pos.col >= gridSize) return null;
      const key = `${pos.row},${pos.col}`;
      if (occupied.has(key)) return null;
      occupied.add(key);
    }

    ships.push({
      id: template.id,
      name: template.name,
      size: template.size,
      positions,
      hits: [],
      sunk: false,
    });
  }

  // All templates must have been used
  if (templateMap.size !== 0) return null;

  return ships;
}

// --- Core Game Logic ---

function processPlaceShips(
  state: BattleshipState,
  playerId: string,
  placements: ShipPlacement[],
  players: Player[] | undefined,
): BattleshipState {
  if (state.phase !== 'setup') return state;
  if (state.setupReady.includes(playerId)) return state;
  if (!state.boards[playerId]) return state;

  const shipTemplates = getShipTemplates(state.shipSet);
  const ships = validatePlacements(placements, state.gridSize, shipTemplates);
  if (!ships) return state;

  const newBoards = {
    ...state.boards,
    [playerId]: { ...state.boards[playerId], ships },
  };
  const newSetupReady = [...state.setupReady, playerId];

  // Both players ready → transition to playing
  if (newSetupReady.length === 2) {
    const firstPlayer = state.turnOrder[0];
    let botActionAt: number | null = null;

    // Check if first player is a bot
    if (players) {
      const firstP = players.find((p) => p.id === firstPlayer);
      if (firstP?.isBot) {
        botActionAt = Date.now() + randomBetween(BOT_SHOT_DELAY_MS[0], BOT_SHOT_DELAY_MS[1]);
      }
    }

    return {
      ...state,
      boards: newBoards,
      setupReady: newSetupReady,
      phase: 'playing',
      currentTurn: firstPlayer,
      botActionAt,
    };
  }

  return {
    ...state,
    boards: newBoards,
    setupReady: newSetupReady,
  };
}

function processFire(
  state: BattleshipState,
  playerId: string,
  row: number,
  col: number,
): BattleshipState {
  if (state.phase !== 'playing') return state;
  if (state.currentTurn !== playerId) return state;

  const opponentId = getOpponentId(state, playerId);
  const opponentBoard = state.boards[opponentId];

  // Validate bounds
  if (row < 0 || row >= state.gridSize || col < 0 || col >= state.gridSize) return state;

  // Check if cell already fired
  const alreadyFired = opponentBoard.shotsReceived.some(
    (s) => s.row === row && s.col === col,
  );
  if (alreadyFired) return state;

  // Check hit or miss
  let hitShip: Ship | null = null;
  for (const ship of opponentBoard.ships) {
    if (ship.sunk) continue;
    for (const pos of ship.positions) {
      if (pos.row === row && pos.col === col) {
        hitShip = ship;
        break;
      }
    }
    if (hitShip) break;
  }

  const shotRecord: ShotRecord = {
    row,
    col,
    result: hitShip ? 'hit' : 'miss',
    shipId: hitShip?.id,
  };

  // Update opponent board with shot
  let updatedShips = opponentBoard.ships;
  let isSunk = false;

  if (hitShip) {
    updatedShips = opponentBoard.ships.map((ship) => {
      if (ship.id !== hitShip!.id) return ship;
      const newHits = [...ship.hits, { row, col }];
      const sunk = newHits.length === ship.size;
      if (sunk) isSunk = true;
      return { ...ship, hits: newHits, sunk };
    });
  }

  const newOpponentBoard: PlayerBoard = {
    ships: updatedShips,
    shotsReceived: [...opponentBoard.shotsReceived, shotRecord],
  };

  const newBoards = {
    ...state.boards,
    [opponentId]: newOpponentBoard,
  };

  const shotResult: ShotResult = {
    attackerId: playerId,
    defenderId: opponentId,
    row,
    col,
    result: isSunk ? 'sunk' : hitShip ? 'hit' : 'miss',
    shipName: isSunk ? hitShip!.name : undefined,
    shipPositions: isSunk ? hitShip!.positions : undefined,
  };

  // Check if all opponent ships sunk
  const allSunk = newOpponentBoard.ships.every((s) => s.sunk);

  if (allSunk) {
    return {
      ...state,
      boards: newBoards,
      lastShot: shotResult,
      shotHistory: [...state.shotHistory, shotResult],
      phase: 'game_over',
      winner: playerId,
      botActionAt: null,
    };
  }

  // Switch turn
  const nextTurn = getOpponentId(state, playerId);

  return {
    ...state,
    boards: newBoards,
    lastShot: shotResult,
    shotHistory: [...state.shotHistory, shotResult],
    currentTurn: nextTurn,
    botActionAt: null, // Caller sets if next is bot
  };
}

// --- GameModule Implementation ---

export const battleshipModule: GameModule<BattleshipState> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialize(players: Player[], settings?: Record<string, any>): BattleshipState {
    const gridSize = (settings?.gridSize as number) || DEFAULT_GRID_SIZE;
    const shipSet = (settings?.shipSet as string) || 'classic';

    // Validate combo
    const validSets = VALID_COMBOS[gridSize];
    if (!validSets || !validSets.includes(shipSet)) {
      // Fallback to defaults if invalid
      return this.initialize(players, { gridSize: DEFAULT_GRID_SIZE, shipSet: 'classic' });
    }

    const turnOrder: [string, string] = [players[0].id, players[1].id];

    const boards: Record<string, PlayerBoard> = {};
    for (const player of players) {
      boards[player.id] = { ships: [], shotsReceived: [] };
    }

    // Check if any player is a bot — schedule bot placement
    const hasBotPlayer = players.some((p) => p.isBot);
    const botActionAt = hasBotPlayer
      ? Date.now() + randomBetween(BOT_SETUP_DELAY_MS[0], BOT_SETUP_DELAY_MS[1])
      : null;

    return {
      phase: 'setup',
      gridSize,
      shipSet,
      boards,
      turnOrder,
      currentTurn: turnOrder[0],
      winner: null,
      setupReady: [],
      lastShot: null,
      shotHistory: [],
      botActionAt,
    };
  },

  processAction(state: BattleshipState, playerId: string, action: GameAction): BattleshipState {
    switch (action.type) {
      case 'place-ships': {
        const payload = action.payload as { placements?: ShipPlacement[]; _players?: Player[] } | undefined;
        if (!payload?.placements) return state;
        return processPlaceShips(state, playerId, payload.placements, payload._players);
      }
      case 'fire': {
        const payload = action.payload as { row?: number; col?: number } | undefined;
        if (payload?.row === undefined || payload?.col === undefined) return state;
        return processFire(state, playerId, payload.row, payload.col);
      }
      default:
        return state;
    }
  },

  getBotAction(state: BattleshipState, botId: string): GameAction {
    if (state.phase === 'setup' && !state.setupReady.includes(botId)) {
      const shipTemplates = getShipTemplates(state.shipSet);
      const placements = generateBotPlacement(state.gridSize, shipTemplates);
      return { type: 'place-ships', payload: { placements } };
    }

    if (state.phase === 'playing' && state.currentTurn === botId) {
      const shot = getBotShot(state, botId);
      return { type: 'fire', payload: { row: shot.row, col: shot.col } };
    }

    return { type: 'noop' };
  },

  checkGameOver(state: BattleshipState) {
    if (state.phase === 'game_over') {
      return { isOver: true, winnerId: state.winner ?? undefined };
    }
    return { isOver: false };
  },

  sanitizeForPlayer(state: BattleshipState, playerId: string): SanitizedBattleshipState {
    const opponentId = getOpponentId(state, playerId);
    const myBoard = state.boards[playerId];
    const opponentBoard = state.boards[opponentId];

    const sunkShips = opponentBoard?.ships.filter((s) => s.sunk) ?? [];
    const shipsRemaining = opponentBoard?.ships.filter((s) => !s.sunk).length ?? 0;

    const sanitized: SanitizedBattleshipState = {
      phase: state.phase,
      gridSize: state.gridSize,
      myBoard: myBoard
        ? { ships: myBoard.ships, shotsReceived: myBoard.shotsReceived }
        : { ships: [], shotsReceived: [] },
      opponentBoard: {
        shotsReceived: opponentBoard?.shotsReceived ?? [],
        sunkShips,
        shipsRemaining,
      },
      currentTurn: state.currentTurn,
      isMyTurn: state.currentTurn === playerId && state.phase === 'playing',
      lastShot: state.lastShot,
      winner: state.winner,
      turnOrder: state.turnOrder,
      setupReady: state.setupReady,
    };

    // On game_over, reveal all opponent ships
    if (state.phase === 'game_over' && opponentBoard) {
      sanitized.opponentShips = opponentBoard.ships;
    }

    return sanitized;
  },

  processAdvancement(state: BattleshipState, players: Player[], now: number): AdvancementResult | null {
    if (!state.botActionAt || now < state.botActionAt) return null;

    // Setup phase — bot needs to place ships
    if (state.phase === 'setup') {
      // Find bots that haven't placed
      const botPlayers = players.filter((p) => p.isBot && !state.setupReady.includes(p.id));
      if (botPlayers.length === 0) return null;

      let currentState = state;
      const roomEvents: AdvancementResult['roomEvents'] = [];
      const playerEvents: AdvancementResult['playerEvents'] = [];

      for (const bot of botPlayers) {
        const action = this.getBotAction(currentState, bot.id);
        if (action.type === 'noop') continue;

        // Inject players for placement transition logic
        const enrichedAction = { ...action, payload: { ...(action.payload as Record<string, unknown>), _players: players } };
        const newState = this.processAction(currentState, bot.id, enrichedAction);

        if (newState !== currentState) {
          roomEvents.push({
            event: 'setup-ready',
            data: { playerId: bot.id },
          });

          // If transitioned to playing, send board updates to each player
          if (newState.phase === 'playing' && currentState.phase === 'setup') {
            for (const p of players) {
              playerEvents.push({
                playerId: p.id,
                event: 'board-updated',
                data: { board: this.sanitizeForPlayer(newState, p.id) },
              });
            }
          }

          currentState = newState;
        }
      }

      if (currentState === state) return null;

      // If transitioned to playing and first turn is a bot, schedule next action
      let stateToSave = currentState;
      if (currentState.phase === 'playing') {
        const currentPlayer = players.find((p) => p.id === currentState.currentTurn);
        if (currentPlayer?.isBot) {
          stateToSave = {
            ...currentState,
            botActionAt: Date.now() + randomBetween(BOT_SHOT_DELAY_MS[0], BOT_SHOT_DELAY_MS[1]),
          };
        } else {
          stateToSave = { ...currentState, botActionAt: null };
        }
      } else {
        // Still in setup, but no more bots to place — clear timer
        stateToSave = { ...currentState, botActionAt: null };
      }

      const setupReadyBefore = state.setupReady.length;
      return {
        newState: stateToSave,
        canApply: (current) => (current as BattleshipState).setupReady.length === setupReadyBefore,
        roomEvents,
        playerEvents,
        recurse: stateToSave.phase === 'playing' && stateToSave.botActionAt !== null,
      };
    }

    // Playing phase — bot fires
    if (state.phase === 'playing') {
      const currentPlayer = players.find((p) => p.id === state.currentTurn);
      if (!currentPlayer?.isBot) return null;

      const shotCountBefore = state.shotHistory.length;
      const action = this.getBotAction(state, currentPlayer.id);
      if (action.type === 'noop') return null;

      const newState = this.processAction(state, currentPlayer.id, action);
      if (newState === state || newState.shotHistory.length === shotCountBefore) return null;

      const lastShot = newState.lastShot!;
      const roomEvents: AdvancementResult['roomEvents'] = [];
      const playerEvents: AdvancementResult['playerEvents'] = [];

      roomEvents.push({
        event: 'shot-fired',
        data: { shot: lastShot },
      });

      if (lastShot.result === 'sunk') {
        roomEvents.push({
          event: 'ship-sunk',
          data: { shot: lastShot, shipName: lastShot.shipName },
        });
      }

      if (newState.phase === 'game_over') {
        roomEvents.push({
          event: 'game-over',
          data: {
            winner: newState.winner,
            boards: newState.boards,
          },
        });
      }

      // Send personalized board updates
      for (const p of players) {
        playerEvents.push({
          playerId: p.id,
          event: 'board-updated',
          data: { board: this.sanitizeForPlayer(newState, p.id) },
        });
      }

      // If game continues and next player is a bot, set botActionAt
      let stateToSave = newState;
      if (newState.phase === 'playing') {
        const nextPlayer = players.find((p) => p.id === newState.currentTurn);
        if (nextPlayer?.isBot) {
          stateToSave = {
            ...newState,
            botActionAt: Date.now() + randomBetween(BOT_SHOT_DELAY_MS[0], BOT_SHOT_DELAY_MS[1]),
          };
        }
      }

      return {
        newState: stateToSave,
        canApply: (current) => (current as BattleshipState).shotHistory.length === shotCountBefore,
        roomEvents,
        playerEvents,
        recurse: stateToSave.phase === 'playing' && stateToSave.botActionAt !== null,
      };
    }

    return null;
  },

  processPlayerReplacement(
    state: BattleshipState,
    departingPlayerId: string,
    replacementBotId: string,
    _playerIndex: number,
    players: Player[],
  ): BattleshipState {
    // Swap player IDs in boards
    const newBoards: Record<string, PlayerBoard> = {};
    for (const [id, board] of Object.entries(state.boards)) {
      const newId = id === departingPlayerId ? replacementBotId : id;
      newBoards[newId] = board;
    }

    // Swap in turnOrder
    const newTurnOrder: [string, string] = [
      state.turnOrder[0] === departingPlayerId ? replacementBotId : state.turnOrder[0],
      state.turnOrder[1] === departingPlayerId ? replacementBotId : state.turnOrder[1],
    ];

    // Swap in setupReady
    const newSetupReady = state.setupReady.map((id) =>
      id === departingPlayerId ? replacementBotId : id,
    );

    // Swap currentTurn
    const newCurrentTurn = state.currentTurn === departingPlayerId
      ? replacementBotId
      : state.currentTurn;

    // Swap winner
    const newWinner = state.winner === departingPlayerId ? replacementBotId : state.winner;

    // Set botActionAt if it's now the bot's turn
    let botActionAt = state.botActionAt;
    if (state.phase === 'setup' && !newSetupReady.includes(replacementBotId)) {
      botActionAt = Date.now() + randomBetween(BOT_SETUP_DELAY_MS[0], BOT_SETUP_DELAY_MS[1]);
    } else if (state.phase === 'playing' && newCurrentTurn === replacementBotId) {
      botActionAt = Date.now() + randomBetween(BOT_SHOT_DELAY_MS[0], BOT_SHOT_DELAY_MS[1]);
    }

    // Swap IDs in shotHistory and lastShot
    const swapId = (id: string) => id === departingPlayerId ? replacementBotId : id;
    const newShotHistory = state.shotHistory.map((s) => ({
      ...s,
      attackerId: swapId(s.attackerId),
      defenderId: swapId(s.defenderId),
    }));
    const newLastShot = state.lastShot
      ? { ...state.lastShot, attackerId: swapId(state.lastShot.attackerId), defenderId: swapId(state.lastShot.defenderId) }
      : null;

    return {
      ...state,
      boards: newBoards,
      turnOrder: newTurnOrder,
      setupReady: newSetupReady,
      currentTurn: newCurrentTurn,
      winner: newWinner,
      botActionAt,
      shotHistory: newShotHistory,
      lastShot: newLastShot,
    };
  },
};

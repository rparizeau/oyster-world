import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, refreshRoomTTL, redis } from '@/lib/redis';
import { getGameModule } from '@/lib/games/loader';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { roomNotFound, unauthorized, apiError } from '@/lib/errors';
import type { Room } from '@/lib/types';
import type { GameState as TPGameState } from '@/lib/games/terrible-people';
import type { FourKateState } from '@/lib/games/4-kate';
import { BOT_MOVE_DELAY_MS } from '@/lib/games/4-kate/constants';
import { VALID_TARGET_SCORES } from '@/lib/games/whos-deal/constants';
import type { WhosDealGameState } from '@/lib/games/whos-deal';
import { WhosDealError, computeBotTiming, getSeatIndex, getTeamForSeat } from '@/lib/games/whos-deal';
import { TerriblePeopleError } from '@/lib/games/terrible-people';

function actionIdKey(roomCode: string, playerId: string): string {
  return `actionId:${roomCode}:${playerId}`;
}

/**
 * Handle lobby-level actions (before game starts).
 * Returns a Response if handled, or null to continue to game action processing.
 */
async function handleLobbyAction(
  room: Room,
  roomCode: string,
  playerId: string,
  type: string,
  payload: unknown,
  actionId?: string,
): Promise<Response | null> {
  // Only handle lobby actions for Who's Deal? in waiting state
  if (room.gameId !== 'whos-deal' || room.status !== 'waiting') return null;
  if (type !== 'swap-teams' && type !== 'set-target-score') return null;

  // actionId idempotency check
  if (actionId) {
    const lastActionId = await redis.get<string>(actionIdKey(roomCode, playerId));
    if (lastActionId === actionId) {
      return NextResponse.json({ success: true });
    }
  }

  // Only owner can modify settings
  if (room.ownerId !== playerId) {
    return apiError('Only the room owner can do this', 'NOT_OWNER', 403);
  }

  const pusher = getPusherServer();

  if (type === 'swap-teams') {
    const { playerIdA, playerIdB } = (payload || {}) as { playerIdA?: string; playerIdB?: string };
    if (!playerIdA || !playerIdB) {
      return apiError('Two player IDs required', 'INVALID_REQUEST', 400);
    }

    const teams = room.settings?.teams as { a: string[]; b: string[] } | undefined;
    if (!teams) {
      return apiError('No team settings found', 'INVALID_PHASE', 409);
    }

    const aInTeamA = teams.a.includes(playerIdA);
    const aInTeamB = teams.b.includes(playerIdA);
    const bInTeamA = teams.a.includes(playerIdB);
    const bInTeamB = teams.b.includes(playerIdB);

    // Validate: one from each team
    const validSwap = (aInTeamA && bInTeamB) || (aInTeamB && bInTeamA);
    if (!validSwap) {
      return apiError('Invalid swap', 'INVALID_SWAP', 400);
    }

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (current.status !== 'waiting') return null;
      const currentTeams = current.settings?.teams as { a: string[]; b: string[] };
      if (!currentTeams) return null;

      const newTeams = {
        a: currentTeams.a.map((id: string) =>
          id === playerIdA ? playerIdB : id === playerIdB ? playerIdA : id
        ),
        b: currentTeams.b.map((id: string) =>
          id === playerIdA ? playerIdB : id === playerIdB ? playerIdA : id
        ),
      };

      return {
        ...current,
        settings: { ...current.settings, teams: newTeams },
      };
    });

    if (!updated) {
      return apiError('Failed to swap teams', 'RACE_CONDITION', 409);
    }

    if (actionId) {
      await redis.set(actionIdKey(roomCode, playerId), actionId, { ex: 3600 });
    }
    await refreshRoomTTL(roomCode);

    try {
      await pusher.trigger(roomChannel(roomCode), 'teams-updated', {
        teams: updated.settings?.teams,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  if (type === 'set-target-score') {
    const { targetScore } = (payload || {}) as { targetScore?: number };
    if (!targetScore || !(VALID_TARGET_SCORES as readonly number[]).includes(targetScore)) {
      return apiError('Invalid target score', 'INVALID_SETTING', 400);
    }

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (current.status !== 'waiting') return null;
      return {
        ...current,
        settings: { ...current.settings, targetScore },
      };
    });

    if (!updated) {
      return apiError('Failed to update setting', 'RACE_CONDITION', 409);
    }

    if (actionId) {
      await redis.set(actionIdKey(roomCode, playerId), actionId, { ex: 3600 });
    }
    await refreshRoomTTL(roomCode);

    try {
      await pusher.trigger(roomChannel(roomCode), 'settings-updated', {
        targetScore,
      });
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  }

  return null;
}

/**
 * Fire Pusher events for Who's Deal? actions.
 */
async function emitWhosDealEvents(
  roomCode: string,
  oldState: WhosDealGameState,
  newState: WhosDealGameState,
  actionType: string,
  playerId: string,
  payload: unknown,
): Promise<void> {
  const pusher = getPusherServer();
  const channel = roomChannel(roomCode);

  try {
    switch (actionType) {
      case 'call-trump': {
        const seatIndex = getSeatIndex(newState, playerId);
        const goAlone = newState.round?.goingAlone || false;

        if (oldState.round?.trumpPhase === 'round1') {
          await pusher.trigger(channel, 'trump-action', {
            seatIndex, action: 'order-up', goAlone,
          });
          await pusher.trigger(channel, 'trump-confirmed', {
            trumpSuit: newState.round!.trumpSuit,
            callingPlayer: playerId,
            callingTeam: newState.round!.callingTeam,
            goAlone,
          });
          // Dealer's hand updated (6 cards) — private channel
          const dealerPlayerId = newState.seats[newState.dealerSeatIndex];
          await pusher.trigger(playerChannel(dealerPlayerId), 'hand-updated', {
            hand: newState.round!.hands[dealerPlayerId],
          });
        } else if (oldState.round?.trumpPhase === 'round2') {
          await pusher.trigger(channel, 'trump-action', {
            seatIndex, action: 'call', suit: newState.round!.trumpSuit, goAlone,
          });
          await pusher.trigger(channel, 'trump-confirmed', {
            trumpSuit: newState.round!.trumpSuit,
            callingPlayer: playerId,
            callingTeam: newState.round!.callingTeam,
            goAlone,
          });
          await pusher.trigger(channel, 'trick-started', {
            leadSeatIndex: newState.round!.trickLeadSeatIndex,
          });
        }
        break;
      }

      case 'pass-trump': {
        const seatIndex = getSeatIndex(oldState, playerId);
        await pusher.trigger(channel, 'trump-action', {
          seatIndex, action: 'pass',
        });
        break;
      }

      case 'discard': {
        await pusher.trigger(channel, 'dealer-discarded', {
          seatIndex: newState.dealerSeatIndex,
        });
        // Updated hand for dealer — private channel
        const dealerPlayerId = newState.seats[newState.dealerSeatIndex];
        await pusher.trigger(playerChannel(dealerPlayerId), 'hand-updated', {
          hand: newState.round!.hands[dealerPlayerId],
        });
        await pusher.trigger(channel, 'trick-started', {
          leadSeatIndex: newState.round!.trickLeadSeatIndex,
        });
        break;
      }

      case 'play-card': {
        const seatIndex = getSeatIndex(oldState, playerId);
        const cardId = (payload as { cardId?: string })?.cardId;
        const playedCard = oldState.round!.hands[playerId].find(c => c.id === cardId);

        await pusher.trigger(channel, 'card-played', {
          seatIndex, card: playedCard,
        });

        // Trick completed?
        const oldTricksPlayed = oldState.round!.tricksPlayed;
        const newTricksPlayed = newState.round!.tricksPlayed;

        if (newTricksPlayed > oldTricksPlayed) {
          const winningSeatIndex = newState.round!.trickLeadSeatIndex;
          const winningTeam = getTeamForSeat(winningSeatIndex);

          await pusher.trigger(channel, 'trick-won', {
            winningSeatIndex,
            winningTeam,
            tricksWon: newState.round!.tricksWon,
          });

          if (newState.round!.trumpPhase === 'round_over') {
            const pointsAwarded = {
              a: newState.teams.a.score - oldState.teams.a.score,
              b: newState.teams.b.score - oldState.teams.b.score,
            };

            await pusher.trigger(channel, 'round-over', {
              callingTeam: newState.round!.callingTeam,
              tricksWon: newState.round!.tricksWon,
              pointsAwarded,
              scores: { a: newState.teams.a.score, b: newState.teams.b.score },
              isGameOver: newState.phase === 'game_over',
            });

            if (newState.phase === 'game_over') {
              await pusher.trigger(channel, 'game-over', {
                winningTeam: newState.winningTeam,
                finalScores: { a: newState.teams.a.score, b: newState.teams.b.score },
              });
            }
          } else {
            await pusher.trigger(channel, 'trick-started', {
              leadSeatIndex: newState.round!.trickLeadSeatIndex,
            });
          }
        }
        break;
      }

      case 'play-again': {
        await pusher.trigger(channel, 'game-started', {
          teams: newState.teams,
          seats: newState.seats,
          dealer: newState.dealerSeatIndex,
          faceUpCard: newState.round!.faceUpCard,
          targetScore: newState.targetScore,
        });
        for (const pid of newState.seats) {
          await pusher.trigger(playerChannel(pid), 'hand-updated', {
            hand: newState.round!.hands[pid],
          });
        }
        break;
      }
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Fire Pusher events for Terrible People actions.
 */
async function emitTerriblePeopleEvents(
  roomCode: string,
  oldState: TPGameState,
  newState: TPGameState,
  actionType: string,
  playerId: string,
  players: Room['players'],
): Promise<void> {
  const pusher = getPusherServer();
  const channel = roomChannel(roomCode);

  try {
    if (actionType === 'submit') {
      await pusher.trigger(channel, 'player-submitted', { playerId });

      // Phase transitioned to judging → reveal submissions
      if (oldState.phase === 'submitting' && newState.phase === 'judging') {
        const anonymousSubmissions = newState.revealOrder.map((id) => ({
          id,
          cards: newState.submissions[id],
        }));

        await pusher.trigger(channel, 'phase-changed', {
          phase: 'judging',
          blackCard: newState.blackCard,
          czarId: players[newState.czarIndex]?.id,
          czarIndex: newState.czarIndex,
          currentRound: newState.currentRound,
        });

        await pusher.trigger(channel, 'submissions-revealed', {
          submissions: anonymousSubmissions,
        });
      }
    }

    if (actionType === 'judge' && oldState.roundWinnerId === null && newState.roundWinnerId !== null) {
      const winnerId = newState.roundWinnerId;
      const winnerPlayer = players.find((p) => p.id === winnerId);
      const scores: Record<string, number> = {};
      for (const p of players) {
        scores[p.id] = p.id === winnerId ? p.score + 1 : p.score;
      }

      await pusher.trigger(channel, 'round-result', {
        winnerId,
        winnerName: winnerPlayer?.name ?? 'Unknown',
        submission: newState.submissions[winnerId],
        scores,
        isGameOver: newState.phase === 'game_over',
      });

      if (newState.phase === 'game_over') {
        await pusher.trigger(channel, 'game-over', {
          finalScores: scores,
          winnerId,
          winnerName: winnerPlayer?.name ?? 'Unknown',
        });
      }
    }
  } catch {
    // Non-fatal
  }
}

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string; actionId?: string; type?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();
  const actionId = body.actionId?.trim();
  const type = body.type?.trim();
  const payload = body.payload;

  if (!roomCode || !playerId || !type) {
    return apiError('Room code, player ID, and action type are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  // Validate player is in room
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return unauthorized();

  // Handle lobby-level actions (before game starts)
  const lobbyResult = await handleLobbyAction(room, roomCode, playerId, type, payload, actionId);
  if (lobbyResult) return lobbyResult;

  if (!room.game) {
    return apiError('Game has not started', 'INVALID_PHASE', 409);
  }

  // Look up game module
  const gameModule = getGameModule(room.gameId);
  if (!gameModule) {
    return apiError('Unknown game module', 'INVALID_GAME', 400);
  }

  // actionId idempotency check
  if (actionId) {
    const lastActionId = await redis.get<string>(actionIdKey(roomCode, playerId));
    if (lastActionId === actionId) {
      // Duplicate — return success (no-op)
      return NextResponse.json({ success: true });
    }
  }

  // Who's Deal? play-again: owner-only validation
  if (room.gameId === 'whos-deal' && type === 'play-again') {
    if (room.ownerId !== playerId) {
      return apiError('Only the room owner can do this', 'NOT_OWNER', 403);
    }
  }

  // Inject players into TP submit/judge payloads (engine needs them for validation)
  let enrichedPayload = payload;
  if (room.gameId === 'terrible-people' && (type === 'submit' || type === 'judge')) {
    enrichedPayload = { ...(payload as Record<string, unknown> || {}), _players: room.players };
  }

  // Dispatch to game module
  let newState;
  try {
    newState = gameModule.processAction(room.game, playerId, { type, payload: enrichedPayload, actionId });
  } catch (e) {
    if (e instanceof WhosDealError || e instanceof TerriblePeopleError) {
      return apiError(e.message, e.code, e.status);
    }
    throw e;
  }

  // If state didn't change (no-op from module), return success
  if (newState === room.game) {
    return NextResponse.json({ success: true });
  }

  // For 4 Kate: set botActionAt if it's now a bot's turn
  let stateToSave = newState;
  if (room.gameId === '4-kate') {
    const fkState = newState as FourKateState;
    if (fkState.phase === 'playing') {
      const nextPlayerId = fkState.currentTurn === 'red' ? fkState.players.red : fkState.players.yellow;
      const nextPlayer = room.players.find((p) => p.id === nextPlayerId);
      if (nextPlayer?.isBot && !fkState.botActionAt) {
        stateToSave = { ...fkState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS } as unknown as typeof newState;
      }
    }
  }

  // For Who's Deal?: set botActionAt if it's now a bot's turn
  if (room.gameId === 'whos-deal') {
    const wdState = newState as WhosDealGameState;
    const botAt = computeBotTiming(wdState, room.players);
    if (botAt) {
      stateToSave = { ...wdState, botActionAt: botAt };
    }
  }

  // Atomically update (include score bump for TP judge)
  const oldTPState = room.gameId === 'terrible-people' ? room.game as TPGameState : null;
  const newTPState = room.gameId === 'terrible-people' ? stateToSave as unknown as TPGameState : null;
  const tpWinnerId = (oldTPState && newTPState && type === 'judge'
    && oldTPState.roundWinnerId === null && newTPState.roundWinnerId !== null)
    ? newTPState.roundWinnerId : null;

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return null;
    if (tpWinnerId) {
      const updatedPlayers = current.players.map((p) =>
        p.id === tpWinnerId ? { ...p, score: p.score + 1 } : p
      );
      return { ...current, game: stateToSave as Room['game'], players: updatedPlayers };
    }
    return { ...current, game: stateToSave as Room['game'] };
  });

  if (!updated) {
    return apiError('Failed to process action', 'RACE_CONDITION', 409);
  }

  // Track actionId
  if (actionId) {
    await redis.set(actionIdKey(roomCode, playerId), actionId, { ex: 3600 });
  }

  await refreshRoomTTL(roomCode);

  // Trigger Pusher events for 4 Kate
  if (room.gameId === '4-kate') {
    const fkState = stateToSave as FourKateState;
    const pusher = getPusherServer();
    const lastMove = fkState.moves[fkState.moves.length - 1];

    if (lastMove) {
      try {
        await pusher.trigger(roomChannel(roomCode), 'move-made', {
          column: lastMove.col,
          row: lastMove.row,
          color: lastMove.color,
          currentTurn: fkState.currentTurn,
          board: fkState.board,
        });
      } catch {
        // Non-fatal
      }
    }

    if (fkState.phase === 'game_over') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'game-over', {
          winner: fkState.winner,
          winningCells: fkState.winningCells,
          finalBoard: fkState.board,
          isDraw: fkState.isDraw,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  // Trigger Pusher events for Who's Deal?
  if (room.gameId === 'whos-deal') {
    const oldState = room.game as WhosDealGameState;
    const finalState = stateToSave as WhosDealGameState;
    await emitWhosDealEvents(roomCode, oldState, finalState, type, playerId, payload);
  }

  // Trigger Pusher events for Terrible People
  if (room.gameId === 'terrible-people') {
    await emitTerriblePeopleEvents(
      roomCode,
      room.game as TPGameState,
      stateToSave as unknown as TPGameState,
      type,
      playerId,
      room.players,
    );
  }

  return NextResponse.json({ success: true });
}

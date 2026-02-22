import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, setHeartbeat, getHeartbeat, refreshRoomTTL, deleteHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { createBotForSeat } from '@/lib/utils';
import { DISCONNECT_TIMEOUT_MS, BOT_REPLACEMENT_TIMEOUT_MS, BOT_SUBMIT_DELAY_RANGE_MS, BOT_JUDGE_DELAY_MS } from '@/lib/constants';
import { roomNotFound, apiError } from '@/lib/errors';
import { shouldAdvancePhase, shouldExecuteBotAction, startSubmittingPhase, advanceRound, submitCards, judgeWinner } from '@/lib/game-engine';
import { selectRandomCards, selectRandomWinner, getBotActionTimestamp } from '@/lib/bots';
import type { Room } from '@/lib/types';

/**
 * Process game state advancement: phase transitions and bot actions.
 * This is called on every heartbeat to drive the timestamp-based state machine.
 */
async function processGameAdvancement(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.status !== 'playing') return;

  const now = Date.now();
  const game = room.game;
  const pusher = getPusherServer();

  // Phase advancement: czar_reveal → submitting
  if (game.phase === 'czar_reveal' && shouldAdvancePhase(game, now)) {
    const newGame = startSubmittingPhase(game, room.players, now);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game || current.game.phase !== 'czar_reveal') return current;
      if (!shouldAdvancePhase(current.game, now)) return current;
      return { ...current, game: newGame };
    });

    if (updated && updated.game?.phase === 'submitting') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'submitting',
          blackCard: newGame.blackCard,
          czarId: room.players[newGame.czarIndex]?.id,
          phaseEndsAt: newGame.phaseEndsAt,
        });
      } catch {
        // Non-fatal
      }

      // Recurse to check if bots need to act immediately
      await processGameAdvancement(roomCode);
      return;
    }
  }

  // Phase advancement: round_result → next round (czar_reveal)
  if (game.phase === 'round_result' && shouldAdvancePhase(game, now)) {
    const newGame = advanceRound(game, room.players, now);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game || current.game.phase !== 'round_result') return current;
      if (!shouldAdvancePhase(current.game, now)) return current;
      return { ...current, game: newGame };
    });

    if (updated && updated.game?.phase === 'czar_reveal') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'czar_reveal',
          blackCard: newGame.blackCard,
          czarId: updated.players[newGame.czarIndex]?.id,
          phaseEndsAt: newGame.phaseEndsAt,
        });
      } catch {
        // Non-fatal
      }

      // Send updated hands to each player
      for (const player of updated.players) {
        const hand = newGame.hands[player.id];
        if (hand) {
          try {
            await pusher.trigger(playerChannel(player.id), 'hand-updated', {
              hand,
            });
          } catch {
            // Non-fatal
          }
        }
      }

      // Recurse to check if czar_reveal should advance
      await processGameAdvancement(roomCode);
      return;
    }
  }

  // Bot action: submit cards during submitting phase
  if (game.phase === 'submitting' && shouldExecuteBotAction(game, now)) {
    await executeBotSubmissions(roomCode);
    return;
  }

  // Bot action: judge during judging phase
  if (game.phase === 'judging' && shouldExecuteBotAction(game, now)) {
    await executeBotJudgment(roomCode);
    return;
  }
}

/**
 * Execute bot card submissions.
 */
async function executeBotSubmissions(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.game.phase !== 'submitting') return;

  const game = room.game;
  const pusher = getPusherServer();
  let currentGame = { ...game };
  let stateChanged = false;

  // Submit for all bots that haven't submitted yet
  for (let i = 0; i < room.players.length; i++) {
    if (i === game.czarIndex) continue;
    const player = room.players[i];
    if (!player.isBot) continue;
    if (currentGame.submissions[player.id]) continue;

    const hand = currentGame.hands[player.id];
    if (!hand || hand.length === 0) continue;

    const cardIds = selectRandomCards(hand, currentGame.blackCard.pick);
    const result = submitCards(currentGame, player.id, cardIds, room.players);

    if (result.ok) {
      currentGame = result.data;
      stateChanged = true;

      try {
        await pusher.trigger(roomChannel(roomCode), 'player-submitted', {
          playerId: player.id,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  if (stateChanged) {
    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game || current.game.phase !== 'submitting') return current;
      return { ...current, game: currentGame };
    });

    // If transitioned to judging, send events
    if (updated && updated.game?.phase === 'judging') {
      const anonymousSubmissions = currentGame.revealOrder.map((id) => ({
        id,
        cards: currentGame.submissions[id],
      }));

      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'judging',
          blackCard: currentGame.blackCard,
          czarId: room.players[currentGame.czarIndex]?.id,
        });

        await pusher.trigger(roomChannel(roomCode), 'submissions-revealed', {
          submissions: anonymousSubmissions,
        });
      } catch {
        // Non-fatal
      }

      // Recurse to check if bot Czar needs to act
      await processGameAdvancement(roomCode);
    }
  }
}

/**
 * Execute bot judgment (Czar is a bot).
 */
async function executeBotJudgment(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.game.phase !== 'judging') return;

  const game = room.game;
  const czar = room.players[game.czarIndex];
  if (!czar || !czar.isBot) return;

  // Idempotent: if winner already selected, skip
  if (game.roundWinnerId !== null) return;

  const winnerId = selectRandomWinner(game.submissions, czar.id);
  if (!winnerId) return;

  const result = judgeWinner(game, czar.id, winnerId, room.players);
  if (!result.ok) return;

  const newGameState = result.state;

  // Build score lookup
  const scores: Record<string, number> = {};
  for (const p of result.updatedPlayers) {
    scores[p.id] = p.score;
  }

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game || current.game.phase !== 'judging') return current;
    if (current.game.roundWinnerId !== null) return current;
    const updatedPlayers = current.players.map((p) => ({
      ...p,
      score: scores[p.id] ?? p.score,
    }));
    return { ...current, players: updatedPlayers, game: newGameState };
  });

  if (!updated) return;

  const pusher = getPusherServer();
  const winnerPlayer = room.players.find((p) => p.id === winnerId)!;

  try {
    await pusher.trigger(roomChannel(roomCode), 'round-result', {
      winnerId,
      winnerName: winnerPlayer.name,
      submission: newGameState.submissions[winnerId],
      scores,
      isGameOver: newGameState.phase === 'game_over',
    });

    if (newGameState.phase === 'game_over') {
      await pusher.trigger(roomChannel(roomCode), 'game-over', {
        finalScores: scores,
        winnerId,
        winnerName: winnerPlayer.name,
      });
    }
  } catch {
    // Non-fatal
  }

  // If round_result, recurse to handle phase advancement later
  if (newGameState.phase === 'round_result') {
    // Don't recurse immediately — wait for phaseEndsAt
  }
}

export async function POST(request: Request) {
  let body: { roomCode?: string; playerId?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid request body', 'INVALID_REQUEST', 400);
  }

  const roomCode = body.roomCode?.trim().toUpperCase();
  const playerId = body.playerId?.trim();

  if (!roomCode || !playerId) {
    return apiError('Room code and player ID are required', 'INVALID_REQUEST', 400);
  }

  const room = await getRoom(roomCode);
  if (!room) return roomNotFound();

  const player = room.players.find((p) => p.id === playerId && !p.isBot);
  if (!player) {
    return apiError('Player not in room', 'UNAUTHORIZED', 401);
  }

  // Update this player's heartbeat
  await setHeartbeat(roomCode, playerId);
  await refreshRoomTTL(roomCode);

  // === GAME STATE ADVANCEMENT ===
  // Process phase transitions and bot actions (timestamp-driven state machine)
  if (room.game && room.status === 'playing') {
    await processGameAdvancement(roomCode);
  }

  // === DISCONNECT / REPLACEMENT CHECKS ===
  const now = Date.now();
  const disconnectedIds: string[] = [];
  const replacedIds: string[] = [];

  // Re-fetch room after game advancement may have changed it
  const currentRoom = await getRoom(roomCode);
  if (!currentRoom) return roomNotFound();

  for (const p of currentRoom.players) {
    if (p.isBot) continue;

    const lastSeen = await getHeartbeat(roomCode, p.id);
    if (!lastSeen) continue;

    const elapsed = now - lastSeen;

    if (elapsed > BOT_REPLACEMENT_TIMEOUT_MS) {
      replacedIds.push(p.id);
    } else if (elapsed > DISCONNECT_TIMEOUT_MS && p.isConnected) {
      disconnectedIds.push(p.id);
    }
  }

  // Apply disconnection markers
  if (disconnectedIds.length > 0) {
    await atomicRoomUpdate(roomCode, (current) => {
      const updatedPlayers = current.players.map((p) => {
        if (disconnectedIds.includes(p.id)) {
          return { ...p, isConnected: false };
        }
        return p;
      });
      return { ...current, players: updatedPlayers };
    });

    const pusher = getPusherServer();
    for (const id of disconnectedIds) {
      try {
        await pusher.trigger(roomChannel(roomCode), 'player-disconnected', {
          playerId: id,
        });
      } catch {
        // Non-fatal
      }
    }
  }

  // Apply bot replacements for long-disconnected players
  if (replacedIds.length > 0) {
    for (const id of replacedIds) {
      await handlePlayerReplacement(roomCode, id);
    }
  }

  // Mark this player as connected if they were disconnected
  const latestRoom = await getRoom(roomCode);
  const latestPlayer = latestRoom?.players.find((p) => p.id === playerId);
  if (latestPlayer && !latestPlayer.isConnected && !latestPlayer.isBot) {
    await atomicRoomUpdate(roomCode, (current) => {
      const updatedPlayers = current.players.map((p) => {
        if (p.id === playerId) return { ...p, isConnected: true };
        return p;
      });
      return { ...current, players: updatedPlayers };
    });

    try {
      await getPusherServer().trigger(roomChannel(roomCode), 'player-reconnected', {
        playerId,
      });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ success: true });
}

/**
 * Handle replacing a disconnected player with a bot.
 * Also handles mid-game scenarios (bot inherits hand/score/seat).
 */
async function handlePlayerReplacement(roomCode: string, departingPlayerId: string): Promise<void> {
  const currentRoom = await getRoom(roomCode);
  if (!currentRoom) return;

  const replacementBot = createBotForSeat(
    currentRoom.players.filter((p) => p.id !== departingPlayerId)
  );

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    const idx = current.players.findIndex((p) => p.id === departingPlayerId && !p.isBot);
    if (idx === -1) return current;

    const departingPlayer = current.players[idx];
    const updatedPlayers = [...current.players];

    // Bot inherits score and seat position
    const bot = {
      ...replacementBot,
      score: departingPlayer.score,
    };
    updatedPlayers[idx] = bot;

    let newOwnerId = current.ownerId;
    if (current.ownerId === departingPlayerId) {
      const nextHuman = updatedPlayers.find((p) => !p.isBot);
      if (nextHuman) {
        newOwnerId = nextHuman.id;
      }
    }

    const hasHumans = updatedPlayers.some((p) => !p.isBot);
    if (!hasHumans) return null;

    // Handle game-in-progress bot takeover
    let game = current.game;
    if (game && current.status === 'playing') {
      const hands = { ...game.hands };
      const submissions = { ...game.submissions };

      // Bot inherits the departing player's hand
      if (hands[departingPlayerId]) {
        hands[bot.id] = hands[departingPlayerId];
        delete hands[departingPlayerId];
      }

      // Transfer any submission
      if (submissions[departingPlayerId]) {
        submissions[bot.id] = submissions[departingPlayerId];
        delete submissions[departingPlayerId];
      }

      let botActionAt = game.botActionAt;

      // If player hadn't submitted and we're in submitting phase, set bot action
      if (game.phase === 'submitting' && !submissions[bot.id] && idx !== game.czarIndex) {
        botActionAt = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
      }

      // If departing player was Czar during judging, set bot action to judge
      if (game.phase === 'judging' && idx === game.czarIndex && game.roundWinnerId === null) {
        botActionAt = Date.now() + BOT_JUDGE_DELAY_MS;
      }

      // Update revealOrder to use bot id instead of departing player id
      const revealOrder = game.revealOrder.map((id) =>
        id === departingPlayerId ? bot.id : id
      );

      game = { ...game, hands, submissions, botActionAt, revealOrder };
    }

    return { ...current, players: updatedPlayers, ownerId: newOwnerId, game };
  });

  await deleteHeartbeat(roomCode, departingPlayerId);

  if (updated) {
    const pusher = getPusherServer();
    try {
      await pusher.trigger(roomChannel(roomCode), 'player-left', {
        playerId: departingPlayerId,
        newOwnerId: updated.ownerId,
        replacementBot,
      });
    } catch {
      // Non-fatal
    }
  }
}

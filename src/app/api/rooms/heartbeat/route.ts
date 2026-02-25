import { NextResponse } from 'next/server';
import { getRoom, atomicRoomUpdate, setHeartbeat, getHeartbeat, refreshRoomTTL, deleteHeartbeat } from '@/lib/redis';
import { getPusherServer, roomChannel, playerChannel } from '@/lib/pusher';
import { createBotForSeat } from '@/lib/utils';
import { DISCONNECT_TIMEOUT_MS, BOT_REPLACEMENT_TIMEOUT_MS, BOT_SUBMIT_DELAY_RANGE_MS, BOT_JUDGE_DELAY_MS } from '@/lib/constants';
import { roomNotFound, apiError } from '@/lib/errors';
import {
  shouldAdvancePhase,
  shouldExecuteBotAction,
  startSubmittingPhase,
  advanceRound,
  submitCards,
  judgeWinner,
  selectRandomCards,
  selectRandomWinner,
  getBotActionTimestamp,
} from '@/lib/games/terrible-people';
import {
  shouldExecuteBotAction as shouldExecute4KateBotAction,
  processDropAction,
  getBotMove,
  getPlayerColor,
  BOT_MOVE_DELAY_MS,
} from '@/lib/games/4-kate';
import type { FourKateState } from '@/lib/games/4-kate';
import type { WhosDealGameState } from '@/lib/games/whos-deal';
import {
  shouldAdvancePhase as shouldAdvanceWDPhase,
  shouldExecuteBotAction as shouldExecuteWDBotAction,
  advanceToNextRound,
  computeBotTiming,
  getSeatIndex,
  getTeamForSeat,
  getBotActionTimestamp as getWDBotTimestamp,
  WhosDealError,
} from '@/lib/games/whos-deal';
import { getWhosDealBotAction } from '@/lib/games/whos-deal/bots';
import { getGameModule } from '@/lib/games/loader';
import type { Room, GameState } from '@/lib/types';

/**
 * Process game state advancement: phase transitions and bot actions.
 * This is called on every heartbeat to drive the timestamp-based state machine.
 */
async function processGameAdvancement(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.status !== 'playing') return;

  // Dispatch to game-specific advancement
  if (room.gameId === '4-kate') {
    await process4KateAdvancement(roomCode);
    return;
  }

  if (room.gameId === 'whos-deal') {
    await processWhosDealAdvancement(roomCode);
    return;
  }

  if (room.gameId !== 'terrible-people') return;

  const now = Date.now();
  const game = room.game as GameState;
  const pusher = getPusherServer();

  // Phase advancement: czar_reveal → submitting
  if (game.phase === 'czar_reveal' && shouldAdvancePhase(game, now)) {
    const newGame = startSubmittingPhase(game, room.players, now);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game) return current;
      const currentGame = current.game as GameState;
      if (currentGame.phase !== 'czar_reveal') return current;
      if (!shouldAdvancePhase(currentGame, now)) return current;
      return { ...current, game: newGame };
    });

    if (updated && (updated.game as GameState)?.phase === 'submitting') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'submitting',
          blackCard: newGame.blackCard,
          czarId: room.players[newGame.czarIndex]?.id,
          czarIndex: newGame.czarIndex,
          currentRound: newGame.currentRound,
          phaseEndsAt: newGame.phaseEndsAt,
        });
      } catch {
        // Non-fatal
      }

      await processGameAdvancement(roomCode);
      return;
    }
  }

  // Phase advancement: round_result → next round (czar_reveal)
  if (game.phase === 'round_result' && shouldAdvancePhase(game, now)) {
    const newGame = advanceRound(game, room.players, now);

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game) return current;
      const currentGame = current.game as GameState;
      if (currentGame.phase !== 'round_result') return current;
      if (!shouldAdvancePhase(currentGame, now)) return current;
      return { ...current, game: newGame };
    });

    if (updated && (updated.game as GameState)?.phase === 'czar_reveal') {
      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'czar_reveal',
          blackCard: newGame.blackCard,
          czarId: updated.players[newGame.czarIndex]?.id,
          czarIndex: newGame.czarIndex,
          currentRound: newGame.currentRound,
          phaseEndsAt: newGame.phaseEndsAt,
        });
      } catch {
        // Non-fatal
      }

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

async function process4KateAdvancement(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.status !== 'playing') return;
  if (room.gameId !== '4-kate') return;

  const now = Date.now();
  const game = room.game as FourKateState;

  if (game.phase !== 'playing') return;
  if (!shouldExecute4KateBotAction(game, now)) return;

  // Find the bot whose turn it is
  const currentPlayerId = game.currentTurn === 'red' ? game.players.red : game.players.yellow;
  const currentPlayer = room.players.find((p) => p.id === currentPlayerId);
  if (!currentPlayer?.isBot) return;

  // Idempotency: check move count
  const moveCountBefore = game.moves.length;
  const color = getPlayerColor(game, currentPlayerId);
  if (!color) return;

  const column = getBotMove(game, color);
  const newState = processDropAction(game, currentPlayerId, column);

  // If state didn't change, skip
  if (newState === game || newState.moves.length === moveCountBefore) return;

  // If game continues and next player is also a bot, set botActionAt
  let stateToSave = newState;
  if (newState.phase === 'playing') {
    const nextPlayerId = newState.currentTurn === 'red' ? newState.players.red : newState.players.yellow;
    const nextPlayer = room.players.find((p) => p.id === nextPlayerId);
    if (nextPlayer?.isBot) {
      stateToSave = { ...newState, botActionAt: Date.now() + BOT_MOVE_DELAY_MS };
    }
  }

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return current;
    const currentGame = current.game as FourKateState;
    // Idempotency: only update if move count hasn't changed
    if (currentGame.moves.length !== moveCountBefore) return current;
    return { ...current, game: stateToSave };
  });

  if (!updated) return;

  const pusher = getPusherServer();
  const lastMove = stateToSave.moves[stateToSave.moves.length - 1];

  if (lastMove) {
    try {
      await pusher.trigger(roomChannel(roomCode), 'move-made', {
        column: lastMove.col,
        row: lastMove.row,
        color: lastMove.color,
        currentTurn: stateToSave.currentTurn,
        board: stateToSave.board,
      });
    } catch {
      // Non-fatal
    }
  }

  if (stateToSave.phase === 'game_over') {
    try {
      await pusher.trigger(roomChannel(roomCode), 'game-over', {
        winner: stateToSave.winner,
        winningCells: stateToSave.winningCells,
        finalBoard: stateToSave.board,
        isDraw: stateToSave.isDraw,
      });
    } catch {
      // Non-fatal
    }
  }
}

async function processWhosDealAdvancement(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game || room.status !== 'playing') return;
  if (room.gameId !== 'whos-deal') return;

  const now = Date.now();
  const game = room.game as WhosDealGameState;
  const pusher = getPusherServer();

  // Phase advancement: round_over → next round (after display pause)
  if (game.round?.trumpPhase === 'round_over' && game.phase !== 'game_over' && shouldAdvanceWDPhase(game, now)) {
    const newGame = advanceToNextRound(game, room.players);
    if (newGame === game) return;

    const updated = await atomicRoomUpdate(roomCode, (current) => {
      if (!current.game) return current;
      const currentGame = current.game as WhosDealGameState;
      if (currentGame.round?.trumpPhase !== 'round_over') return current;
      if (!shouldAdvanceWDPhase(currentGame, now)) return current;
      return { ...current, game: newGame };
    });

    if (updated) {
      const updatedGame = updated.game as WhosDealGameState;
      if (updatedGame.round?.trumpPhase === 'round1') {
        try {
          await pusher.trigger(roomChannel(roomCode), 'new-round', {
            dealerSeatIndex: updatedGame.dealerSeatIndex,
            faceUpCard: updatedGame.round.faceUpCard,
          });
          // Send updated hands to all players
          for (const pid of updatedGame.seats) {
            const hand = updatedGame.round.hands[pid];
            if (hand) {
              await pusher.trigger(playerChannel(pid), 'hand-updated', { hand });
            }
          }
        } catch {
          // Non-fatal
        }
        // Continue processing in case first player is a bot
        await processWhosDealAdvancement(roomCode);
      }
    }
    return;
  }

  // Bot action execution
  if (!shouldExecuteWDBotAction(game, now)) return;
  if (!game.round) return;

  const phase = game.round.trumpPhase;
  if (phase === 'round_over') return;

  const currentPlayerId = game.seats[game.round.currentTurnSeatIndex];
  const currentPlayer = room.players.find(p => p.id === currentPlayerId);
  if (!currentPlayer?.isBot) return;

  // Get bot action
  const botAction = getWhosDealBotAction(game, currentPlayerId);
  if (botAction.type === 'noop') return;

  // Process through engine
  const gameModule = getGameModule('whos-deal');
  if (!gameModule) return;

  let newState: WhosDealGameState;
  try {
    newState = gameModule.processAction(game, currentPlayerId, botAction) as WhosDealGameState;
  } catch (e) {
    if (e instanceof WhosDealError) return; // Bot shouldn't trigger errors, but safety
    throw e;
  }

  if (newState === game) return;

  // Set bot timing for next player if needed
  const botAt = computeBotTiming(newState, room.players);
  if (botAt) {
    newState = { ...newState, botActionAt: botAt };
  }

  // Idempotent atomic update
  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return current;
    const currentGame = current.game as WhosDealGameState;
    // Idempotency: check that the game state hasn't changed
    if (!currentGame.round || currentGame.round.trumpPhase !== phase) return current;
    if (currentGame.round.currentTurnSeatIndex !== game.round!.currentTurnSeatIndex) return current;
    return { ...current, game: newState };
  });

  if (!updated) return;

  // Fire Pusher events based on bot action type
  const oldState = game;
  const channel = roomChannel(roomCode);

  try {
    switch (botAction.type) {
      case 'call-trump': {
        const seatIndex = getSeatIndex(newState, currentPlayerId);
        const goAlone = newState.round?.goingAlone || false;

        if (oldState.round?.trumpPhase === 'round1') {
          await pusher.trigger(channel, 'trump-action', {
            seatIndex, action: 'order-up', goAlone,
          });
          await pusher.trigger(channel, 'trump-confirmed', {
            trumpSuit: newState.round!.trumpSuit,
            callingPlayer: currentPlayerId,
            callingTeam: newState.round!.callingTeam,
            goAlone,
          });
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
            callingPlayer: currentPlayerId,
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
        const seatIndex = getSeatIndex(oldState, currentPlayerId);
        await pusher.trigger(channel, 'trump-action', {
          seatIndex, action: 'pass',
        });
        break;
      }

      case 'discard': {
        await pusher.trigger(channel, 'dealer-discarded', {
          seatIndex: newState.dealerSeatIndex,
        });
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
        const seatIndex = getSeatIndex(oldState, currentPlayerId);
        const cardId = (botAction.payload as { cardId: string }).cardId;
        const playedCard = oldState.round!.hands[currentPlayerId].find(c => c.id === cardId);

        await pusher.trigger(channel, 'card-played', {
          seatIndex, card: playedCard,
        });

        const oldTricksPlayed = oldState.round!.tricksPlayed;
        const newTricksPlayed = newState.round!.tricksPlayed;

        if (newTricksPlayed > oldTricksPlayed) {
          const winningSeatIndex = newState.round!.trickLeadSeatIndex;
          const winningTeam = getTeamForSeat(winningSeatIndex);

          await pusher.trigger(channel, 'trick-won', {
            winningSeatIndex, winningTeam,
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
    }
  } catch {
    // Non-fatal
  }

  // Continue processing — next bot might need to act
  await processWhosDealAdvancement(roomCode);
}

async function executeBotSubmissions(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game) return;

  const game = room.game as GameState;
  if (game.phase !== 'submitting') return;

  const pusher = getPusherServer();
  let currentGame = { ...game };
  let stateChanged = false;

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
      if (!current.game) return current;
      const currentGameState = current.game as GameState;
      if (currentGameState.phase !== 'submitting') return current;
      return { ...current, game: currentGame };
    });

    if (updated && (updated.game as GameState)?.phase === 'judging') {
      const anonymousSubmissions = currentGame.revealOrder.map((id) => ({
        id,
        cards: currentGame.submissions[id],
      }));

      try {
        await pusher.trigger(roomChannel(roomCode), 'phase-changed', {
          phase: 'judging',
          blackCard: currentGame.blackCard,
          czarId: room.players[currentGame.czarIndex]?.id,
          czarIndex: currentGame.czarIndex,
          currentRound: currentGame.currentRound,
        });

        await pusher.trigger(roomChannel(roomCode), 'submissions-revealed', {
          submissions: anonymousSubmissions,
        });
      } catch {
        // Non-fatal
      }

      await processGameAdvancement(roomCode);
    }
  }
}

async function executeBotJudgment(roomCode: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room || !room.game) return;

  const game = room.game as GameState;
  if (game.phase !== 'judging') return;

  const czar = room.players[game.czarIndex];
  if (!czar || !czar.isBot) return;

  if (game.roundWinnerId !== null) return;

  const winnerId = selectRandomWinner(game.submissions, czar.id);
  if (!winnerId) return;

  const result = judgeWinner(game, czar.id, winnerId, room.players);
  if (!result.ok) return;

  const newGameState = result.state;

  const scores: Record<string, number> = {};
  for (const p of result.updatedPlayers) {
    scores[p.id] = p.score;
  }

  const updated = await atomicRoomUpdate(roomCode, (current) => {
    if (!current.game) return current;
    const currentGame = current.game as GameState;
    if (currentGame.phase !== 'judging') return current;
    if (currentGame.roundWinnerId !== null) return current;
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
  if (room.game && room.status === 'playing') {
    await processGameAdvancement(roomCode);
  }

  // === DISCONNECT / REPLACEMENT CHECKS ===
  const now = Date.now();
  const disconnectedIds: string[] = [];
  const replacedIds: string[] = [];

  const currentRoom = await getRoom(roomCode);
  if (!currentRoom) return roomNotFound();

  const humanPlayers = currentRoom.players.filter(p => !p.isBot);
  const heartbeats = await Promise.all(
    humanPlayers.map(p => getHeartbeat(roomCode, p.id))
  );

  for (let i = 0; i < humanPlayers.length; i++) {
    const p = humanPlayers[i];
    const lastSeen = heartbeats[i];
    if (!lastSeen) continue;

    const elapsed = now - lastSeen;

    if (elapsed > BOT_REPLACEMENT_TIMEOUT_MS) {
      replacedIds.push(p.id);
    } else if (elapsed > DISCONNECT_TIMEOUT_MS && p.isConnected) {
      disconnectedIds.push(p.id);
    }
  }

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

  if (replacedIds.length > 0) {
    for (const id of replacedIds) {
      await handlePlayerReplacement(roomCode, id);
    }
  }

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
      if (current.gameId === 'terrible-people') {
        const tpGame = game as GameState;
        const hands = { ...tpGame.hands };
        const submissions = { ...tpGame.submissions };

        if (hands[departingPlayerId]) {
          hands[bot.id] = hands[departingPlayerId];
          delete hands[departingPlayerId];
        }

        if (submissions[departingPlayerId]) {
          submissions[bot.id] = submissions[departingPlayerId];
          delete submissions[departingPlayerId];
        }

        let botActionAt = tpGame.botActionAt;

        if (tpGame.phase === 'submitting' && !submissions[bot.id] && idx !== tpGame.czarIndex) {
          botActionAt = getBotActionTimestamp(BOT_SUBMIT_DELAY_RANGE_MS);
        }

        if (tpGame.phase === 'judging' && idx === tpGame.czarIndex && tpGame.roundWinnerId === null) {
          botActionAt = Date.now() + BOT_JUDGE_DELAY_MS;
        }

        const revealOrder = tpGame.revealOrder.map((id) =>
          id === departingPlayerId ? bot.id : id
        );

        game = { ...tpGame, hands, submissions, botActionAt, revealOrder };
      } else if (current.gameId === '4-kate') {
        const fkGame = game as FourKateState;
        const players = { ...fkGame.players };

        if (players.red === departingPlayerId) {
          players.red = bot.id;
        } else if (players.yellow === departingPlayerId) {
          players.yellow = bot.id;
        }

        let botActionAt = fkGame.botActionAt;
        const currentTurnPlayerId = fkGame.currentTurn === 'red' ? players.red : players.yellow;
        if (fkGame.phase === 'playing' && currentTurnPlayerId === bot.id) {
          botActionAt = Date.now() + BOT_MOVE_DELAY_MS;
        }

        game = { ...fkGame, players, botActionAt };
      } else if (current.gameId === 'whos-deal') {
        const wdGame = game as WhosDealGameState;

        // Update seats: replace departing player with bot
        const seats = wdGame.seats.map(id => id === departingPlayerId ? bot.id : id);

        // Update teams: replace in team playerIds
        const teams = {
          a: {
            ...wdGame.teams.a,
            playerIds: wdGame.teams.a.playerIds.map(id =>
              id === departingPlayerId ? bot.id : id
            ) as [string, string],
          },
          b: {
            ...wdGame.teams.b,
            playerIds: wdGame.teams.b.playerIds.map(id =>
              id === departingPlayerId ? bot.id : id
            ) as [string, string],
          },
        };

        // Update round: replace in hands, passedPlayers, currentTrick, callingPlayerId, alonePlayerId
        let round = wdGame.round;
        if (round) {
          const hands = { ...round.hands };
          if (hands[departingPlayerId]) {
            hands[bot.id] = hands[departingPlayerId];
            delete hands[departingPlayerId];
          }

          const passedPlayers = round.passedPlayers.map(id =>
            id === departingPlayerId ? bot.id : id
          );
          const currentTrick = round.currentTrick.map(tc =>
            tc.playerId === departingPlayerId ? { ...tc, playerId: bot.id } : tc
          );
          const callingPlayerId = round.callingPlayerId === departingPlayerId ? bot.id : round.callingPlayerId;
          const alonePlayerId = round.alonePlayerId === departingPlayerId ? bot.id : round.alonePlayerId;

          round = {
            ...round,
            hands,
            passedPlayers,
            currentTrick,
            callingPlayerId,
            alonePlayerId,
          };
        }

        // If it was the departing player's turn, set botActionAt
        let botActionAt = wdGame.botActionAt;
        if (round && round.trumpPhase !== 'round_over' && wdGame.phase !== 'game_over') {
          const currentTurnId = seats[round.currentTurnSeatIndex];
          if (currentTurnId === bot.id) {
            botActionAt = getWDBotTimestamp();
          }
        }

        game = { ...wdGame, seats, teams, round, botActionAt };
      }
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

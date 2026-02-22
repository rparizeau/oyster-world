import { Player } from './types';
import { MAX_PLAYERS } from './constants';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0/O, 1/I
const ROOM_CODE_LENGTH = 6;

const BOT_NAMES = ['Bot Alice', 'Bot Bob', 'Bot Charlie'];

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function generatePlayerId(): string {
  return crypto.randomUUID();
}

export function createBot(seatIndex: number): Player {
  return {
    id: generatePlayerId(),
    name: BOT_NAMES[seatIndex] ?? `Bot ${seatIndex + 1}`,
    isBot: true,
    isConnected: true,
    joinedAt: Date.now(),
    score: 0,
  };
}

export function createBotForSeat(existingPlayers: Player[]): Player {
  const usedBotNames = new Set(
    existingPlayers.filter((p) => p.isBot).map((p) => p.name)
  );
  const availableName = BOT_NAMES.find((n) => !usedBotNames.has(n)) ?? `Bot ${existingPlayers.length + 1}`;
  return {
    id: generatePlayerId(),
    name: availableName,
    isBot: true,
    isConnected: true,
    joinedAt: Date.now(),
    score: 0,
  };
}

export function fillWithBots(players: Player[]): Player[] {
  const result = [...players];
  let botIndex = 0;
  while (result.length < MAX_PLAYERS) {
    result.push(createBot(botIndex));
    botIndex++;
  }
  return result;
}

export function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

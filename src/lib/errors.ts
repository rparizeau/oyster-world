import { NextResponse } from 'next/server';
import type { ApiError } from './types';

export function apiError(
  message: string,
  code: string,
  status: number
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

// Pre-built error helpers for common cases

export function roomNotFound() {
  return apiError('Room not found', 'ROOM_NOT_FOUND', 404);
}

export function roomFull() {
  return apiError('Room is full', 'ROOM_FULL', 410);
}

export function gameInProgress() {
  return apiError('Game in progress', 'GAME_IN_PROGRESS', 403);
}

export function notOwner() {
  return apiError('Only the room owner can do this', 'NOT_OWNER', 403);
}

export function invalidPhase() {
  return apiError('Invalid action for current phase', 'INVALID_PHASE', 409);
}

export function alreadySubmitted() {
  return apiError('Already submitted', 'ALREADY_SUBMITTED', 409);
}

export function invalidSubmission() {
  return apiError('Invalid submission', 'INVALID_SUBMISSION', 400);
}

export function unauthorized() {
  return apiError('Unauthorized', 'UNAUTHORIZED', 401);
}

export function raceCondition() {
  return apiError('Please try again', 'RACE_CONDITION', 409);
}

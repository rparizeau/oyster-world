import { useState, useEffect, useCallback } from 'react';
import type { Room } from '@/lib/types';
import { getGameConfig } from '@/lib/games/registry';
import type { Difficulty } from '@/lib/games/minesweeper/types';
import { SHIP_SETS, VALID_COMBOS } from '@/lib/games/battleship/constants';
import PlayerCard from './PlayerCard';
import WhosDealTeamAssignment from './WhosDealTeamAssignment';

export default function LobbyView({
  room,
  playerId,
  isOwner,
  starting,
  leaving,
  copied,
  onCopy,
  onStartGame,
  onLeave,
  onSwapTeams,
  onSetTargetScore,
  gameInProgress = false,
  onRejoin,
  stepOutTime,
}: {
  room: Room;
  playerId: string | null;
  isOwner: boolean;
  starting: boolean;
  leaving: boolean;
  copied: 'code' | 'link' | null;
  onCopy: (type: 'code' | 'link') => void;
  onStartGame: (settings?: Record<string, unknown>) => void;
  onLeave: () => void;
  onSwapTeams: (playerIdA: string, playerIdB: string) => void;
  onSetTargetScore: (targetScore: number) => void;
  gameInProgress?: boolean;
  onRejoin?: () => void;
  stepOutTime?: number | null;
}) {
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const isWhosDeal = room.gameId === 'whos-deal';
  const gameConfig = getGameConfig(room.gameId);
  const isSinglePlayer = gameConfig?.maxPlayers === 1;
  const isMinesweeper = room.gameId === 'minesweeper';
  const isBattleship = room.gameId === 'battleship';
  const teams = room.settings?.teams as { a: string[]; b: string[] } | undefined;
  const targetScore = (room.settings?.targetScore as number) || 10;

  const [difficulty, setDifficulty] = useState<Difficulty>(
    (room.settings?.difficulty as Difficulty) || 'easy',
  );

  const [bsGridSize, setBsGridSize] = useState<number>(
    (room.settings?.gridSize as number) || 10,
  );
  const [bsShipSet, setBsShipSet] = useState<string>(
    (room.settings?.shipSet as string) || 'classic',
  );

  // Countdown for step-out timer
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    if (!gameInProgress || stepOutTime == null) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - stepOutTime) / 1000);
      setSecondsLeft(Math.max(0, 30 - elapsed));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [gameInProgress, stepOutTime]);

  const handleSetGridSize = useCallback(async (gridSize: number) => {
    setBsGridSize(gridSize);
    // If current ship set is invalid for new grid size, auto-correct
    const validSets = VALID_COMBOS[gridSize] || [];
    if (!validSets.includes(bsShipSet)) {
      const newSet = validSets[0] || 'classic';
      setBsShipSet(newSet);
      // Fire both updates
      try {
        await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: room.roomCode, playerId, type: 'set-ship-set', payload: { shipSet: newSet } }),
        });
      } catch { /* Non-fatal */ }
    }
    try {
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: room.roomCode, playerId, type: 'set-grid-size', payload: { gridSize } }),
      });
    } catch { /* Non-fatal */ }
  }, [room.roomCode, playerId, bsShipSet]);

  const handleSetShipSet = useCallback(async (shipSet: string) => {
    setBsShipSet(shipSet);
    try {
      await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: room.roomCode, playerId, type: 'set-ship-set', payload: { shipSet } }),
      });
    } catch { /* Non-fatal */ }
  }, [room.roomCode, playerId]);

  // --- Game in progress (stepped-out) mode ---
  if (gameInProgress) {
    return (
      <div className="flex flex-col items-center gap-6 p-4 pt-4 pb-6 animate-fade-in">
        {/* Game in progress banner */}
        <div className="w-full max-w-sm text-center pt-2">
          <div
            className="rounded-xl border px-4 py-5"
            style={{ borderColor: 'rgba(240,194,127,.2)', background: 'rgba(240,194,127,.04)' }}
          >
            <div className="text-[0.62em] uppercase tracking-[3px] font-bold mb-2" style={{ color: 'rgba(240,194,127,.5)' }}>
              Game in Progress
            </div>
            <div className="font-display text-[2em] text-pearl tabular-nums">
              0:{secondsLeft.toString().padStart(2, '0')}
            </div>
            <p className="text-[0.78em] mt-1" style={{ color: 'rgba(232,230,240,.35)' }}>
              You&apos;ll be replaced by a bot when the timer runs out
            </p>
          </div>
        </div>

        {/* Player list */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>Players</h2>
            <span className="text-[0.65em] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>{humanCount}/{room.players.length} humans</span>
          </div>
          <div className="flex flex-col gap-2">
            {room.players.map((player, i) => (
              <PlayerCard key={player.id} player={player} isOwnerPlayer={player.id === room.ownerId} index={i} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 w-full max-w-sm">
          <button
            onClick={onRejoin}
            className="btn-primary text-lg"
          >
            Rejoin Game
          </button>
          <button
            onClick={onLeave}
            disabled={leaving}
            className="btn-danger"
          >
            {leaving ? 'Leaving...' : 'Leave Room'}
          </button>
        </div>
      </div>
    );
  }

  // --- Normal lobby mode ---
  return (
    <div className="flex flex-col items-center gap-6 p-4 pt-4 pb-6 animate-fade-in">
      {/* Game code section */}
      <div className="text-center pt-2 pb-4">
        <div className="text-[0.62em] uppercase tracking-[3px] font-bold mb-1" style={{ color: 'rgba(240,194,127,.35)' }}>
          Game Code
        </div>
        <button
          onClick={() => onCopy('code')}
          className="group relative font-display text-[2.2em] text-cream tracking-[6px] hover:text-pearl transition-colors"
          title="Copy game code"
        >
          {room.roomCode}
        </button>
        <button
          onClick={() => onCopy('link')}
          className="mt-1.5 flex items-center gap-1 mx-auto text-sm font-semibold transition-colors"
          style={{ color: 'var(--shallow-water)' }}
        >
          {copied === 'link' ? '✓ Link copied!' : copied === 'code' ? '✓ Code copied!' : '🔗 Copy invite link'}
        </button>
      </div>

      {/* Who's Deal? Team Assignment */}
      {isWhosDeal && teams ? (
        <WhosDealTeamAssignment
          room={room}
          teams={teams}
          playerId={playerId}
          isOwner={isOwner}
          onSwapTeams={onSwapTeams}
        />
      ) : isSinglePlayer ? (
        /* Single-player lobby — just the owner card */
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-2">
            {room.players.filter((p) => !p.isBot).map((player, i) => (
              <PlayerCard key={player.id} player={player} isOwnerPlayer={player.id === room.ownerId} index={i} />
            ))}
          </div>
        </div>
      ) : (
        /* Standard player list for other games */
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>Players</h2>
            <span className="text-[0.65em] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>{humanCount}/{room.players.length} humans</span>
          </div>
          <div className="flex flex-col gap-2">
            {room.players.map((player, i) => (
              <PlayerCard key={player.id} player={player} isOwnerPlayer={player.id === room.ownerId} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Who's Deal? Target Score Selector */}
      {isWhosDeal && (
        <div className="w-full max-w-sm">
          <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold mb-3" style={{ color: 'rgba(232,230,240,.25)' }}>Points to Win</h2>
          <div className="flex gap-1.5">
            {[5, 7, 10, 11].map((score) => (
              <button
                key={score}
                onClick={() => isOwner && onSetTargetScore(score)}
                disabled={!isOwner}
                className="flex-1 rounded-lg py-2.5 text-lg font-bold transition-all"
                style={targetScore === score
                  ? { border: '2px solid var(--pearl)', background: 'rgba(240,194,127,.06)', color: 'var(--pearl)' }
                  : { border: '2px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', color: 'rgba(232,230,240,.35)' }
                }
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Minesweeper Difficulty Selector */}
      {isMinesweeper && (
        <div className="w-full max-w-sm">
          <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold mb-3" style={{ color: 'rgba(232,230,240,.25)' }}>Difficulty</h2>
          <div className="flex gap-1.5">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 rounded-lg px-4 py-2 min-h-[44px] font-semibold transition-all capitalize ${
                  difficulty === d
                    ? 'bg-accent/10 border border-accent text-pearl'
                    : 'border border-border bg-surface text-cream'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Battleship Settings */}
      {isBattleship && (
        <div className="w-full max-w-sm space-y-4">
          {/* Grid Size */}
          <div>
            <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold mb-3" style={{ color: 'rgba(232,230,240,.25)' }}>Grid Size</h2>
            <div className="flex gap-1.5">
              {([10, 8, 7] as const).map((size) => {
                const labels: Record<number, string> = { 10: '10x10 Classic', 8: '8x8 Compact', 7: '7x7 Quick' };
                return (
                  <button
                    key={size}
                    onClick={() => isOwner && handleSetGridSize(size)}
                    disabled={!isOwner}
                    className="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all min-h-[44px]"
                    style={bsGridSize === size
                      ? { border: '2px solid var(--pearl)', background: 'rgba(240,194,127,.06)', color: 'var(--pearl)' }
                      : { border: '2px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', color: 'rgba(232,230,240,.35)' }
                    }
                  >
                    {labels[size]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ship Set */}
          <div>
            <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold mb-3" style={{ color: 'rgba(232,230,240,.25)' }}>Ships</h2>
            <div className="flex gap-1.5">
              {(['classic', 'quick', 'blitz'] as const).map((setName) => {
                const validSets = VALID_COMBOS[bsGridSize] || [];
                const isValid = validSets.includes(setName);
                const labels: Record<string, string> = { classic: 'Classic', quick: 'Quick', blitz: 'Blitz' };
                const counts: Record<string, number> = { classic: 5, quick: 4, blitz: 3 };
                return (
                  <button
                    key={setName}
                    onClick={() => isOwner && isValid && handleSetShipSet(setName)}
                    disabled={!isOwner || !isValid}
                    className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all min-h-[44px] ${
                      !isValid ? 'opacity-30 cursor-not-allowed' : ''
                    }`}
                    style={bsShipSet === setName && isValid
                      ? { border: '2px solid var(--pearl)', background: 'rgba(240,194,127,.06)', color: 'var(--pearl)' }
                      : { border: '2px solid rgba(255,255,255,.05)', background: 'rgba(255,255,255,.02)', color: 'rgba(232,230,240,.35)' }
                    }
                  >
                    <div>{labels[setName]}</div>
                    <div className="text-[0.65em] font-normal opacity-60">{counts[setName]} ships</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ship preview */}
          <div className="flex gap-2 justify-center flex-wrap">
            {(SHIP_SETS[bsShipSet] || SHIP_SETS.classic).map((ship) => (
              <div key={ship.id} className="flex items-center gap-1">
                <span className="text-[0.6rem] text-muted">{ship.name}</span>
                <span className="flex gap-0.5">
                  {Array.from({ length: ship.size }).map((_, i) => (
                    <span key={i} className="w-2 h-2 rounded-full" style={{ background: 'rgba(126,184,212,.4)' }} />
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {isOwner ? (
          <button
            onClick={() => {
              if (isMinesweeper) return onStartGame({ difficulty });
              if (isBattleship) return onStartGame({ gridSize: bsGridSize, shipSet: bsShipSet });
              return onStartGame();
            }}
            disabled={starting}
            className="btn-primary flex items-center justify-center gap-2 text-lg"
          >
            {starting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting...
              </>
            ) : (
              'Start Game'
            )}
          </button>
        ) : (
          <div className="text-center py-4">
            <p className="text-[0.88em] font-semibold" style={{ color: 'rgba(232,230,240,.3)' }}>Waiting for host to start...</p>
            <div className="flex gap-1.5 justify-center mt-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'rgba(240,194,127,.25)', animation: `dot-pulse 1.4s ease-in-out infinite ${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onLeave}
          disabled={leaving}
          className="btn-danger"
        >
          {leaving ? 'Leaving...' : 'Leave Game'}
        </button>
      </div>

      {!isSinglePlayer && (
        <p className="text-[0.68em] text-center" style={{ color: 'rgba(232,230,240,.18)' }}>
          Share the code — the more the merrier
        </p>
      )}
    </div>
  );
}

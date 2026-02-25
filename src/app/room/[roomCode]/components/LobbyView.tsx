import { useState } from 'react';
import type { Room } from '@/lib/types';
import { getGameConfig } from '@/lib/games/registry';
import type { Difficulty } from '@/lib/games/minesweeper/types';
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
}) {
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const isWhosDeal = room.gameId === 'whos-deal';
  const gameConfig = getGameConfig(room.gameId);
  const isSinglePlayer = gameConfig?.maxPlayers === 1;
  const isMinesweeper = room.gameId === 'minesweeper';
  const teams = room.settings?.teams as { a: string[]; b: string[] } | undefined;
  const targetScore = (room.settings?.targetScore as number) || 10;

  const [difficulty, setDifficulty] = useState<Difficulty>(
    (room.settings?.difficulty as Difficulty) || 'easy',
  );

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

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {isOwner ? (
          <button
            onClick={() => isMinesweeper ? onStartGame({ difficulty }) : onStartGame()}
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

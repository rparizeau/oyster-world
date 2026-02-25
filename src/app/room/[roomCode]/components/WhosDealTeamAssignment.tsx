'use client';

import { useState } from 'react';
import type { Room, Player } from '@/lib/types';

export default function WhosDealTeamAssignment({
  room,
  teams,
  playerId,
  isOwner,
  onSwapTeams,
}: {
  room: Room;
  teams: { a: string[]; b: string[] };
  playerId: string | null;
  isOwner: boolean;
  onSwapTeams: (playerIdA: string, playerIdB: string) => void;
}) {
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);

  const teamAPlayers = teams.a.map((id) => room.players.find((p) => p.id === id)).filter(Boolean) as Player[];
  const teamBPlayers = teams.b.map((id) => room.players.find((p) => p.id === id)).filter(Boolean) as Player[];

  const humanCount = room.players.filter((p) => !p.isBot).length;

  function handleSelectA(id: string) {
    if (!isOwner) return;
    if (selectedA === id) {
      setSelectedA(null);
      return;
    }
    setSelectedA(id);
    if (selectedB) {
      onSwapTeams(id, selectedB);
      setSelectedA(null);
      setSelectedB(null);
    }
  }

  function handleSelectB(id: string) {
    if (!isOwner) return;
    if (selectedB === id) {
      setSelectedB(null);
      return;
    }
    setSelectedB(id);
    if (selectedA) {
      onSwapTeams(selectedA, id);
      setSelectedA(null);
      setSelectedB(null);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[0.65em] uppercase tracking-[2px] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>Teams</h2>
        <span className="text-[0.65em] font-bold" style={{ color: 'rgba(232,230,240,.25)' }}>{humanCount}/{room.players.length} humans</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Team A */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--shallow-water)' }} />
            <span className="text-[0.7em] font-bold" style={{ color: 'var(--shallow-water)' }}>Team A</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {teamAPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectA(player.id)}
                disabled={!isOwner}
                className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all text-left w-full ${
                  isOwner ? 'cursor-pointer' : 'cursor-default'
                } ${!player.isConnected && !player.isBot ? 'opacity-40' : ''} ${player.isBot ? 'opacity-45' : ''}`}
                style={selectedA === player.id
                  ? { background: 'rgba(126,184,212,.15)', border: '2px solid var(--shallow-water)', boxShadow: '0 0 10px rgba(126,184,212,.2)' }
                  : player.isBot
                    ? { background: 'rgba(126,184,212,.03)', border: '1.5px dashed rgba(126,184,212,.1)' }
                    : { background: 'rgba(126,184,212,.05)', border: '1.5px solid rgba(126,184,212,.1)' }
                }
              >
                {player.isBot ? (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em]" style={{ background: 'rgba(255,255,255,.06)' }}>🤖</div>
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(126,184,212,.2)' }}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className={`font-bold text-[0.82em] truncate block ${player.isBot ? 'text-cream/60' : 'text-cream'}`}>
                    {player.name}
                  </span>
                  {player.isBot && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>}
                  {player.id === room.ownerId && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Team B */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--coral)' }} />
            <span className="text-[0.7em] font-bold" style={{ color: 'var(--coral)' }}>Team B</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {teamBPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectB(player.id)}
                disabled={!isOwner}
                className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all text-left w-full ${
                  isOwner ? 'cursor-pointer' : 'cursor-default'
                } ${!player.isConnected && !player.isBot ? 'opacity-40' : ''} ${player.isBot ? 'opacity-45' : ''}`}
                style={selectedB === player.id
                  ? { background: 'rgba(232,168,124,.15)', border: '2px solid var(--coral)', boxShadow: '0 0 10px rgba(232,168,124,.2)' }
                  : player.isBot
                    ? { background: 'rgba(232,168,124,.03)', border: '1.5px dashed rgba(232,168,124,.1)' }
                    : { background: 'rgba(232,168,124,.05)', border: '1.5px solid rgba(232,168,124,.1)' }
                }
              >
                {player.isBot ? (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em]" style={{ background: 'rgba(255,255,255,.06)' }}>🤖</div>
                ) : (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(232,168,124,.2)' }}>
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className={`font-bold text-[0.82em] truncate block ${player.isBot ? 'text-cream/60' : 'text-cream'}`}>
                    {player.name}
                  </span>
                  {player.isBot && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>}
                  {player.id === room.ownerId && <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {isOwner && (
        <p className="text-[0.65em] text-center mt-2.5" style={{ color: 'rgba(232,230,240,.18)' }}>
          Tap one player from each team to swap them
        </p>
      )}
    </div>
  );
}

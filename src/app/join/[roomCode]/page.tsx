'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import PearlGlobe from '@/components/PearlGlobe';

interface GameInfo {
  name: string;
  icon: string;
}

const GAME_INFO: Record<string, GameInfo> = {
  'terrible-people': { name: 'Terrible People', icon: '😈' },
  '4-kate': { name: 'Take 4', icon: '❤️' },
  'whos-deal': { name: "Who's Deal?", icon: '🃏' },
};

export default function JoinPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/rooms/${roomCode}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.gameId) {
          setGameId(data.gameId);
        }
      })
      .catch(() => {});
  }, [roomCode]);

  const handleJoin = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to join game');
        return;
      }
      sessionStorage.setItem('playerId', data.playerId);
      sessionStorage.setItem('playerName', data.playerName);
      router.push(`/room/${data.roomCode}`);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [name, roomCode, router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !loading) {
      handleJoin();
    }
  }

  const gameInfo = gameId ? GAME_INFO[gameId] : null;

  return (
    <div className="bg-depth-wading flex min-h-dvh flex-col items-center justify-center p-6 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">
          <PearlGlobe size={64} animate="float" />
        </div>
        <h1 className="font-display text-[1.7em] text-pearl mb-1">Join a Game</h1>

        {/* Game code display */}
        <div className="mt-3 mb-1">
          <div className="text-[0.62em] uppercase tracking-[3px] font-bold" style={{ color: 'rgba(240,194,127,.35)' }}>
            Game Code
          </div>
          <div className="font-display text-[2.2em] text-cream tracking-[6px]">
            {roomCode}
          </div>
        </div>

        {gameInfo && (
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <span className="text-lg">{gameInfo.icon}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--shallow-water)' }}>{gameInfo.name}</span>
          </div>
        )}

        <p className="text-sm mb-6" style={{ color: 'rgba(245,230,202,.45)' }}>
          Enter your name to dive in
        </p>

        <div className="flex flex-col gap-3 w-full max-w-[260px]" onKeyDown={handleKeyDown}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="input-ocean"
            autoFocus
          />

          {error && (
            <div className="animate-fade-in rounded-lg px-4 py-2.5 text-center" style={{ background: 'rgba(201,101,138,.1)', border: '1px solid rgba(201,101,138,.3)' }}>
              <p className="text-star text-sm font-medium">{error}</p>
              <button
                onClick={() => router.push('/')}
                className="mt-1.5 text-xs underline transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                Return Home
              </button>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Diving in...
              </>
            ) : (
              'Dive In'
            )}
          </button>

          <button
            onClick={() => router.push('/')}
            className="text-[0.8em] mt-1"
            style={{ color: 'rgba(232,230,240,.25)', background: 'none', border: 'none' }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

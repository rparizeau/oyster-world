'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface GameCardInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxPlayers: number;
}

const GAMES: GameCardInfo[] = [
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    icon: '\u{1F0CF}',
    maxPlayers: 4,
  },
  {
    id: '4-kate',
    name: '4 Kate',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    icon: '\u{1F534}',
    maxPlayers: 2,
  },
];

type Mode = 'home' | 'create-name' | 'create-game' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const handleCreate = useCallback(async () => {
    if (!selectedGame) {
      setError('Please select a game');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), gameId: selectedGame }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create world');
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
  }, [name, selectedGame, router]);

  const handleJoin = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a world code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCode.trim().toUpperCase(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to join world');
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

  function handleNameContinue() {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setError('');
    setMode('create-game');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !loading) {
      if (mode === 'create-name') handleNameContinue();
      else if (mode === 'create-game') handleCreate();
      else if (mode === 'join') handleJoin();
    }
  }

  function handleBack() {
    if (mode === 'create-game') {
      setMode('create-name');
      setSelectedGame(null);
    } else {
      setMode('home');
    }
    setError('');
  }

  // --- HOME ---
  if (mode === 'home') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6 animate-fade-in">
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-foreground mb-2">
            Oyster World
          </h1>
          <p className="text-muted-light text-lg">Pick a game. Start some trouble.</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => { setMode('create-name'); setError(''); }}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Create a World
          </button>
          <button
            onClick={() => { setMode('join'); setError(''); }}
            className="w-full rounded-xl border-2 border-border-light px-6 py-4 text-lg font-bold text-foreground hover:border-muted-light hover:bg-surface-light active:scale-[0.98] transition-all"
          >
            Join a World
          </button>
        </div>
      </div>
    );
  }

  // --- JOIN ---
  if (mode === 'join') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 animate-fade-in">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Join a World</h1>
          <p className="mt-2 text-muted">Enter your name and world code</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs" onKeyDown={handleKeyDown}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="w-full rounded-xl border-2 border-border bg-surface px-4 py-3.5 text-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            autoFocus
          />

          <input
            type="text"
            placeholder="World code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full rounded-xl border-2 border-border bg-surface px-4 py-3.5 text-lg text-foreground placeholder:text-muted uppercase tracking-[0.3em] text-center font-mono font-bold focus:outline-none focus:border-accent transition-colors"
          />

          {error && (
            <div className="animate-fade-in rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
              <p className="text-danger text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-bold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Joining...
              </>
            ) : (
              'Join World'
            )}
          </button>

          <button
            onClick={handleBack}
            className="text-sm text-muted hover:text-muted-light transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // --- CREATE: NAME ENTRY ---
  if (mode === 'create-name') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 animate-fade-in">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Create a World</h1>
          <p className="mt-2 text-muted">Enter your name to get started</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs" onKeyDown={handleKeyDown}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            className="w-full rounded-xl border-2 border-border bg-surface px-4 py-3.5 text-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
            autoFocus
          />

          {error && (
            <div className="animate-fade-in rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
              <p className="text-danger text-sm font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={handleNameContinue}
            className="w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Next
          </button>

          <button
            onClick={handleBack}
            className="text-sm text-muted hover:text-muted-light transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // --- CREATE: GAME SELECTION CAROUSEL ---
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Choose a Game</h1>
        <p className="mt-2 text-muted">Swipe to browse, tap to select</p>
      </div>

      {/* Horizontal swipeable carousel */}
      <div className="w-full max-w-md">
        <div
          ref={carouselRef}
          className="flex gap-4 overflow-x-auto pb-4 px-2 snap-x snap-mandatory scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {GAMES.map((game) => {
            const isSelected = selectedGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => setSelectedGame(game.id)}
                className={`flex-shrink-0 w-[200px] snap-center rounded-2xl border-2 p-6 text-left transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/10 shadow-[0_0_20px_rgba(139,92,246,0.2)]'
                    : 'border-border bg-surface hover:border-border-light hover:bg-surface-light'
                }`}
              >
                <div className="text-4xl mb-3">{game.icon}</div>
                <h3 className={`text-lg font-bold mb-1 ${isSelected ? 'text-accent' : 'text-foreground'}`}>
                  {game.name}
                </h3>
                <p className="text-sm text-muted mb-3 leading-snug">{game.description}</p>
                <span className="inline-block text-xs font-semibold text-muted-light bg-surface-lighter rounded-full px-2.5 py-1">
                  {game.maxPlayers} players
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="animate-fade-in rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center max-w-xs w-full">
          <p className="text-danger text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs" onKeyDown={handleKeyDown}>
        <button
          onClick={handleCreate}
          disabled={!selectedGame || loading}
          className="w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-bold text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </>
          ) : (
            'Create'
          )}
        </button>

        <button
          onClick={handleBack}
          className="text-sm text-muted hover:text-muted-light transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

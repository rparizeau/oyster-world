'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PearlGlobe from '@/components/PearlGlobe';

interface GameCardInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxPlayers: number;
}

const GAMES: GameCardInfo[] = [
  {
    id: '4-kate',
    name: 'Take 4',
    description: 'Classic Connect 4. Drop pieces. Get four in a row.',
    icon: '❤️',
    maxPlayers: 2,
  },
  {
    id: 'whos-deal',
    name: "Who's Deal?",
    description: 'Classic Euchre. Pick trump. Take tricks. Talk trash.',
    icon: '🃏',
    maxPlayers: 4,
  },
  {
    id: 'terrible-people',
    name: 'Terrible People',
    description: 'Fill in the blanks. Be terrible.',
    icon: '😈',
    maxPlayers: 4,
  },
];

type Mode = 'home' | 'create-name' | 'create-game' | 'loading' | 'join';

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
    // Transition to descent loading screen
    setMode('loading');
    setError('');
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), gameId: selectedGame }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create game');
        setMode('create-game');
        return;
      }
      sessionStorage.setItem('playerId', data.playerId);
      sessionStorage.setItem('playerName', data.playerName);
      // Auto-advance after 1.5s minimum
      setTimeout(() => {
        router.push(`/room/${data.roomCode}`);
      }, 1500);
    } catch {
      setError('Network error. Please try again.');
      setMode('create-game');
    }
  }, [name, selectedGame, router]);

  const handleJoin = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a game code');
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

  // --- HOME (Surface) ---
  if (mode === 'home') {
    return (
      <div className="bg-depth-surface flex min-h-dvh flex-col items-center justify-center p-6 animate-fade-in relative overflow-hidden">
        <Bubbles />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-6">
            <PearlGlobe size={96} animate="float" />
          </div>
          <h1 className="font-display text-[2em] text-cream mb-1">My Oyster World</h1>
          <p className="text-sm font-semibold mb-8" style={{ color: 'rgba(240,194,127,.6)' }}>
            Every game is a pearl.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-[260px]">
            <button
              onClick={() => { setMode('create-name'); setError(''); }}
              className="btn-primary"
            >
              Dive In
            </button>
            <button
              onClick={() => { setMode('join'); setError(''); }}
              className="btn-secondary"
            >
              Join a Game
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 py-3.5 text-center text-[0.65em] font-semibold" style={{ color: 'rgba(240,194,127,.18)' }}>
          We make pearls faster than oysters.
        </div>
      </div>
    );
  }

  // --- JOIN (Wading) ---
  if (mode === 'join') {
    return (
      <div className="bg-depth-wading flex min-h-dvh flex-col items-center justify-center p-6 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <PearlGlobe size={64} animate="float" />
          </div>
          <h1 className="font-display text-[1.7em] text-pearl mb-1">Join a Game</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(245,230,202,.45)' }}>
            Enter your name and the code you were given
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
            <input
              type="text"
              placeholder="GAME CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="input-ocean input-ocean-code"
            />

            {error && (
              <div className="animate-fade-in rounded-lg px-4 py-2.5 text-center" style={{ background: 'rgba(201,101,138,.1)', border: '1px solid rgba(201,101,138,.3)' }}>
                <p className="text-star text-sm font-medium">{error}</p>
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
              onClick={handleBack}
              className="text-[0.8em] mt-1"
              style={{ color: 'rgba(232,230,240,.25)', background: 'none', border: 'none' }}
            >
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CREATE: NAME ENTRY (Wading) ---
  if (mode === 'create-name') {
    return (
      <div className="bg-depth-wading flex min-h-dvh flex-col items-center justify-center p-6 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4">
            <PearlGlobe size={64} animate="float" />
          </div>
          <h1 className="font-display text-[1.7em] text-pearl mb-1">What&apos;s your name?</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(245,230,202,.45)' }}>
            This is how other players will see you
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
              </div>
            )}

            <button
              onClick={handleNameContinue}
              className="btn-primary"
            >
              Next
            </button>

            <button
              onClick={handleBack}
              className="text-[0.8em] mt-1"
              style={{ color: 'rgba(232,230,240,.25)', background: 'none', border: 'none' }}
            >
              &larr; Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- LOADING (Descent) ---
  if (mode === 'loading') {
    const gameName = GAMES.find(g => g.id === selectedGame)?.name ?? '';
    const gameMax = GAMES.find(g => g.id === selectedGame)?.maxPlayers ?? 4;
    return (
      <div className="bg-depth-descent flex min-h-dvh flex-col items-center justify-center p-6 animate-fade-in">
        <div className="flex flex-col items-center text-center">
          <div className="mb-5">
            <PearlGlobe size={56} animate="pulse" />
          </div>
          <h1 className="font-display text-[1.3em] text-pearl mb-1">Cracking open your pearl...</h1>
          <p className="text-[0.78em]" style={{ color: 'rgba(232,230,240,.22)' }}>
            {gameName} &middot; {gameMax} players
          </p>
          <div className="flex gap-1.5 mt-3.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: 'rgba(240,194,127,.25)',
                  animation: `dot-pulse 1.4s ease-in-out infinite ${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- CREATE: GAME SELECTION (Choosing) ---
  return (
    <div className="bg-depth-choosing flex min-h-dvh flex-col items-center justify-center gap-6 p-6 animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3.5">
          <PearlGlobe size={48} animate="float" />
        </div>
        <h1 className="font-display text-[1.5em] text-pearl mb-1">Pick a Pearl</h1>
        <p className="text-[0.82em] mb-5" style={{ color: 'rgba(245,230,202,.4)' }}>
          Each game is a treasure. Choose yours.
        </p>
      </div>

      {/* Pearl cards carousel */}
      <div className="w-full max-w-[300px]">
        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto pb-1 px-1 snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {GAMES.map((game) => {
            const isSelected = selectedGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => setSelectedGame(game.id)}
                className="flex-shrink-0 w-[140px] snap-center rounded-2xl p-[18px_14px] text-left transition-all relative"
                style={{
                  border: isSelected ? '2px solid var(--pearl)' : '2px solid rgba(255,255,255,.06)',
                  background: isSelected ? 'rgba(240,194,127,.06)' : 'rgba(255,255,255,.03)',
                  boxShadow: isSelected ? '0 0 20px rgba(240,194,127,.15)' : 'none',
                }}
              >
                <span
                  className="absolute top-2.5 right-2.5 text-[0.5em] font-bold tracking-[0.5px] rounded-md px-2 py-0.5"
                  style={{ background: 'rgba(240,194,127,.1)', color: 'var(--pearl)' }}
                >
                  ✦ PEARL
                </span>
                <div className="text-[1.8em] mb-2">{game.icon}</div>
                <div className="font-sub text-[0.95em] text-cream mb-0.5">{game.name}</div>
                <p className="text-[0.68em] leading-snug mb-2" style={{ color: 'rgba(232,230,240,.4)' }}>
                  {game.description}
                </p>
                <span
                  className="inline-block text-[0.6em] font-bold rounded-md px-2 py-[3px]"
                  style={{ background: 'rgba(126,184,212,.1)', color: 'var(--shallow-water)' }}
                >
                  {game.maxPlayers} players
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="animate-fade-in rounded-lg px-4 py-2.5 text-center max-w-[300px] w-full" style={{ background: 'rgba(201,101,138,.1)', border: '1px solid rgba(201,101,138,.3)' }}>
          <p className="text-star text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-[300px]" onKeyDown={handleKeyDown}>
        <button
          onClick={handleCreate}
          disabled={!selectedGame || loading}
          className="btn-primary flex items-center justify-center gap-2"
        >
          Crack It Open
        </button>

        <button
          onClick={handleBack}
          className="text-[0.8em] mt-1"
          style={{ color: 'rgba(232,230,240,.25)', background: 'none', border: 'none' }}
        >
          &larr; Back
        </button>
      </div>
    </div>
  );
}

// Bubble effect for Surface screen
function Bubbles() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    for (let i = 0; i < 10; i++) {
      const b = document.createElement('div');
      b.className = 'bubble';
      const s = Math.random() * 14 + 3;
      b.style.width = `${s}px`;
      b.style.height = `${s}px`;
      b.style.left = `${Math.random() * 100}%`;
      b.style.animationDuration = `${Math.random() * 12 + 6}s`;
      b.style.animationDelay = `${Math.random() * 8}s`;
      container.appendChild(b);
    }
    return () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden" />;
}

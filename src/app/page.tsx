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
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    description: 'Classic Minesweeper. Find the mines. Clear the board.',
    icon: '💣',
    maxPlayers: 1,
  },
];

type Mode = 'home' | 'create-name' | 'create-game' | 'loading' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [selectedGame, setSelectedGame] = useState<string>(GAMES[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCarouselSelect = useCallback((gameId: string) => {
    setSelectedGame(gameId);
  }, []);

  const handleCreate = useCallback(async () => {
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
      setSelectedGame(GAMES[0].id);
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
    <div className="bg-depth-choosing flex min-h-dvh flex-col items-center justify-center gap-6 p-6 animate-fade-in overflow-hidden">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3.5">
          <PearlGlobe size={48} animate="float" />
        </div>
        <h1 className="font-display text-[1.5em] text-pearl mb-1">Pick a Pearl</h1>
        <p className="text-[0.82em] mb-5" style={{ color: 'rgba(245,230,202,.4)' }}>
          Each game is a treasure. Choose yours.
        </p>
      </div>

      {/* Pearl carousel */}
      <PearlCarousel games={GAMES} onSelect={handleCarouselSelect} />

      {error && (
        <div className="animate-fade-in rounded-lg px-4 py-2.5 text-center max-w-[300px] w-full" style={{ background: 'rgba(201,101,138,.1)', border: '1px solid rgba(201,101,138,.3)' }}>
          <p className="text-star text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-[300px]" onKeyDown={handleKeyDown}>
        <button
          onClick={handleCreate}
          disabled={loading}
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

// ====================
// PEARL CAROUSEL
// ====================
function PearlCarousel({
  games,
  onSelect,
}: {
  games: GameCardInfo[];
  onSelect: (gameId: string) => void;
}) {
  const count = games.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(count); // start at middle copy, first card
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [containerWidth, setContainerWidth] = useState(300);
  const startXRef = useRef(0);
  const wasDragRef = useRef(false);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Notify parent on mount
  useEffect(() => {
    onSelect(games[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Card width = 88% of the CTA button (max 300px), not the carousel container
  const ctaWidth = Math.min(containerWidth, 300);
  const cardWidth = ctaWidth * 0.88;
  const gap = 12;
  const stride = cardWidth + gap;
  const threshold = cardWidth * 0.2;

  // Transform to center the current card
  const baseOffset = containerWidth / 2 - cardWidth / 2 - current * stride;
  const translateX = baseOffset + dragDelta;

  const snapTo = (index: number) => {
    setCurrent(index);
    setIsAnimating(true);
    const realIndex = ((index % count) + count) % count;
    onSelect(games[realIndex].id);
  };

  const handleTransitionEnd = () => {
    setIsAnimating(false);
    const realIndex = ((current % count) + count) % count;
    const middleIndex = count + realIndex;
    if (current !== middleIndex) {
      setCurrent(middleIndex);
    }
  };

  // Pointer handlers
  const onPointerDown = (clientX: number) => {
    if (isAnimating) return;
    setIsDragging(true);
    startXRef.current = clientX;
    wasDragRef.current = false;
    setDragDelta(0);
  };

  const onPointerMove = (clientX: number) => {
    if (!isDragging) return;
    const delta = clientX - startXRef.current;
    setDragDelta(delta);
    if (Math.abs(delta) > 5) wasDragRef.current = true;
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dragDelta) > threshold) {
      snapTo(current + (dragDelta < 0 ? 1 : -1));
    } else {
      setIsAnimating(true); // snap back
    }
    setDragDelta(0);
  };

  const handleCardClick = (virtualIndex: number) => {
    if (wasDragRef.current) return;
    if (virtualIndex === current) return;
    snapTo(virtualIndex);
  };

  // Build tripled array
  const tripled = [...games, ...games, ...games];
  const easing = 'cubic-bezier(.25,.85,.35,1)';

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="w-full overflow-hidden relative"
        style={{ touchAction: 'pan-y' }}
        onMouseDown={(e) => { e.preventDefault(); onPointerDown(e.clientX); }}
        onMouseMove={(e) => onPointerMove(e.clientX)}
        onMouseUp={onPointerUp}
        onMouseLeave={() => { if (isDragging) onPointerUp(); }}
        onTouchStart={(e) => onPointerDown(e.touches[0].clientX)}
        onTouchMove={(e) => onPointerMove(e.touches[0].clientX)}
        onTouchEnd={onPointerUp}
      >
        <div
          style={{
            display: 'flex',
            gap: `${gap}px`,
            transform: `translateX(${translateX}px)`,
            transition: isDragging ? 'none' : isAnimating ? `transform 0.4s ${easing}` : 'none',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {tripled.map((game, i) => {
            const dist = Math.abs(i - current - (isDragging ? -dragDelta / stride : 0));
            const roundedDist = Math.round(Math.max(0, dist));
            const isCentered = roundedDist === 0;
            const isNear = roundedDist === 1;

            const opacity = isCentered ? 1 : isNear ? 0.6 : 0.45;
            const scale = isCentered ? 1 : isNear ? 0.95 : 0.92;

            return (
              <div
                key={`${game.id}-${i}`}
                onClick={() => handleCardClick(i)}
                style={{
                  width: `${cardWidth}px`,
                  flexShrink: 0,
                  opacity,
                  transform: `scale(${scale})`,
                  transition: isDragging ? 'none' : `opacity 0.4s ${easing}, transform 0.4s ${easing}`,
                  borderRadius: '18px',
                  padding: '18px 18px 20px',
                  border: isCentered ? '2px solid rgba(255,255,255,.12)' : '2px solid rgba(255,255,255,.06)',
                  background: isCentered ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.03)',
                  backdropFilter: 'blur(4px)',
                  cursor: isCentered ? 'default' : 'pointer',
                }}
              >
                {/* Header: icon + text column */}
                <div style={{ display: 'flex', gap: '14px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '2em', lineHeight: 1, flexShrink: 0 }}>{game.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                    <span className="font-sub" style={{ fontSize: '1.05em', color: 'var(--cream)', lineHeight: 1.2 }}>
                      {game.name}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.5em', fontWeight: 700, letterSpacing: '0.5px',
                        background: 'rgba(240,194,127,.1)', color: 'var(--pearl)',
                        padding: '3px 9px', borderRadius: '6px',
                      }}>
                        ✦ PEARL
                      </span>
                      <span style={{
                        fontSize: '0.62em', fontWeight: 700,
                        background: 'rgba(126,184,212,.1)', color: 'var(--shallow-water)',
                        padding: '3px 8px', borderRadius: '6px', width: 'fit-content',
                      }}>
                        {game.maxPlayers} {game.maxPlayers === 1 ? 'player' : 'players'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Description */}
                <p className="font-body" style={{ fontSize: '0.72em', lineHeight: 1.5, color: 'rgba(232,230,240,.4)' }}>
                  {game.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Indicator dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px' }}>
        {games.map((game, i) => {
          const realIndex = ((current % count) + count) % count;
          const isActive = realIndex === i;
          return (
            <button
              key={game.id}
              onClick={() => snapTo(current + (i - realIndex))}
              style={{
                width: isActive ? '18px' : '6px',
                height: '6px',
                borderRadius: isActive ? '3px' : '50%',
                background: isActive ? '#F0C27F' : 'rgba(245,230,202,.12)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
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

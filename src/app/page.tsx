'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'home' | 'create' | 'join';

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create room');
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
  }, [name, router]);

  const handleJoin = useCallback(async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setError('Please enter a room code');
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
        setError(data.error || 'Failed to join room');
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
      if (mode === 'create') handleCreate();
      else if (mode === 'join') handleJoin();
    }
  }

  if (mode === 'home') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-10 p-6 animate-fade-in">
        <div className="text-center">
          <div className="mb-6 inline-block">
            <div className="card-black !p-6 !text-2xl text-center max-w-xs mx-auto">
              <span className="block text-4xl font-black tracking-tight">Terrible</span>
              <span className="block text-4xl font-black tracking-tight">People</span>
            </div>
          </div>
          <p className="text-muted-light text-lg">A party game for terrible people</p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => { setMode('create'); setError(''); }}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-bold text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Create Room
          </button>
          <button
            onClick={() => { setMode('join'); setError(''); }}
            className="w-full rounded-xl border-2 border-border-light px-6 py-4 text-lg font-bold text-foreground hover:border-muted-light hover:bg-surface-light active:scale-[0.98] transition-all"
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === 'create' ? 'Create a Room' : 'Join a Room'}
        </h1>
        <p className="mt-2 text-muted">
          {mode === 'create' ? 'Enter your name to get started' : 'Enter your name and room code'}
        </p>
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

        {mode === 'join' && (
          <input
            type="text"
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full rounded-xl border-2 border-border bg-surface px-4 py-3.5 text-lg text-foreground placeholder:text-muted uppercase tracking-[0.3em] text-center font-mono font-bold focus:outline-none focus:border-accent transition-colors"
          />
        )}

        {error && (
          <div className="animate-fade-in rounded-lg bg-danger/10 border border-danger/30 px-4 py-2.5 text-center">
            <p className="text-danger text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading}
          className="w-full rounded-xl bg-accent px-6 py-3.5 text-lg font-bold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {mode === 'create' ? 'Creating...' : 'Joining...'}
            </>
          ) : (
            mode === 'create' ? 'Create Room' : 'Join Room'
          )}
        </button>

        <button
          onClick={() => { setMode('home'); setError(''); setName(''); setRoomCode(''); }}
          className="text-sm text-muted hover:text-muted-light transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function JoinPage() {
  const router = useRouter();
  const params = useParams();
  const roomCode = (params.roomCode as string).toUpperCase();

  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      handleJoin();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 animate-fade-in">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Join Room</h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-light px-4 py-2">
          <span className="text-muted text-sm">Room</span>
          <span className="font-mono font-bold text-xl tracking-[0.2em]">{roomCode}</span>
        </div>
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
            <button
              onClick={() => router.push('/')}
              className="mt-1.5 text-xs text-muted hover:text-muted-light underline transition-colors"
            >
              Return Home
            </button>
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
            'Join Game'
          )}
        </button>

        <button
          onClick={() => router.push('/')}
          className="text-sm text-muted hover:text-muted-light transition-colors"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

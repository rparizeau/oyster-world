import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getPusherClient, roomChannel, playerChannel } from '@/lib/pusher';
import { HEARTBEAT_INTERVAL_MS } from '@/lib/constants';
import type { Room, Player } from '@/lib/types';
import type Channel from 'pusher-js/types/src/core/channels/channel';

export interface RoomConnectionResult {
  room: Room | null;
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>;
  playerId: string | null;
  loading: boolean;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  roomChannel: Channel | null;
  playerChannel: Channel | null;
}

export function useRoomConnection(
  roomCode: string,
  addToast: (message: string, type: 'info' | 'success' | 'warning') => void,
): RoomConnectionResult {
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [channels, setChannels] = useState<{ room: Channel; player: Channel } | null>(null);

  const playerIdRef = useRef<string | null>(null);

  // Load room state
  const fetchRoom = useCallback(async () => {
    try {
      const pid = playerIdRef.current || '';
      const res = await fetch(`/api/rooms/${roomCode}?playerId=${encodeURIComponent(pid)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Room not found');
        return null;
      }
      const data = await res.json();
      setRoom(data);
      return data;
    } catch {
      setError('Failed to load room');
      return null;
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  // Session bootstrap
  useEffect(() => {
    const storedPlayerId = sessionStorage.getItem('playerId');
    if (!storedPlayerId) {
      router.push(`/join/${roomCode}`);
      return;
    }
    setPlayerId(storedPlayerId);
    playerIdRef.current = storedPlayerId;
    fetchRoom();
  }, [roomCode, router, fetchRoom]);

  // Subscribe to Pusher events
  useEffect(() => {
    if (!playerId) return;

    const pusher = getPusherClient();
    const rChannel = pusher.subscribe(roomChannel(roomCode));
    const pChannel = pusher.subscribe(playerChannel(playerId));

    setChannels({ room: rChannel as unknown as Channel, player: pChannel as unknown as Channel });

    // Connection status tracking
    pusher.connection.bind('state_change', (states: { current: string }) => {
      if (states.current === 'connected') {
        setConnectionStatus('connected');
      } else if (states.current === 'connecting' || states.current === 'unavailable') {
        setConnectionStatus('reconnecting');
      } else if (states.current === 'disconnected' || states.current === 'failed') {
        setConnectionStatus('disconnected');
      }
    });

    // --- Game started: update room status ---
    rChannel.bind('game-started', () => {
      setRoom((prev) => prev ? { ...prev, status: 'playing' } : prev);
    });

    // --- Lobby events ---

    rChannel.bind('player-joined', (data: { player: Player }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const idx = prev.players.findIndex(
          (p) => p.isBot && !prev.players.some((existing) => existing.id === data.player.id && !existing.isBot)
        );
        if (idx === -1) return prev;
        const updated = [...prev.players];
        updated[idx] = data.player;
        return { ...prev, players: updated };
      });
      addToast(`${data.player.name} joined the game`, 'info');
    });

    rChannel.bind('player-left', (data: { playerId: string; newOwnerId?: string; replacementBot: Player }) => {
      // Self-replacement: the current player was replaced by a bot
      if (data.playerId === playerIdRef.current) {
        addToast('You were replaced by a bot', 'warning');
        router.push('/');
        return;
      }
      setRoom((prev) => {
        if (!prev) return prev;
        const leavingPlayer = prev.players.find((p) => p.id === data.playerId);
        if (leavingPlayer) {
          addToast(`${leavingPlayer.name} left the game`, 'warning');
        }
        const idx = prev.players.findIndex((p) => p.id === data.playerId);
        if (idx === -1) return prev;
        const updated = [...prev.players];
        updated[idx] = data.replacementBot;
        return {
          ...prev,
          players: updated,
          ownerId: data.newOwnerId ?? prev.ownerId,
        };
      });
    });

    rChannel.bind('player-disconnected', (data: { playerId: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updated = prev.players.map((p) =>
          p.id === data.playerId ? { ...p, isConnected: false } : p
        );
        return { ...prev, players: updated };
      });
    });

    rChannel.bind('player-reconnected', (data: { playerId: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updated = prev.players.map((p) =>
          p.id === data.playerId ? { ...p, isConnected: true } : p
        );
        return { ...prev, players: updated };
      });
    });

    rChannel.bind('room-destroyed', () => {
      setError('Room has been closed');
      setTimeout(() => router.push('/'), 2000);
    });

    return () => {
      pusher.connection.unbind('state_change');
      rChannel.unbind_all();
      pChannel.unbind_all();
      pusher.unsubscribe(roomChannel(roomCode));
      pusher.unsubscribe(playerChannel(playerId));
      setChannels(null);
    };
  }, [playerId, roomCode, router, addToast]);

  // Heartbeat
  useEffect(() => {
    if (!playerId || !roomCode) return;

    let abortController: AbortController | null = null;

    const sendHeartbeat = () => {
      abortController?.abort();
      abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController?.abort(), 5000);

      fetch('/api/rooms/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode, playerId }),
        signal: abortController.signal,
      })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Heartbeat failed:', err.message);
          }
        })
        .finally(() => clearTimeout(timeoutId));
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortController?.abort();
    };
  }, [playerId, roomCode]);

  return {
    room,
    setRoom,
    playerId,
    loading,
    error,
    setError,
    connectionStatus,
    roomChannel: channels?.room ?? null,
    playerChannel: channels?.player ?? null,
  };
}

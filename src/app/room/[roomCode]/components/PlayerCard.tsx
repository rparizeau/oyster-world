import type { Player } from '@/lib/types';

export default function PlayerCard({ player, isOwnerPlayer, index }: { player: Player; isOwnerPlayer: boolean; index: number }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[10px] px-2.5 py-2.5 transition-all animate-fade-in ${
        !player.isConnected && !player.isBot ? 'opacity-40' : ''
      } ${player.isBot ? 'opacity-45' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
        background: 'rgba(126,184,212,.05)',
        border: '1.5px solid rgba(126,184,212,.1)',
      }}
    >
      {player.isBot ? (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(255,255,255,.06)' }}>
          🤖
        </div>
      ) : (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[0.7em] font-bold text-white" style={{ background: 'rgba(126,184,212,.2)' }}>
          {player.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className={`font-bold text-[0.82em] truncate block ${
          player.isBot ? 'text-cream/60' : 'text-cream'
        }`}>
          {player.name}
        </span>
        {isOwnerPlayer && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'var(--pearl)' }}>OWNER</span>
        )}
        {player.isBot && !isOwnerPlayer && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold" style={{ color: 'rgba(232,230,240,.2)' }}>BOT</span>
        )}
        {!player.isConnected && !player.isBot && (
          <span className="text-[0.55em] uppercase tracking-[1px] font-bold text-danger">DISCONNECTED</span>
        )}
      </div>
    </div>
  );
}

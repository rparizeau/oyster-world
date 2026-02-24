'use client';

import PearlGlobe from './PearlGlobe';

interface DeepBarProps {
  gameName: string;
  actionLabel?: string;
  onAction?: () => void;
  onHome: () => void;
  showAction: boolean;
}

export default function DeepBar({ gameName, actionLabel, onAction, onHome, showAction }: DeepBarProps) {
  return (
    <div className="flex items-center px-4 py-3" style={{ background: 'rgba(13,27,62,.5)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
      <button
        onClick={onHome}
        className="w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
        style={{
          background: 'rgba(240,194,127,.06)',
          border: '1.5px solid rgba(240,194,127,.1)',
        }}
        title="Go home"
      >
        <PearlGlobe size={18} />
      </button>

      <span
        className="font-sub text-cream flex-1 ml-2.5 truncate"
        style={{ fontSize: '0.92em' }}
      >
        {gameName}
      </span>

      {showAction && actionLabel ? (
        <button
          onClick={onAction}
          className="flex-shrink-0 ml-2 text-pearl transition-colors"
          style={{
            fontSize: '0.7em',
            padding: '6px 14px',
            borderRadius: '8px',
            fontWeight: 700,
            border: '1.5px solid rgba(240,194,127,.3)',
            background: 'none',
          }}
        >
          {actionLabel}
        </button>
      ) : showAction ? (
        <div className="w-[60px]" />
      ) : null}
    </div>
  );
}

'use client';

type PearlSize = 96 | 64 | 56 | 48 | 30 | 18;

interface PearlGlobeProps {
  size: PearlSize;
  animate?: 'float' | 'pulse' | 'none';
  className?: string;
}

export default function PearlGlobe({ size, animate = 'none', className = '' }: PearlGlobeProps) {
  const animClass =
    animate === 'float' ? 'animate-float' :
    animate === 'pulse' ? 'animate-pearl-pulse' :
    '';

  // Simplified version for tiny sizes (bar icon)
  if (size === 18) {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 18 18"
        className={`${animClass} ${className}`}
      >
        <defs>
          <radialGradient id="pg18" cx="38%" cy="30%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#bfab8e" />
          </radialGradient>
        </defs>
        <circle cx="9" cy="9" r="7" fill="url(#pg18)" />
      </svg>
    );
  }

  // Small version for bar (30px)
  if (size === 30) {
    return (
      <svg
        width={30}
        height={30}
        viewBox="0 0 30 30"
        className={`${animClass} ${className}`}
      >
        <defs>
          <radialGradient id="pg30" cx="38%" cy="30%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="20%" stopColor="#f5ece2" />
            <stop offset="55%" stopColor="#ead8c0" />
            <stop offset="100%" stopColor="#bfab8e" />
          </radialGradient>
        </defs>
        <circle cx="15" cy="15" r="12" fill="url(#pg30)" />
        <ellipse cx="11" cy="10" rx="4" ry="3" fill="rgba(255,255,255,.14)" transform="rotate(-18,11,10)" />
        <circle cx="10" cy="9" r="1.5" fill="rgba(255,255,255,.28)" />
      </svg>
    );
  }

  const half = size / 2;
  const mainR = size === 96 ? 34 : size === 64 ? 26 : size === 56 ? 22 : 20;
  const showGlobe = size === 96;
  const showSparkle = size >= 48;

  // Unique ID per size to avoid SVG gradient conflicts
  const gid = `pg${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`${animClass} ${className}`}
      style={animate !== 'none' ? { filter: 'drop-shadow(0 8px 24px rgba(240,194,127,.15))' } : undefined}
    >
      <defs>
        <radialGradient id={`${gid}-main`} cx="38%" cy="30%">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="20%" stopColor="#f5ece2" />
          <stop offset="50%" stopColor="#ead8c0" />
          <stop offset="100%" stopColor="#bfab8e" />
        </radialGradient>
        {showGlobe && (
          <radialGradient id={`${gid}-glow`} cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(240,194,127,.15)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        )}
      </defs>

      {/* Outer glow for 96px */}
      {showGlobe && (
        <circle cx={half} cy={half} r={half - 2} fill={`url(#${gid}-glow)`} />
      )}

      {/* Main pearl */}
      <circle cx={half} cy={half} r={mainR} fill={`url(#${gid}-main)`} />

      {/* Globe lines (96px only) */}
      {showGlobe && (
        <>
          <ellipse cx={half} cy={half} rx={mainR} ry={mainR * 0.32} fill="none" stroke="rgba(139,115,85,.12)" strokeWidth="0.7" />
          <ellipse cx={half} cy={half} rx={mainR * 0.41} ry={mainR} fill="none" stroke="rgba(139,115,85,.09)" strokeWidth="0.7" />
        </>
      )}

      {/* Highlight */}
      <ellipse
        cx={half * 0.79}
        cy={half * 0.71}
        rx={mainR * 0.32}
        ry={mainR * 0.24}
        fill="rgba(255,255,255,.15)"
        transform={`rotate(-18,${half * 0.79},${half * 0.71})`}
      />
      <circle
        cx={half * 0.75}
        cy={half * 0.67}
        r={mainR * 0.088}
        fill="rgba(255,255,255,.3)"
      />

      {/* Sparkle */}
      {showSparkle && (
        <text
          x={size * 0.79}
          y={size * 0.19}
          fontSize="9"
          fill="rgba(240,194,127,.4)"
        >
          {"✦"}
        </text>
      )}
    </svg>
  );
}

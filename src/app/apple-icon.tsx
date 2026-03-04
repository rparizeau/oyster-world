import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 36,
          background: 'linear-gradient(135deg, #0f1832, #080c1a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240,194,127,0.18) 0%, transparent 70%)',
          }}
        />
        {/* Pearl */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 30%, #fff 0%, #f5ece2 20%, #ead8c0 50%, #bfab8e 100%)',
            boxShadow: '0 4px 24px rgba(240,194,127,0.2)',
            position: 'relative',
            display: 'flex',
          }}
        >
          {/* Highlight */}
          <div
            style={{
              position: 'absolute',
              top: 22,
              left: 20,
              width: 28,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.3)',
              transform: 'rotate(-18deg)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 26,
              left: 24,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.45)',
            }}
          />
        </div>
        {/* Sparkle */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            right: 28,
            fontSize: 14,
            color: 'rgba(240,194,127,0.5)',
          }}
        >
          ✦
        </div>
      </div>
    ),
    { ...size },
  );
}

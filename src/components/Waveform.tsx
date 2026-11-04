export interface WaveformProps {
  /** Total width of the track. Omit to fill the parent. */
  width?: number | string;
  /** Height of the *hit area* (the row the bar lives in) — not the bar itself. */
  height?: number;
  progress?: number;
  color?: string;
  dim?: string;
  /** Accepted for compatibility with older call sites; unused. */
  bars?: number;
  seed?: number;
  flat?: boolean;
}

/**
 * Seek bar.
 *
 * Geometry, deliberately fixed: a 4px track with a 12px playhead inside a taller
 * transparent hit area. The `height` prop sizes the *hit area* only.
 *
 * An earlier version used `height` for the track thickness, so the Player — which
 * passes 72 for a comfortable click target — drew a 72px-tall purple slab across
 * the transport card. Keeping the two concepts separate is the whole point of
 * this component.
 */
export default function Waveform({
  width = '100%',
  height = 72,
  progress = 0,
  color = 'var(--onyx-accent)',
  dim = 'var(--onyx-glass-strong)',
}: WaveformProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 4,
          borderRadius: 'var(--r-pill)',
          background: dim,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${clamped * 100}%`,
            borderRadius: 'var(--r-pill)',
            background: color,
            // 200ms linear tracks the 1 Hz playback tick without lagging a seek.
            transition: 'width 200ms linear',
          }}
        />
        {/* Playhead: a small dot on the fill edge, ringed with the card surface so
            it stays visible over the accent fill. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${clamped * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: '50%',
            background: color,
            boxShadow: '0 0 0 2px var(--surface-raised, #111)',
            transition: 'left 200ms linear',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

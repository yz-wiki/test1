export interface WaveformProps {
  width?: number;
  height?: number;
  progress?: number;
  color?: string;
  dim?: string;
  bars?: number;
  seed?: number;
  flat?: boolean;
}

/**
 * Playback progress bar.
 *
 * This used to be a 140-segment "waveform" (a faux-equaliser made of vertical
 * bars). Two problems with that: it read as an audio visualiser rather than a
 * seek bar, and at 140 bars the 1px gaps produced a moiré pattern on scaled
 * displays. It is now a single rounded capsule with a solid fill and a playhead
 * dot — the shape every native player uses, and the one that survives being
 * stretched across a 4K window.
 *
 * The props are kept so call sites (the Player) do not change: `bars`/`seed`
 * are accepted for compatibility and intentionally unused.
 */
export default function Waveform({
  width = 600,
  height = 80,
  progress = 0.42,
  color = '#fff',
  dim = 'rgba(255,255,255,0.22)',
  flat = false,
}: WaveformProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  // In "flat" mode the caller wants a thin seek bar; otherwise keep a tall band
  // whose fill still reads as a single shape.
  const thickness = flat ? height : Math.max(10, Math.round(height * 0.34));
  const radius = thickness / 2;
  const knob = Math.max(6, Math.min(14, Math.round(thickness * 0.9)));

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
          height: thickness,
          borderRadius: radius,
          background: dim,
          overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${clamped * 100}%`,
            borderRadius: radius,
            background: color,
            // 200ms linear tracks the 1 Hz playback tick without lagging a seek.
            transition: 'width 200ms linear',
          }}
        />
        {/* Playhead: a solid dot sitting on the fill edge, ringed with the page
            background so it stays visible over any cover colour. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${clamped * 100}%`,
            width: knob,
            height: knob,
            marginLeft: -knob / 2,
            marginTop: -knob / 2,
            borderRadius: '50%',
            background: color,
            boxShadow: '0 0 0 2px var(--onyx-panel, #111)',
            transition: 'left 200ms linear',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

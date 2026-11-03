// macOS traffic-light window controls.
//
// Skald runs undecorated (decorations(false) in src-tauri/src/lib.rs), so these
// are the only window controls the user gets. Ordering, colours and the
// hover-only glyphs follow the macOS convention exactly — close / minimise /
// zoom, left to right — which is what makes an undecorated window read as native
// rather than as a web page pretending to be an app.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from '../../i18n';

export interface TrafficLightsProps {
  /** macOS calls the third button "zoom"; on Windows it is maximise/restore. */
  maximized?: boolean;
}

function Glyph({ kind }: { kind: 'close' | 'min' | 'max' }) {
  if (kind === 'close') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1.6 1.6 L6.4 6.4 M6.4 1.6 L1.6 6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  if (kind === 'min') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1.6 4 L6.4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <path d="M1.8 5.4 L5.4 1.8 M1.8 5.4 L1.8 1.8 L5.4 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6.2 2.6 L2.6 6.2 M6.2 2.6 L6.2 6.2 L2.6 6.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function TrafficLights({ maximized = false }: TrafficLightsProps) {
  const { t } = useI18n();

  // Each handler is individually guarded: a rejected promise (window already
  // closing, compositor refusing) must not surface as an unhandled rejection in
  // the WebView console, which the verify:console gate treats as a failure.
  const close = () => { void getCurrentWindow().close().catch(() => {}); };
  const minimize = () => { void getCurrentWindow().minimize().catch(() => {}); };
  const toggleZoom = () => { void getCurrentWindow().toggleMaximize().catch(() => {}); };

  const buttons = [
    { kind: 'close' as const, label: t('window.close'), onClick: close },
    { kind: 'min' as const, label: t('window.minimize'), onClick: minimize },
    { kind: 'max' as const, label: maximized ? t('window.restore') : t('window.maximize'), onClick: toggleZoom },
  ];

  return (
    <div className="mac-traffic" data-tauri-drag-region="false">
      {buttons.map(button => (
        <button
          key={button.kind}
          type="button"
          className={`mac-traffic__btn mac-traffic__btn--${button.kind}`}
          title={button.label}
          aria-label={button.label}
          onClick={button.onClick}
          data-tauri-drag-region="false"
        >
          <Glyph kind={button.kind} />
        </button>
      ))}
    </div>
  );
}

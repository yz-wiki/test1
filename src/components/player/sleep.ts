// Sleep-timer model shared by the Player's sleep popover: the mode union, the
// selectable options, and the Settings-default parser.
// Moved verbatim out of Player.tsx (God-File Decomposition roadmap, L3/L7).

export type SleepMode = null | number | 'chapter';

export const SLEEP_OPTIONS: { id: SleepMode; label: string }[] = [
  { id: null,      label: '关闭'      },
  { id: 5,         label: '5 分钟'    },
  { id: 15,        label: '15 分钟'   },
  { id: 30,        label: '30 分钟'   },
  { id: 60,        label: '1 小时'    },
  { id: 'chapter', label: '本章结束'  },
];

/** Map the persisted Settings → Playback sleep-default string to a SleepMode. */
export function parseSleepDefault(raw: string): SleepMode {
  if (raw === '15m') return 15;
  if (raw === '30m') return 30;
  if (raw === '1h') return 60;
  if (raw === 'End of chapter') return 'chapter';
  return null;
}

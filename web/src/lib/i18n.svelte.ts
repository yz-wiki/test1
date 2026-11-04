/**
 * Localisation.
 *
 * A single flat dictionary per locale, typed so a missing key is a compile
 * error. `t()` reads the `locale` rune, so any template that calls it re-renders
 * when the language changes — no provider, no context, no subscription.
 *
 * Follows the system language on first run, then remembers the choice.
 */
export const LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};

const en = {
  'app.name': 'Skald',

  'nav.library': 'Library',
  'nav.nowPlaying': 'Now playing',
  'nav.settings': 'Settings',
  'nav.section.browse': 'Browse',

  'login.title': 'Sign in',
  'login.subtitle': 'Connect to your Audiobookshelf server.',
  'login.server': 'Server address',
  'login.serverPlaceholder': 'library.example.com:13378',
  'login.method': 'Sign-in method',
  'login.apiKey': 'API key',
  'login.password': 'Password',
  'login.username': 'Username',
  'login.apiKeyHint': 'Create one in Audiobookshelf under Settings → Users.',
  'login.submit': 'Sign in',
  'login.pending': 'Signing in…',
  'login.errServer': 'A server address is required.',
  'login.errKey': 'An API key is required.',
  'login.errName': 'A username is required.',
  'login.errPass': 'A password is required.',

  'library.search': 'Search titles…',
  'library.empty': 'This library is empty.',
  'library.emptyHint': 'Add books in Audiobookshelf, then refresh.',
  'library.error': 'Could not load the library.',
  'library.retry': 'Retry',
  'library.continue': 'Continue listening',
  'library.all': 'All titles',
  'library.count': '{count} titles',
  'library.refresh': 'Refresh',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageHint': 'Interface language. Changes apply immediately.',
  'settings.theme': 'Theme',
  'settings.themeHint': 'Colour scheme for the whole window.',
  'theme.graphite': 'Graphite',
  'theme.paper': 'Paper',
  'theme.midnight': 'Midnight',
  'settings.motion': 'Reduce motion',
  'settings.motionHint': 'Disable transitions and animations.',

  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.prevChapter': 'Previous chapter',
  'player.nextChapter': 'Next chapter',
  'player.back30': 'Back 30 seconds',
  'player.forward30': 'Forward 30 seconds',
  'player.chapters': 'Chapters',
  'player.details': 'Details',
  'player.speed': 'Speed',
  'player.volume': 'Volume',
  'player.expand': 'Open the player',
  'player.collapse': 'Back to the library',
  'player.noChapters': 'This title has no chapter markers.',
  'player.loading': 'Opening…',
  'player.narrator': 'Narrated by {name}',
  'player.publisher': 'Publisher',
  'player.year': 'Published',
  'player.genres': 'Genres',
  'player.progressOf': '{done} of {total}',

  'podcast.episodes': '{count} episodes',
  'podcast.search': 'Search episodes…',
  'podcast.empty': 'This show has no episodes.',
  'podcast.emptyHint': 'Check the feed in Audiobookshelf, then refresh.',
  'podcast.finished': 'Played',
  'podcast.inProgress': 'In progress',
  'podcast.new': 'New',
  'podcast.play': 'Play episode',
  'podcast.resume': 'Resume',
  'podcast.back': 'Back to the library',
  'podcast.filterAll': 'All',
  'podcast.filterUnplayed': 'Unplayed',
  'podcast.filterProgress': 'In progress',
  'podcast.filterFinished': 'Played',
  'podcast.episodeOf': 'Episode {n}',

  'common.retry': 'Retry',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.unknown': 'Unknown',
  'common.offline': 'Offline',
  'common.minutes': '{count} min',
  'common.hours': '{count} h',
} as const;

type Dict = Record<keyof typeof en, string>;

const zh: Dict = {
  'app.name': 'Skald',

  'nav.library': '书库',
  'nav.nowPlaying': '正在播放',
  'nav.settings': '设置',
  'nav.section.browse': '浏览',

  'login.title': '登录',
  'login.subtitle': '连接到你的 Audiobookshelf 服务器。',
  'login.server': '服务器地址',
  'login.serverPlaceholder': 'library.example.com:13378',
  'login.method': '登录方式',
  'login.apiKey': 'API 密钥',
  'login.password': '密码',
  'login.username': '用户名',
  'login.apiKeyHint': '在 Audiobookshelf 的「设置 → 用户」中创建。',
  'login.submit': '登录',
  'login.pending': '正在登录…',
  'login.errServer': '请填写服务器地址。',
  'login.errKey': '请填写 API 密钥。',
  'login.errName': '请填写用户名。',
  'login.errPass': '请填写密码。',

  'library.search': '搜索书名…',
  'library.empty': '此书库为空。',
  'library.emptyHint': '在 Audiobookshelf 中添加书籍后刷新。',
  'library.error': '无法加载书库。',
  'library.retry': '重试',
  'library.continue': '继续收听',
  'library.all': '全部书籍',
  'library.count': '共 {count} 本',
  'library.refresh': '刷新',

  'settings.title': '设置',
  'settings.language': '语言',
  'settings.languageHint': '界面语言，修改后立即生效。',
  'settings.theme': '主题',
  'settings.themeHint': '整个窗口的配色方案。',
  'theme.graphite': '石墨',
  'theme.paper': '纸张',
  'theme.midnight': '午夜',
  'settings.motion': '减少动态效果',
  'settings.motionHint': '关闭过渡与动画。',

  'player.play': '播放',
  'player.pause': '暂停',
  'player.prevChapter': '上一章',
  'player.nextChapter': '下一章',
  'player.back30': '后退 30 秒',
  'player.forward30': '前进 30 秒',
  'player.chapters': '章节',
  'player.details': '详情',
  'player.speed': '倍速',
  'player.volume': '音量',
  'player.expand': '打开播放器',
  'player.collapse': '返回书库',
  'player.noChapters': '这本书没有章节标记。',
  'player.loading': '正在打开…',
  'player.narrator': '朗读：{name}',
  'player.publisher': '出版方',
  'player.year': '出版年份',
  'player.genres': '分类',
  'player.progressOf': '{done} / {total}',

  'podcast.episodes': '共 {count} 集',
  'podcast.search': '搜索单集…',
  'podcast.empty': '这个节目还没有单集。',
  'podcast.emptyHint': '在 Audiobookshelf 里检查订阅源后刷新。',
  'podcast.finished': '已听完',
  'podcast.inProgress': '听到一半',
  'podcast.new': '未收听',
  'podcast.play': '播放单集',
  'podcast.resume': '继续收听',
  'podcast.back': '返回书库',
  'podcast.filterAll': '全部',
  'podcast.filterUnplayed': '未收听',
  'podcast.filterProgress': '听到一半',
  'podcast.filterFinished': '已听完',
  'podcast.episodeOf': '第 {n} 集',

  'common.retry': '重试',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.unknown': '未知',
  'common.offline': '离线',
  'common.minutes': '{count} 分钟',
  'common.hours': '{count} 小时',
};

export type TranslationKey = keyof typeof en;

const DICTS: Record<Locale, Dict> = { en, 'zh-CN': zh };

const KEY_LOCALE = 'skald.locale';

function normalize(tag: string | undefined): Locale {
  const lower = (tag ?? '').toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return en === DICTS.en ? 'en' : 'en';
}

function initialLocale(): Locale {
  const stored = localStorage.getItem(KEY_LOCALE);
  if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  const tags = typeof navigator === 'undefined'
    ? []
    : [navigator.language, ...(navigator.languages ?? [])];
  return normalize(tags.filter(Boolean)[0]);
}

let locale = $state<Locale>(initialLocale());

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  localStorage.setItem(KEY_LOCALE, next);
  document.documentElement.lang = next;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTS[locale] ?? DICTS.en;
  let out = dict[key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${name}}`, String(value));
    }
  }
  return out;
}

// ─── Number / duration formatting ────────────────────────────────────────────

/** 3725 → "1:02:05", 125 → "2:05". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Human-readable "3 h 20 min" for metadata, not for the transport. */
export function formatLength(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

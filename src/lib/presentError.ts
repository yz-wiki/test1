export type ErrorKind = 'unreachable' | 'tls' | 'unauthorized' | 'forbidden' | 'not-found' | 'conflict' | 'capacity' | 'validation' | 'offline-queued' | 'unexpected';

export interface PresentedError {
  kind: ErrorKind;
  title: string;
  message: string;
  action?: string;
  showLogHint: boolean;
}

export interface ErrorPresentationContext {
  operation?: 'authenticate' | 'download' | 'delete' | 'save' | 'import' | 'refresh';
  credential?: 'api-key' | 'password' | 'saved-session';
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

/** Translate technical failures without returning raw response text to the UI. */
export function presentError(error: unknown, context: ErrorPresentationContext = {}): PresentedError {
  const raw = errorText(error).toLowerCase();
  const authentication = context.operation === 'authenticate';
  if (/certificate|cert |tls|ssl|unknown issuer|invalid peer/.test(raw)) return { kind: 'tls', title: '安全连接失败', message: 'Skald 无法验证服务器证书。', action: '请检查 HTTPS 地址或证书后重试。', showLogHint: true };
  if (/401|unauthori[sz]ed|invalid (api )?key|invalid credentials|incorrect password|authentication failed/.test(raw)) {
    const credential = context.credential === 'api-key' ? 'API 密钥' : context.credential === 'saved-session' ? '已保存的登录信息' : '用户名和密码';
    return { kind: 'unauthorized', title: '登录未通过', message: `服务器未接受你的${credential}。`, action: context.credential === 'api-key' ? '请从 Audiobookshelf WebUI 创建或复制有效密钥，然后重试。' : '请检查你的凭据后重试。', showLogHint: false };
  }
  if (/403|forbidden|permission denied|not permitted/.test(raw)) return { kind: 'forbidden', title: '权限不足', message: authentication ? '该账户不允许在此登录。' : '你的账户无权执行此操作。', action: '请联系你的 Audiobookshelf 管理员调整访问权限。', showLogHint: false };
  if (/404|not found/.test(raw)) return { kind: 'not-found', title: authentication ? '未找到 Audiobookshelf' : '条目不存在', message: authentication ? '该地址有响应，但似乎不是 Audiobookshelf 服务器。' : '请求的条目已不可用。', action: authentication ? '请检查服务器地址、端口与反向代理路径。' : '请刷新后重试。', showLogHint: true };
  if (/409|conflict|already exists|duplicate/.test(raw)) return { kind: 'conflict', title: '与现有数据冲突', message: 'Skald 无法应用该更改，因为已存在匹配的条目。', action: '请检查现有条目并改用其他值。', showLogHint: false };
  if (/no space|disk full|insufficient (disk|space|storage)|not enough (disk|space|storage)|capacity/.test(raw)) return { kind: 'capacity', title: '存储空间不足', message: '所选磁盘的可用空间不足以完成此操作。', action: '请释放一些空间或选择其他位置后重试。', showLogHint: false };
  if (/offline.*queue|queued.*offline/.test(raw)) return { kind: 'offline-queued', title: '已保存，稍后同步', message: '此更改已进入队列，将在服务器可达时同步。', showLogHint: false };
  if (/invalid|validation|required|must be|unsupported|bad request|400/.test(raw)) return { kind: 'validation', title: '请检查输入的内容', message: '一个或多个值无法被接受。', action: '请检查信息后重试。', showLogHint: false };
  if (/dns|resolve|connection refused|connect error|failed to connect|network|timed? out|timeout|unreachable|could not connect|error sending request/.test(raw)) return { kind: 'unreachable', title: '无法连接到服务器', message: 'Skald 无法连接到该地址。', action: '请检查地址、端口、网络以及 Audiobookshelf 是否正在运行。', showLogHint: true };
  return { kind: 'unexpected', title: '出现了一些问题', message: authentication ? 'Skald 无法完成登录。' : 'Skald 无法完成该操作。', action: '请重试。若问题依旧，请查看“设置 → 日志”。', showLogHint: true };
}

export function errorMessage(error: unknown, context: ErrorPresentationContext = {}): string {
  const presented = presentError(error, context);
  return [presented.message, presented.action].filter(Boolean).join(' ');
}

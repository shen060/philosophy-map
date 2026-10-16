// 前端 API 封装（原生 fetch，带 JWT token）

function getToken() {
  return localStorage.getItem('token');
}

function setToken(t) {
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch('/api' + path, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export const auth = {
  register: (email, password, name) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
};

// 哲学家
export const philosophers = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('/philosophers' + (qs ? '?' + qs : ''));
  },
  get: (id) => request('/philosophers/' + id),
  favorited: (id) => request('/philosophers/' + id + '/favorited'),
  favorite: (id) => request('/philosophers/' + id + '/favorite', { method: 'POST' }),
  unfavorite: (id) => request('/philosophers/' + id + '/favorite', { method: 'DELETE' }),
  myFavorites: () => request('/philosophers/me/favorites'),
  myHistory: () => request('/philosophers/me/history'),
  addHistory: (philosopherId) =>
    request('/philosophers/me/history', { method: 'POST', body: JSON.stringify({ philosopherId }) }),
};

// 连线
export const getLinks = () => request('/links');

// 搜索
export const search = (q) => request('/search?q=' + encodeURIComponent(q));

// 搜索历史（需要登录）
export const searchHistory = {
  list: () => request('/search/history'),
  add: (query) => request('/search/history', { method: 'POST', body: JSON.stringify({ query }) }),
  remove: (query) => request('/search/history', { method: 'DELETE', body: JSON.stringify({ query }) }),
  clear: () => request('/search/history', { method: 'DELETE', body: JSON.stringify({}) }),
};

// AI 对话历史（方案 C）：scope = 'guide' 或 philosopherId
export const chatHistory = {
  list: (scope) => request('/chat/history?scope=' + encodeURIComponent(scope)),
  clear: (scope) => request('/chat/history?scope=' + encodeURIComponent(scope), { method: 'DELETE' }),
};

// AI 对话（SSE 流式）：POST /api/chat
// messages: [{role, content}]；onDelta(text) 逐段回调增量，onError(msg) 回复中断错误
// mode='guide' 时为全局向导模式（philosopherId 传 null）
export async function chatStream(philosopherId, messages, { onDelta, onError, signal, mode } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ philosopherId, messages, mode }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop(); // 留半行到下一轮
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        if (j.error) { if (onError) onError(j.error); }
        else if (j.delta && onDelta) onDelta(j.delta);
      } catch { /* 忽略不完整行 */ }
    }
  }
}

// token 工具
export const token = { get: getToken, set: setToken };

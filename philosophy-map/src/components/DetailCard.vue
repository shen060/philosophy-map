<template>
  <div v-if="philosopher" ref="cardEl" class="detail-card" :style="cardSizeStyle">
    <div class="detail-card-scroll">
    <div class="detail-card-header">
      <div class="detail-avatar">{{ philosopher.name.charAt(0) }}</div>
      <div class="detail-names">
        <div class="name-cn">{{ philosopher.name }}</div>
        <div class="name-en">{{ philosopher.nameEn }}</div>
        <div class="meta">{{ formattedDates }} · {{ philosopher.nationality }}</div>
      </div>
      <div class="header-actions">
        <button class="favorite-btn" :class="{ favorited }" @click="$emit('toggle-favorite')">
          {{ favorited ? '⭐ 已收藏' : '☆ 收藏' }}
        </button>
      </div>
    </div>

    <div class="detail-tags">
      <span class="detail-tag" v-for="s in philosopher.school" :key="s">{{ s }}</span>
    </div>

    <div v-if="philosopher.coreIdea" class="detail-core">
      <strong>核心观点</strong><br>
      {{ philosopher.coreIdea }}
    </div>

    <div v-if="philosopher.biography" class="detail-core">
      <strong>生平</strong><br>
      {{ philosopher.biography }}
    </div>

    <div v-if="philosopher.historicalContext" class="detail-core">
      <strong>历史背景</strong><br>
      {{ philosopher.historicalContext }}
    </div>

    <!-- 缺简介时的友好兜底（理论上不应触发，因为 seed 后端数据库全量完整） -->
    <div v-if="!philosopher.coreIdea && !philosopher.biography && !philosopher.historicalContext" class="detail-core detail-empty">
      暂无简介
    </div>

    <div v-if="philosopher.keyConcepts && philosopher.keyConcepts.length" class="detail-section">
      <div class="detail-section-title">关键概念</div>
      <div class="detail-concepts">
        <div v-for="(c, i) in philosopher.keyConcepts" :key="i" class="concept-item">
          <span class="concept-term">{{ c.term }}</span>
          <span class="concept-def">{{ c.def }}</span>
        </div>
      </div>
    </div>

    <div v-if="philosopher.anecdotes && philosopher.anecdotes.length" class="detail-section">
      <div class="detail-section-title">趣闻轶事</div>
      <div class="detail-anecdotes">
        <div v-for="(a, i) in philosopher.anecdotes" :key="i" class="anecdote-item">{{ a }}</div>
      </div>
    </div>

    <div v-if="philosopher.famousQuotes && philosopher.famousQuotes.length" class="detail-section">
      <div class="detail-section-title">名言</div>
      <div class="detail-quotes">
        <div v-for="(q, i) in philosopher.famousQuotes" :key="i" class="quote-item">「{{ q }}」</div>
      </div>
    </div>

    <div v-if="philosopher.works && philosopher.works.length" class="detail-section">
      <div class="detail-section-title">主要著作</div>
      <div class="detail-works">
        <div v-for="(w, i) in philosopher.works" :key="i">
          · {{ w.title }}{{ w.year ? ` (${fmtYear(w.year)})` : '' }}{{ w.coauthor ? ` · 与${w.coauthor}` : '' }}{{ w.note ? ` · ${w.note}` : '' }}
        </div>
      </div>
    </div>

    <div class="detail-section" v-if="influences.length > 0 || influencesBack.length > 0 || oppositions.length > 0 || oppositionsBack.length > 0">
      <div class="detail-section-title">思想关系</div>
      <div class="detail-relation">
        <div v-if="influences.length > 0" class="influence">
          → 影响：{{ influences.map(n => n.name).join('、') }}
        </div>
        <div v-if="influencesBack.length > 0" class="influence">
          ← 受影响：{{ influencesBack.map(n => n.name).join('、') }}
        </div>
        <div v-if="oppositions.length > 0" class="opposition">
          ✗ 对立：{{ oppositions.map(n => n.name).join('、') }}
        </div>
        <div v-if="oppositionsBack.length > 0" class="opposition">
          被批判：{{ oppositionsBack.map(n => n.name).join('、') }}
        </div>
      </div>
    </div>

    <!-- === AI 对话面板 === -->
    <div class="detail-section chat-section">
      <div class="detail-section-title chat-toggle" @click="chatOpen = !chatOpen">
        与AI向导对话 <span class="chat-arrow">{{ chatOpen ? '▾' : '▸' }}</span>
      </div>

      <template v-if="chatOpen">
        <div v-if="!user" class="chat-login-hint">
          登录后可与先哲对话
          <button class="chat-login-btn" @click="$emit('need-login')">登录 / 注册</button>
        </div>

        <template v-else>
          <div class="chat-messages" ref="chatBox">
            <div v-if="!chatMessages.length" class="chat-empty">
              想了解{{ philosopher.name }}的什么？比如「{{ firstConcept || 'TA的核心思想' }}是什么意思？」或「TA的思想对后世有什么影响？」
            </div>
            <div v-for="(m, i) in chatMessages" :key="i" class="chat-msg" :class="m.role">
              <span class="chat-bubble">{{ m.content }}<span v-if="m.streaming" class="chat-cursor">▍</span></span>
            </div>
          </div>
          <div v-if="chatError" class="chat-error">{{ chatError }}</div>
          <div class="chat-input-row">
            <input
              v-model="chatInput"
              class="chat-input"
              :disabled="chatBusy"
              maxlength="2000"
              placeholder="和AI聊聊这位先哲…"
              @keydown.enter="sendChat"
            />
            <button class="chat-send" :disabled="chatBusy || !chatInput.trim()" @click="sendChat">
              {{ chatBusy ? '…' : '发送' }}
            </button>
          </div>
          <div class="chat-note">
            回答由 AI 生成，仅供参考
            <button v-if="chatMessages.length" class="chat-clear" @click="clearChatHistory" title="清空与TA的对话记录">清空记录</button>
          </div>
        </template>
      </template>
    </div>
    </div><!-- /detail-card-scroll -->

    <!-- 左下角拖拽手柄 -->
    <div class="card-resize-handle" title="拖拽调整大小" @pointerdown="onResizeDown"></div>
  </div>
  <div v-else class="empty-hint">
    点击一颗星<br>查看哲学家详情
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { chatStream, chatHistory } from '../api';
import { useAuth } from '../composables/useAuth';

const props = defineProps({
  philosopher: { type: Object, default: null },
  favorited: { type: Boolean, default: false },
  allNodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
});

defineEmits(['toggle-favorite', 'need-login']);

// 构建节点 id → 节点 的快速查找映射
const nodeMap = computed(() => {
  const m = {};
  for (const n of props.allNodes) m[n.id] = n;
  return m;
});

// 影响：我 → 他人（我是 source，type=influence）
const influences = computed(() => {
  if (!props.philosopher) return [];
  const id = props.philosopher.id;
  return props.links
    .filter(l => l.type === 'influence' && (l.source === id || l.sourceId === id))
    .map(l => nodeMap.value[l.target ?? l.targetId])
    .filter(Boolean);
});

// 受影响：他人 → 我（我是 target，type=influence）
const influencesBack = computed(() => {
  if (!props.philosopher) return [];
  const id = props.philosopher.id;
  return props.links
    .filter(l => l.type === 'influence' && (l.target === id || l.targetId === id))
    .map(l => nodeMap.value[l.source ?? l.sourceId])
    .filter(Boolean);
});

// 对立：我 → 他人（我批判他，type=opposition）
const oppositions = computed(() => {
  if (!props.philosopher) return [];
  const id = props.philosopher.id;
  return props.links
    .filter(l => l.type === 'opposition' && (l.source === id || l.sourceId === id))
    .map(l => nodeMap.value[l.target ?? l.targetId])
    .filter(Boolean);
});

// 被批判：他人 → 我（我是 opposition target）
const oppositionsBack = computed(() => {
  if (!props.philosopher) return [];
  const id = props.philosopher.id;
  return props.links
    .filter(l => l.type === 'opposition' && (l.target === id || l.targetId === id))
    .map(l => nodeMap.value[l.source ?? l.sourceId])
    .filter(Boolean);
});

const formattedDates = computed(() => {
  if (!props.philosopher) return '';
  const b = props.philosopher.birthYear;
  const d = props.philosopher.deathYear;
  const fmt = (y) => (y == null ? '' : (y < 0 ? `前${-y}` : y.toString()));
  if (b == null && d == null) return '';
  // 在世哲学家（deathYear 为 null）显示"至今"，否则 (null).toString() 会抛异常导致详情卡整卡渲染失败
  if (d == null) return `${fmt(b)} – 至今`;
  return `${fmt(b)} – ${fmt(d)}`;
});

const fmtYear = (y) => {
  if (y < 0) return `前${-y}`;
  return y.toString();
};

// === AI 对话 ===
const { user } = useAuth();
const chatOpen = ref(false);
const chatMessages = ref([]);   // [{role: 'user'|'assistant', content, streaming?}]
const chatInput = ref('');
const chatBusy = ref(false);
const chatError = ref('');
const chatBox = ref(null);

const firstConcept = computed(() =>
  props.philosopher && props.philosopher.keyConcepts && props.philosopher.keyConcepts.length
    ? props.philosopher.keyConcepts[0].term
    : ''
);

// 切换哲学家时清空对话并重新加载该先哲的历史（不同先哲不共享上下文）
watch(() => props.philosopher && props.philosopher.id, () => {
  chatMessages.value = [];
  chatInput.value = '';
  chatError.value = '';
  chatBusy.value = false;
  if (chatOpen.value) loadChatHistory();
});

// 展开对话面板时加载历史（方案 C）
watch(chatOpen, (open) => {
  if (open && user.value && !chatMessages.value.length) loadChatHistory();
});

async function loadChatHistory() {
  if (!user.value || !props.philosopher) return;
  try {
    const res = await chatHistory.list(props.philosopher.id);
    chatMessages.value = res.messages || [];
    scrollChat();
  } catch { /* 历史加载失败静默处理，不影响新对话 */ }
}

async function clearChatHistory() {
  if (!user.value || !props.philosopher) return;
  try { await chatHistory.clear(props.philosopher.id); } catch {}
  chatMessages.value = [];
}

function scrollChat() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || chatBusy.value || !props.philosopher) return;
  chatError.value = '';
  chatInput.value = '';

  const msgs = chatMessages.value
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }));
  msgs.push({ role: 'user', content: text });
  chatMessages.value.push({ role: 'user', content: text });
  const reply = { role: 'assistant', content: '', streaming: true };
  chatMessages.value.push(reply);
  chatBusy.value = true;
  scrollChat();

  try {
    await chatStream(props.philosopher.id, msgs, {
      onDelta: (d) => {
        reply.content += d;
        scrollChat();
      },
      onError: (msg) => { chatError.value = msg; },
    });
    // 空回复兜底
    if (!reply.content && !chatError.value) chatError.value = '未收到回复，请重试';
  } catch (e) {
    if (e.name === 'AbortError') {
      chatError.value = '已取消';
    } else {
      chatError.value = e.message || '请求失败，请重试';
    }
  } finally {
    reply.streaming = false;
    chatBusy.value = false;
    if (!reply.content) {
      // 失败时移除空的回复气泡
      const idx = chatMessages.value.indexOf(reply);
      if (idx !== -1) chatMessages.value.splice(idx, 1);
    }
    scrollChat();
  }
}

// === 卡片大小：左下角手柄拖拽调整，记忆到 localStorage（仅桌面端） ===
const cardEl = ref(null);
const explicitSize = ref(null);
const isDesktop = ref(true);
try {
  const s = JSON.parse(localStorage.getItem('detailCardSize') || 'null');
  if (s && s.w >= 240 && s.h >= 240) explicitSize.value = s;
} catch {}
const cardSizeStyle = computed(() =>
  isDesktop.value && explicitSize.value
    ? { width: explicitSize.value.w + 'px', height: explicitSize.value.h + 'px' }
    : null
);

// 拖拽：卡片锚定在右上，向左拖变宽、向下拖变高
function onResizeDown(e) {
  const el = cardEl.value;
  if (!el || !isDesktop.value) return;
  e.preventDefault();
  const startW = el.offsetWidth;
  const startH = el.offsetHeight;
  const sx = e.clientX;
  const sy = e.clientY;
  const minW = 240, minH = 240;
  const maxW = window.innerWidth - 48;
  const maxH = window.innerHeight - 120;

  const onMove = (ev) => {
    const w = Math.min(maxW, Math.max(minW, startW + (sx - ev.clientX)));
    const h = Math.min(maxH, Math.max(minH, startH + (ev.clientY - sy)));
    explicitSize.value = { w: Math.round(w), h: Math.round(h) };
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    try { localStorage.setItem('detailCardSize', JSON.stringify(explicitSize.value)); } catch {}
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

const onWinResize = () => { isDesktop.value = window.innerWidth > 640; };
onMounted(() => {
  onWinResize();
  window.addEventListener('resize', onWinResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWinResize);
});
</script>

<style scoped>
.detail-card {
  position: fixed;
  top: 90px;
  right: 24px;
  width: 280px;
  max-height: calc(100vh - 120px);
  max-width: calc(100vw - 48px);
  min-width: 240px;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 14px 18px 16px 18px;
  z-index: 15;
  background: linear-gradient(160deg, rgba(252,244,220,0.96), rgba(232,220,190,0.96));
  border: 1px solid #a08a68;
  border-radius: 5px;
  box-shadow: 0 5px 20px rgba(70,40,10,0.30), inset 0 0 26px rgba(160,130,80,0.18);
  color: #3a2008;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
}
/* 内容滚动层：卡片高度被拖大后内部滚动 */
.detail-card-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
/* 左下角拖拽手柄 */
.card-resize-handle {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nesw-resize;
  touch-action: none;
  border-radius: 0 0 0 4px;
  background: repeating-linear-gradient(
    135deg,
    transparent 0 3px,
    rgba(122, 90, 56, 0.55) 3px 4.5px
  );
  transition: background .2s;
}
.card-resize-handle:hover {
  background: repeating-linear-gradient(
    135deg,
    transparent 0 3px,
    rgba(90, 58, 24, 0.85) 3px 4.5px
  );
}
.empty-hint {
  position: fixed;
  top: 90px;
  right: 24px;
  width: 280px;
  color: #7a6a48;
  padding: 30px 14px;
  font-style: italic;
  text-align: center;
  font-size: 13px;
  z-index: 15;
}

/* === header: 首字母圆头像 + 姓名 + 年代 + 收藏按钮 === */
.detail-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.detail-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(140deg, #8a5a30, #6a3a18);
  color: #f4eed8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  border: 1px solid #5a3a18;
  box-shadow: inset 0 0 6px rgba(0,0,0,0.25);
  flex-shrink: 0;
}
.detail-names { flex: 1; }
.name-cn { font-size: 17px; font-weight: 700; color: #2a1008; letter-spacing: 1px; }
.name-en { font-size: 12px; font-style: italic; color: #7a5a38; }
.meta { font-size: 10.5px; color: #6a4a28; margin-top: 2px; }

.header-actions { margin-left: auto; }
.favorite-btn {
  padding: 4px 10px;
  background: linear-gradient(140deg, rgba(232,220,180,0.75), rgba(212,196,156,0.75));
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: all .2s;
}
.favorite-btn:hover { background: linear-gradient(140deg, rgba(212,196,156,0.9), rgba(192,176,136,0.92)); }
.favorite-btn.favorited {
  background: linear-gradient(140deg, rgba(180,150,70,0.52), rgba(160,130,60,0.58));
  border-color: rgba(160,130,60,0.55);
  color: #6a4a18;
  font-weight: 600;
}
.favorite-btn.favorited:hover { background: linear-gradient(140deg, rgba(200,170,90,0.68), rgba(180,150,70,0.72)); }

/* === tags === */
.detail-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 12px 0; }
.detail-tag {
  font-size: 10.5px;
  padding: 1px 7px;
  background: rgba(150,110,60,0.20);
  border: 1px solid rgba(130,95,50,0.40);
  border-radius: 10px;
  color: #5a3a18;
}

/* === 分节卡片：核心观点/生平/历史背景（三块不同棕边色区分）=== */
.detail-core {
  padding: 5px 9px;
  margin: 10px 0;
  border-left: 3px solid #8a5a30; /* 核心观点：深棕 */
  background: rgba(220,200,160,0.22);
  font-size: 12px;
  line-height: 1.55;
  border-radius: 0 3px 3px 0;
}
.detail-core strong { color: #2a1008; }
.detail-core + .detail-core {
  border-left-color: #b08040; /* 生平：橙棕 */
  background: rgba(220,208,170,0.22);
}
.detail-core + .detail-core + .detail-core {
  border-left-color: #8a8a60; /* 历史背景：青褐 */
  background: rgba(212,212,180,0.22);
}
.detail-empty {
  border-left-color: #b8a878 !important;
  color: #7a6a48;
  font-style: italic;
}

.detail-section {
  margin: 12px 0;
  font-size: 12px;
  line-height: 1.55;
}
.detail-section-title {
  font-weight: 700;
  font-size: 12.5px;
  margin-bottom: 5px;
  color: #4a2f18;
  letter-spacing: 1px;
}

.detail-quotes .quote-item {
  padding: 3px 0 3px 10px;
  border-left: 2px dashed rgba(120,85,40,0.5);
  margin: 4px 0;
  font-style: italic;
  color: #4a3018;
  line-height: 1.5;
}

/* === 关键概念：术语词条样式 === */
.detail-concepts { display: flex; flex-direction: column; gap: 5px; }
.concept-item {
  background: rgba(220,200,160,0.20);
  border-left: 3px solid #8a5a30;
  border-radius: 0 3px 3px 0;
  padding: 5px 9px;
  font-size: 11.5px;
  line-height: 1.5;
}
.concept-term {
  font-weight: 700;
  color: #3a2008;
  margin-right: 5px;
}
.concept-term::after { content: "："; }
.concept-def { color: #5a3a18; }

/* === 趣闻轶事：故事段落样式 === */
.detail-anecdotes { display: flex; flex-direction: column; gap: 6px; }
.anecdote-item {
  position: relative;
  padding: 5px 9px 5px 12px;
  border-left: 2px dotted rgba(140,90,40,0.55);
  font-size: 11.5px;
  line-height: 1.6;
  color: #4a3018;
  background: rgba(228,214,180,0.18);
  border-radius: 0 3px 3px 0;
}
.detail-works > div {
  padding: 2px 0 2px 6px;
  border-left: 2px dotted rgba(130,95,50,0.45);
  margin: 3px 0;
  color: #4a3018;
}

/* === 关系：4 类颜色（与连线配色一致）=== */
.detail-relation {
  background: rgba(220,200,160,0.20);
  border-left: 3px solid #a08a68;
  padding: 6px 9px;
  border-radius: 0 3px 3px 0;
  font-size: 11.5px;
  line-height: 1.7;
}
.detail-relation .influence { padding: 2px 0; color: #6a4a28; font-weight: 600; }  /* 影响/受影响：深褐（同 influence 连线）*/
.detail-relation .opposition { padding: 2px 0; color: #8a3a38; font-weight: 600; }  /* 对立/被批判：红褐（同 opposition 连线）*/

/* === AI 对话面板 === */
.chat-section { border-top: 1px solid rgba(160,130,90,0.30); padding-top: 8px; }
.chat-toggle { cursor: pointer; user-select: none; }
.chat-toggle:hover { color: #2a1008; }
.chat-arrow { font-size: 10px; color: #8a6a48; }
.chat-login-hint {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: #7a6a48;
  font-style: italic;
}
.chat-login-btn {
  display: block;
  margin: 8px auto 0;
  padding: 5px 14px;
  background: linear-gradient(140deg, rgba(160,120,70,0.60), rgba(140,100,60,0.65));
  border: 1px solid #7a5a28;
  border-radius: 4px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  font-style: normal;
}
.chat-login-btn:hover { background: linear-gradient(140deg, rgba(180,140,80,0.72), rgba(160,120,70,0.78)); }

.chat-messages {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.chat-empty {
  text-align: center;
  font-size: 11px;
  color: #8a7a58;
  font-style: italic;
  padding: 8px 4px;
}
.chat-msg { display: flex; }
.chat-msg.user { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }
.chat-bubble {
  max-width: 88%;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.chat-msg.user .chat-bubble {
  background: linear-gradient(140deg, rgba(120,85,45,0.72), rgba(100,70,35,0.78));
  color: #f4eed8;
  border-bottom-right-radius: 2px;
}
.chat-msg.assistant .chat-bubble {
  background: rgba(220,200,160,0.30);
  border: 1px solid rgba(130,95,50,0.35);
  color: #3a2008;
  border-bottom-left-radius: 2px;
}
.chat-cursor { animation: chat-blink 0.9s infinite; color: #6a4a28; }
@keyframes chat-blink { 50% { opacity: 0; } }
.chat-error {
  margin-top: 4px;
  padding: 4px 8px;
  font-size: 11px;
  color: #a03a38;
  background: rgba(160,58,56,0.10);
  border-left: 2px solid #a03a38;
  border-radius: 0 3px 3px 0;
}
.chat-input-row { display: flex; gap: 6px; margin-top: 6px; }
.chat-input {
  flex: 1;
  min-width: 0;
  padding: 6px 9px;
  background: rgba(234,226,198,0.95);
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 12px;
  outline: none;
}
.chat-input:focus { border-color: #6a4a28; box-shadow: 0 0 6px rgba(100,70,30,0.25); }
.chat-input:disabled { opacity: 0.55; }
.chat-send {
  padding: 6px 12px;
  background: linear-gradient(140deg, rgba(160,120,70,0.60), rgba(140,100,60,0.65));
  border: 1px solid #7a5a28;
  border-radius: 4px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.chat-send:hover:not(:disabled) { background: linear-gradient(140deg, rgba(180,140,80,0.72), rgba(160,120,70,0.78)); }
.chat-send:disabled { opacity: 0.5; cursor: default; }
.chat-note { margin-top: 5px; font-size: 10px; color: #8a7a58; text-align: center; font-style: italic; }
.chat-clear {
  margin-left: 6px;
  background: transparent;
  border: none;
  color: #8a5a30;
  font-family: inherit;
  font-size: 10px;
  font-style: normal;
  cursor: pointer;
  padding: 0;
  text-decoration: underline dotted;
}
.chat-clear:hover { color: #a03a38; }

/* === 移动端：卡片改为顶部全宽面板，不再右侧贴边 === */
@media (max-width: 640px) {
  .detail-card {
    top: 100px;           /* 避开两行顶栏（标题行 + 搜索行，约 96px） */
    left: 10px;
    right: 10px;
    width: auto;
    max-height: calc(100vh - 200px);  /* 底部留给两行控制按钮 */
    padding: 12px 14px;
    min-width: 0;
    min-height: 0;
  }
  .empty-hint { display: none; }
  .card-resize-handle { display: none; }  /* 移动端全宽面板，隐藏手柄 */
}
</style>

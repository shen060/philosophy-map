<template>
  <!-- 全局 AI 向导弹窗：参照筛选面板的弹窗交互模式 -->
  <div class="guide-backdrop" @click.self="$emit('close')">
    <div class="guide-modal">
      <header class="guide-header">
        <h3>AI 哲学向导</h3>
        <div class="guide-header-actions">
          <button v-if="user && messages.length" class="guide-clear" @click="clearHistory" title="清空向导对话记录">清空</button>
          <button class="guide-close" @click="$emit('close')" title="关闭">✕</button>
        </div>
      </header>

      <!-- 未登录引导 -->
      <div v-if="!user" class="guide-login-hint">
        <p class="guide-login-text">
          登录后，向导会倾听你的兴趣与困惑，<br>为你引荐星图中最契合的哲学家
        </p>
        <button class="guide-login-btn" @click="$emit('need-login')">登录 / 注册</button>
      </div>
      <!-- 对话主体 -->
      <template v-else>
        <div class="guide-messages" ref="msgBox">
          <div v-if="!messages.length" class="guide-empty">
            说说你的兴趣或困惑吧，比如：<br>
            「人应该怎么活？」<br>
            「推荐几位讲『自由』的哲学家」<br>
            「喜欢庄子，还有谁思想相近？」
          </div>
          <div v-for="(m, i) in messages" :key="i" class="guide-msg" :class="m.role">
            <span class="guide-bubble">{{ displayOf(m) }}<span v-if="m.streaming" class="guide-cursor">▍</span></span>
            <span
              v-if="m.role === 'assistant' && recIdsOf(m).length"
              class="guide-recs"
            >
              <button
                v-for="rid in recIdsOf(m)"
                :key="rid"
                class="guide-rec-chip"
                :title="'去星图查看 ' + nameOf(rid)"
                @click="$emit('select', rid)"
              >{{ nameOf(rid) }}</button>
            </span>
          </div>
        </div>

        <div v-if="error" class="guide-error">{{ error }}</div>

        <div class="guide-input-row">
          <input
            v-model="input"
            class="guide-input"
            :disabled="busy"
            maxlength="2000"
            placeholder="告诉向导你的兴趣或困惑…"
            @keydown.enter="send"
          />
          <button class="guide-send" :disabled="busy || !input.trim()" @click="send">
            {{ busy ? '…' : '发送' }}
          </button>
        </div>
        <div class="guide-note">回答由 AI 生成，仅供参考 · 点击推荐条可跳转到对应哲学家</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { chatStream, chatHistory } from '../api';
import { useAuth } from '../composables/useAuth';

const props = defineProps({
  nodes: { type: Array, default: () => [] },   // 全量哲学家节点（用于 id→名字映射与推荐校验）
});

defineEmits(['close', 'select', 'need-login']);

const { user } = useAuth();

const messages = ref([]);   // [{role:'user'|'assistant', content, streaming?}]
const input = ref('');
const busy = ref(false);
const error = ref('');
const msgBox = ref(null);

function nameOf(id) {
  const n = props.nodes.find(n => n.id === id);
  return n ? n.name : id;
}

// 解析回复末尾的「推荐：id1,id2」行 → { text: 去除推荐行的正文, ids: 有效推荐 id }
function parseRecs(raw) {
  const m = raw.match(/推荐[:：]\s*([A-Za-z0-9_\-，,\s、]+)\s*$/);
  if (!m) return { text: raw, ids: [] };
  const ids = m[1]
    .split(/[,，\s、]+/)
    .map(s => s.trim())
    .filter(s => s && props.nodes.some(n => n.id === s));
  return { text: raw.slice(0, m.index).trimEnd(), ids };
}
function displayOf(m) {
  if (m.role !== 'assistant') return m.content;
  return parseRecs(m.content).text;
}
function recIdsOf(m) {
  if (m.role !== 'assistant') return [];
  return parseRecs(m.content).ids;
}

function scrollBottom() {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight;
  });
}

// 打开弹窗时加载向导历史（方案 C；历史里的推荐行会照常渲染成可点推荐条）
onMounted(() => {
  if (user.value) loadHistory();
});

async function loadHistory() {
  try {
    const res = await chatHistory.list('guide');
    messages.value = res.messages || [];
    scrollBottom();
  } catch { /* 加载失败静默，不影响新对话 */ }
}

async function clearHistory() {
  try { await chatHistory.clear('guide'); } catch {}
  messages.value = [];
}

async function send() {
  const text = input.value.trim();
  if (!text || busy.value) return;
  error.value = '';
  input.value = '';

  const msgs = messages.value
    .filter(m => !m.streaming)
    .map(m => ({ role: m.role, content: m.content }));
  msgs.push({ role: 'user', content: text });
  messages.value.push({ role: 'user', content: text });

  const reply = { role: 'assistant', content: '', streaming: true };
  messages.value.push(reply);
  busy.value = true;
  scrollBottom();

  try {
    await chatStream(null, msgs, {
      mode: 'guide',
      onDelta: (d) => {
        reply.content += d;
        scrollBottom();
      },
      onError: (msg) => { error.value = msg; },
    });
    if (!reply.content && !error.value) error.value = '未收到回复，请重试';
  } catch (e) {
    if (e.name === 'AbortError') {
      error.value = '已取消';
    } else {
      error.value = e.message || '请求失败，请重试';
    }
  } finally {
    reply.streaming = false;
    busy.value = false;
    if (!reply.content) {
      const idx = messages.value.indexOf(reply);
      if (idx !== -1) messages.value.splice(idx, 1);
    }
    scrollBottom();
  }
}
</script>

<style scoped>
/* === 遮罩 + 弹窗（牛皮纸风，与登录弹窗同族）=== */
.guide-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(30,20,5,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.guide-modal {
  display: flex;
  flex-direction: column;
  width: 520px;
  max-width: calc(100vw - 40px);
  height: 620px;
  max-height: calc(100vh - 80px);
  padding: 18px 22px 14px 22px;
  background: linear-gradient(160deg, rgba(252,244,220,0.97), rgba(232,220,190,0.97));
  border: 1px solid #a08a68;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.45), inset 0 0 26px rgba(160,130,80,0.18);
  color: #3a2008;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
}

.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.guide-header h3 {
  margin: 0;
  font-size: 15px;
  letter-spacing: 2px;
  color: #3a2008;
}
.guide-close {
  background: transparent;
  border: 1px solid #a08a68;
  border-radius: 3px;
  color: #6a4a28;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 3px 9px;
  cursor: pointer;
  transition: all .15s;
}
.guide-close:hover { background: rgba(160,130,90,0.20); color: #2a1008; }
.guide-header-actions { display: flex; align-items: center; gap: 6px; }
.guide-clear {
  background: transparent;
  border: 1px solid #a08a68;
  border-radius: 3px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 3px 7px;
  cursor: pointer;
  transition: all .15s;
}
.guide-clear:hover { background: rgba(160,130,90,0.20); }

/* === 未登录引导 === */
.guide-login-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.guide-login-text {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: #7a5a38;
  line-height: 1.9;
  font-style: italic;
}
.guide-login-btn {
  padding: 7px 20px;
  background: linear-gradient(140deg, rgba(160,120,70,0.60), rgba(140,100,60,0.65));
  border: 1px solid #7a5a28;
  border-radius: 4px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.guide-login-btn:hover { background: linear-gradient(140deg, rgba(180,140,80,0.72), rgba(160,120,70,0.78)); }

/* === 消息区 === */
.guide-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 2px;
}
.guide-empty {
  text-align: center;
  font-size: 12px;
  color: #8a7a58;
  font-style: italic;
  line-height: 2;
  padding: 20px 8px;
  margin: auto 0;
}
.guide-msg { display: flex; flex-direction: column; }
.guide-msg.user { align-items: flex-end; }
.guide-msg.assistant { align-items: flex-start; }
.guide-bubble {
  max-width: 88%;
  padding: 7px 11px;
  border-radius: 7px;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.guide-msg.user .guide-bubble {
  background: linear-gradient(140deg, rgba(120,85,45,0.72), rgba(100,70,35,0.78));
  color: #f4eed8;
  border-bottom-right-radius: 2px;
}
.guide-msg.assistant .guide-bubble {
  background: rgba(220,200,160,0.32);
  border: 1px solid rgba(130,95,50,0.35);
  color: #3a2008;
  border-bottom-left-radius: 2px;
}
.guide-cursor { animation: guide-blink 0.9s infinite; color: #6a4a28; }
@keyframes guide-blink { 50% { opacity: 0; } }

/* === 推荐跳转条 === */
.guide-recs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
  max-width: 88%;
}
.guide-rec-chip {
  padding: 4px 11px;
  background: linear-gradient(140deg, rgba(160,120,70,0.55), rgba(140,100,60,0.60));
  border: 1px solid #7a5a28;
  border-radius: 12px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 11.5px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all .18s;
}
.guide-rec-chip:hover {
  background: linear-gradient(140deg, rgba(185,145,85,0.75), rgba(165,125,75,0.80));
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(100,60,20,0.30);
}

/* === 错误 / 输入区 === */
.guide-error {
  flex-shrink: 0;
  margin-top: 4px;
  padding: 4px 9px;
  font-size: 11px;
  color: #a03a38;
  background: rgba(160,58,56,0.10);
  border-left: 2px solid #a03a38;
  border-radius: 0 3px 3px 0;
}
.guide-input-row {
  flex-shrink: 0;
  display: flex;
  gap: 7px;
  margin-top: 8px;
}
.guide-input {
  flex: 1;
  min-width: 0;
  padding: 8px 11px;
  background: rgba(234,226,198,0.95);
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.guide-input:focus { border-color: #6a4a28; box-shadow: 0 0 6px rgba(100,70,30,0.25); }
.guide-input:disabled { opacity: 0.55; }
.guide-send {
  padding: 8px 16px;
  background: linear-gradient(140deg, rgba(160,120,70,0.60), rgba(140,100,60,0.65));
  border: 1px solid #7a5a28;
  border-radius: 4px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.guide-send:hover:not(:disabled) { background: linear-gradient(140deg, rgba(180,140,80,0.72), rgba(160,120,70,0.78)); }
.guide-send:disabled { opacity: 0.5; cursor: default; }
.guide-note {
  flex-shrink: 0;
  margin-top: 6px;
  font-size: 10px;
  color: #8a7a58;
  text-align: center;
  font-style: italic;
}

/* === 移动端 === */
@media (max-width: 640px) {
  .guide-modal {
    height: calc(100vh - 90px);
    max-height: none;
    padding: 14px 14px 10px 14px;
  }
  .guide-bubble { max-width: 94%; }
  .guide-recs { max-width: 94%; }
}
</style>

<template>
  <div v-if="philosopher" class="detail-card">
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

    <div class="detail-core">
      💡 <strong>核心观点</strong><br>
      {{ philosopher.coreIdea }}
    </div>

    <div class="detail-core">
      📜 <strong>生平</strong><br>
      {{ philosopher.biography }}
    </div>

    <div class="detail-core">
      🌍 <strong>历史背景</strong><br>
      {{ philosopher.historicalContext }}
    </div>

    <div v-if="philosopher.keyConcepts && philosopher.keyConcepts.length" class="detail-section">
      <div class="detail-section-title">🔑 关键概念</div>
      <div class="detail-concepts">
        <div v-for="(c, i) in philosopher.keyConcepts" :key="i" class="concept-item">
          <span class="concept-term">{{ c.term }}</span>
          <span class="concept-def">{{ c.def }}</span>
        </div>
      </div>
    </div>

    <div v-if="philosopher.anecdotes && philosopher.anecdotes.length" class="detail-section">
      <div class="detail-section-title">🎭 趣闻轶事</div>
      <div class="detail-anecdotes">
        <div v-for="(a, i) in philosopher.anecdotes" :key="i" class="anecdote-item">{{ a }}</div>
      </div>
    </div>

    <div v-if="philosopher.famousQuotes && philosopher.famousQuotes.length" class="detail-section">
      <div class="detail-section-title">💬 名言</div>
      <div class="detail-quotes">
        <div v-for="(q, i) in philosopher.famousQuotes" :key="i" class="quote-item">「{{ q }}」</div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📖 主要著作</div>
      <div class="detail-works">
        <div v-for="(w, i) in philosopher.works" :key="i">
          · {{ w.title }}{{ w.year ? ` (${fmtYear(w.year)})` : '' }}{{ w.coauthor ? ` · 与${w.coauthor}` : '' }}{{ w.note ? ` · ${w.note}` : '' }}
        </div>
      </div>
    </div>

    <div class="detail-section" v-if="influences.length > 0 || influencesBack.length > 0 || oppositions.length > 0 || oppositionsBack.length > 0">
      <div class="detail-section-title">🔗 思想关系</div>
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
  </div>
  <div v-else class="empty-hint">
    点击一颗星 🌟<br>查看哲学家详情
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  philosopher: { type: Object, default: null },
  favorited: { type: Boolean, default: false },
  allNodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
});

defineEmits(['toggle-favorite']);

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
  const fmt = (y) => (y < 0 ? `前${-y}` : y.toString());
  return `${fmt(b)} – ${fmt(d)}`;
});

const fmtYear = (y) => {
  if (y < 0) return `前${-y}`;
  return y.toString();
};
</script>

<style scoped>
.detail-card {
  position: fixed;
  top: 90px;
  right: 24px;
  width: 280px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  padding: 14px 18px 16px 18px;
  z-index: 15;
  background: linear-gradient(160deg, rgba(252,244,220,0.96), rgba(232,220,190,0.96));
  border: 1px solid #a08a68;
  border-radius: 5px;
  box-shadow: 0 5px 20px rgba(70,40,10,0.30), inset 0 0 26px rgba(160,130,80,0.18);
  color: #3a2008;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
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

/* === 移动端：卡片改为顶部全宽面板，不再右侧贴边 === */
@media (max-width: 640px) {
  .detail-card {
    top: 100px;           /* 避开两行顶栏（标题行 + 搜索行，约 96px） */
    left: 10px;
    right: 10px;
    width: auto;
    max-height: calc(100vh - 200px);  /* 底部留给两行控制按钮 */
    padding: 12px 14px;
  }
  .empty-hint { display: none; }
}
</style>

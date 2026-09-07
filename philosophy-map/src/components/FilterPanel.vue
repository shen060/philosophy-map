<template>
  <!-- 折叠态：左侧贴边的竖条按钮 -->
  <button
    v-if="!open"
    class="filter-rail"
    @click="open = true"
    :class="{ 'has-active': activeCount > 0 }"
    title="打开筛选"
  >
    <span class="rail-icon">⚙</span>
    <span class="rail-label">筛选</span>
    <span v-if="activeCount > 0" class="rail-badge">{{ activeCount }}</span>
  </button>

  <!-- 展开态：抽屉面板 -->
  <transition name="filter-slide">
    <aside v-if="open" class="filter-panel">
      <header class="filter-header">
        <h3>🎯 筛选</h3>
        <button class="filter-close" @click="open = false" title="收起">‹</button>
      </header>

      <div class="filter-summary">
        匹配 <strong>{{ matchedCount }}</strong> / {{ totalCount }} 位哲学家
      </div>

      <section class="filter-section">
        <div class="filter-section-title">时期 <span class="dim">（多选）</span></div>
        <div class="chip-grid">
          <button
            v-for="era in eras"
            :key="era"
            class="chip"
            :class="{ active: filters.eras.includes(era) }"
            @click="toggleArr(filters.eras, era)"
          >{{ era }}</button>
        </div>
      </section>

      <section class="filter-section">
        <div class="filter-section-title">学派 <span class="dim">（多选 · 可滚动）</span></div>
        <div class="chip-grid schools">
          <button
            v-for="s in schools"
            :key="s"
            class="chip"
            :class="{ active: filters.schools.includes(s) }"
            @click="toggleArr(filters.schools, s)"
          >{{ s }}</button>
        </div>
      </section>

      <section class="filter-section">
        <div class="filter-section-title">国籍 <span class="dim">（多选）</span></div>
        <div class="chip-grid">
          <button
            v-for="n in nationalities"
            :key="n"
            class="chip"
            :class="{ active: filters.nationalities.includes(n) }"
            @click="toggleArr(filters.nationalities, n)"
          >{{ n }}</button>
        </div>
      </section>

      <footer class="filter-footer">
        <button class="filter-reset" :disabled="activeCount === 0" @click="resetAll">
          ✕ 重置筛选
        </button>
      </footer>
    </aside>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  eras:        { type: Array, required: true },   // 时期列表（从父组件传入，避免静态 import）
  schools:     { type: Array, required: true },   // 学派列表
  nationalities: { type: Array, required: true }, // 国籍列表
  totalCount:  { type: Number, required: true },   // 全量节点数
  matchedCount: { type: Number, required: true },  // 筛选后匹配数
  filters:     { type: Object, required: true },   // 共享 filters 对象（App.vue 维护）
});

const emit = defineEmits(['update:filters']);

const open = ref(false);

// 工具：切换数组成员
function toggleArr(arr, value) {
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else arr.splice(idx, 1);
}

// 统计已选项数量
const activeCount = computed(() => {
  return (props.filters.eras?.length || 0)
       + (props.filters.schools?.length || 0)
       + (props.filters.nationalities?.length || 0);
});

function resetAll() {
  emit('update:filters', { eras: [], schools: [], nationalities: [] });
}
</script>

<style scoped>
/* === 折叠态：左侧贴边竖条 === */
.filter-rail {
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 18;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 26px;
  padding: 14px 0;
  background: linear-gradient(180deg, rgba(248,240,216,0.95), rgba(228,220,192,0.95));
  border: 1px solid #a08a68;
  border-left: none;
  border-radius: 0 6px 6px 0;
  color: #3a2008;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 2px 0 8px rgba(70,40,10,0.20), inset 0 0 14px rgba(160,130,80,0.12);
  transition: width .2s, background .15s;
}
.filter-rail:hover {
  width: 32px;
  background: linear-gradient(180deg, rgba(252,244,220,0.98), rgba(232,224,196,0.98));
}
.filter-rail.has-active {
  background: linear-gradient(180deg, rgba(160,120,70,0.65), rgba(140,100,60,0.70));
  color: #f4eed8;
}
.rail-icon { font-size: 14px; }
.rail-label {
  writing-mode: vertical-rl;
  font-size: 11px;
  letter-spacing: 4px;
  font-weight: 600;
}
.rail-badge {
  background: #a03a38;
  color: #f4eed8;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

/* === 展开态：抽屉面板 === */
.filter-panel {
  position: fixed;
  top: 60px;
  left: 14px;
  bottom: 60px;
  z-index: 18;
  width: 320px;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 12px 16px;
  background: linear-gradient(160deg, rgba(252,244,220,0.97), rgba(232,220,190,0.97));
  border: 1px solid #a08a68;
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(70,40,10,0.30), inset 0 0 26px rgba(160,130,80,0.18);
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  color: #3a2008;
  overflow: hidden;
}
.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.filter-header h3 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 2px;
  color: #3a2008;
}
.filter-close {
  background: transparent;
  border: 1px solid #a08a68;
  border-radius: 3px;
  color: #6a4a28;
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  padding: 2px 8px;
  cursor: pointer;
  transition: all .15s;
}
.filter-close:hover {
  background: rgba(160,130,90,0.20);
  color: #2a1008;
}

.filter-summary {
  padding: 6px 10px;
  margin-bottom: 10px;
  background: rgba(220,200,160,0.30);
  border-left: 3px solid #8a5a30;
  border-radius: 0 3px 3px 0;
  font-size: 11.5px;
  color: #5a3a18;
}
.filter-summary strong { color: #2a1008; font-weight: 700; font-size: 13px; }

.filter-section {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.filter-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #4a2f18;
  margin-bottom: 6px;
  letter-spacing: 1px;
}
.filter-section-title .dim {
  font-weight: 400;
  color: #8a7a58;
  font-size: 10.5px;
  margin-left: 4px;
}

/* chips 网格：自动换行 */
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  overflow-y: auto;
}
.chip-grid.schools {
  /* 学派较多，给滚动上限 */
  max-height: 180px;
  padding-right: 4px;
}
.chip {
  padding: 3px 9px;
  background: rgba(232,220,180,0.70);
  border: 1px solid #a08a68;
  border-radius: 12px;
  color: #3a2008;
  font-family: inherit;
  font-size: 10.5px;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.chip:hover {
  background: rgba(212,196,156,0.85);
  border-color: #6a4a28;
}
.chip.active {
  background: linear-gradient(140deg, rgba(120,85,45,0.85), rgba(100,70,35,0.88));
  color: #f4eed8;
  border-color: #3a2008;
  font-weight: 600;
}
.chip.active:hover {
  background: linear-gradient(140deg, rgba(140,100,55,0.92), rgba(120,85,45,0.95));
}

.filter-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed rgba(160,130,90,0.40);
}
.filter-reset {
  width: 100%;
  padding: 6px;
  background: transparent;
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #6a4a28;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all .15s;
}
.filter-reset:hover:not(:disabled) {
  background: rgba(160,130,90,0.20);
  color: #2a1008;
}
.filter-reset:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* === 抽屉动画 === */
.filter-slide-enter-active,
.filter-slide-leave-active {
  transition: transform .25s ease, opacity .25s ease;
}
.filter-slide-enter-from,
.filter-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* === 移动端：抽屉改为贴底全宽 === */
@media (max-width: 640px) {
  .filter-panel {
    top: 100px;
    left: 8px;
    right: 8px;
    bottom: 56px;
    width: auto;
    max-height: calc(100vh - 160px);
  }
  .filter-rail {
    width: 32px;
    padding: 10px 0;
  }
  .rail-icon { font-size: 12px; }
  .rail-label { font-size: 10px; letter-spacing: 3px; }
  .chip-grid.schools { max-height: 120px; }
}
</style>

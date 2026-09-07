<template>
  <div class="app-container">
    <div class="starfield"></div>

    <!-- 欢迎页：进入站点时显示 -->
    <transition name="welcome-fade">
      <div v-if="appStage === 'welcome'" class="welcome-screen">
        <div class="welcome-inner">
          <div class="welcome-title">人类群星闪耀时</div>
          <div class="welcome-sub">—— 哲学 ——</div>
          <p class="welcome-subtitle">穿越两千五百年的思想银河</p>
          <p class="welcome-desc">105 位先哲的星辰在此运转，选择一片星云开启你的漫游</p>
          <div class="welcome-galaxy-choices">
            <button class="galaxy-choice western" @click="enterGalaxy('western')">
              <span class="galaxy-icon">🌑</span>
              <span class="galaxy-label">西方星云</span>
              <span class="galaxy-count">{{ westernCount }} 位先哲</span>
            </button>
            <button class="galaxy-choice eastern" @click="enterGalaxy('eastern')">
              <span class="galaxy-icon">🌓</span>
              <span class="galaxy-label">东方星云</span>
              <span class="galaxy-count">{{ easternCount }} 位先哲</span>
            </button>
            <button class="galaxy-choice all" @click="enterGalaxy('all')">
              <span class="galaxy-icon">🌌</span>
              <span class="galaxy-label">全体星云</span>
              <span class="galaxy-count">{{ nodes.length }} 位先哲</span>
            </button>
          </div>
          <p v-if="loadingData" class="welcome-loading">星图加载中…</p>
        </div>
      </div>
    </transition>

    <!-- 加载错误提示 -->
    <div v-if="loadError" class="error-banner">
      <span>⚠️ 数据加载失败：{{ loadError }}</span>
      <button class="error-retry" @click="loadData">重试</button>
    </div>

    <!-- 星图画布 -->
    <StarMap
      v-show="appStage === 'galaxy'"
      :view-mode="viewMode"
      :selected-id="selectedId"
      :nodes="displayNodes"
      :links="displayLinks"
      :loading="loadingData"
      :search-hit-ids="searchHitIds"
      @node-click="onNodeClick"
    />

    <!-- 顶部工具栏：搜索 + 登录 -->
    <div class="top-bar">
      <div class="top-left">
        <div class="title" @click="backToWelcome" title="返回星云选择">⚡ 群星闪耀时</div>

        <!-- 搜索框 -->
        <div class="search-wrap">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="🔍 搜名字 / 思想 / 学派 / 名言..."
            @input="doSearch"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
          />
          <button v-if="searchQuery" class="search-btn" @click="doSearch">搜</button>
          <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>

          <!-- 搜索历史下拉（登录后聚焦空搜索框时显示）-->
          <div v-if="currentUser && historyDropdown && !searchQuery.trim() && !searchResults.length" class="search-dropdown history-dropdown">
            <template v-if="searchHistoryList.length">
              <div
                v-for="h in searchHistoryList"
                :key="h.query"
                class="search-item history-item"
                @mousedown.prevent="useSearchHistory(h)"
              >
                <span class="history-dot">⏱</span>
                <span class="history-query">{{ h.query }}</span>
                <span class="history-del" @click.stop="removeSearchHistory(h.query)">✕</span>
              </div>
              <div class="history-footer" @click="clearAllSearchHistory">清空搜索历史</div>
            </template>
            <div v-else class="search-empty">暂无搜索记录</div>
          </div>

          <!-- 搜索结果下拉 -->
          <div v-if="searchResults.length" class="search-dropdown">
            <div
              v-for="p in searchResults"
              :key="p.id"
              class="search-item"
              @click="selectFromSearch(p)"
            >
              <span class="search-item-name">{{ p.name }}</span>
              <span class="search-item-en">{{ p.nameEn }}</span>
              <span class="search-item-era">{{ p.era }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="top-right">
        <template v-if="currentUser">
          <span class="user-greeting">👤 {{ currentUser.name }}</span>
          <button class="auth-btn" @click="openHistoryModal">📖 浏览记录</button>
          <button class="auth-btn" @click="toggleFavoritesView">
            {{ favoritesOnly ? '🌌 返回全部星云' : '⭐ 我的收藏' }}
          </button>
          <button class="auth-btn" @click="logout">退出</button>
        </template>
        <template v-else>
          <button class="auth-btn primary" @click="showLogin = true">登录 / 注册</button>
        </template>
      </div>
    </div>

    <!-- 视图切换 -->
    <div class="view-switch">
      <button
        class="view-btn"
        :class="{ active: galaxyFilter === 'western' }"
        @click="switchGalaxy('western')"
      >🌑 西方</button>
      <button
        class="view-btn"
        :class="{ active: galaxyFilter === 'eastern' }"
        @click="switchGalaxy('eastern')"
      >🌓 东方</button>
      <button
        class="view-btn"
        :class="{ active: galaxyFilter === 'all' }"
        @click="switchGalaxy('all')"
      >🌌 全体</button>
      <span class="view-divider"></span>
      <button
        class="view-btn"
        :class="{ active: viewMode === 'star' }"
        @click="viewMode = 'star'"
      >✨ 星图</button>
      <button
        class="view-btn"
        :class="{ active: viewMode === 'cluster' }"
        @click="viewMode = 'cluster'"
      >🫧 聚类</button>
    </div>

    <!-- 左侧筛选面板 -->
    <FilterPanel
      :eras="allEras"
      :schools="allSchools"
      :nationalities="visibleNationalities"
      :total-count="totalNodeCount"
      :matched-count="matchedCount"
      :filters="filters"
      @update:filters="(f) => { filters.eras = f.eras; filters.schools = f.schools; filters.nationalities = f.nationalities; }"
    />

    <!-- 右侧详情卡 -->
    <DetailCard
      :philosopher="selectedPhilosopher"
      :favorited="selectedFavorited"
      :all-nodes="nodes"
      :links="links"
      @toggle-favorite="toggleFavorite"
    />

    <!-- 底部图例 -->
    <div class="legend">
      <div class="legend-item">
        <div class="legend-line-solid"></div>
        <span>传承 / 影响</span>
      </div>
      <div class="legend-item">
        <div class="legend-line-dashed"></div>
        <span>对立 / 批判</span>
      </div>
      <div v-if="loadingData" class="legend-item">
        <span style="color:#aaa">加载中...</span>
      </div>
    </div>

    <!-- 登录/注册弹窗 -->
    <div v-if="showLogin" class="modal-backdrop" @click.self="showLogin = false">
      <div class="modal">
        <h3>{{ loginMode === 'login' ? '登录' : '注册' }}</h3>
        <template v-if="loginMode === 'register'">
          <input v-model="loginForm.name" placeholder="昵称" />
        </template>
        <input v-model="loginForm.email" placeholder="邮箱" type="email" />
        <input v-model="loginForm.password" placeholder="密码 (至少6位)" type="password" />
        <div v-if="loginError" class="modal-error">{{ loginError }}</div>
        <button class="auth-btn primary full" @click="submitAuth">
          {{ loginMode === 'login' ? '登录' : '注册并登录' }}
        </button>
        <div class="modal-switch" @click="loginMode = loginMode === 'login' ? 'register' : 'login'">
          {{ loginMode === 'login' ? '还没有账号？去注册' : '已有账号？去登录' }}
        </div>
      </div>
    </div>

    <!-- 浏览记录弹窗 -->
    <div v-if="showHistoryModal" class="modal-backdrop" @click.self="showHistoryModal = false">
      <div class="modal history-modal">
        <h3>📖 浏览记录</h3>
        <div class="history-list" v-if="historyList.length">
          <div
            v-for="p in historyList"
            :key="p.id"
            class="history-item"
            @click="jumpToHistory(p)"
          >
            <span class="history-item-name">{{ p.name }}</span>
            <span class="history-item-en">{{ p.nameEn }}</span>
            <span class="history-item-era">{{ p.era }}</span>
          </div>
        </div>
        <div v-else class="search-empty">还没有浏览过任何哲学家</div>
        <div class="modal-switch" @click="showHistoryModal = false">关闭</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import StarMap from './components/StarMap.vue';
import DetailCard from './components/DetailCard.vue';
import FilterPanel from './components/FilterPanel.vue';
import { auth as authApi, philosophers, getLinks, search as searchApi, searchHistory as searchHistoryApi } from './api';
import { useAuth } from './composables/useAuth';

const viewMode = ref('star');
const selectedId = ref(null);
const loadingData = ref(true);
const loadError = ref(null);
const nodes = ref([]);
const links = ref([]);

// 应用阶段：welcome 欢迎页 / galaxy 星图
const appStage = ref('welcome');
// 星云筛选：all 全体 / eastern 东方 / western 西方
const galaxyFilter = ref('all');

// 东方判定：按国籍关键词（中国、日本、印度、古印度、朝鲜、韩国、越南、阿拉伯、波斯、伊斯兰）
const EASTERN_RE = /中国|日本|印度|古印度|朝鲜|韩国|越南|阿拉伯|波斯|伊斯兰/;
const isEastern = (n) => EASTERN_RE.test(n.nationality || '');

// 东西方计数（欢迎页展示用）
const easternCount = computed(() => nodes.value.filter(isEastern).length);
const westernCount = computed(() => nodes.value.length - easternCount.value);

// 进入星云
function enterGalaxy(filter) {
  galaxyFilter.value = filter;
  appStage.value = 'galaxy';
  selectedId.value = null;
}
// 返回欢迎页
function backToWelcome() {
  appStage.value = 'welcome';
  selectedId.value = null;
  if (favoritesOnly.value) exitFavoritesView();
}
// 星图内切换星云
function switchGalaxy(filter) {
  if (galaxyFilter.value === filter) return;
  galaxyFilter.value = filter;
  selectedId.value = null;
  // 切换星云时若在收藏视图，退出以免看不到非收藏节点
  if (favoritesOnly.value) exitFavoritesView();
}

// 星云筛选后的节点
const galaxyNodes = computed(() => {
  if (galaxyFilter.value === 'all') return nodes.value;
  if (galaxyFilter.value === 'eastern') return nodes.value.filter(isEastern);
  return nodes.value.filter(n => !isEastern(n));
});
const galaxyIds = computed(() => new Set(galaxyNodes.value.map(n => n.id)));

// === 细粒度筛选（学派 / 时期 / 国籍） ——
const filters = reactive({ eras: [], schools: [], nationalities: [] });
const filterResult = ref(null);           // API 拉到的筛选结果；null 表示无筛选
const filterLoading = ref(false);

// 计算筛选选项（从全量节点算；去重 + 排序）
const allEras = computed(() => [...new Set(nodes.value.map(n => n.era))].sort());
const allSchools = computed(() => {
  const set = new Set();
  nodes.value.forEach(n => (n.school || []).forEach(s => set.add(s)));
  return [...set].sort();
});
const allNationalities = computed(() => {
  const set = new Set();
  nodes.value.forEach(n => n.nationality && set.add(n.nationality));
  return [...set].sort();
});

// === 上下文敏感的国籍列表 ===
// 在「西方星云」/「东方星云」模式下，只显示当前星云范围里的国籍，
// 避免出现「选了西方但国籍筛了个中国 → 结果为空」这种体验断点。
// 时期和学派不联动：时期是中性维度，学派可能跨东西方。
const visibleNationalities = computed(() => {
  if (galaxyFilter.value === 'all') return allNationalities.value;
  if (galaxyFilter.value === 'eastern') {
    return allNationalities.value.filter(n => isEastern({ nationality: n }));
  }
  return allNationalities.value.filter(n => !isEastern({ nationality: n }));
});

// 总数（用于筛选面板"匹配 N/M"展示）
const totalNodeCount = computed(() => nodes.value.length);

// 是否有筛选生效
const hasActiveFilter = computed(() =>
  filters.eras.length + filters.schools.length + filters.nationalities.length > 0
);

// 筛选后的节点列表
const filteredNodes = computed(() => {
  if (!hasActiveFilter.value) return nodes.value;
  if (filterLoading.value) return [];   // 加载中显示空，避免闪烁
  return filterResult.value || [];
});

// 筛选面板实时"匹配 N"显示
const matchedCount = computed(() => filteredNodes.value.length);

// 把细粒度筛选叠加在星云筛选之上
const galaxyFilteredNodes = computed(() => {
  if (!hasActiveFilter.value) return galaxyNodes.value;
  const ids = new Set(filteredNodes.value.map(n => n.id));
  return galaxyNodes.value.filter(n => ids.has(n.id));
});

let filterTimer = null;
// 监听 filters 变化 → 防抖调 API
watch(filters, () => {
  clearTimeout(filterTimer);
  if (!hasActiveFilter.value) {
    filterResult.value = null;
    return;
  }
  filterTimer = setTimeout(refreshFilteredNodes, 200);
}, { deep: true });

async function refreshFilteredNodes() {
  filterLoading.value = true;
  try {
    const params = {};
    if (filters.schools.length)     params.school = filters.schools.join(',');
    // era / nationality 目前后端只支持单值，取第一个（用户在 UI 上看到只生效第一个）
    if (filters.eras.length)        params.era = filters.eras[0];
    if (filters.nationalities.length) params.nationality = filters.nationalities[0];
    filterResult.value = await philosophers.list(params);
  } catch (e) {
    console.error('Filter fetch error:', e);
    filterResult.value = [];
  } finally {
    filterLoading.value = false;
  }
}

// 收藏视图：不修改原始 nodes/links，只在这里做"显示层"筛选
const favoritesOnly = ref(false);
const favoriteList = ref([]);

const displayNodes = computed(() => {
  if (!favoritesOnly.value) return galaxyFilteredNodes.value;
  return favoriteList.value.length ? favoriteList.value : [];
});

// 收藏视图下只保留收藏节点之间的连线，避免悬空连线连到不存在的节点
const displayLinks = computed(() => {
  const ids = favoritesOnly.value
    ? new Set(favoriteList.value.map(n => n.id))
    : galaxyIds.value;
  return links.value.filter(l => {
    const s = l.source ?? l.sourceId;
    const t = l.target ?? l.targetId;
    return ids.has(s) && ids.has(t);
  });
});

// 搜索
const searchQuery = ref('');
const searchResults = ref([]);
const searchHitIds = computed(() => searchResults.value.map(p => p.id));
let searchTimer = null;

// 搜索历史（登录后才有）
const historyDropdown = ref(false);          // 聚焦搜索框时显示历史
const searchHistoryList = ref([]);           // [{query, searchedAt}]
let searchHistoryTimer = null;               // 防抖：记录搜索时不每次都调 API

// 浏览记录（登录后才有）
const showHistoryModal = ref(false);
const historyList = ref([]);                 // [{哲学家完整数据, visitedAt}]

// 登录
const showLogin = ref(false);
const loginMode = ref('login');
const loginForm = ref({ name: '', email: '', password: '' });
const loginError = ref('');
const auth = useAuth();
const { user: authUser, login: authLogin, register: authRegister, logout, checkAuth } = auth;
const currentUser = computed(() => authUser.value);

// 收藏
const selectedFavorited = ref(false);

const selectedPhilosopher = computed(() => {
  if (!selectedId.value) return null;
  return nodes.value.find(n => n.id === selectedId.value) || null;
});

const onNodeClick = (node) => {
  selectedId.value = node ? node.id : null;
  if (selectedId.value && currentUser.value) {
    checkFavorited();
    // 登录用户自动记录浏览（异步，不阻塞交互）
    philosophers.addHistory(selectedId.value).catch(() => {});
  }
};

const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    selectedId.value = null;
    showLogin.value = false;
  }
};

// === 拉取数据（纯 API，无 fallback）===
async function loadData() {
  loadingData.value = true;
  loadError.value = null;
  try {
    const [nodeList, linkData] = await Promise.all([
      philosophers.list(),
      getLinks(),
    ]);
    nodes.value = nodeList;
    const all = [];
    for (const l of linkData.influence) all.push({ ...l, type: 'influence' });
    for (const l of linkData.opposition) all.push({ ...l, type: 'opposition' });
    links.value = all;
  } catch (e) {
    loadError.value = e.message || '未知错误';
    console.error('Failed to load data:', e);
  } finally {
    loadingData.value = false;
  }
}

// === 搜索（debounce 300ms）===
function doSearch() {
  clearTimeout(searchTimer);
  const q = searchQuery.value.trim();
  if (!q) { searchResults.value = []; return; }
  searchTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchApi(q);
      // 登录用户：防抖记录搜索关键词
      if (currentUser.value) {
        clearTimeout(searchHistoryTimer);
        searchHistoryTimer = setTimeout(() => {
          searchHistoryApi.add(q).catch(() => {});
        }, 600);
      }
    } catch {
      searchResults.value = [];
    }
  }, 200);
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  historyDropdown.value = false;
}

// === 浏览记录 ===
async function openHistoryModal() {
  if (!currentUser.value) { showLogin.value = true; return; }
  try {
    historyList.value = await philosophers.myHistory();
  } catch {
    historyList.value = [];
  }
  showHistoryModal.value = true;
}
function jumpToHistory(p) {
  showHistoryModal.value = false;
  appStage.value = 'galaxy';
  // 若该哲学家不在当前星云，自动切到全体
  if (galaxyFilter.value !== 'all' && !galaxyIds.value.has(p.id)) {
    galaxyFilter.value = 'all';
  }
  selectedId.value = p.id;
}

// === 搜索历史下拉 ===
async function loadSearchHistory() {
  if (!currentUser.value) return;
  try {
    searchHistoryList.value = await searchHistoryApi.list();
  } catch {
    searchHistoryList.value = [];
  }
}
function onSearchFocus() {
  if (!currentUser.value) return;
  if (!searchQuery.value.trim()) {
    loadSearchHistory();
    historyDropdown.value = true;
  }
}
function onSearchBlur() {
  // 点击历史条目时也要触发 mousedown，先不立刻关
  setTimeout(() => { historyDropdown.value = false; }, 150);
}
function useSearchHistory(item) {
  searchQuery.value = item.query;
  historyDropdown.value = false;
  doSearch();
}
async function removeSearchHistory(query) {
  try {
    await searchHistoryApi.remove(query);
    searchHistoryList.value = searchHistoryList.value.filter(h => h.query !== query);
  } catch {}
}
async function clearAllSearchHistory() {
  try {
    await searchHistoryApi.clear();
    searchHistoryList.value = [];
  } catch {}
}

function selectFromSearch(p) {
  searchResults.value = [];
  searchQuery.value = '';
  // 退回欢迎页外，若该哲学家不在当前星云，自动切到全体星云
  if (favoritesOnly.value) exitFavoritesView();
  if (galaxyFilter.value !== 'all' && !galaxyIds.value.has(p.id)) {
    galaxyFilter.value = 'all';
  }
  selectedId.value = p.id;
  if (currentUser.value) checkFavorited();
}
// === 登录 ===
async function submitAuth() {
  loginError.value = '';
  try {
    if (loginMode.value === 'login') {
      await authLogin(loginForm.value.email, loginForm.value.password);
    } else {
      await authRegister(loginForm.value.email, loginForm.value.password, loginForm.value.name);
    }
    showLogin.value = false;
    loginForm.value = { name: '', email: '', password: '' };
    if (selectedId.value) checkFavorited();
  } catch (e) {
    loginError.value = e.message;
  }
}

// === 收藏 ===
async function checkFavorited() {
  if (!currentUser.value || !selectedId.value) return;
  try {
    const res = await philosophers.favorited(selectedId.value);
    selectedFavorited.value = res.favorited;
  } catch {
    selectedFavorited.value = false;
  }
}

async function toggleFavorite() {
  if (!currentUser.value) { showLogin.value = true; return; }
  if (!selectedId.value) return;
  if (selectedFavorited.value) {
    await philosophers.unfavorite(selectedId.value);
    selectedFavorited.value = false;
  } else {
    await philosophers.favorite(selectedId.value);
    selectedFavorited.value = true;
  }
}

async function showFavorites() {
  try {
    const favs = await philosophers.myFavorites();
    if (favs.length) {
      favoriteList.value = favs;
      favoritesOnly.value = true;
      selectedId.value = favs[0].id;
      viewMode.value = 'star';
      checkFavorited();
    } else {
      alert('还没有收藏任何哲学家');
    }
  } catch (e) {
    alert(e.message);
  }
}

function exitFavoritesView() {
  favoritesOnly.value = false;
  favoriteList.value = [];
}

function toggleFavoritesView() {
  if (favoritesOnly.value) {
    exitFavoritesView();
  } else {
    showFavorites();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  // 启动时尝试用 localStorage 里的 token 恢复登录态
  checkAuth();
  loadData();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// 选中变化时检查收藏
watch(selectedId, () => {
  selectedFavorited.value = false;
  if (selectedId.value && currentUser.value) checkFavorited();
});
</script>

<style>
/* ===== 全局 body 衬线字体（牛皮纸风所有 UI 统一衬线）===== */
body {
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
}

/* 搜索 + 登录顶栏 */
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 20px;
  gap: 16px;
  pointer-events: none;
}
.top-bar > * { pointer-events: auto; }
.top-left { display: flex; align-items: center; gap: 12px; position: relative; }
.top-right { display: flex; align-items: center; gap: 8px; }

.title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #4a2f18;
  text-shadow: 1px 1px 0 rgba(255,240,200,0.6);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
.title:hover { color: #6a3f18; }

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search-input {
  width: 280px;
  padding: 6px 30px 6px 12px;
  background: rgba(234,226,198,0.95);
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: all .2s;
}
.search-input:focus {
  border-color: #6a4a28;
  box-shadow: 0 0 6px rgba(100,70,30,0.30);
}
.search-input::placeholder { color: #8a7a58; }
.search-btn, .search-clear {
  position: absolute;
  right: 4px;
  background: transparent;
  border: none;
  color: #6a4a28;
  cursor: pointer;
  font-size: 11px;
  padding: 4px 6px;
  font-family: inherit;
}
.search-clear { right: 28px; }
.search-btn:hover { color: #2a1008; }

.search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 240px;
  width: 320px;
  max-height: 340px;
  overflow-y: auto;
  background: linear-gradient(140deg, rgba(252,244,220,0.97), rgba(232,224,196,0.97));
  border: 1px solid #a08a68;
  border-radius: 4px;
  box-shadow: 0 4px 18px rgba(70,40,10,0.30), inset 0 0 20px rgba(160,130,80,0.12);
  z-index: 100;
}
.search-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(160,130,90,0.18);
  font-size: 12px;
}
.search-item:hover { background: rgba(180,150,100,0.25); }
.search-item:last-child { border-bottom: none; }
.search-item-name { color: #3a2008; font-weight: 600; }
.search-item-en { color: #7a6a48; font-style: italic; flex: 1; margin: 0 10px; }
.search-item-era { color: #8a7a58; font-size: 10px; }

.user-greeting { color: #6a4a28; font-size: 13px; }

.auth-btn {
  padding: 5px 14px;
  background: linear-gradient(140deg, rgba(232,220,180,0.70), rgba(212,196,156,0.70));
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all .2s;
  box-shadow: inset 0 0 6px rgba(160,130,80,0.10);
}
.auth-btn:hover { background: linear-gradient(140deg, rgba(212,196,156,0.85), rgba(192,176,136,0.85)); }
.auth-btn.primary { background: linear-gradient(140deg, rgba(160,120,70,0.60), rgba(140,100,60,0.65)); color: #f4eed8; border-color: #7a5a28; }
.auth-btn.primary:hover { background: linear-gradient(140deg, rgba(180,140,80,0.72), rgba(160,120,70,0.78)); }
.auth-btn.full { width: 100%; padding: 8px; font-size: 13px; }

/* 视图切换 */
.view-switch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 20px;
  display: flex;
  gap: 6px;
  z-index: 20;
}
.view-btn {
  padding: 5px 14px;
  background: linear-gradient(140deg, rgba(232,220,180,0.70), rgba(212,196,156,0.70));
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all .2s;
}
.view-btn:hover { background: rgba(190,170,130,0.75); }
.view-btn.active { background: linear-gradient(140deg, rgba(120,85,45,0.70), rgba(100,70,35,0.75)); color: #f4eed8; border-color: #6a4a20; }

/* 底部图例 */
.legend {
  position: absolute;
  left: 20px;
  bottom: 20px;
  z-index: 10;
  padding: 8px 14px;
  background: linear-gradient(140deg, rgba(248,240,216,0.92), rgba(228,220,192,0.92));
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  box-shadow: 0 3px 10px rgba(70,40,10,0.22), inset 0 0 18px rgba(160,130,80,0.15);
}
.legend-item { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11px; }
.legend-line-solid { width: 34px; height: 0; border-top: 2px solid #6a4a28; }
.legend-line-dashed { width: 34px; height: 0; border-top: 2px dashed #8a3a38; }
.legend > div:first-child { font-weight: 700; font-size: 12px; margin-bottom: 4px; letter-spacing: 1px; }

/* 弹窗 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(30,20,5,0.60);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: linear-gradient(160deg, rgba(252,244,220,0.97), rgba(232,220,190,0.97));
  border: 1px solid #a08a68;
  border-radius: 6px;
  padding: 24px 28px;
  width: 340px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.45), inset 0 0 26px rgba(160,130,80,0.18);
  position: relative;
}
.modal h3 {
  margin: 0 0 16px 0;
  color: #3a2008;
  text-align: center;
  letter-spacing: 2px;
  font-weight: 700;
}
.modal input {
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 10px;
  background: rgba(234,226,198,0.95);
  border: 1px solid #a08a68;
  border-radius: 4px;
  color: #3a2008;
  font-family: inherit;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
}
.modal input:focus { border-color: #6a4a28; box-shadow: 0 0 6px rgba(100,70,30,0.30); }
.modal-error { color: #a03a38; font-size: 12px; margin-bottom: 8px; text-align: center; font-weight: 600; }
.modal-switch { color: #6a4a28; font-size: 11px; text-align: center; margin-top: 10px; cursor: pointer; }
.modal-switch:hover { color: #3a2008; text-decoration: underline; text-underline-offset: 2px; }

/* 加载错误 banner */
.error-banner {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 18px;
  background: linear-gradient(140deg, rgba(248,220,200,0.96), rgba(228,200,180,0.96));
  border: 1px solid #a04a38;
  border-radius: 4px;
  color: #6a2018;
  font-size: 13px;
  box-shadow: 0 4px 14px rgba(100,30,10,0.30), inset 0 0 14px rgba(160,80,60,0.10);
}
.error-retry {
  padding: 4px 14px;
  background: rgba(160,74,56,0.85);
  border: 1px solid #6a2018;
  border-radius: 3px;
  color: #f4eed8;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.error-retry:hover { background: rgba(180,94,76,0.95); }

/* ===== 移动端适配（窄屏手机）===== */
@media (max-width: 640px) {
  /* 顶栏：第一行 标题+登录按钮，第二行 搜索框全宽 */
  .top-bar {
    flex-wrap: wrap;
    padding: 10px 12px;
    gap: 8px;
  }
  .top-right {
    order: 1;
    margin-left: auto;
  }
  .top-left {
    order: 2;
    flex: 1 1 100%;
    gap: 8px;
  }
  .title {
    font-size: 13px;
    letter-spacing: 1px;
    flex-shrink: 0;
  }
  .search-wrap { flex: 1; min-width: 0; }
  .search-input {
    width: 100%;
    box-sizing: border-box;
    font-size: 16px; /* ≥16px 避免 iOS 聚焦时自动放大页面 */
  }
  /* 搜索下拉：相对顶栏全宽，不再 left:240px 飞出屏幕 */
  .search-dropdown {
    left: 0;
    right: 0;
    width: auto;
    max-height: 240px;
  }
  .search-item-en { display: none; } /* 窄屏隐藏英文名，留中文名+年代 */
  .user-greeting { display: none; }   /* 省空间，只留按钮 */
  .auth-btn { padding: 6px 12px; }

  /* 底部控件：图例左下；"星图/聚类"居中；"重置/自转"在 StarMap 内已抬到第二行 */
  .legend {
    left: 10px;
    bottom: 12px;
    padding: 5px 9px;
  }
  .legend-item { font-size: 10px; gap: 6px; }
  .legend-line-solid, .legend-line-dashed { width: 20px; }
  .view-switch {
    left: 50%;
    right: auto;
    bottom: 12px;
    transform: translateX(-50%);
  }
  .view-btn { padding: 7px 14px; font-size: 12px; }

  /* 登录/注册弹窗：宽度自适应屏幕 */
  .modal {
    width: calc(100vw - 40px);
    max-width: 340px;
    padding: 20px;
  }
  .modal input { font-size: 16px; } /* 防止 iOS 聚焦放大 */
}

/* ===== 欢迎页 ===== */
.welcome-screen {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(120,90,50,0.10), transparent 60%),
    radial-gradient(ellipse at 70% 80%, rgba(90,60,30,0.12), transparent 55%),
    linear-gradient(160deg, #f4ead0 0%, #e8dcc0 50%, #ddd0b0 100%);
}
.welcome-inner {
  text-align: center;
  max-width: 640px;
  padding: 40px 30px;
}
.welcome-title {
  font-size: 42px;
  font-weight: 700;
  letter-spacing: 8px;
  color: #3a2008;
  text-shadow: 2px 2px 0 rgba(255,240,200,0.5);
  margin-bottom: 4px;
}
.welcome-sub {
  font-size: 14px;
  color: #6a4a28;
  letter-spacing: 12px;
  margin-bottom: 18px;
  font-weight: 600;
}
.welcome-subtitle {
  font-size: 16px;
  color: #5a3a18;
  letter-spacing: 4px;
  margin: 0 0 6px 0;
  font-style: italic;
}
.welcome-desc {
  font-size: 13px;
  color: #7a5a38;
  margin: 0 0 36px 0;
  line-height: 1.8;
}
.welcome-galaxy-choices {
  display: flex;
  gap: 18px;
  justify-content: center;
  flex-wrap: wrap;
}
.galaxy-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 150px;
  padding: 24px 12px 20px;
  background: linear-gradient(150deg, rgba(252,244,220,0.85), rgba(232,220,190,0.85));
  border: 1px solid #a08a68;
  border-radius: 6px;
  cursor: pointer;
  transition: all .25s;
  box-shadow: 0 4px 16px rgba(70,40,10,0.18), inset 0 0 20px rgba(160,130,80,0.10);
  font-family: inherit;
}
.galaxy-choice:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(70,40,10,0.28), inset 0 0 20px rgba(160,130,80,0.16);
  border-color: #6a4a28;
}
.galaxy-icon { font-size: 34px; line-height: 1; }
.galaxy-label { font-size: 16px; font-weight: 700; color: #3a2008; letter-spacing: 2px; }
.galaxy-count { font-size: 11px; color: #8a6a48; }
.galaxy-choice.western:hover { background: linear-gradient(150deg, rgba(232,224,200,0.92), rgba(200,190,160,0.92)); }
.galaxy-choice.eastern:hover { background: linear-gradient(150deg, rgba(240,230,205,0.92), rgba(210,195,165,0.92)); }
.galaxy-choice.all:hover { background: linear-gradient(150deg, rgba(245,235,210,0.92), rgba(215,200,170,0.92)); }
.welcome-loading { margin-top: 24px; color: #8a7a58; font-size: 13px; letter-spacing: 2px; }

/* 欢迎页淡入/淡出 */
.welcome-fade-enter-active, .welcome-fade-leave-active { transition: opacity .5s ease; }
.welcome-fade-enter-from, .welcome-fade-leave-to { opacity: 0; }

/* 视图切换分隔线 */
.view-divider {
  width: 1px;
  height: 20px;
  background: rgba(160,130,90,0.4);
  margin: 0 4px;
  align-self: center;
}

/* 欢迎页移动端适配 */
@media (max-width: 640px) {
  .welcome-title { font-size: 30px; letter-spacing: 4px; }
  .welcome-subtitle { font-size: 14px; letter-spacing: 2px; }
  .welcome-desc { font-size: 12px; margin-bottom: 24px; }
  .welcome-galaxy-choices { gap: 10px; }
  .galaxy-choice { width: calc(50vw - 20px); padding: 18px 8px 14px; }
  .galaxy-icon { font-size: 28px; }
  .galaxy-label { font-size: 14px; letter-spacing: 1px; }
  /* 窄屏时视图切换区按钮较多，缩小间距 */
  .view-switch { gap: 4px; flex-wrap: nowrap; }
  .view-btn { padding: 6px 9px; font-size: 11px; }
  .view-divider { margin: 0 2px; }
}

/* ===== 搜索历史下拉 ===== */
.history-dropdown {
  left: 0;
  right: auto;
  min-width: 280px;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history-dot { color: #8a6a48; font-size: 11px; flex-shrink: 0; }
.history-query { flex: 1; color: #3a2008; font-weight: 500; }
.history-del {
  color: #8a6a48;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.history-del:hover { background: rgba(160,130,90,0.25); color: #6a2018; }
.history-footer {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: #6a4a28;
  cursor: pointer;
  border-top: 1px solid rgba(160,130,90,0.18);
}
.history-footer:hover { background: rgba(160,130,90,0.15); color: #3a2008; }
.search-empty { text-align: center; padding: 18px; color: #8a7a58; font-size: 12px; }

/* ===== 浏览记录弹窗 ===== */
.history-modal {
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}
.history-modal h3 { flex-shrink: 0; }
.history-list {
  flex: 1;
  overflow-y: auto;
  margin: 8px 0;
  max-height: 400px;
}
.history-list .history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(160,130,90,0.12);
  font-size: 12px;
}
.history-list .history-item:hover { background: rgba(180,150,100,0.18); }
.history-item-name { color: #3a2008; font-weight: 600; }
.history-item-en { color: #7a6a48; font-style: italic; flex: 1; }
.history-item-era { color: #8a7a58; font-size: 10px; }
</style>

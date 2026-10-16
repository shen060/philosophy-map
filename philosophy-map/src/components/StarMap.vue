﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿<template>
  <div ref="container" class="canvas-area">
    <!-- Three.js WebGL 画布 -->
    <canvas ref="canvas" style="display:block;width:100%;height:100%"></canvas>
    <!-- CSS2D 标签层 -->
    <div ref="labelLayer" class="label-layer"></div>
    <!-- Tooltip -->
    <div ref="tooltip" class="tooltip" v-if="tooltipVisible" :style="tooltipStyle">
      <div>{{ tooltipData.name }} · {{ tooltipData.nameEn }}</div>
      <div style="opacity:.65">{{ tooltipData.era }} · {{ tooltipData.nationality }}</div>
      <div v-if="tooltipData.coreIdea" class="tooltip-core">{{ tooltipData.coreIdea }}</div>
    </div>
    <!-- 右下角控制按钮 -->
    <div class="starmap-controls">
      <button class="view-btn" @click="resetView">⟲ 重置视角</button>
      <button class="view-btn" :class="{ active: autoRotate }" @click="toggleAutoRotate">
        {{ autoRotate ? '⏸ 停止自转' : '▶ 自动自转' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { schoolColors, eraColors } from '../data/philosophers.js';

const props = defineProps({
  viewMode: { type: String, default: 'star' },
  selectedId: { type: String, default: null },
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searchHitIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['nodeClick']);

const container = ref(null);
const canvas = ref(null);
const labelLayer = ref(null);
const tooltip = ref(null);
const tooltipVisible = ref(false);
const tooltipData = ref({});
const tooltipStyle = ref({});
const autoRotate = ref(false);

// Three.js 核心对象
let scene = null;
let camera = null;
let renderer = null;
let labelRenderer = null;
let controls = null;
let raycaster = null;
let pointer = null;
let animationId = null;

// 3D 位置（单一数据源）
const positions = new Map();  // nodeId → THREE.Vector3
let nodeMeshes = [];          // 用于 Raycaster
let hitMeshes = [];           // 隐形命中代理球（覆盖光晕区域，供 Raycaster 拾取）
let labelObjects = [];        // CSS2DObject 标签
let linkLines = [];           // THREE.Line 连线
let allMeshesGroup = null;    // 所有节点 + 连线的父组（方便整体旋转）
let parchmentDome = null;     // 牛皮纸 inside-out 穹顶（替换原星空粒子）
let resizeObserver = null;    // 监听容器从 display:none 变为可见

// 自定义右键旋转状态（桌面右键 + 移动端单指触摸共用）
let isRightDragging = false;
let lastDragX = 0;
let lastDragY = 0;
let dragStartX = 0;       // 按下起点（死区判定用）
let dragStartY = 0;
let dragMoved = false;    // 是否超过死区（区分触摸"轻点选中"与"拖动旋转"）

// 标签去重节流（避免每帧 getBoundingClientRect 触发 reflow 导致卡顿）
let occlusionFrameSkip = 0;
const OCCLUSION_INTERVAL = 4;  // 每 4 帧执行一次去重
const DRAG_DEADZONE_PX = 8;
let activeTouches = 0;    // 当前触摸手指数（双指捏合时交还给 OrbitControls 缩放）
let gestureHadMultitouch = false;  // 本轮手势是否出现过双指（出现过则末尾不触发轻点）

// === 牛皮纸风格 — 学派褐墨色板（深棕主色 + 微偏色调区分学派）===
const SCHOOL_COLORS = {
  // 古希腊 / 古典
  '古典哲学': 0x5a3f28,  '辩证法': 0x5a4428,
  '理念论': 0x6a4630,   '辩证法先驱': 0x5a4428,
  '亚里士多德主义': 0x55402a,

  // 中世纪 / 神学 — 略偏紫褐
  '教父哲学': 0x5a3a3a,  '新柏拉图主义': 0x5a3a44,
  '神学': 0x583838,      '经院哲学': 0x553840,
  '自然神学': 0x5a3f48,  '空性论': 0x4a3a4a,
  '佛教中观派': 0x4a3a4a,

  // 近代理性 — 略偏冷褐灰
  '理性主义': 0x524a3c,  '二元论': 0x564840,
  '泛神论': 0x4e4840,    '单子论': 0x564a42,
  '微积分共同发明者': 0x564a42,
  '经验主义': 0x5c4a32,  '怀疑论': 0x584a3e,
  '社会契约论': 0x5e4a30,'自然主义': 0x504a32,
  '自然主义(卢梭)': 0x5e4a30, '浪漫主义先驱': 0x5e4a30,
  '非物质主义': 0x5a483a,

  // 德国古典 — 略偏红褐
  '德国古典哲学': 0x603828, '先验唯心论': 0x603828,
  '批判哲学': 0x623a28,    '主观唯心论': 0x623a30,
  '主观唯心论(费希特)': 0x623a30,
  '绝对唯心论': 0x603828,  '辩证法(黑格尔)': 0x603828,
  '客观唯心论': 0x5e3a2a,  '客观唯心论(谢林)': 0x5e3a2a,
  '自然哲学': 0x584230,

  // 19 世纪激进 — 偏红褐深
  '意志主义': 0x6a3828,   '悲观主义': 0x663a28,
  '马克思主义': 0x6a3028, '历史唯物主义': 0x683228,
  '辩证唯物主义': 0x6a3028,
  '权力意志': 0x6a3828,   '超人哲学': 0x6a3828,
  '透视主义': 0x683a30,   '后现代先驱': 0x683a30,

  // 20 世纪 — 略偏青褐/绿褐
  '精神分析': 0x4a4a3a,   '深度心理学': 0x4c4c3c,
  '现象学': 0x48463e,     '意识哲学': 0x4a4840,
  '身体现象学': 0x4a4a42, '存在主义': 0x484a3e,
  '荒诞哲学': 0x5a3e30,   '解释学': 0x4c4a40,
  '技术哲学': 0x4a4c40,
  '分析哲学': 0x444a3a,   '维也纳学派': 0x444a3a,
  '逻辑主义': 0x444a3a,   '语言哲学': 0x464a3e,
  '摹状词理论': 0x464a3e, '和平主义': 0x4a4a42,
  '后结构主义': 0x5a3a42, '解构主义': 0x5a3a42,
  '文字学': 0x5a3a42,     '权力/知识': 0x5a3a42,
  '系谱学': 0x5a3a42,     '话语分析': 0x5a3a42,
  '批判理论': 0x583a3e,   '交往理性': 0x583a3e,
  '社会理论': 0x583a3e,   '政治自由主义': 0x4a4448,
  '正义论': 0x4a4448,

  // 东方学派
  '儒家': 0x5c3c20,       '道家': 0x464a32,
  '宋明理学': 0x5a3c24,   '程朱理学': 0x5a3c24,
  '心学': 0x603a22,
};
const PARCHMENT_DEFAULT_COLOR = 0x5a3f28;  // 默认哑光深褐墨

const getSchoolColor = (schoolName) => {
  if (schoolName && SCHOOL_COLORS[schoolName] != null) return SCHOOL_COLORS[schoolName];
  return PARCHMENT_DEFAULT_COLOR;
};

// 颜色工具（牛皮纸化：学派优先深褐墨 → 时代偏置微调）
const getNodeColor = (node) => {
  const c = getSchoolColor(node.school?.[0]);
  return new THREE.Color(c);
};

// === 工具：基于字符串的确定性随机，保证同一节点每次刷新位置相同 ===
function cyrb32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let s = (seed & 0x7fffffff) || 1;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return s / 0xffffffff;
  };
}

// === 3D 位置计算 ===
const computeGalaxyPositions = (nodes, links) => {
  // 均匀体积分布：Fibonacci 球面角 + 立方根半径
  // 数学上保证球体内密度均匀，同时给 era 加微妙的径向偏置（古代略内、当代略外）
  const eras = [...new Set(nodes.map(n => n.era))].sort();
  const eraIndex = {};
  eras.forEach((e, i) => { eraIndex[e] = i / Math.max(eras.length - 1, 1); }); // 0~1

  const N = nodes.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // 黄金角
  const R = 260; // 球体半径继续撑大，给长标签和密集投影留出足够空间

  nodes.forEach((node, idx) => {
    const seed = cyrb32(node.id);
    const rng = seededRandom(seed + idx * 9973);

    // Fibonacci 球面角（均匀角分布，无聚拢）
    const yPos = 1 - (2 * (idx + 0.5)) / N;        // -1 ~ 1
    const phi = Math.acos(yPos);                    // 极角
    const theta = idx * goldenAngle;                // 方位角

    // 体积均匀半径：r = R * cbrt(random)，让球体内部密度均匀
    let r = R * Math.cbrt(rng());

    // era 偏置：古代 *0.85，当代 *1.15，微妙的时间感但不形成空心环
    const bias = 0.85 + 0.3 * (eraIndex[node.era] || 0.5);
    r *= bias;

    // 小 jitter 做微调
    r += (rng() - 0.5) * 14;

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions.set(node.id, new THREE.Vector3(x, y, z));
  });

  // 迭代排斥：节点太近就互相推开，避免名字堆叠
  const MIN_DIST = 38;
  const posList = nodes.map(n => positions.get(n.id));
  for (let iter = 0; iter < 160; iter++) {
    let moved = false;
    for (let i = 0; i < posList.length; i++) {
      for (let j = i + 1; j < posList.length; j++) {
        const p1 = posList[i];
        const p2 = posList[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        if (distSq > 0 && distSq < MIN_DIST * MIN_DIST) {
          const dist = Math.sqrt(distSq);
          const overlap = (MIN_DIST - dist) * 0.48;
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          p1.x -= nx * overlap;
          p1.y -= ny * overlap;
          p1.z -= nz * overlap;
          p2.x += nx * overlap;
          p2.y += ny * overlap;
          p2.z += nz * overlap;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
};

const computeClusterPositions = (nodes) => {
  // 只为实际作为聚类首标签的学派分布球面位置（避免未使用的学派挤占空间）
  const schools = [...new Set(nodes.map(n => n.school[0] || '其他'))];
  const clusterCenters = {};
  schools.forEach((s, i) => {
    // 学校按球面分布
    const phi = Math.acos(-1 + (2 * i) / schools.length);
    const theta = Math.sqrt(schools.length * Math.PI) * phi;
    clusterCenters[s] = new THREE.Vector3(
      Math.cos(theta) * 190,
      Math.sin(theta) * 190 * Math.cos(phi),
      Math.sin(theta) * 190 * Math.sin(phi)
    );
  });

  // 按学派分组，组内环形散开
  const bySchool = {};
  nodes.forEach(n => {
    const s = n.school[0] || '其他';
    if (!bySchool[s]) bySchool[s] = [];
    bySchool[s].push(n);
  });

  Object.entries(bySchool).forEach(([school, members]) => {
    const center = clusterCenters[school] || new THREE.Vector3(0, 0, 0);
    members.forEach((node, i) => {
      const seed = cyrb32(node.id);
      const rng = seededRandom(seed + i * 7919);
      const angle = (i / Math.max(members.length, 1)) * Math.PI * 2 + rng() * 0.45;
      const radius = 24 + Math.sqrt(i) * 8 + rng() * 10;
      const offX = Math.cos(angle) * radius;
      const offZ = Math.sin(angle) * radius;
      const offY = (rng() - 0.5) * 14;
      positions.set(node.id, new THREE.Vector3(
        center.x + offX,
        center.y + offY,
        center.z + offZ
      ));
    });
  });
};

// === 牛皮纸墨晕 Halo 纹理（深褐墨径向扩散，NormalBlending 叠加到星球四周）===
const createParchmentHaloTexture = (size = 128) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  // 中心深褐墨（浓）→ 外圈近透明（模拟墨水滴在牛皮纸上的晕染）
  grad.addColorStop(0,    'rgba(42,22,8,0.72)');
  grad.addColorStop(0.22, 'rgba(58,32,12,0.48)');
  grad.addColorStop(0.48, 'rgba(78,50,22,0.24)');
  grad.addColorStop(0.78, 'rgba(110,80,44,0.08)');
  grad.addColorStop(1,    'rgba(140,110,70,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};
let _parchmentHaloTex = null;
const getSharedParchmentHaloTex = () => {
  if (!_parchmentHaloTex) _parchmentHaloTex = createParchmentHaloTexture(128);
  return _parchmentHaloTex;
};

// 保持旧变量名（兼容），内容改为牛皮纸墨晕
const createStarTexture = () => createParchmentHaloTexture(128);

let starTexture = null;

// === 创建场景 ===
const initScene = () => {
  try {
  // 延迟创建纹理（确保 DOM 环境就绪）
  starTexture = createStarTexture();

  const width = container.value.clientWidth || 800;
  const height = container.value.clientHeight || 600;

  // Scene — 仿古象牙白牛皮纸基调
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0e8d8);
  scene.fog = new THREE.FogExp2(0xe4dcc0, 0.0035);

  // Camera
  camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
  camera.position.set(0, 30, 200);
  camera.lookAt(0, 0, 0);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas.value,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xf0e8d8, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // CSS2D Renderer（标签）
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height, false);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  labelLayer.value.appendChild(labelRenderer.domElement);

  // OrbitControls 只用来滚轮缩放 —— 旋转由自定义 handler 接管（避免万向锁）
  controls = new OrbitControls(camera, canvas.value);
  controls.enableRotate = false;
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.zoomSpeed = 1.2;
  controls.minDistance = 50;
  controls.maxDistance = 500;

  // 阻止右键菜单（关键！否则拖拽到一半弹出菜单打断）
  canvas.value.addEventListener('contextmenu', (e) => e.preventDefault());

  // 自定义拖拽旋转 —— 直接对 allMeshesGroup 做增量四元数旋转
  // 球坐标万向锁消失，水平垂直都是真正无限 360°
  // 桌面端：右键拖拽；移动端：单指触摸拖拽（轻点留给选中，见 pickAt）
  canvas.value.addEventListener('pointerdown', (e) => {
    if (e.button === 2 || e.pointerType === 'touch') {
      if (e.pointerType === 'touch') {
        activeTouches++;
        // 第二根手指落下 → 进入双指捏合，交给 OrbitControls 缩放，且不算轻点
        if (activeTouches > 1) { dragMoved = true; gestureHadMultitouch = true; }
      }
      isRightDragging = true;
      lastDragX = dragStartX = e.clientX;
      lastDragY = dragStartY = e.clientY;
      canvas.value.setPointerCapture(e.pointerId);
      if (e.button === 2) canvas.value.style.cursor = 'grabbing';
    }
  });
  canvas.value.addEventListener('pointermove', (e) => {
    if (!isRightDragging) return;
    // 双指触摸（捏合缩放）时不做旋转，交给 OrbitControls
    if (e.pointerType === 'touch' && activeTouches > 1) return;
    // 死区：位移不足阈值前不旋转（触摸时避免手指微抖导致误旋转）
    if (!dragMoved) {
      const totalX = e.clientX - dragStartX;
      const totalY = e.clientY - dragStartY;
      if (Math.abs(totalX) < DRAG_DEADZONE_PX && Math.abs(totalY) < DRAG_DEADZONE_PX) return;
      dragMoved = true;
    }
    const dx = e.clientX - lastDragX;
    const dy = e.clientY - lastDragY;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    const SPEED = 0.006;
    // 水平拖拽 → 绕 Y 轴旋转；垂直拖拽 → 绕相机的右轴旋转（真正的俯仰）
    allMeshesGroup.rotateY(dx * SPEED);
    // 相机右轴 = 水平方向旋转轴，用 rotateOnAxis 保证不会有万向锁
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(camera.quaternion);
    allMeshesGroup.rotateOnAxis(right, dy * SPEED);
  });
  canvas.value.addEventListener('pointerup', (e) => {
    if (e.button === 2 || e.pointerType === 'touch') {
      const wasTouch = e.pointerType === 'touch';
      const moved = dragMoved;
      const hadMulti = gestureHadMultitouch;
      isRightDragging = false;
      dragMoved = false;
      if (wasTouch) activeTouches = Math.max(0, activeTouches - 1);
      canvas.value.releasePointerCapture?.(e.pointerId);
      if (e.button === 2) canvas.value.style.cursor = '';
      // 触摸轻点（未超过死区、未双指、最后一根手指抬起）→ 点击选中星球
      if (wasTouch && !moved && !hadMulti && activeTouches === 0) pickAt(e);
      if (activeTouches === 0) gestureHadMultitouch = false;
    }
  });
  canvas.value.addEventListener('pointercancel', () => {
    isRightDragging = false;
    dragMoved = false;
    activeTouches = 0;
    gestureHadMultitouch = false;
  });

  // 光照 — 牛皮纸哑光三件套（零发光 emissive，纯漫反射均匀照明）
  const ambientLight = new THREE.AmbientLight(0xf4eed8, 1.0);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(60, 120, 80);
  scene.add(dirLight);
  const hemiLight = new THREE.HemisphereLight(0xf4eed8, 0xd4ccc0, 0.3);
  scene.add(hemiLight);

  // 主容器组（穹顶+节点+连线都装进来，整体旋转不脱节）
  allMeshesGroup = new THREE.Group();
  scene.add(allMeshesGroup);

  // 牛皮纸 inside-out 穹顶（替换原星空粒子背景）
  createParchmentDome();

  // Raycaster
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // 事件绑定
  canvas.value.addEventListener('pointerdown', onPointerDown);
  canvas.value.addEventListener('pointermove', onPointerMove);
  window.addEventListener('resize', handleResize);

  buildGalaxy();

  animate();
  } catch (err) {
    console.error('initScene error:', err);
  }
};

// === 牛皮纸选择态：虚线圆环（48 段 LineLoop + LineDashedMaterial）===
const createDashedSelectionRing = (sphereR = 0.75) => {
  const ringR = sphereR * 1.85;   // 比星球略大一圈做墨圈
  const geo = new THREE.BufferGeometry();
  const segments = 48;
  const verts = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    verts[i * 3 + 0] = Math.cos(a) * ringR;
    verts[i * 3 + 1] = Math.sin(a) * ringR;
    verts[i * 3 + 2] = 0;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.LineDashedMaterial({
    color: 0x3a2008,
    dashSize: 0.18,
    gapSize: 0.14,
    transparent: true,
    opacity: 0,          // 默认隐形
    depthWrite: false,
  });
  const line = new THREE.LineLoop(geo, mat);
  // ⚠ LineDashedMaterial 必调 computeLineDistances() 否则虚线不显
  line.computeLineDistances();
  line.userData._isSelectionRing = true;
  line.userData._origScale = 1.0;
  return line;
};


const createParchmentDomeTexture = (size = 2048) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  // 1) 基础象牙白径向渐变：中心浅→边缘略深
  const baseGrad = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.72);
  baseGrad.addColorStop(0,    '#f6efdc');
  baseGrad.addColorStop(0.45, '#efe6cf');
  baseGrad.addColorStop(0.80, '#e6dcc1');
  baseGrad.addColorStop(1,    '#d8ccae');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // 2) multiply 四角暗角 vignette
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const vig = ctx.createRadialGradient(cx, cy, size * 0.30, cx, cy, size * 0.78);
  vig.addColorStop(0,    'rgba(255,255,255,1)');
  vig.addColorStop(0.55, 'rgba(230,220,190,1)');
  vig.addColorStop(0.85, 'rgba(180,160,115,1)');
  vig.addColorStop(1,    'rgba(130,110,75,1)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // 3) 叠加 ~6000 条纤维噪点（纸浆纹理，偏褐黄）
  ctx.save();
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 1 + Math.random() * 3;
    const h = 0.6 + Math.random() * 2.2;
    const alpha = 0.05 + Math.random() * 0.18;
    // 褐黄色系，轻微色相抖动
    const r = 128 + (Math.random() * 28 | 0);
    const g = 112 + (Math.random() * 24 | 0);
    const b = 72  + (Math.random() * 20 | 0);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // 再加一层稀疏的深褐小点（霉点/老旧污点）
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 1.4;
    const alpha = 0.12 + Math.random() * 0.22;
    ctx.fillStyle = `rgba(92,68,38,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
};

let _parchmentDomeTex = null;
const getSharedParchmentDomeTex = () => {
  if (!_parchmentDomeTex) _parchmentDomeTex = createParchmentDomeTexture(2048);
  return _parchmentDomeTex;
};

// === 屏幕空间标签去重：每帧隐藏重叠的低优先级标签 ===
const updateLabelOcclusion = () => {
  if (!camera || labelObjects.length === 0) return;

  const selectedId = props.selectedId;
  const hitSet = new Set(props.searchHitIds);
  const camPos = camera.position;
  const occupied = [];
  const PADDING_X = 8;
  const PADDING_Y = 5;

  // 收集当前可见 label 的屏幕矩形、距离和优先级
  const candidates = [];
  labelObjects.forEach((label) => {
    if (!label.visible) return;
    const el = label.element;
    if (!el || el.style.display === 'none') return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const worldPos = new THREE.Vector3();
    label.getWorldPosition(worldPos);
    const dist = worldPos.distanceTo(camPos);

    let priority = 0;
    const id = label.userData.nodeId;
    if (id === selectedId) priority += 2000;
    if (hitSet.has(id)) priority += 1000;
    priority += (label.userData.degree || 0) * 30;
    // 名字短的更有价值显示完整
    const textLen = (el.textContent || '').length;
    priority -= textLen * 2;

    candidates.push({ label, rect, dist, priority });
  });

  // 优先级高 → 显示；同优先级距离近优先；名字短优先
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (Math.abs(a.dist - b.dist) > 0.1) return a.dist - b.dist;
    return (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
  });

  candidates.forEach((item) => {
    const r = item.rect;
    let overlaps = false;
    for (const o of occupied) {
      if (!(
        r.right + PADDING_X < o.left - PADDING_X ||
        r.left - PADDING_X > o.right + PADDING_X ||
        r.bottom + PADDING_Y < o.top - PADDING_Y ||
        r.top - PADDING_Y > o.bottom + PADDING_Y
      )) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      item.label.element.style.opacity = '0';
      item.label.element.style.pointerEvents = 'none';
    } else {
      item.label.element.style.opacity = '1';
      // 标签始终不拦截鼠标事件，让点击穿透到 canvas 触发节点选中
      item.label.element.style.pointerEvents = 'none';
      occupied.push(r);
    }
  });
};

// inside-out 大球壳 R=360，把玩家包在牛皮纸里，节点分布在 R=260 内不会穿出
const createParchmentDome = () => {
  const tex = getSharedParchmentDomeTex();
  const geo = new THREE.SphereGeometry(360, 48, 36);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    depthWrite: false,
  });
  parchmentDome = new THREE.Mesh(geo, mat);
  parchmentDome.renderOrder = 0;
  allMeshesGroup.add(parchmentDome);
};

// === 构建星系节点和连线 ===
const buildGalaxy = () => {
  // 清理旧的
  if (allMeshesGroup) {
    allMeshesGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    // 只清理节点/连线/选择环 —— 跳过穹顶
    const KEEP = [parchmentDome].filter(Boolean);
    for (let i = allMeshesGroup.children.length - 1; i >= 0; i--) {
      const child = allMeshesGroup.children[i];
      if (!KEEP.includes(child)) allMeshesGroup.remove(child);
    }
  }
  // 清理标签 DOM
  labelObjects.forEach(l => {
    if (l.parent) l.parent.remove(l);
  });
  labelObjects = [];
  nodeMeshes = [];
  hitMeshes = [];
  linkLines = [];
  positions.clear();

  // 计算每个节点的连接度（用于标签优先级）
  const nodeDegreeMap = {};
  props.nodes.forEach(n => { nodeDegreeMap[n.id] = 0; });
  props.links.forEach(l => {
    if (nodeDegreeMap[l.source] != null) nodeDegreeMap[l.source]++;
    if (nodeDegreeMap[l.target] != null) nodeDegreeMap[l.target]++;
  });

  // 计算 3D 位置
  if (props.viewMode === 'cluster') {
    computeClusterPositions(props.nodes);
  } else {
    computeGalaxyPositions(props.nodes, props.links);
  }

  // 创建节点
  props.nodes.forEach((node) => {
    const pos = positions.get(node.id);
    if (!pos) return;
    const color = getNodeColor(node);

    // 节点球体（牛皮纸哑光深褐墨球，零 emissive）
    // 半径 0.75 → 1.4：球壳 R 撑大后节点显得小，同步放大保持视觉一致
    const geo = new THREE.SphereGeometry(1.4, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.95,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.userData = {
      nodeId: node.id,
      philosopher: node,
      _origColor: color.clone(),       // 牛皮纸原始色
      _origScale: 1.0,                  // 基础 scale
    };
    allMeshesGroup.add(mesh);
    nodeMeshes.push(mesh);

    // 虚线选择环（默认隐形；applySelectionStyle 控制显示）
    // ring 半径从 0.75 → 1.4，与星球同步放大
    const ring = createDashedSelectionRing(1.4);
    // 挂在 allMeshesGroup 下，与星球同坐标（每帧 ring.lookAt 相机做 billboard）
    ring.position.copy(mesh.position);
    ring.userData.nodeId = node.id;
    ring.userData._followMesh = mesh;
    allMeshesGroup.add(ring);
    mesh.userData._selectionRing = ring;
    // 备份环 userData._ringOrigOpacity（主循环 sin 脉动会用到）
    ring.material.userData = { _origOpacity: 0.60 };

    // 牛皮纸墨晕 sprite（NormalBlending 零发光，叠在星球外做墨晕）
    const haloTex = getSharedParchmentHaloTex();
    const spriteMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0x3a2008,           // 深褐墨统一色调（不按学派，统一牛皮纸墨色）
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      opacity: 0.72,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(9.0, 9.0, 1);
    sprite.userData = {
      _origOpacity: 0.72,
      _origScale: 9.0,
      _isHalo: true,
    };
    mesh.add(sprite);
    mesh.userData._halo = sprite;

    // 隐形命中代理球：用户看到的"星"主要是半径 ~4.5 的墨晕 sprite，
    // 但 Raycaster 原先只对半径 1.4 的球体生效，点到光晕外围会 miss（详情页不弹出）。
    // material.visible=false → 不渲染但仍可被射线命中（three r160 Mesh.raycast 不检查 visible）。
    // 单独存 hitMeshes，勿并入 nodeMeshes，避免选中动画对它缩放/变色。
    const hitGeo = new THREE.SphereGeometry(4.0, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitProxy = new THREE.Mesh(hitGeo, hitMat);
    hitProxy.position.copy(pos);
    hitProxy.userData = { nodeId: node.id, philosopher: node };
    allMeshesGroup.add(hitProxy);
    hitMeshes.push(hitProxy);

    // CSS2D 标签（衬线深褐墨色 + 象牙白柔光字影）
    const labelDiv = document.createElement('div');
    labelDiv.className = 'label-node';
    const nameCnEl = document.createElement('span');
    nameCnEl.className = 'name-cn';
    nameCnEl.textContent = node.name;
    const brEl = document.createElement('br');
    const nameEnEl = document.createElement('span');
    nameEnEl.className = 'name-en';
    nameEnEl.textContent = node.nameEn;
    labelDiv.appendChild(nameCnEl);
    labelDiv.appendChild(brEl);
    labelDiv.appendChild(nameEnEl);

    const label = new CSS2DObject(labelDiv);
    label.position.set(0, 4.5, 0);  // halo sprite scale=9 → 标签上移到 halo 顶部之上
    label.userData.nodeId = node.id;
    label.userData.degree = nodeDegreeMap[node.id] || 0;
    mesh.add(label);
    labelObjects.push(label);
    // 保存引用（Task7 选中态加深刻度）
    mesh.userData._labelDiv = labelDiv;
    mesh.userData._nameCnEl = nameCnEl;
    mesh.userData._nameEnEl = nameEnEl;
  });

  // 创建连线（牛皮纸风格：influence 深褐实线 / opposition 红褐虚线）
  props.links.forEach((link) => {
    const pos1 = positions.get(link.source);
    const pos2 = positions.get(link.target);
    if (!pos1 || !pos2) return;

    const geom = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
    const isInfluence = link.type === 'influence';
    let mat;
    if (isInfluence) {
      mat = new THREE.LineBasicMaterial({
        color: 0x6a4a28,
        transparent: true,
        opacity: 0.55,
      });
    } else {
      mat = new THREE.LineDashedMaterial({
        color: 0x8a3a38,
        dashSize: 0.5,
        gapSize: 0.4,
        transparent: true,
        opacity: 0.50,
      });
    }
    const line = new THREE.Line(geom, mat);
    // ⚠ LineDashedMaterial 必调 computeLineDistances() 否则虚线不显示
    if (!isInfluence) line.computeLineDistances();
    line.userData.baseOpacity = isInfluence ? 0.55 : 0.50;
    line.userData._isOpposition = !isInfluence;
    allMeshesGroup.add(line);
    linkLines.push(line);
  });
};

// === 选择高亮（牛皮纸语言：放大 + 墨晕呼吸 + 虚线圈，三层叠加）===
const applySelectionStyle = () => {
  const selectedId = props.selectedId;
  const hitSet = new Set(props.searchHitIds);

  // 选中节点的关联 ID
  let relatedIds = new Set();
  if (selectedId) {
    relatedIds.add(selectedId);
    props.links.forEach(l => {
      if (l.source === selectedId) relatedIds.add(l.target);
      if (l.target === selectedId) relatedIds.add(l.source);
    });
  }

  const hasHits = hitSet.size > 0;
  // 非命中星球淡化目标色（接近象牙白牛皮纸）
  const parchmentFade = new THREE.Color(0xdcd4b8);

  nodeMeshes.forEach((mesh) => {
    const id = mesh.userData.nodeId;
    const mat = mesh.material;
    const halo = mesh.userData._halo;
    const ring = mesh.userData._selectionRing;
    const nameCnEl = mesh.userData._nameCnEl;
    const nameEnEl = mesh.userData._nameEnEl;
    const labelDiv = mesh.userData._labelDiv;

    // 标签 class 状态（控制英文名是否显示 + 选中态高亮）
    if (labelDiv) {
      labelDiv.classList.remove('is-active', 'is-hot', 'is-related');
    }

    // Step A：先还原（作为兜底）
    mesh.scale.set(1.0, 1.0, 1.0);
    mat.color.copy(mesh.userData._origColor);
    let sphereScaleHit = 1.0;   // 主循环 sin 时的基础倍率
    let haloScaleHit = 1.0;
    let ringScaleHit = 1.0;
    let ringVisible = false;

    if (halo) {
      halo.scale.set(halo.userData._origScale, halo.userData._origScale, 1);
      halo.material.opacity = halo.userData._origOpacity;
    }
    if (ring) {
      ring.scale.set(1, 1, 1);
      ring.material.opacity = 0;
    }
    if (nameCnEl) {
      nameCnEl.style.fontWeight = '600';
      nameCnEl.style.color = '';
    }
    if (nameEnEl) {
      nameEnEl.style.color = '';
    }

    // Step B：选中态（最高优先级）—— 三层最大
    if (selectedId) {
      if (id === selectedId) {
        sphereScaleHit = 2.2;
        haloScaleHit  = 1.3;
        ringScaleHit  = 1.1;
        ringVisible = true;
        if (labelDiv) labelDiv.classList.add('is-active');
        if (nameCnEl) {
          nameCnEl.style.fontWeight = '700';
          nameCnEl.style.color = '#2a1008';
        }
        if (nameEnEl) {
          nameEnEl.style.color = '#5a4a28';
        }
      } else if (relatedIds.has(id)) {
        // 关联节点：轻微放大墨圈浅显
        sphereScaleHit = 1.2;
        haloScaleHit  = 1.08;
        if (labelDiv) labelDiv.classList.add('is-related');
      } else {
        // 非关联：大幅缩小 + 颜色 lerp 近象牙白
        sphereScaleHit = 0.4;
        haloScaleHit  = 0.5;
        mat.color.lerpColors(mesh.userData._origColor, parchmentFade, 0.72);
      }
    } else if (hasHits) {
      // Step C：搜索命中
      if (hitSet.has(id)) {
        sphereScaleHit = 2.0;
        haloScaleHit  = 1.2;
        ringScaleHit  = 1.0;
        ringVisible = true;
        if (labelDiv) labelDiv.classList.add('is-hot');
        if (nameCnEl) {
          nameCnEl.style.fontWeight = '700';
          nameCnEl.style.color = '#2a1008';
        }
      } else {
        // 非命中：缩小 0.4 + 墨晕 0.5 + 颜色淡化近象牙白
        sphereScaleHit = 0.4;
        haloScaleHit  = 0.5;
        if (halo) halo.material.opacity = halo.userData._origOpacity * 0.15;
        mat.color.lerpColors(mesh.userData._origColor, parchmentFade, 0.72);
      }
    }

    // 将基础倍率写入 userData，主循环 sin 脉动读取叠加
    mesh.userData._selSphereS = sphereScaleHit;
    mesh.userData._selHaloS   = haloScaleHit;
    mesh.userData._selRingS   = ringScaleHit;
    mesh.userData._selRingVis = ringVisible;

    // 默认首帧先按基础倍率初始化（主循环会覆盖带 sin 脉动）
    mesh.scale.set(sphereScaleHit, sphereScaleHit, sphereScaleHit);
    if (halo) {
      const hs = haloScaleHit * halo.userData._origScale;
      halo.scale.set(hs, hs, 1);
    }
    if (ring) {
      ring.scale.set(ringScaleHit, ringScaleHit, ringScaleHit);
      ring.material.opacity = ringVisible ? 0.60 : 0;
    }
  });

  // 连线高亮
  linkLines.forEach((line) => {
    const geom = line.geometry;
    if (geom.attributes.position.count >= 2) {
      const p1 = new THREE.Vector3().fromBufferAttribute(geom.attributes.position, 0);
      const p2 = new THREE.Vector3().fromBufferAttribute(geom.attributes.position, 1);
      let id1 = null, id2 = null;
      for (const m of nodeMeshes) {
        if (m.position.distanceTo(p1) < 0.1) id1 = m.userData.nodeId;
        if (m.position.distanceTo(p2) < 0.1) id2 = m.userData.nodeId;
        if (id1 && id2) break;
      }
      const mat = line.material;
      const base = line.userData.baseOpacity ?? 0.5;
      let opacity = base;
      if (selectedId) {
        if (id1 === selectedId || id2 === selectedId) {
          opacity = Math.min(1.0, base * 1.7);
        } else {
          opacity = base * 0.12;
        }
      } else if (hasHits) {
        if (hitSet.has(id1) && hitSet.has(id2)) {
          opacity = Math.min(1.0, base * 1.8);
        } else {
          opacity = base * 0.05;
        }
      }
      mat.opacity = opacity;
      // 保存给 animate 主循环乘距离 lineFade
      line.userData._highlightOpacity = opacity;
    }
  });
};

// === 指针事件 ===
const onPointerDown = (event) => {
  // 左键点击 → Raycaster 检测星球
  if (event.button !== 0) return;
  // 触摸：不在按下时立即选中（拖动旋转 vs 轻点选中在 pointerup 里判定）
  if (event.pointerType === 'touch') return;
  pickAt(event);
};

// 射线拾取：点中星球 → 通知父组件；点空白 → 通知取消选中
const pickAt = (event) => {
  const rect = canvas.value.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObjects([...nodeMeshes, ...hitMeshes], false);
  if (intersects.length > 0) {
    const hit = intersects[0];
    emit('nodeClick', hit.object.userData.philosopher);
  } else {
    emit('nodeClick', null);
  }
};

const onPointerMove = (event) => {
  // 触摸设备没有 hover，拖动时不显示 tooltip
  if (event.pointerType === 'touch') {
    tooltipVisible.value = false;
    return;
  }
  const rect = canvas.value.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObjects([...nodeMeshes, ...hitMeshes], false);
  if (intersects.length > 0) {
    tooltipData.value = intersects[0].object.userData.philosopher;
    tooltipVisible.value = true;
    tooltipStyle.value = {
      left: (event.clientX - rect.left + 14) + 'px',
      top: (event.clientY - rect.top + 14) + 'px',
    };
    canvas.value.style.cursor = 'pointer';
  } else {
    tooltipVisible.value = false;
    canvas.value.style.cursor = '';
  }
};

// === 视角控制 ===
const resetView = () => {
  camera.position.set(0, 30, 200);
  controls.target.set(0, 0, 0);
  allMeshesGroup.rotation.set(0, 0, 0);
  controls.update();
  autoRotate.value = false;
};

const toggleAutoRotate = () => {
  autoRotate.value = !autoRotate.value;
};

const handleResize = () => {
  if (!container.value || !renderer || !labelRenderer) return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  if (w <= 0 || h <= 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h, false);
};

// === 主循环 ===
const animate = () => {
  animationId = requestAnimationFrame(animate);
  try {
    controls.update();

    // 自动自转
    if (autoRotate.value && allMeshesGroup) {
      allMeshesGroup.rotation.y += 0.0015;  // 速度减半，减少自转时的 GPU 压力
    }

    // 根据相机距离控制标签可见性 + 远处标签自然淡出
    const camDist = camera.position.length();
    const SHOW_ALL_LABELS = 340;
    const SHOW_SELECTED_ONLY = 520;
    // 远处标签淡出区间：节点距相机 < FADE_NEAR 全显示，> FADE_FAR 全消失
    const FADE_NEAR = 220;
    const FADE_FAR = 360;
    // 远→近的连线淡入系数 (0~1)
    const lineFade = Math.max(0, Math.min(1, (SHOW_SELECTED_ONLY - camDist) / (SHOW_SELECTED_ONLY - 70)));

    const hitSet2 = new Set(props.searchHitIds);
    const camPos = camera.position;
    // 自转时按相机距离统一淡出：避免每帧 105 次 getWorldPosition，减少 DOM 更新
    const autoRotateOpacity = autoRotate.value
      ? Math.max(0.35, 1 - (camDist / SHOW_ALL_LABELS)).toFixed(2)
      : null;

    labelObjects.forEach((label) => {
      if (camDist < SHOW_ALL_LABELS) {
        label.visible = true;
        const id = label.userData.nodeId;
        const isHighlighted = (props.selectedId === id) || hitSet2.has(id);
        if (isHighlighted) {
          label.element.style.opacity = '1';
        } else if (autoRotate.value) {
          label.element.style.opacity = autoRotateOpacity;
        } else {
          const worldPos = new THREE.Vector3();
          label.getWorldPosition(worldPos);
          const d = worldPos.distanceTo(camPos);
          const t = Math.max(0, Math.min(1, (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
          label.element.style.opacity = (1 - t).toFixed(2);
        }
      } else if (camDist < SHOW_SELECTED_ONLY) {
        label.visible = !!props.selectedId && label.userData.nodeId === props.selectedId;
        if (label.visible) label.element.style.opacity = '1';
      } else {
        label.visible = false;
        label.element.style.opacity = '0';
      }
    });

    linkLines.forEach((line) => {
      // 保留 applySelectionStyle 设置的高亮倍率；这里再乘距离淡入
      const base = line.userData._highlightOpacity ?? line.userData.baseOpacity ?? 0.5;
      line.material.opacity = base * lineFade;
    });

    // 虚线圈 billboard（每帧朝向相机）— 同时跟随对应星球位移
    nodeMeshes.forEach((mesh) => {
      const ring = mesh.userData._selectionRing;
      if (ring) {
        ring.position.copy(mesh.position);
        ring.lookAt(camera.getWorldPosition(new THREE.Vector3()));
      }
    });

    // 选中 / 搜索命中 三层脉动（球面缩放 + 墨晕呼吸 + 虚线圈呼吸）
    const t = Date.now() * 0.005;
    const sinPulse = (Math.sin(t) + 1) * 0.5;   // 0 ~ 1
    const hitSet = new Set(props.searchHitIds);
    const doPulse = props.selectedId || hitSet.size > 0;

    nodeMeshes.forEach((mesh) => {
      const baseS = mesh.userData._selSphereS ?? 1.0;
      const halo  = mesh.userData._halo;
      const ring  = mesh.userData._selectionRing;
      const baseH = mesh.userData._selHaloS ?? 1.0;
      const baseR = mesh.userData._selRingS ?? 1.0;
      const ringVis = !!mesh.userData._selRingVis;

      let s, hs, rs, ringOp;
      if (doPulse && (
        (props.selectedId && mesh.userData.nodeId === props.selectedId) ||
        (!props.selectedId && hitSet.has(mesh.userData.nodeId))
      )) {
        // 三层呼吸叠加
        s  = baseS * (1.0 + 0.60 * sinPulse);
        hs = baseH * (1.0 + 0.25 * sinPulse);
        rs = baseR * (1.0 + 0.22 * sinPulse);
        ringOp = ringVis ? (0.60 + 0.35 * sinPulse) : 0;
        if (halo) {
          halo.material.opacity = halo.userData._origOpacity * (0.75 + 0.35 * sinPulse);
        }
      } else {
        // 非脉动节点：静态 base
        s  = baseS;
        hs = baseH;
        rs = baseR;
        ringOp = ringVis ? 0.60 : 0;
      }

      mesh.scale.set(s, s, s);
      if (halo) {
        const hAbs = hs * halo.userData._origScale;
        halo.scale.set(hAbs, hAbs, 1);
      }
      if (ring) {
        ring.scale.set(rs, rs, rs);
        ring.material.opacity = ringOp;
      }
    });

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    // 标签去重已临时禁用：每帧 105 个 getBoundingClientRect + O(n²) 比较是卡顿元凶
    // 现在依赖布局参数（R=260, MIN_DIST=38）+ 小字号 + 隐藏英文名 来减少重叠
  } catch (err) {
    console.error('animate error:', err);
  }
};

// === Watchers ===
watch(() => props.viewMode, () => {
  buildGalaxy();
  nextTick(applySelectionStyle);
});

watch(() => props.selectedId, () => {
  applySelectionStyle();
});

// 搜索结果变化时重新高亮
watch(() => props.searchHitIds, () => {
  applySelectionStyle();
}, { deep: true });

// 当后端数据拉到（nodes/links 从 fallback 换成真实 API 数据）时重建
watch(() => [props.nodes, props.links], () => {
  if (props.nodes.length > 0 && allMeshesGroup) {
    buildGalaxy();
    nextTick(applySelectionStyle);
  }
}, { deep: true });

// === 生命周期 ===
onMounted(() => {
  nextTick(() => {
    const w = container.value?.clientWidth || 0;
    const h = container.value?.clientHeight || 0;
    if (w > 0 && h > 0) {
      initScene();
    } else {
      // StarMap 初始被 v-show="false" 隐藏（App.vue 欢迎页），clientWidth/Height 为 0
      // 用 ResizeObserver 等容器真正显示后再初始化 Three.js，否则 labelRenderer 和
      // renderer 的尺寸不一致会导致标签投影错位、名字与节点分离。
      resizeObserver = new ResizeObserver((entries) => {
        if (scene) return; // 已经初始化过就不再重复
        const cr = entries[0]?.contentRect;
        if (cr && cr.width > 0 && cr.height > 0) {
          initScene();
        }
      });
      resizeObserver.observe(container.value);
    }
  });
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  if (canvas.value) {
    canvas.value.removeEventListener('pointerdown', onPointerDown);
    canvas.value.removeEventListener('pointermove', onPointerMove);
  }
  if (controls) controls.dispose();
  if (renderer) renderer.dispose();
  if (scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
});
</script>

<style scoped>
.canvas-area {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.label-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

:deep(.label-node) {
  text-align: center;
  pointer-events: none;
  transform: translate(-50%, -100%);
  line-height: 1.3;
}

:deep(.label-node .name-cn) {
  font-size: 11px;
  font-weight: 600;
  font-family: "Georgia", "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  letter-spacing: 1px;
  color: #3a2008;
  /* 象牙白柔光字影（牛皮纸上油墨立体凸起感） */
  text-shadow: 0 1px 0 rgba(248,242,222,0.85), 0 0 6px rgba(244,238,216,0.6);
  white-space: nowrap;
}

/* 英文名默认隐藏，只在选中/搜索时显示（避免占地太大重叠） */
:deep(.label-node .name-en) {
  display: none;
  font-size: 9px;
  color: #7a6a48;
  font-style: italic;
  font-family: "Georgia", "Times New Roman", "Noto Serif SC", serif;
  letter-spacing: 0.6px;
  text-shadow: 0 1px 0 rgba(248,242,222,0.7), 0 0 4px rgba(244,238,216,0.45);
  white-space: nowrap;
}

/* 选中/搜索命中的节点显示英文名（高优先级标签更具识别度） */
:deep(.label-node.is-active .name-en),
:deep(.label-node.is-hot .name-en) {
  display: inline;
}

/* 右下角按钮容器：重置视角 / 自动自转 */
.starmap-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  gap: 6px;
  z-index: 10;
  pointer-events: auto;
}

/* 右下角按钮：牛皮纸象牙白风格 */
.view-btn {
  font-family: "Georgia", "Times New Roman", "Noto Serif SC", "Songti SC", serif;
  font-size: 11px;
  letter-spacing: 1px;
  color: #4a2f18;
  background: linear-gradient(180deg, #f3ead2 0%, #e7dcc0 100%);
  border: 1px solid #a08a68;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 3px rgba(90,60,24,0.18);
  transition: all 0.18s ease;
}
.view-btn:hover {
  background: linear-gradient(180deg, #f7efd9 0%, #ede1c4 100%);
  border-color: #8a6a48;
}
.view-btn.active {
  background: linear-gradient(180deg, #5a3a20 0%, #3a2008 100%);
  color: #f4eed8;
  border-color: #3a2008;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.35);
}

.tooltip {
  position: absolute;
  z-index: 20;
  pointer-events: none;
  font-family: "Georgia", "Times New Roman", "Noto Serif SC", serif;
  color: #3a2008;
  background: linear-gradient(180deg, rgba(246,239,220,0.96), rgba(232,222,196,0.96));
  border: 1px solid #a08a68;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  letter-spacing: 0.5px;
  line-height: 1.5;
  box-shadow: 0 2px 8px rgba(90,60,24,0.2), inset 0 0 6px rgba(160,130,80,0.12);
}

.tooltip-core {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #a08a68;
  opacity: .85;
  max-width: 260px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.6;
}
@media (max-width: 640px) {
  .starmap-controls {
    bottom: 16px;
    right: 10px;
    flex-direction: column;
    gap: 6px;
  }
  .starmap-controls .view-btn {
    padding: 5px 8px;
    font-size: 10px;
  }
  /* 星球名字标签在窄屏略缩小，减少互相遮挡 */
  :deep(.label-node .name-cn) { font-size: 11px; }
  :deep(.label-node .name-en) { display: none; }
}
</style>

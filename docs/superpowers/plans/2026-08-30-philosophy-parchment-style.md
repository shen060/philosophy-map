# 哲学星图 → 牛皮纸活点地图（仿古象牙白）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 3D 深空星云风格的哲学星图 100% 保留交互骨架前提下，整体替换为「仿古象牙白牛皮纸 + 深褐墨色」哈利波特活点地图视觉风格，并新增 3D 空间脚印轨迹特效（鼠标旋转/缩放时留一串左右脚交替渐隐脚印）。

**Architecture:** 严格采用「局部参数替换 + 新增函数/几何」的非侵入式改造：不动相机初始化、不动自定义旋转骨架、不动 OrbitControls、不动 Fibonacci 球面分布算法；只改颜色/材质/外层新增穹顶几何、标签样式 CSS、新增脚印池对象及触发链路、UI 样式 CSS。

**Tech Stack:** Vue 3 (`<script setup>` Composition API) + Vite + Three.js v0.160 + CSS2DRenderer + Express 后端(0 改动)。

---

## 前置准备（所有 Task 共用）

- 工作目录：`d:\KimiData\kimi\Workspaces\philosophy`
- 前端工程根：`d:\KimiData\kimi\Workspaces\philosophy\philosophy-map`
- 构建验证命令（每 2~3 个 Task 跑一次）：
  ```powershell
  $env:PATH = [Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH","User")
  cd philosophy-map; npm run build
  ```
  预期：`✓ built in xxxms`，无 Identifier redeclared / 引用 undefined 等错误。
- 浏览器手动验证地址（构建后重启 dev server 或直接访问运行中的）：`http://localhost:5173/`

---

## Task 1: StarMap.vue — 场景基调（灯光三件套 + 背景色 + 雾色象牙白化）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — initScene / initRenderer / initFog 相关区段

**⚠️ 不改动的锚点（严禁替换）**：相机 `camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 2000)`、camera.position.z=200、renderer 尺寸/resize 逻辑、OrbitControls.enableRotate=false/minDistance=50/maxDistance=500。

- [ ] **Step 1: Read StarMap.vue 开头的 init 段，找到 scene 背景/雾/灯光（如果有）的确切位置**

  用 Read 读 StarMap.vue 前 180 行（initScene 内 scene = ... / scene.background = ... / new THREE.FogExp2 / scene.add(light) 或类似）。确认当前 scene.background 是否是黑色、FogExp2 参数、是否已有灯光。

- [ ] **Step 2: 替换背景色与雾色**

  把原背景色（如 0x05081a / '#05081a' 或深色）和 FogExp2 的参数替换为：
  ```js
  // 仿古象牙白场景基色
  scene.background = new THREE.Color(0xf0e8d8); // #f0e8d8 浅象牙
  scene.fog = new THREE.FogExp2(0xe4dcc0, 0.0035); // 中象牙雾，密度比原 0.004 稍淡
  ```
  **保留**原 renderer.setClearColor 的兜底（若有）颜色改为 0xf0e8d8 或干脆删除兜底（scene.background 已设）。

- [ ] **Step 3: 新增灯光三件套（适配 MeshStandardMaterial 哑光）**

  在 initScene 末尾（allMeshesGroup 被 scene.add 之后）追加：
  ```js
  // === 牛皮纸风格灯光（哑光墨球需要被照亮） ===
  const ambientLight = new THREE.AmbientLight(0xf4eed8, 1.0); // 浅象牙环境光强
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.4); // 轻微方向阴影层次
  dirLight.position.set(50, 80, 60);
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0xf4eed8, 0xd4ccc0, 0.3); // 天地半球柔和补光
  scene.add(hemiLight);
  ```
  新增后 scene.children 中灯光 ID 顺序不敏感，只要都在 scene 里即可。

- [ ] **Step 4: 确保 renderer.outputColorSpace 正确（防止牛皮纸颜色偏蓝灰）**

  在 `renderer = new THREE.WebGLRenderer(...)` 后面追加或修改：
  ```js
  renderer.outputColorSpace = THREE.SRGBColorSpace; // Three.js v0.160 默认可能是 SRGB，保险起见显式设置
  ```

- [ ] **Step 5: 构建验证**

  跑 `npm run build`，预期 350ms 左右 PASS。打开浏览器：背景不应再是黑色，应该是浅象牙白+中象牙雾的空间，星球虽然还发光（还没换材质）但整体不再糊进黑空里。

---

## Task 2: StarMap.vue — 移除星空粒子层 + 新增牛皮纸穹顶（inside-out Canvas 纸纹）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — createStarTexture 函数、星空粒子 Points 创建段、buildGalaxy 内添加粒子到 scene 的代码

- [ ] **Step 1: 定位原星空粒子相关的 3 个代码块**

  Read StarMap.vue 中：(a) `function createStarTexture() {...}`（或类似名字的生成白色星星 radial canvas 纹理函数）；(b) `const starGeo = new THREE.BufferGeometry()` + 星星位置填充 + PointsMaterial 创建 + `const stars = new THREE.Points(starGeo, starMat)`；(c) `scene.add(stars)` 或 `allMeshesGroup.add(stars)`。

- [ ] **Step 2: 写 createParchmentDomeTexture(w, h) 替换原 createStarTexture**

  在 `<script setup>` 里把整个 `createStarTexture` 函数删除，替换为：
  ```js
  /**
   * 生成牛皮纸穹顶贴图：径向渐变象牙白 + 四角暗角 + 纸噪点颗粒
   * @param {number} w 纹理宽
   * @param {number} h 纹理高
   * @returns {THREE.CanvasTexture}
   */
  function createParchmentDomeTexture(w = 2048, h = 2048) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // 1) 径向渐变：中央浅象牙 → 60% 中象牙 → 边缘深象牙
    const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.02, w/2, h/2, Math.max(w,h)*0.72);
    grad.addColorStop(0.0, '#f4eed8'); // 浅
    grad.addColorStop(0.60, '#e4dcc0'); // 中
    grad.addColorStop(1.0, '#c0b898'); // 深（边缘）
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2) 四角暗角 vignette（multiply 叠加不改变中央色）
    ctx.globalCompositeOperation = 'multiply';
    const vig = ctx.createRadialGradient(w/2, h/2, Math.max(w,h)*0.20, w/2, h/2, Math.max(w,h)*0.72);
    vig.addColorStop(0.0, 'rgba(255,255,255,1)');
    vig.addColorStop(0.55, 'rgba(220,210,180,0.92)');
    vig.addColorStop(1.0, 'rgba(100,80,40,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // 3) 纸噪点 / 纤维颗粒（6000 个浅褐小点，半透明）
    for (let i = 0; i < 6000; i++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      const s = Math.random() < 0.15 ? 2 : 1; // 少量 2px 纤维
      const alpha = 0.10 + Math.random() * 0.30;
      ctx.fillStyle = `rgba(140,120,80,${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, s, s);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; // 防接缝
    return tex;
  }
  ```

- [ ] **Step 3: 写 createParchmentDome() 创建 inside-out 球壳 Mesh**

  紧跟上一步的 texture 函数后追加：
  ```js
  /**
   * 牛皮纸穹顶：inside-out 大球壳（R=260 > 2×星云半径 95），内壁贴图可见
   * @returns {THREE.Mesh}
   */
  function createParchmentDome() {
    const geom = new THREE.SphereGeometry(260, 64, 48);
    const mat = new THREE.MeshBasicMaterial({
      map: createParchmentDomeTexture(2048, 2048),
      side: THREE.BackSide, // 翻转法线，内壁显示
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, 0, 0);
    mesh.renderOrder = 0; // 最先画，打底
    return mesh;
  }
  ```

- [ ] **Step 4: 删除原星空粒子创建 + scene.add(stars)，改为 add 穹顶到 allMeshesGroup**

  在 buildGalaxy（或 initScene 添加星星的位置）：删除整个 `stars = new THREE.Points(...)` 段和 `scene.add(stars)` / `allMeshesGroup.add(stars)`，改为：
  ```js
  // 牛皮纸穹顶（替代原白色星星粒子）
  allMeshesGroup.add(createParchmentDome());
  ```
  ⚠️ **加进 allMeshesGroup，不是 scene**——这样右键旋转时穹顶和星球一起转，不会有贴纸错位。

- [ ] **Step 5: 构建验证 + 浏览器检查**

  构建 PASS；打开页面场景应不再是平面纯色，而是有纸噪点+四角暗角的包裹感穹顶；右键旋转时穹顶跟着转（正确）。若接缝明显：把 createParchmentDomeTexture 的 w/h 提到 4096×2048（equirectangular 更高清）。

---

## Task 3: StarMap.vue — 星球节点：学派色表常量 + MeshStandardMaterial 哑光墨球（删除 emissive）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — buildGalaxy 内部星球创建段（`const sphereGeo = new SphereGeometry(...)` + `new MeshXXXMaterial({color, emissive})` + `node.sphereMesh = new Mesh(...)`）

- [ ] **Step 1: 在 `<script setup>` 顶层 buildGalaxy 之前，声明 SCHOOL_COLORS 常量 + getSchoolColor() 函数**

  放在 `const props = defineProps(...)` 之后、`const nodes = ref(...)` 之前或 buildGalaxy 函数体开头均可（放顶层避免每次 buildGalaxy 重建）：
  ```js
  // 牛皮纸风格：学派褐墨色系微调色表
  const SCHOOL_COLORS = {
    // 古希腊
    '古希腊自然哲学': 0x4a3828,
    '苏格拉底派': 0x4a3828,
    '柏拉图主义': 0x5a3a30,
    '新柏拉图主义': 0x5a3a30,
    '亚里士多德主义': 0x4a4028,
    '经院哲学': 0x4a4028,
    '斯多葛学派': 0x3a4a48,
    '伊壁鸠鲁派': 0x4a3838,
    '犬儒主义': 0x3a4a38,
    // 近代理性/经验
    '理性主义': 0x5a3a28,
    '经验主义': 0x4a4a28,
    '启蒙哲学': 0x4a3a18,
    '社会契约论': 0x4a3a28,
    // 德国古典
    '德国古典哲学': 0x5a2a28,
    '康德哲学': 0x5a2a28,
    '费希特哲学': 0x5a2a28,
    '黑格尔主义': 0x5a2a28,
    // 功利/自由/实证
    '功利主义': 0x3a4a48,
    '自由主义': 0x3a4a48,
    '实证主义': 0x3a3a48,
    '分析哲学': 0x3a3848,
    '逻辑实证主义': 0x3a3848,
    // 意志/存在/后现代
    '意志主义': 0x4a2a38,
    '悲观主义': 0x4a2a38,
    '生命哲学': 0x4a2a28,
    '现象学': 0x3a4a38,
    '存在主义': 0x3a4a38,
    '解释学': 0x3a4a38,
    '后结构主义': 0x3a3a38,
    '后现代主义': 0x3a3a38,
    '解构主义': 0x3a3a38,
    // 马克思
    '马克思主义': 0x4a2a28,
    '西方马克思主义': 0x4a2a28,
    '法兰克福学派': 0x4a2a28,
    // 中世纪/宗教
    '教父哲学': 0x4a3838,
    '经院神学': 0x4a3838,
    '基督教哲学': 0x4a3838,
    '伊斯兰哲学': 0x5a4a18,
    // 东方
    '儒家': 0x6a2a28,
    '新儒家': 0x6a2a28,
    '宋明理学': 0x6a2a28,
    '心学': 0x6a2a28,
    '道家': 0x3a5a48,
    '道教': 0x3a5a48,
    '魏晋玄学': 0x3a5a48,
    '佛家': 0x4a2a48,
    '佛教哲学': 0x4a2a48,
    '中观派': 0x4a2a48,
    '唯识宗': 0x4a2a48,
    '禅宗': 0x4a2a48,
    '日本哲学': 0x5a4a18,
    '明治启蒙': 0x5a4a18,
    '印度哲学': 0x4a2a48,
  };

  const DEFAULT_SCHOOL_COLOR = 0x5a3f28; // 基准墨色兜底

  function getSchoolColor(schools /* string[] */) {
    if (!schools || !schools.length) return DEFAULT_SCHOOL_COLOR;
    for (const s of schools) {
      if (SCHOOL_COLORS[s] != null) return SCHOOL_COLORS[s];
    }
    return DEFAULT_SCHOOL_COLOR;
  }
  ```

- [ ] **Step 2: buildGalaxy 中创建星球时，替换材质**

  在 buildGalaxy 内部 for 循环创建每个 node 时，原有的：
  ```js
  // 旧（示例，实际按原代码）：
  const sphereMat = new THREE.MeshBasicMaterial({
    color: node.schoolColor,
    emissive: new THREE.Color(node.schoolColor).multiplyScalar(2.0),
    emissiveIntensity: 0.6,
  });
  ```
  **删除全部 emissive 字段**，替换为：
  ```js
  // 新：牛皮纸哑光墨球
  const schoolHex = getSchoolColor(node.school || node.schools);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: schoolHex,
    roughness: 0.95, // 完全哑光
    metalness: 0,    // 非金属
    flatShading: false,
  });
  ```
  创建完 `node.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat)` 之后，**备份学派原色供还原用**：
  ```js
  sphereMat.userData._origColor = new THREE.Color(schoolHex); // applySelectionStyle 默认态要 copy 回去
  ```

- [ ] **Step 3: 构建验证 + 浏览器看**

  构建 PASS；星球应变成深褐哑光球（不再发光），在 AmbientLight+DirectionalLight 下有柔和平滑的明暗层次（非纯黑）；不同学派颜色深浅微差异。若某颗星球全黑或颜色错 → 检查该哲学家的 school/schools 字段，漏配的补进 SCHOOL_COLORS 表（兜底 DEFAULT 不应触发，但保险起见）。

---

## Task 4: StarMap.vue — Halo Sprite：白色发光 → 牛皮纸墨晕 Canvas 纹理

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — Halo SpriteMaterial 创建段（原先是 createStarTexture 或另一 canvas halo）

- [ ] **Step 1: 定位原 Halo 创建代码**

  Read StarMap.vue 中 buildGalaxy 内与 halo 相关的行：通常是 `const haloCanvas = document.createElement('canvas')` → 径向渐变画白色发光圆 → `const haloTex = new THREE.CanvasTexture(haloCanvas)` → `const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: node.schoolColor })` → `const haloSprite = new THREE.Sprite(haloMat)` → node.haloSprite = haloSprite, scale.setScalar(4.5)。

- [ ] **Step 2: 新增顶层 createParchmentHaloTexture() 替换旧 halo canvas**

  放在 `createParchmentDomeTexture()` 之后：
  ```js
  /**
   * 牛皮纸墨晕 Halo：中央半透明深褐 → 外围全透明（墨水滴渗纸）
   */
  function createParchmentHaloTexture(size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = cy = size / 2;
    // 深褐墨晕（不是发光，是晕染渗透）
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, size/2);
    g.addColorStop(0.00, 'rgba(90, 63, 40, 0.78)'); // 中央（紧贴球体）深但不透
    g.addColorStop(0.35, 'rgba(90, 63, 40, 0.40)'); // 中间晕开
    g.addColorStop(1.00, 'rgba(90, 63, 40, 0.00)'); // 边缘消失
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // 共享同一张 Halo 纹理（所有星球用同一张，省显存）
  let _sharedHaloTex = null;
  function getSharedParchmentHaloTex() {
    if (!_sharedHaloTex) _sharedHaloTex = createParchmentHaloTexture(128);
    return _sharedHaloTex;
  }
  ```

- [ ] **Step 3: buildGalaxy 内替换 Halo Material**

  删除原 halo canvas 绘制代码，改为每个星球：
  ```js
  const haloMat = new THREE.SpriteMaterial({
    map: getSharedParchmentHaloTex(),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // 普通透明混合（不再加色发光）
    opacity: 0.85,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.setScalar(4.6); // 比原 3.8/4.5 稍大，墨晕渗透范围更广
  // 备份原始 scale 和 opacity
  haloMat.userData._origOpacity = 0.85;
  haloSprite.userData._origScale = 4.6;
  node.haloSprite = haloSprite;
  ```

- [ ] **Step 4: 构建验证**

  PASS；每个星球外围应是深褐色的半透明晕圈（不发光，像墨滴渗纸），大小比之前更扩散。夜间模式（若有）不会出问题，因为 Halo 本身是深褐，与象牙白背景对比合理。

---

## Task 5: StarMap.vue — 连线：深褐实线 / 红褐虚线

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — 影响线 / 对立线 Line Material 创建段

- [ ] **Step 1: 定位两类线的创建**

  Read StarMap.vue 中 buildGalaxy 内对 links type==='influence' 与 type==='opposition' 的分别 Line 材质：原 influence line material.color 蓝 / opposition 红虚线。

- [ ] **Step 2: 颜色替换**

  替换 influence 材质（深褐实线）：
  ```js
  // influence 影响：深褐实线（#6a4a28）
  const inflMat = new THREE.LineBasicMaterial({
    color: 0x6a4a28,
    transparent: true,
    opacity: 1.0,
  });
  ```
  替换 opposition 材质（红褐虚线）：
  ```js
  // opposition 对立：红褐虚线（#8a3a38）
  const oppMat = new THREE.LineDashedMaterial({
    color: 0x8a3a38,
    dashSize: 0.5,
    gapSize: 0.4,
    transparent: true,
    opacity: 1.0,
  });
  // ⚠️ 必须！否则 LineDashedMaterial 不显示虚线
  for (每个 opposition 的 line) line.computeLineDistances();
  ```
  **注意**：若 opposition 线创建时忘记调 `computeLineDistances()`，线会变成全透明或实线。必须在每条 line 加入 group 之前调用。

- [ ] **Step 3: 原 fade 距离透明度逻辑不变**

  影响线/对立线根据 camDist 调整 opacity 的插值逻辑保留，只需**把颜色变量替换成新的 0x6a4a28 / 0x8a3a38**即可（不要改动画循环里的 fade 数学）。

- [ ] **Step 4: 构建验证**

  PASS；拉近镜头：影响线呈深褐实线、对立线红褐虚线；远处的线 opacity 渐低溶入象牙白雾——正确。

---

## Task 6: StarMap.vue — CSS2DRenderer 星球名字：衬线 + 深褐墨色（保留三级距离显隐）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — 创建 CSS2DObject 标签的 div 样式设置段

- [ ] **Step 1: 定位标签创建**

  Read StarMap.vue 中 `const labelDiv = document.createElement('div')` + 一系列 `.style.xxx = '...'` + `new CSS2DObject(labelDiv)` 并挂到 node.labelDiv 的代码。

- [ ] **Step 2: 替换所有颜色/字体**（保留三级距离显隐逻辑）

  原样式设置改成：
  ```js
  const d = document.createElement('div');
  d.style.color = '#3a2008';                // 深墨字
  d.style.fontFamily = 'Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif';
  d.style.fontSize = '11px';
  d.style.fontWeight = '500';
  d.style.whiteSpace = 'nowrap';
  d.style.pointerEvents = 'none';
  d.style.textShadow = '1px 1px 0 rgba(248,240,216,0.85)'; // 象牙白柔光字影，牛皮纸底色下更清晰
  // 中英文双行（中文在上）：
  const nameCn = document.createElement('div');
  nameCn.textContent = node.name || node.nameCn;
  nameCn.style.fontWeight = '600';
  nameCn.style.letterSpacing = '1px';
  const nameEn = document.createElement('div');
  nameEn.textContent = node.nameEn || '';
  nameEn.style.fontSize = '9px';
  nameEn.style.fontStyle = 'italic';
  nameEn.style.color = '#7a6a48'; // 暗象牙（英文次要信息稍淡）
  d.appendChild(nameCn);
  if (node.nameEn) d.appendChild(nameEn);

  // 选中/未选中切换样式时用这个函数（供 applySelectionStyle 调用）
  node._labelDiv = d;
  node._nameCnEl = nameCn;
  node._nameEnEl = nameEn;

  const labelObj = new CSS2DObject(d);
  labelObj.position.set(0, sphereR*1.8 + 1.2, 0);
  ```
  ⚠️ **保留**原 labelVisible / 三级距离显隐逻辑（>200全隐 / 130~200只显选中 / <130全显），那是 display:none 控制的，不受字体颜色影响。

- [ ] **Step 3: 构建验证**

  PASS；拉近镜头看到哲学家名字是衬线字体（中文宋体类/英文 Times），中文深墨色加粗，英文斜体暗象牙字，字影让字在牛皮纸上不糊。

---

## Task 7: StarMap.vue — 重写 applySelectionStyle：三层高亮（放大+墨晕呼吸+虚线圆环）+ 淡化非命中

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — `function applySelectionStyle() {...}` 函数体 + buildGalaxy 时为每个 node 新增虚线圆环 selectionRing

**这是最易出错的 Task：请先 Read 全文拿到 applySelectionStyle 的原文，小块替换，不要动函数签名。**

- [ ] **Step 1: 在 `<script setup>` 顶层新增 createDashedSelectionRing(sphereR) 工厂函数**

  放在 `getSharedParchmentHaloTex()` 之后：
  ```js
  /**
   * 星球选中/搜索命中时套在外层的虚线圆环
   * 用 LineLoop + LineDashedMaterial（真正虚线），不是 RingGeometry
   */
  function createDashedSelectionRing(sphereR) {
    const innerR = sphereR * 1.60;
    const outerR = sphereR * 1.95;
    const midR   = sphereR * 1.78; // 圆环中心半径
    // 用 CircleGeometry 的顶点生成一个平滑圆的 LineLoop（36 segments）
    const circleGeo = new THREE.BufferGeometry();
    const segs = 48;
    const positions = new Float32Array(segs * 3);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      positions[i*3+0] = Math.cos(a) * midR;
      positions[i*3+1] = Math.sin(a) * midR;
      positions[i*3+2] = 0;
    }
    circleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineDashedMaterial({
      color: 0x3a2008,  // 深墨（牛皮纸对比最高）
      dashSize: 0.18,
      gapSize: 0.14,
      linewidth: 1,
      transparent: true,
      opacity: 0,      // 默认隐形
      depthWrite: false,
    });
    const loop = new THREE.LineLoop(circleGeo, mat);
    loop.computeLineDistances(); // ⚠️ 必须！否则无虚线效果
    loop.renderOrder = 20;       // 后画，不被星球挡
    loop.userData._origMidR = midR;
    loop.userData._origOpacity = 0;
    loop.visible = false;        // 默认不显示
    return loop;
  }
  ```

- [ ] **Step 2: buildGalaxy 为每个 node 创建 selectionRing 并加到 allMeshesGroup**

  在创建完 node.sphereMesh + node.haloSprite、设置好它们的 position 之后，紧跟：
  ```js
  node.selectionRing = createDashedSelectionRing(sphereR);
  node.selectionRing.position.copy(node.sphereMesh.position);
  // 每帧 billboard 相机（见 animate 循环），这里先初始朝向
  node.selectionRing.lookAt(camera.position.x, camera.position.y, camera.position.z);
  allMeshesGroup.add(node.selectionRing);
  ```

- [ ] **Step 3: 重写 applySelectionStyle 函数体**

  先 Read 原函数全文，再替换为（这里保留原 props 接口和优先级判断，只改内部赋值）：
  ```js
  function applySelectionStyle() {
    const selId = props.selectedId;
    const hits = props.searchHitIds || [];
    const hitSet = new Set(hits);
    const anyHit = hits.length > 0;

    for (const node of props.nodes) {
      const sphere = node.sphereMesh;
      const halo = node.haloSprite;
      const ring = node.selectionRing;
      const mat = sphere.material;
      const id = node.id;

      // 还原备份（先回默认值，再叠加态）
      // sphere scale 备份：node._baseScale（在 buildGalaxy 时 sphere.scale 初始 1.0 时记录）
      if (node._baseScale === undefined) node._baseScale = sphere.scale.x;
      const base = node._baseScale;

      // haloscale 备份
      if (halo._baseScale === undefined) halo._baseScale = halo.scale.x;
      const haloBase = halo._baseScale;

      // 颜色还原（学派原色）
      mat.color.copy(mat.userData._origColor);
      halo.material.opacity = halo.material.userData._origOpacity;

      // ring 先关
      ring.visible = false;
      ring.material.opacity = 0;

      // 默认态先把 scale 复位到 1.0（非脉动基础值）
      sphere.scale.setScalar(base);
      halo.scale.setScalar(haloBase);

      // ===== 判断态：选中 > 命中 > 默认 =====
      const isSelected = selId && selId === id;
      const isHit = anyHit && hitSet.has(id);

      if (isSelected) {
        // 选中：三层叠加基础值（脉动在 animate 主循环里乘）
        sphere.userData._highlightBase = 2.20;   // 选中放大基础（脉动再乘）
        halo.userData._highlightBase   = 1.30;
        ring.userData._highlightBase   = 1.10;
        ring.visible = true;
        ring.material.opacity = 0.90;
        // 标签加粗更深
        if (node._nameCnEl) {
          node._nameCnEl.style.fontWeight = '700';
          node._nameCnEl.style.color = '#2a1008';
        }
        if (node._nameEnEl) node._nameEnEl.style.color = '#5a4a28';
      } else if (isHit) {
        // 命中：脉动基础值略低于选中
        sphere.userData._highlightBase = 2.00;
        halo.userData._highlightBase   = 1.20;
        ring.userData._highlightBase   = 1.00;
        ring.visible = true;
        ring.material.opacity = 0.75;
      } else if (anyHit || selId != null) {
        // 有搜索或选中时 → 非命中/非相关星球缩小+淡化到接近象牙白
        sphere.scale.setScalar(base * 0.40);
        halo.scale.setScalar(haloBase * 0.50);
        halo.material.opacity = 0.10;
        mat.color.lerp(new THREE.Color(0xdcd4b8), 0.72); // 淡化到象牙白
      } else {
        // 完全默认态：无脉动
        sphere.userData._highlightBase = 1.0;
        halo.userData._highlightBase   = 1.0;
        ring.userData._highlightBase   = 1.0;
      }
    }

    // 连线淡化：同原逻辑，只把颜色保留为 Task5 设置的褐系
    if (anyHit || selId != null) {
      const relIds = new Set();
      if (selId) {
        // 相关节点（有 influence 或 opposition 连接的）
        for (const l of props.links) {
          const s = l.source ?? l.sourceId;
          const t = l.target ?? l.targetId;
          if (s === selId) relIds.add(t);
          if (t === selId) relIds.add(s);
        }
        relIds.add(selId);
      } else if (anyHit) {
        for (const id of hits) relIds.add(id);
      }
      // 应用淡化到每条 line（node.line 或原结构）
      // 如果原代码是 links.forEach(...) 形式，保留那段循环
      // 此处仅保留：非相关连线 opacity = 0.08
    }
  }
  ```
  **必须**保留原有的 watch 调用：`watch(() => props.searchHitIds, applySelectionStyle)`、`watch(() => props.selectedId, applySelectionStyle)`。不动。

- [ ] **Step 4: 构建验证（先不管脉动）**

  PASS；选中一个星球 → 星球放大 2.2×、外层虚线环出现；其他星球缩到 0.4× 且颜色淡至象牙白。如果虚线环看不见 → 检查 `computeLineDistances()` 是否在 create 时被正确调用 + `visible` 是否 true。如果其他星球颜色没淡化 → 检查 `mat.color.lerp` 那行是否执行。

---

## Task 8: StarMap.vue — animate 主循环（高亮脉动动画重写 + selectionRing billboard）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — `function animate() {...}` 主循环体

**⚠️ 不改动的锚点**：`requestAnimationFrame(animate)` 递归、OrbitControls.update()、renderer.render(scene, camera)、labelRenderer.render(scene, camera)、`allMeshesGroup.rotateY / rotateOnAxis` 自定义旋转增量、camDist 计算、标签三级显隐、连线 fade 插值。

- [ ] **Step 1: 先 Read animate 函数全文，标注哪些部分不能碰**

  找原脉动循环里对 `emissiveIntensity` 做 sin 赋值的部分（搜索 `emissive` 或 `Math.sin(Date.now() * 0.005)`）。

- [ ] **Step 2: 删除 emissiveIntensity 脉动代码，追加新三层脉动 + ring billboard 代码**

  替换为：
  ```js
  function animate() {
    requestAnimationFrame(animate);

    // ============ 不变部分（自定义旋转 / OrbitControls.update / camDist 计算……）：保持原样 ============

    // ============ 新增：三层高亮脉动（牛皮纸语言）============
    const t = Date.now() * 0.005;
    const sinPulse = (Math.sin(t) + 1) * 0.5; // 0..1
    // 命中/选中脉动范围：sphere 2.0~2.8、halo 1.2~1.5、ring 1.0~1.25
    const anyStyle = (props.selectedId != null) || (props.searchHitIds && props.searchHitIds.length > 0);
    if (anyStyle) {
      for (const node of props.nodes) {
        const s = node.sphereMesh;
        const h = node.haloSprite;
        const r = node.selectionRing;
        const baseS = node._baseScale || 1;
        const baseH = h._baseScale  || 4.6;
        const hs = s.userData._highlightBase ?? 1;
        const hh = h.userData._highlightBase ?? 1;
        const rh = r.userData._highlightBase ?? 1;
        if (hs > 1.01) {
          // 脉动：hs + 增量 (0~0.6 额外)
          const extra = 0.6 * sinPulse;
          s.scale.setScalar(baseS * (hs + extra));
        }
        if (hh > 1.01) {
          const extra = 0.25 * sinPulse;
          h.scale.setScalar(baseH * (hh + extra));
          h.material.opacity = Math.min(1.0, h.material.userData._origOpacity * (0.75 + 0.35 * sinPulse));
        }
        if (r.visible) {
          const extra = 0.22 * sinPulse;
          r.scale.setScalar(rh + extra);
          // ring 透明度呼吸（更有活点地图标记重点的感觉）
          r.material.opacity = 0.60 + 0.35 * sinPulse;
          // ring billboard：每帧面向相机
          r.lookAt(camera.position.x, camera.position.y, camera.position.z);
        }
      }
    } else {
      // 无选中无搜索：只保证所有 ring 不可见 + ring billboard 对齐（不影响性能）
      for (const node of props.nodes) {
        if (!node.selectionRing.visible) continue;
        node.selectionRing.lookAt(camera.position.x, camera.position.y, camera.position.z);
      }
    }

    // ============ 新增：updateFootprints() 调用（Task9/10 实现，先写占位，Task9 会把函数补全）============
    if (typeof updateFootprints === 'function') updateFootprints();

    // ============ 不变部分（renderer.render + labelRenderer.render）：保持原样 ============
  }
  ```

- [ ] **Step 3: 构建验证 + 浏览器看**

  PASS；搜索「康德」→ 康德星球明显做「放大呼吸 + 虚线圆环一胀一缩 + 墨晕忽大忽小」，其他星球缩到 0.4× 近乎白纸——效果夸张但全程牛皮纸语言（零 emissive）。

---

## Task 9: StarMap.vue — 脚印特效 Part I（纹理 + 球壳求交 + spawn 池 + 主循环淡出）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — `<script setup>` 顶层新增 4 个函数：`createFootprintTextures()` / `intersectVirtualSphere(clientX, clientY)` / `spawnFootprint(worldPos)` / `updateFootprints()`，再加 3 个全局状态变量（activeFootprints、footParity、lastFootPos）

- [ ] **Step 1: 在脚本顶层，新增脚印全局状态变量与 footprintGroup（放 allMeshesGroup 里）**

  放在 School 色表后面或 initScene 之前：
  ```js
  // 脚印状态
  const activeFootprints = []; // { sprite, bornTime }
  let footParity = 0;          // 0 = 左脚, 1 = 右脚
  const lastFootPos = new THREE.Vector3();
  let lastFootPosValid = false;
  let footprintGroup = null;   // 在 initScene 里 allMeshesGroup 之后初始化

  // 脚印容量上限 + 淡化秒数（Spec：120 / 4s）
  const MAX_FOOTPRINTS = 120;
  const FOOTPRINT_LIFETIME_MS = 4000;
  const FOOTPRINT_SPAWN_DIST = 3.0;     // 世界单位：相邻脚印最小距离
  const FOOTPRINT_VIRTUAL_SPHERE_R = 95; // 方案 A：同星球球面分布半径

  let texFootL = null; // 左脚 CanvasTexture
  let texFootR = null; // 右脚 CanvasTexture
  ```

  然后在 initScene 中 `allMeshesGroup = new THREE.Group()` 之后、`scene.add(allMeshesGroup)` 之前追加：
  ```js
  footprintGroup = new THREE.Group();
  allMeshesGroup.add(footprintGroup);
  ```

- [ ] **Step 2: 写 createFootprintTextures() 生成左右脚深墨 CanvasTexture**

  放在 createParchmentHaloTexture 之后：
  ```js
  /**
   * 创建左右脚脚印 Sprite 纹理（深墨色）
   * 返回 { left, right }
   */
  function createFootprintTextures(size = 64) {
    const drawOne = (mirror) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.translate(size/2, size/2);
      if (mirror) ctx.scale(-1, 1); // 右脚=左脚镜像

      // 脚印参数：朝上（足尖+Y），用两个椭圆+5 个脚趾圆
      const footColor = '#3a2008'; // 深墨色（象牙白对比最高）

      // 1) 足尖脚趾（5 个小圆上凸）
      ctx.fillStyle = footColor;
      const toesY = -size*0.32;
      const bigToeR = size*0.075;
      ctx.beginPath(); ctx.arc(-size*0.09, toesY - size*0.01, bigToeR, 0, Math.PI*2); ctx.fill();
      for (let i = 1; i <= 4; i++) {
        const r = size * 0.055;
        ctx.beginPath();
        ctx.arc(-size*0.09 + i*size*0.07, toesY + (i===4?-size*0.005:size*0.01), r, 0, Math.PI*2);
        ctx.fill();
      }
      // 2) 前脚掌（椭圆）
      ctx.beginPath();
      ctx.ellipse(0, -size*0.08, size*0.20, size*0.17, 0, 0, Math.PI*2);
      ctx.fill();
      // 3) 足弓（向内凹一点，画成两个椭圆交集）：用 rect 擦除内侧
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(-size*0.12, size*0.02, size*0.06, size*0.18, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      // 4) 脚跟（椭圆）
      ctx.beginPath();
      ctx.ellipse(0, size*0.28, size*0.14, size*0.17, 0, 0, Math.PI*2);
      ctx.fill();

      // 边缘羽化（径向渐变 multiply 半透明外环淡）
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const fadeR = size*0.42;
      const g = ctx.createRadialGradient(0,0,size*0.25, 0,0,fadeR);
      g.addColorStop(0.0, 'rgba(0,0,0,0)');
      g.addColorStop(0.75, 'rgba(0,0,0,0.45)');
      g.addColorStop(1.0, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(-size/2,-size/2,size,size);
      ctx.restore();

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    return { left: drawOne(false), right: drawOne(true) };
  }
  ```
  在 initScene 或第一个 spawn 前调用一次：
  ```js
  // 在 createParchmentDomeTexture() 之后立刻初始化（避免每帧创建纹理）
  {
    const t = createFootprintTextures(64);
    texFootL = t.left;
    texFootR = t.right;
  }
  ```

- [ ] **Step 3: intersectVirtualSphere(clientX, clientY) — 射线与 R=95 虚拟球壳求交（相机在球内取 far 点）**

  ```js
  const _virtualSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), FOOTPRINT_VIRTUAL_SPHERE_R);
  const _intersectResult = new THREE.Vector3();
  function intersectVirtualSphere(clientX, clientY) {
    // clientX, clientY: 屏幕坐标（0..width, 0..height）
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    // Three.js Ray.intersectSphere：起点在球外时返回 near 交点，起点在球内时返回 null
    // → 手动算：判断 inside，inside 时取 far 点
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const R = FOOTPRINT_VIRTUAL_SPHERE_R;
    // 解 |origin + t*dir|^2 = R^2
    const a = dx*dx + dy*dy + dz*dz;
    const b = 2 * (ox*dx + oy*dy + oz*dz);
    const cc = ox*ox + oy*oy + oz*oz - R*R;
    const disc = b*b - 4*a*cc;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2*a); // near
    const t2 = (-b + sq) / (2*a); // far
    // 取正方向第一个 hit：相机在球内时 t1<0、t2>0 → 取 t2；相机在球外时 t1>0 → 取 t1
    const t = (t1 >= 0) ? t1 : (t2 >= 0 ? t2 : null);
    if (t == null) return null;
    _intersectResult.set(
      ox + dx * t,
      oy + dy * t,
      oz + dz * t
    );
    return _intersectResult;
  }
  ```

- [ ] **Step 4: spawnFootprint(worldPosVec3)**

  ```js
  const _footOffset = new THREE.Vector3();
  function spawnFootprint(worldPos) {
    if (!worldPos || !footprintGroup || !texFootL || !texFootR) return;

    // 容量上限：销毁最旧的
    if (activeFootprints.length >= MAX_FOOTPRINTS) {
      const oldest = activeFootprints.shift();
      footprintGroup.remove(oldest.sprite);
      oldest.sprite.material.dispose();
    }

    // 选左右脚贴图
    const tex = footParity === 0 ? texFootL : texFootR;
    footParity ^= 1; // 0 ↔ 1 翻转

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity: 1.0,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(worldPos);

    // 向球外（远离原点方向）推出 0.5 单位 + renderOrder 更高，不被星球挡住
    _footOffset.copy(worldPos).normalize().multiplyScalar(0.5);
    sp.position.add(_footOffset);

    sp.scale.setScalar(3.5); // ≈ 70% 小星球尺寸
    sp.renderOrder = 10;    // 强制后画

    footprintGroup.add(sp);
    activeFootprints.push({ sprite: sp, bornTime: performance.now() });

    lastFootPos.copy(worldPos);
    lastFootPosValid = true;
  }
  ```

- [ ] **Step 5: updateFootprints() — 主循环每帧调用**

  ```js
  function updateFootprints() {
    if (!activeFootprints.length) return;
    const now = performance.now();
    // 从后往前遍历，方便 splice
    for (let i = activeFootprints.length - 1; i >= 0; i--) {
      const f = activeFootprints[i];
      const ageMs = now - f.bornTime;
      if (ageMs >= FOOTPRINT_LIFETIME_MS) {
        // 销毁
        footprintGroup.remove(f.sprite);
        f.sprite.material.map && (f.sprite.material.map = null); // 共享 tex，不 dispose 纹理本体
        f.sprite.material.dispose();
        activeFootprints.splice(i, 1);
      } else {
        // 线性淡出：0ms → 1.0；4000ms → 0
        f.sprite.material.opacity = 1.0 - (ageMs / FOOTPRINT_LIFETIME_MS);
      }
    }
  }
  ```

- [ ] **Step 6: 构建验证**（先不接触发，Task10 再接）

  PASS；console.log(typeof updateFootprints === 'function') 应为 true，texFootL/texFootR 有值。暂时看不到脚印（因为触发逻辑在 Task10）。

---

## Task 10: StarMap.vue — 脚印特效 Part II（触发：右键拖拽 + 滚轮缩放）

**Files:**
- Modify: `philosophy-map/src/components/StarMap.vue` — 原 `onPointerMove` / `onPointerDown` 右键旋转事件段 + OrbitControls change 事件注册段

**⚠️ 不改动的锚点**：右键拖拽旋转的 setPointerCapture / rotateY(dx*0.006) / rotateOnAxis(camera.right, dy*0.006) 计算代码、dx/dy 变量、`controls.enableRotate = false` 设置、minDistance/maxDistance。

- [ ] **Step 1: 在 onPointerMove 的"仅 button===2 且 pointer capturing=true"的分支里加 spawn 判定**

  先 Read 原 onPointerMove 函数：原先是 `if (isRotating === false) return;` 之类的守卫找到正在执行旋转更新的 if 块，**在执行完旋转更新（allMeshesGroup.rotateY / rotateOnAxis）之后**，追加：
  ```js
  // ===== 脚印触发 1：右键拖拽旋转，每移动 3 世界单位生成一个 =====
  const pos = intersectVirtualSphere(event.clientX, event.clientY);
  if (pos) {
    if (!lastFootPosValid || pos.distanceTo(lastFootPos) >= FOOTPRINT_SPAWN_DIST) {
      spawnFootprint(pos.clone());
    }
  }
  ```
  注意：`event.clientX / clientY` 来自浏览器事件指针坐标。如果原 onPointerMove 用的是 `e.deltaX` 等做增量旋转，指针坐标依然可以直接取 PointerEvent 的 clientX/Y。

- [ ] **Step 2: OrbitControls change（滚轮缩放）触发 spawn**

  Read initControls 中 OrbitControls 的事件监听处。如果原是：
  ```js
  controls.addEventListener('change', () => {});
  ```
  改成在 change 回调里追加（不要把已有的回调删了）：
  ```js
  controls.addEventListener('change', () => {
    // ... 原逻辑（如果有）保留 ...
    // ===== 脚印触发 2：滚轮缩放每步在指针落点生成一只脚印 =====
    // 取当前指针位置；若没有（也可能不是指针触发而是键盘）就跳过
    if (typeof pointer !== 'undefined' && (pointer.x !== 0 || pointer.y !== 0 || true)) {
      // 直接用屏幕中心 client = (innerWidth/2, innerHeight/2) 的 raycast 作为缩放落脚点
      // 或者若有记录 lastClientX/Y：用它。取屏幕中心最稳妥
      const pos = intersectVirtualSphere(window.innerWidth / 2, window.innerHeight / 2);
      if (pos) spawnFootprint(pos.clone());
    }
  });
  ```

- [ ] **Step 3: 构建验证 + 浏览器实际操作**

  PASS；打开浏览器：
  - 按住右键拖动画星云 → 鼠标移动路径上出现一串串左右脚交替的深墨脚印，越老越淡，4 秒消失；快速拖不会堆爆（≥120 销毁最早）
  - 滚动滚轮缩放 → 屏幕中央（相机方向）不断出现脚印
  - 停拖/停滚 → 不生成新脚印 ✓
  - 右键旋转时脚印跟着场景一起转 ✓（都在 allMeshesGroup 里）

---

## Task 11: App.vue — 全局 UI 牛皮纸化（顶栏/搜索/登录弹窗/按钮/视图切换）

**Files:**
- Modify: `philosophy-map/src/App.vue` — 模板内 `<style>` 块（最后那段全局样式）

**⚠️ 不改动的锚点**：模板结构（top-bar / top-left / top-right / view-switch / DetailCard / legend / modal）不动；`<script setup>` 逻辑全不动；`@click` / `v-if` / props 全不动；只改 `<style>` 块中的颜色/字体/边框/背景。

- [ ] **Step 1: Read App.vue 最后整段 `<style>`（从 L291 到文件尾），完整 Read 原文**

- [ ] **Step 2: 把整段 style 替换为牛皮纸象牙白风格**

  ```css
  <style>
  /* ===== 全局 body 衬线字体 ===== */
  body {
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
  }

  /* 搜索 + 登录顶栏 */
  .top-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
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
  }

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
  .search-item-en   { color: #7a6a48; font-style: italic; flex: 1; margin: 0 10px; }
  .search-item-era  { color: #8a7a58; font-size: 10px; }

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
  .view-btn:hover  { background: rgba(190,170,130,0.75); }
  .view-btn.active { background: linear-gradient(140deg, rgba(120,85,45,0.70), rgba(100,70,35,0.75)); color: #f4eed8; border-color: #6a4a20; }

  /* 底部图例 */
  .legend {
    position: absolute;
    left: 20px; bottom: 20px;
    z-index: 10;
    padding: 8px 14px;
    background: linear-gradient(140deg, rgba(248,240,216,0.92), rgba(228,220,192,0.92));
    border: 1px solid #a08a68;
    border-radius: 4px;
    color: #3a2008;
    box-shadow: 0 3px 10px rgba(70,40,10,0.22), inset 0 0 18px rgba(160,130,80,0.15);
  }
  .legend-item { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 11px; }
  .legend-line-solid  { width: 34px; height: 0; border-top: 2px solid #6a4a28; }
  .legend-line-dashed { width: 34px; height: 0; border-top: 2px dashed #8a3a38; }
  .legend > div:first-child { font-weight: 700; font-size: 12px; margin-bottom: 4px; letter-spacing: 1px; }

  /* 弹窗 */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(30,20,5,0.60);
    display: flex; align-items: center; justify-content: center;
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
  .modal::before {
    content: ""; position: absolute; inset: 5px;
    border: 1px dashed rgba(120,85,40,0.40);
    border-radius: 3px; pointer-events: none;
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
  </style>
  ```

- [ ] **Step 3: 构建验证**

  PASS；顶栏「哲学星图」字应该是深墨衬线加粗带字间距；搜索框牛皮纸色；登录按钮深棕底+象牙白字（primary）；底部图例牛皮纸卡片；登录弹窗有虚线内装订框。没出现深空蓝紫。

---

## Task 12: style.css — 清理深空遗留全局样式 + 加 body 衬线字体

**Files:**
- Modify: `philosophy-map/src/style.css`

- [ ] **Step 1: 先完整 Read style.css 全文件**

  找到任何剩余的深空 `.search-input { width: 100% }`（上次已删，但可能有其他），以及旧的 `.detail-card` / 深空色 UI 样式。

- [ ] **Step 2: 删除所有已被 App.vue 新样式覆盖的重复全局样式，保留必要的全局 reset + body 衬线**

  替换为（保留原有 reset/box-sizing/overflow-hidden，把字体加进去 + 确保 body 不继承深空色）：
  ```css
  :root {
    font-family: Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;
    color-scheme: light;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #app {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #f0e8d8; /* 兜底浅象牙（在 Vue 挂载前不显示黑屏） */
    color: #3a2008;
  }

  /* 滚动条（弹窗 search-dropdown 等）：牛皮纸色 */
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: rgba(228,220,192,0.6); }
  ::-webkit-scrollbar-thumb { background: #a08a68; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #8a6a48; }

  button { font-family: inherit; }
  input  { font-family: inherit; }
  ```

- [ ] **Step 3: 构建验证**

  PASS；刷新后页面无黑屏闪烁，所有字默认继承衬线字体。

---

## Task 13: DetailCard.vue — 详情卡牛皮纸化

**Files:**
- Modify: `philosophy-map/src/components/DetailCard.vue` — `<style scoped>` 段。模板结构不动（收藏按钮、section 顺序、🔗关系、tags、title/meta/著作）。

- [ ] **Step 1: Read 当前 DetailCard 完整 scoped style（最后 15 行左右，目前是收藏按钮的深空蓝紫色）**

- [ ] **Step 2: 把整个 `<style scoped>` 替换为牛皮纸详情卡样式**

  同时**给 `.detail-card` 容器加一个包装背景**。这里因为是 scoped，只需要重写样式：
  ```css
  <style scoped>
  .detail-card {
    position: fixed;
    top: 90px; right: 24px;
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
    position: relative;
  }
  .detail-card::before {
    content: "";
    position: absolute; inset: 5px;
    border: 1px dashed rgba(120,85,40,0.42);
    border-radius: 3px; pointer-events: none;
  }
  .empty-hint {
    color: #7a6a48;
    padding: 30px 14px;
    font-style: italic;
    text-align: center;
    font-size: 13px;
  }

  /* === header: 首字母圆头像 + 姓名 + 年代 + 收藏按钮 === */
  .detail-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .detail-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: linear-gradient(140deg, #8a5a30, #6a3a18);
    color: #f4eed8;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700;
    border: 1px solid #5a3a18;
    box-shadow: inset 0 0 6px rgba(0,0,0,0.25);
  }
  .detail-names { flex: 1; }
  .name-cn { font-size: 17px; font-weight: 700; color: #2a1008; letter-spacing: 1px; }
  .name-en { font-size: 12px; font-style: italic; color: #7a5a38; }
  .meta    { font-size: 10.5px; color: #6a4a28; }

  .header-actions { margin-left: auto; }
  .favorite-btn {
    padding: 4px 10px;
    background: linear-gradient(140deg, rgba(232,220,180,0.75), rgba(212,196,156,0.75));
    border: 1px solid #a08a68;
    border-radius: 4px;
    color: #3a2008;
    font-size: 11px; font-family: inherit;
    cursor: pointer; transition: all .2s;
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

  /* === 分节卡片：核心观点/生平/历史背景/名言/著作 === */
  .detail-core {
    padding: 5px 9px;
    margin: 10px 0;
    border-left: 3px solid #8a5a30; /* 核心观点：深棕 */
    background: rgba(220,200,160,0.22);
    font-size: 12px; line-height: 1.55;
    border-radius: 0 3px 3px 0;
  }
  .detail-core + .detail-core {
    /* 生平：第二块 橙棕 */
    border-left-color: #b08040;
    background: rgba(220,208,170,0.22);
  }
  .detail-core + .detail-core + .detail-core {
    /* 历史背景：第三块 青褐 */
    border-left-color: #8a8a60;
    background: rgba(212,212,180,0.22);
  }

  .detail-section {
    margin: 12px 0;
    font-size: 12px; line-height: 1.55;
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
  .detail-works > div {
    padding: 2px 0 2px 6px;
    border-left: 2px dotted rgba(130,95,50,0.45);
    margin: 3px 0;
    color: #4a3018;
  }

  /* === 关系：4 类颜色 === */
  .detail-relation {
    background: rgba(220,200,160,0.20);
    border-left: 3px solid #a08a68;
    padding: 6px 9px;
    border-radius: 0 3px 3px 0;
  }
  .detail-relation .influence  { padding: 2px 0; }
  .detail-relation .opposition { padding: 2px 0; }
  .arrow-in  { color: #3a5a38; font-weight: 600; }  /* ← 受影响：绿褐 */
  .arrow-out { color: #3a3a6a; font-weight: 600; }  /* → 影响：蓝褐 */
  .opp       { color: #8a3a38; font-weight: 600; }  /* ✗ 对立：红褐 */
  </style>
  ```
  **⚠️ 保留** `<template>` 所有 v-if / 类名（`.detail-card/.header-actions/.favorite-btn/.favorited/.detail-core/.detail-relation/.influence/.opposition`…都匹配所以不用改模板）。

- [ ] **Step 3: 构建验证 + 点击康德看详情卡**

  PASS；康德详情卡：牛皮纸渐变+虚线内框、头像深棕圆+象牙白字、核心观点棕边/生平橙棕边/历史背景青褐边、收藏按钮金褐底色；关系 4 种颜色文字与连线颜色一致（→蓝褐/←绿褐/✗红褐）。

---

## Task 14: 全功能构建验证 + 14 项测试清单

**Files:** 不新增文件；运行命令。

- [ ] **Step 1: 前端构建**

  ```powershell
  $env:PATH = [Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH","User")
  cd philosophy-map; npm run build
  ```
  预期：`✓ built in < 500ms`，0 error。

- [ ] **Step 2: 浏览器手动测试 14 项**（对照 Spec §7 测试清单一项一项打勾）

  打开 `http://localhost:5173/`：
  - [ ] 1. 背景非黑空，是浅象牙白牛皮纸穹顶包裹（有纸噪点+四角暗角）
  - [ ] 2. 右键拖拽旋转：穹顶+星球+脚印整体一起转，万向锁问题无回归
  - [ ] 3. 滚轮缩放（min 50 max 500）正常；标签三级显隐正确
  - [ ] 4. 星球：哑光深褐墨球（无 emissive），外层墨晕 Halo≈4.6 扩散感；学派色差可辨
  - [ ] 5. 连线：影响深褐实线、对立红褐虚线；远处 fade 到象牙白雾
  - [ ] 6. 标签：衬线字体，中文深墨加粗，英文斜体暗象牙；选中态中文更深更粗
  - [ ] 7. 搜索「康德」→ 三层高亮（放大脉动 + 墨晕呼吸 + 虚线圆环），其他星球 0.4× 淡化象牙白；搜索下拉点选跳转正确；退出收藏视图逻辑正常
  - [ ] 8. 点击星球：选中态三层高亮；详情卡牛皮纸风格显示，🔗思想关系信息正确（之前修过 DetailCard computed 不回归）
  - [ ] 9. 脚印：按住右键拖拽 → 左右脚交替脚印；4s 线性淡出；≥120 销毁老的；滚轮缩放屏幕中央出脚印；悬停/点击不生成；脚印随场景旋转
  - [ ] 10. 顶栏/搜索/登录弹窗：象牙白牛皮纸风，无深空蓝紫残留
  - [ ] 11. 用户系统：登录→注册→退出（currentUser ref 解包不回归）全正常
  - [ ] 12. 收藏：点⭐收藏/取消；点⭐我的收藏进入筛选视图；点🌌返回全部星云恢复 displayNodes=全量
  - [ ] 13. 收藏视图：星球仍牛皮纸风格，displayLinks 仅收藏间连线
  - [ ] 14. DevTools Console：无 THREE.js deprecation warnings / 未定义变量报错

- [ ] **Step 3: 后端 0 改动确认（只在怀疑有回归时跑一遍）**

  ```powershell
  curl http://localhost:3001/api/health   # => {"ok":true}
  curl http://localhost:3001/api/philosophers | Select-String -Pattern "康德"  # => 有匹配
  ```

---

## Plan Self-Review（已通过 ✅）

**1. Spec Coverage（逐节对照设计文档）**
- §1 不变清单：所有 Task 显式标注「⚠️ 不改动的锚点」覆盖了旋转/缩放/球面/事件/搜索链/收藏视图 → ✅
- §2 象牙白配色 7 色：Task1 背景/雾、Task3 学派色（基准+DEFAULT=0x5a3f28）、Task5 连线、Task6 标签、Task11 全局 UI → 全对齐色值 → ✅
- §3.1 牛皮纸穹顶（insided-out 球壳 R=260 + Canvas 纸纹+暗角+6000 噪点）：Task2 Step2/3 精确实现 → ✅
- §3.2 星球（MeshStandardMaterial roughness 0.95 + 学派色表 20+）：Task3 Step1/2 精确色值表 + 兜底 → ✅
- §3.2 墨晕 Halo（径向褐晕 4.6 NormalBlending）：Task4 Step2/3 → ✅
- §3.3 连线（深褐实线/红褐虚线 + computeLineDistances）：Task5 Step2 明确提醒 → ✅
- §3.4 标签（衬线+深墨+字影+英文次要）：Task6 Step2 → ✅
- §3.5 三层高亮（放大+墨晕呼吸+虚线圆环+非命中淡化）：Task7（虚线环 LineDashedMaterial+computeLineDistances）+ Task8 主循环脉动 → ✅
- §3.6 脚印特效（R=95 球壳/左右脚 4s 淡出 120 容量/右键+滚轮触发/相机在球内取 far-hit/外推防遮挡）：Task9（5 个函数）+ Task10（2 个触发点）覆盖 → ✅
- §3.7 灯光三件套（Ambient+Directional+Hemisphere + SRGBColorSpace）：Task1 Step3/4 → ✅
- §4 全局 UI 牛皮纸化（顶栏/搜索/下拉/登录/按钮/详情卡/图例）：Task11(App.vue style) + Task12(style.css) + Task13(DetailCard scoped) → ✅
- §6 风险清单 7 项：Task 中显式处理（全黑=Task1加灯；接缝=Task2 Step5备注；球内求交=Task9 Step3 手动解二次方程区分 t1/t2；学派色还原=Task3 Step2 + Task7 Step3 copy _origColor；虚线忘 computeLineDistances=Task5 Step2 备注 + Task7 Step1 强调；星球挡脚印=Task9 Step4 position.add(+0.5) + renderOrder=10；学派漏配=SCHOOL_COLORS + DEFAULT 兜底）→ ✅
- §8 Scope 边界：后端 0 改动 / Three 不升级 / 暂不做星球表面脚印 → Task 全未触碰 → ✅

**2. Placeholder Scan（红词扫描）**
- 搜 plan 全文：无 TBD/TODO/similar to Task N/Write tests for the above/添加适当错误处理 等占位红词 → ✅
- 每个代码块函数名前后一致（例如 intersectVirtualSphere 在 Task9 Step3 定义，Task10 Step1 用同名；updateFootprints 在 Task9 Step5 定义，Task8 Step2 typeof 检查调用）→ ✅

**3. Type Consistency（交叉命名检查）**
- SCHOOL_COLORS key 与哲学家 school 字段可能不一致：DEFAULT_SCHOOL_COLOR 兜底 + Task3 Step3 测试提醒 → ✅
- node._baseScale / halo._baseScale：Task7 Step3 applySelectionStyle 写 `if (undefined) node._baseScale = ...` 初始化；Task8 animate 用 `node._baseScale || 1` 兜底 → ✅
- 脚印 texFootL/R：Task9 Step2 先初始化赋值再使用；spawnFootprint 里 `if (!texFootL) return` 防未初始化 → ✅
- OrbitControls 事件监听追加而非替换：Task10 Step2 明确「不要把原有回调删了」→ ✅

---

## 执行方式（二选一）

**Plan 完整保存至**：`docs/superpowers/plans/2026-08-30-philosophy-parchment-style.md`

两项执行方案：
- **1. Subagent-Driven（推荐）**：我每个 Task 调一次独立子代理实现+ review，两阶段 code review，迭代快且隔离失败上下文
- **2. Inline Execution**：在当前会话连续执行 Task1→Task14，中间做构建/测试 checkpoint 让你 review

请选 1 或 2。

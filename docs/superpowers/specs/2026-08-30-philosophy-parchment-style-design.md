# 3D 哲学星图 → 牛皮纸活点地图（仿古象牙白版）设计规格

- **日期**：2026-08-30
- **状态**：Draft（等待用户 review）
- **设计者**：Trae AI + 用户联合敲定（8 轮 Q&A 逐项决策）
- **前置依赖**：现有 Vue 3 + Vite + Three.js v0.160 + Express 后端 + Prisma/SQLite 全栈工程，后端与业务逻辑 0 改动

---

## 1. 项目背景与目标

### 1.1 背景
当前哲学星图是「深空星云风格」：黑色太空背景、白雾、彩色发光星球、白色星粒子、蓝色/红色连线、深紫半透明 UI。用户希望将整体视觉风格切换为「哈利波特活点地图（Marauder's Map）」的**仿古象牙白牛皮纸质感**，同时**100% 保留原有 3D 交互骨架与业务功能**。

### 1.2 目标
- **视觉换皮**：将「深空星云风」整体替换为「象牙白牛皮纸 + 深褐墨色」风格
- **新增特效**：脚印轨迹特效（鼠标移动视角时在 3D 空间留一串渐隐脚印）
- **功能零丢**：所有已有功能（右键旋转/滚轮缩放/搜索高亮脉动/详情卡/登录注册/收藏切换/我的收藏视图/距离自适应标签）100% 保留
- **零侵入式改造**：不动交互骨架（OrbitControls、自定义旋转四元数、事件绑定、渲染循环结构），只替换「颜色/材质/纹理/外层几何/标签样式/UI 样式」

### 1.3 不变的清单（显式列出防止误删）
- 自定义右键拖拽旋转（allMeshesGroup.rotateY + rotateOnAxis(camera.right)，setPointerCapture，contextmenu preventDefault）
- OrbitControls.enableRotate=false，只负责滚轮缩放 minDistance=50 maxDistance=500
- Fibonacci 黄金角球面节点分布 + cbrt(random) 体积均匀半径 R=95 + era bias 0.85~1.15 + 小 jitter ±12
- 星球三级距离标签显隐（>200 全隐 / 130~200 只显选中 / <130 全显中英）
- 主循环 requestAnimationFrame：脉动呼吸动画 sin(Date.now*0.005)
- applySelectionStyle 优先级链：选中态 > 搜索命中态 > 默认态
- 搜索 @input debounce 200ms + 下拉 + searchHitIds prop 联动 StarMap
- favoritesOnly 收藏视图 / displayNodes / displayLinks 筛选逻辑
- DetailCard props：philosopher / favorited / allNodes / links → 🔗思想关系 computed 4 个过滤
- App.vue 顶栏：currentUser（useAuth 解构）、login/register/logout/favorites 按钮
- 后端 API 与 Express/Prisma 全链路：不动

---

## 2. 全局配色基调（用户选 C：仿古象牙白）

非黄牛皮纸，偏冷的旧书页色，更干净。

| 用途 | 颜色 | 说明 |
|---|---|---|
| scene.background | `#f0e8d8` | 浅象牙白（兜底纯色，与穹顶内壁渐变起始色匹配） |
| FogExp2 雾色 | `#e4dcc0` | 中象牙白（远处星球/连线/脚印自然溶入） |
| FogExp2 density | 0.0035 | 比原 0.004 稍淡，牛皮纸雾不会糊到看不见远处星球 |
| 浅象牙（UI 背景浅） | `#f4eed8` | 顶栏/详情卡/按钮渐变起始 |
| 中象牙（UI 背景深） | `#e4dcc0` | UI 渐变结束 / 输入框底 |
| 暗象牙（UI 边 / 浅墨字） | `#a08a68` | UI 边框 / placeholder / 注释字 |
| 基准墨色（正文 & 连线 & 脚印） | `#5a3f28` | 连线·影响 / 正文字 / 中等节点墨色 |
| 深墨色（标题 & 选中 & 脚印） | `#3a2008` | 标题 / 选中星球字 / 脚印 Sprite 填充 |
| 对立墨红 | `#8a3a38` | 连线·对立（虚线） / 对立标签 |
| 学派色系（在褐墨范围内微调，不跳出色系） | 见 §3.2 | 每个学派一个独立褐/棕/橄榄/青褐/紫褐变体 |

---

## 3. 3D 场景改动（核心在 `StarMap.vue`）

### 3.1 牛皮纸穹顶（用户选 B：取消星粒子 + inside-out 大球）
**移除**原 `createStarTexture()` + `THREE.Points` 星空粒子层。

**新增**：`createParchmentDome()` → 返回 THREE.Mesh：
- 几何：`THREE.SphereGeometry(radius=260, 64, 64)`（半径 260，比星云最大分布 2×95 大一圈，防止相机 max=500 时看到穹顶裁剪）
- 翻转法线（BackSide）：`material.side = THREE.BackSide`，内壁贴图可见
- 贴图：CanvasTexture（1024×1024 或 2048×2048），Canvas 2D 画：
  1. **径向渐变**：中央 `#f4eed8` → 60% 处 `#e4dcc0` → 边缘 `#c0b898`
  2. **四角暗角 vignette**：`radial-gradient(ellipse at center, transparent 55%, rgba(80,60,30,0.35) 100%)` 用 `ctx.globalCompositeOperation = 'multiply'` 叠上去
  3. **纸噪点 / 纤维颗粒**（用户要求的复古感）：
     - 方法 A（简单）：for 循环 6000 次，随机 x/y，`ctx.fillRect(x,y,1,1)` 或 2×1 的矩形，fillStyle 用 `rgba(140,120,80, ${Math.random()*0.35})`（浅褐、半透明）
     - 方法 B（细腻）：createImageData 生成 perlin-like 噪点
     - 选方法 A 即可，6000 个点足够复古且 canvas 绘制快
- 材质：`MeshBasicMaterial`（穹顶是"背景贴纸"，不受光照影响，保证纸纹颜色准确）
- 位置：`position.set(0,0,0)` 居中；**加入 allMeshesGroup**（旋转时整个穹顶跟着场景一起转，保证纸纹与星球相对位置一致，而不是固定在相机上像贴纸）
- renderOrder = 0（最早被画，作为天穹打底）

### 3.2 星球节点（用户选 C：墨球 + 牛皮纸墨晕 Halo + 学派褐系微调色）

原结构：SphereGeometry(sphereMesh) + Sprite(haloSprite)，保留结构，只换材质/颜色。

#### 3.2.1 核心球 sphereMesh
- 几何：保留原 `SphereGeometry(radius, 24, 24)`（原 radius=0.75），大小不变
- 材质：**MeshStandardMaterial**
  - `roughness = 0.95`（高粗糙，完全哑光，牛皮纸/墨点不反光）
  - `metalness = 0`（非金属）
  - `color = 学派色`（下面表）
  - **删除 emissive 与 emissiveIntensity**（牛皮纸墨球不发光）
  - `flatShading = false`（光滑墨球表面）
- 学派色表（全部在褐墨色系内，差异微妙但可辨）：

| 学派 | 颜色（sphereMesh color） | 色名变体 |
|---|---|---|
| 古希腊自然哲学/苏格拉底派 | `#4a3828` | 深棕 |
| 柏拉图主义 / 新柏拉图 | `#5a3a30` | 红棕 |
| 亚里士多德主义 / 经院 | `#4a4028` | 橄榄棕 |
| 理性主义（笛卡尔/斯宾诺莎/莱布尼茨） | `#5a3a28` | 棕 |
| 经验主义（洛克/贝克莱/休谟） | `#4a4a28` | 橄榄棕（比经院绿一点） |
| 德国古典哲学（康德/费希特/黑格尔） | `#5a2a28` | 红棕（暖褐） |
| 功利主义 / 自由主义（密尔/罗尔斯） | `#3a4a48` | 青棕 |
| 意志主义/悲观主义（叔本华/尼采） | `#4a2a38` | 紫红棕 |
| 马克思主义 | `#4a2a28` | 深红棕 |
| 实证主义（孔德/罗素） | `#3a3a48` | 蓝棕 |
| 分析哲学（维特根斯坦/波普尔） | `#3a3848` | 紫棕 |
| 现象学/存在主义（海德格尔/萨特） | `#3a4a38` | 绿棕 |
| 后结构/后现代（福柯） | `#3a3a38` | 灰棕 |
| 儒家 / 新儒家（孔/孟/朱/王） | `#6a2a28` | 红褐棕 |
| 道家（老/庄） | `#3a5a48` | 青褐棕 |
| 佛家 / 印度哲学（龙树等） | `#4a2a48` | 紫褐 |
| 日本近代（福泽谕吉） | `#5a4a18` | 金褐 |
| 启蒙（卢梭/霍布斯/马基雅维利） | `#4a3a18` | 暗金棕 |
| 中世纪（奥古斯丁/阿奎那） | `#4a3838` | 深酒棕 |
| 斯多葛（塞内卡/芝诺） | `#3a4a48` | 青灰棕 |
| 默认 / 其他 | `#5a3f28` | 基准墨色 |

#### 3.2.2 外层 Halo Sprite
- **移除**原白色加色发光（AdditiveBlending）的 Halo 图
- **替换**为「牛皮纸墨晕」CanvasTexture：
  - Canvas 尺寸：128×128
  - 径向渐变：中央 `rgba(90, 63, 40, 0.70)` → 35% 处 `rgba(90,63,40,0.35)` → 100% 处 `rgba(90,63,40,0)`
  - （不做纯黑色，而是墨褐色，模拟墨水滴在牛皮纸上渗透晕开一圈的感觉）
- SpriteMaterial：
  - `map = 上面的 CanvasTexture`
  - `transparent = true`
  - `depthWrite = false`（不写深度，不挡其他星球）
  - **blending = THREE.NormalBlending**（普通透明混合，不是加色）
  - `color = 0xffffff`（不额外染色）
- 尺寸：原 scale=3.8 → 改 **scale=4.6**（墨晕晕开比原发光 Halo 稍大，牛皮纸渗透感更明显）

### 3.3 连线
- **影响线（type=influence）**：原蓝色 → `new THREE.LineBasicMaterial({ color: 0x6a4a28, transparent: true, opacity: 1.0 })`（深褐实线）
- **对立线（type=opposition）**：原红色虚线 → LineDashedMaterial + `color: 0x8a3a38`（红褐虚线，dashSize/gapSize 同原）
- 距离相机 fade 系数：同原逻辑（camDist 插值 0~1 控制 `material.opacity`）
- 选中/搜索态下的非命中连线淡化：同原逻辑（opacity=0.08 隐形）

### 3.4 星球名字标签（CSS2DRenderer）
保留三级距离自适应逻辑。只改样式：
- `color: #3a2008`（深墨色）
- `font-family: Georgia, "Times New Roman", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif;`（衬线字体）
- 中文字：`font-weight: 500`（稍粗）
- 英文字：`font-style: italic; color: #7a6a48`（暗象牙，比中文浅一点）
- 选中态星球：中文加 `font-weight: 700; color: #2a1008`（更深更粗），英文加深到 `#5a4a28`

### 3.5 搜索命中 + 选中高亮（用户选 C：三层叠加，零发光）
**重写 applySelectionStyle 和 animate 主循环脉动逻辑**（原 emissive 相关全部删除，替换为牛皮纸语言）：

每个节点额外维护两个新对象，在 `buildGalaxy` 时创建：
- `node.selectionRing`：`THREE.Mesh(new THREE.RingGeometry(innerR, outerR, 32), new THREE.MeshBasicMaterial({ color: 0x3a2008, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }))`
  - innerR = sphereR × 1.6，outerR = sphereR × 1.9（虚线圆环，略大于星球+墨晕）
  - Ring 本身不是虚线——要用 LineSegments 做虚线？或者做一个透明的 ring，然后在 Canvas 上画虚线环贴图给 PlaneGeometry？简单起见：用 `THREE.RingGeometry` 做实体环，但给它一个 stroke-dash 的 CanvasTexture（1 px 深褐在透明上，6px dash / 4px gap），PlaneGeometry 或者做一个 thin TorusGeometry。**更简单方案**：用 `LineLoop(BufferGeometry(circle points))` + `LineDashedMaterial(color=0x3a2008, dashSize=0.15, gapSize=0.1)` 做虚线圆环，`line.computeLineDistances()` 必须调
- `node._baseR` / `node._baseHaloR`：原始缩放备份

#### 三层叠加具体表现：
**命中态（在 searchHitIds 但未选中）**：
1. sphereMesh.scale = 2.0~2.6 pulsating（sin 脉动）
2. haloSprite.material.opacity = 0.7~0.95 呼吸 + haloSprite.scale = 1.2~1.5 pulsating
3. selectionRing（虚线环）visible=true，scale=1.0~1.25 pulsating，opacity=0.75
4. 非命中星球：sphereMesh.scale × 0.4，sphereMesh.material.color.lerp(象牙白 #dcd4b8, 0.7)（几乎融进纸里）；haloSprite opacity=0.1

**选中态（selectedId===id，优先级 > 命中态）**：
1. sphereMesh.scale = 2.2~3.0 pulsating（比搜索态更大一点）
2. haloSprite.material.opacity = 0.75~1.0 呼吸 + haloSprite.scale = 1.3~1.7 pulsating
3. selectionRing visible=true，scale=1.1~1.4 pulsating，opacity=0.9
4. 非相关星球：同搜索非命中（scale 0.4 + 淡化到象牙白 + halo 0.1）
5. 非相关连线：opacity 0.08

**默认态**：
- sphereMesh.scale = 1.0（还原）
- haloSprite.material.opacity = 0.85（还原）
- selectionRing.visible = false
- material.color 还原为学派原始色（保存备份 _originalColor）

#### 数据结构建议：
在 buildGalaxy 创建每个 node 时额外存：
```js
// 备份原始色，供还原用
node.sphereMesh.userData._origColor = new THREE.Color(schoolColor);
// 虚线圆环（选中原点时加的）
node.selectionRing = createDashedSelectionRing(sphereR);
allMeshesGroup.add(node.selectionRing);
node.selectionRing.position.copy(node.sphereMesh.position);
node.selectionRing.lookAt(camera.position); // 每帧 billboard
```

### 3.6 脚印特效（用户选 Y 经典活点地图 + 方案 A 球壳落点）

#### 3.6.1 数据结构
- 全局脚印 Group：`const footprintGroup = new THREE.Group(); allMeshesGroup.add(footprintGroup);`（旋转时一起转）
- 脚印池：`const activeFootprints = [];` 每项：`{ sprite, bornTime: number, age: 4.0 }`
- 容量上限：120 只（超出则销毁最早 bornTime 的）
- 左右脚切换计数器：`let footParity = 0;`（0=左脚，1=右脚，每放一只翻转）
- 鼠标球壳落点距离阈值：上一只脚印位置与当前落点距离 > **3 世界单位**才生成新的（防止不动时堆一地）
- 最后一次落点：`lastFootPos = new THREE.Vector3()`（备份用于距离计算）

#### 3.6.2 生成 Canvas 脚印 Sprite 纹理
- 两个 CanvasTexture：左脚（footL）和右脚（footR），32×32 px
- 脚印形状：深墨色 `#3a2008` 填充（用户希望在象牙白上清晰）
- 绘制路径：类似 mockup 里的脚印 SVG，转成 Canvas 2D path
  - 足尖略尖朝上或朝前；脚跟略圆
  - 左右脚沿中心轴镜像
  - 边缘半透明羽化（径向渐变 overlay multiply）

#### 3.6.3 落点计算函数：intersectVirtualSphere(clientX, clientY) → Vector3 | null
- 复用原 Raycaster 管线：`raycaster.setFromCamera(pointer, camera)`
- 不是对星球 mesh 求交，而是**对虚拟球壳求交**：
  - 建立一个临时不可见 `THREE.Sphere(new THREE.Vector3(0,0,0), 95)`
  - 或者手写射线-球相交解析公式：raycaster.ray.intersectSphere(sphere, targetVec)
  - 得到交点 → 返回世界坐标（相对于 allMeshesGroup 空间，应直接加到 footprintGroup）

#### 3.6.4 触发时机（Y 选项）
- **按住右键拖拽旋转时**：在原 `onPointerMove` 回调里（只在 pointerdown.button===2 且 capturing=true 的那段里）每帧：
  - 计算 raycaster 与球壳交点
  - 如果 `distance(lastFootPos, newPos) > 3`：调用 spawnFootprint(newPos)，更新 lastFootPos = newPos
- **滚轮缩放时**：在 `controls.addEventListener('change', ...)` 回调里（OrbitControls 的缩放每次触发 change 事件）：
  - 取当前指针 clientX/clientY 位置，计算球壳交点
  - 直接 spawn 一只脚印（跳过距离阈值检查，因为滚轮每步都要留痕）
- **不触发**：鼠标悬停（未按下）、点击星球（pointerdown left button）

#### 3.6.5 spawnFootprint(pos) 函数
1. 先检查容量：activeFootprints.length ≥ 120 → 销毁数组第 0 只（最早的）：`sprite.parent.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose(); activeFootprints.shift();`
2. 创建 Sprite：
   - `new THREE.Sprite(new THREE.SpriteMaterial({ map: footParity===0 ? texFootL : texFootR, transparent: true, depthWrite: false, opacity: 1.0 }))`
   - position = pos.clone()，再加一点点径向外偏出（`pos.normalize().multiplyScalar(0.5)`），确保脚印在星球球面外面一点点，不被星球挡住
3. scale：统一 3.5（≈70% 小星球尺寸）
4. `footprintGroup.add(sprite)`
5. 推入 activeFootprints：`{ sprite, bornTime: performance.now() }`
6. `footParity ^= 1`（0↔1 切换左右脚）
7. 更新 lastFootPos = pos.clone()

#### 3.6.6 淡出逻辑（主循环 animate 每帧）
在 animate 主循环里新增 `updateFootprints()`：
```js
const now = performance.now();
for (let i = activeFootprints.length - 1; i >= 0; i--) {
  const f = activeFootprints[i];
  const ageSec = (now - f.bornTime) / 1000;
  if (ageSec >= 4.0) {
    // 4 秒到期，销毁
    f.sprite.parent.remove(f.sprite);
    f.sprite.material.map.dispose();
    f.sprite.material.dispose();
    activeFootprints.splice(i, 1);
  } else {
    // 线性淡出：0s → opacity 1.0；4s → opacity 0
    f.sprite.material.opacity = 1.0 - (ageSec / 4.0);
  }
}
```

### 3.7 灯光体系新增（因为改成 MeshStandardMaterial 哑光）
原场景如果没加光，或者只有极弱的光，MeshStandardMaterial 会全黑。必须加：
- `scene.add(new THREE.AmbientLight(0xf4eed8, 1.0))`（浅象牙白环境光，强度 1.0，整体照亮牛皮纸墨球的哑光表面）
- `scene.add(directionalLight = new THREE.DirectionalLight(0xffffff, 0.4))`（冷白方向光，轻微方向阴影层次；position (50, 80, 60)）——不要太强，不然哑光会过亮像塑料
- 如果还是偏暗：再加 `new THREE.HemisphereLight(0xf4eed8, 0xd4ccc0, 0.3)`（天地半球光，浅象牙→中象牙）

渲染器参数保留，但可以考虑 `renderer.outputColorSpace = THREE.SRGBColorSpace`（如果 Three.js v0.160 默认不是的话），让牛皮纸色更准。

---

## 4. 全局 UI 风格改造（App.vue + DetailCard.vue + style.css）

**所有 UI 元素（顶栏/搜索/搜索下拉/登录注册弹窗/详情卡/图例/视图切换按钮/收藏按钮/我的收藏返回按钮）统一从深空蓝紫 → 仿古象牙白牛皮纸风。**

统一设计语言：
- **背景**：`linear-gradient(140deg, rgba(248,240,216,0.92), rgba(228,220,192,0.92))`（象牙白渐变 + 高不透明度 0.92，牛皮纸不透明感更强）
- **边框**：`1px solid #a08a68`（深褐纸边），`border-radius: 4~6px`（不要太圆润，古地图边缘略带方）
- **字体**：衬线 `Georgia, "Times New Roman", "Noto Serif SC", serif;`，正文 `color: #3a2008`，placeholder/次要 `#8a7a58`
- **阴影**：`0 3px 10px rgba(70,40,10,0.25)` + `inset 0 0 18px rgba(160,130,80,0.15)`（内阴影，牛皮纸凹进纸面的质感）
- **输入框**：`background: rgba(234,226,198,0.95); border: 1px solid #a08a68; color: #3a2008`；focus 时 `border-color: #6a4a28; box-shadow: 0 0 6px rgba(100,70,30,0.3)`（深褐光晕，不是蓝）
- **按钮**：默认 `rgba(220,208,170,0.6)` + 褐边；hover 加深到 `rgba(200,180,140,0.75)`；primary 按钮 `rgba(160,120,70,0.55)`（深棕底） + `color: #f4eed8`（浅象牙字，高对比）

### 4.1 具体元素
- **哲学星图 Title**：衬线加粗，`letter-spacing: 3px;`，`color: #4a2f18`，加 `text-shadow: 1px 1px 0 rgba(255,240,200,0.6)`（轻微浮雕感）
- **DetailCard**：仿 mockup 风格
  - 最外层牛皮纸渐变 + 深褐边 + 内外阴影
  - 内层 `::before` 画 1px `dashed` 边框（四角 inset 4px，像旧书皮的装订线）
  - section 左边框：原来的蓝/橙/青 → 换成不同深浅的褐（核心观点 `#8a5a30` / 生平 `#b08040` / 历史背景 `#8a8a60` / 名言 `#6a5a48` / 著作 `#7a5a48`）
  - 关系 section：← 受影响 `#3a5a38` 深绿褐；→ 影响 `#3a3a6a` 蓝褐；✗ 对立 `#8a3a38` 红褐
- **登录注册弹窗**：同牛皮纸风；error 字 `#a03a38`（红褐），不是粉
- **收藏按钮**：favorited 状态：`background: rgba(180,150,70,0.4); border-color: rgba(160,130,60,0.5); color: #6a4a18;`（金褐，不是橙黄）
- **视图切换按钮（星图/聚类）**：牛皮纸底；active 态深褐底 + 象牙白字
- **用户问候 👤**：`color: #6a4a28`（中墨褐）

### 4.2 CSS 文件影响范围
- `style.css`：可能要移除/替换少量遗留的深空 search-input 样式（已确认之前删过 width:100% 那块，其他可能还有）
- `App.vue <style>` 全局样式块：**全量替换**（因为现在写的都是深空蓝紫色）
- `DetailCard.vue <style scoped>`：收藏按钮那部分改成牛皮纸色

---

## 5. 实现优先级顺序（建议）

因为改动大，按顺序做，每一步验证，防止越改越乱：

1. **StarMap：牛皮纸穹顶 + 灯光**（先把空间底色改对，再画别的）
2. **StarMap：星球节点换哑光墨球 + 学派微调色 + 墨晕 Halo**（替换原发光球）
3. **StarMap：连线换深褐实线 / 红褐虚线**
4. **StarMap：CSS2D 标签字体/颜色替换**
5. **StarMap：搜索/选中高亮重写（三层叠加 + selectionRing 虚线环 + 淡化非命中）**
6. **StarMap：脚印特效（球壳交点 + 左右脚 Sprite + 4s 淡出池 + 右键/滚轮触发）**
7. **App.vue / style.css / DetailCard：全局 UI 换牛皮纸风格**
8. 构建验证 + 浏览器实测每个功能（旋转/缩放/搜索高亮/选中脉动/登录/收藏/详情卡/我的收藏视图切换）

---

## 6. 风险与注意事项

| 风险 | 影响 | 规避 |
|---|---|---|
| 原星球用的是 MeshBasicMaterial（不受光），直接换成 MeshStandardMaterial 后场景没加光 → 星球全黑 | 高 | 在 initScene 第一步就加 AmbientLight 1.0 + DirectionalLight 0.4 + 可选 HemisphereLight 0.3 |
| 牛皮纸穹顶 BackSide Sphere UV 贴图上下极可能接缝明显（SphereGeometry 顶底封顶点 UV 收敛） | 中 | Canvas 纹理的纸纹噪点是均匀随机的，所以即使 UV 封点也不会看到明显接缝；如果接缝明显，改用 `SphereGeometry(260, 64, 64, Math.PI, Math.PI*2, 0, Math.PI)` + 把纸纹渐变中心设在水平中线处 |
| 脚印射线求不到交点（相机在星云球内部时，射线起点在球内，intersectSphere 返回 null） | 高 | ray-intersect-sphere 要手动算两个交点取**正方向第一个 hit**（从相机出发的 +t 那个），或者改用 raycaster.ray.intersectSphere 并处理两种情况：inside 时取 far intersection；outside 时取 near intersection |
| 搜索/选中高亮时，sphereMesh.material.color 的 lerp 把学派原色覆盖没了（还原不回来） | 中 | buildGalaxy 时把每个 sphereMesh.material.color.clone() 存到 userData._origColor，applySelectionStyle 默认态时 `.copy(_origColor)` 回去 |
| `line.computeLineDistances()` 忘了调 → 虚线圆环 selectionRing 不显示（全实心/全不见） | 低 | 创建 LineDashed 后立即调用 computeLineDistances()；每次 scale 变化不用重新计算（dashSize 在 object space） |
| 脚印放的位置太靠近星球球面，被星球 sphereMesh 挡住（depth test 输了） | 中 | spawn 时 position 做 `pos.normalize().multiplyScalar(0.5)` 把脚印向球外推一点点；同时 footprintGroup 的 renderOrder 设为比星球 sphereMesh 更高的数（例如 10），强制后画，即使 z 值接近也不被 depth 裁掉 |
| 学派色表不完整（56 位哲学家不在上述 20 个学派里） | 低 | 默认 `#5a3f28` 基准墨色兜底；先跑一次 console 打日志检查每个 philosopher.school 的实际值，补上表 |

---

## 7. 测试清单（完成后逐功能过）

- [ ] 浏览器打开 http://localhost:5173，场景不是黑色太空：能看到象牙白牛皮纸穹顶包裹着 3D 星云，有纸噪点颗粒 + 四角暗角
- [ ] 右键拖拽旋转：整张牛皮纸 + 星球 + 脚印整体一起转（无错位），万向锁问题无回归
- [ ] 滚轮缩放：50~500 正常；距离标签三级显隐正常（>200 全隐，<130 中英都显）
- [ ] 星球视觉：哑光深褐墨球（无 emissive 发光），外层墨晕 Halo 大小 4.6 晕染感明显；学派之间颜色有微差（但都在褐墨色系内）
- [ ] 连线：影响深褐实线、对立红褐虚线，远处 fade 正常
- [ ] 搜索功能：输入「康德」，康德星球立刻三层叠加高亮（放大脉动 + 墨晕呼吸 + 虚线圆环），其他星球缩到 0.4×、淡化近象牙白；搜索下拉项点选后自动跳过去，退出收藏视图逻辑正常
- [ ] 点击星球：选中态三层叠加，详情卡牛皮纸风格显示，🔗思想关系信息正常
- [ ] 脚印特效：按住右键拖拽旋转，每移动 3 单位在球壳交点处生成左右脚交替脚印；4 秒线性淡出，满 120 自动销毁老的；停止拖拽不生成；普通悬停/点击不生成；滚轮缩放每步生成；旋转时脚印跟着场景一起动（不固定在相机上）
- [ ] 顶栏/搜索/登录弹窗：UI 风格统一为象牙白牛皮纸 + 深褐字，无深空蓝紫元素残留
- [ ] 用户系统：登录/注册/退出/收藏/我的收藏视图/返回全部星云——全部功能正常
- [ ] 收藏视图：displayNodes/displayLinks 筛选正常，节点仍为牛皮纸墨球风格
- [ ] npm run build 无错误通过
- [ ] 后端 API：无改动（视觉改造只动前端），curl 测试全部通过（不用重复测，代码没动后端）

---

## 8. 范围边界（不做的事，防止 scope creep）

- ❌ 不改动后端（Express/Prisma/SQLite 全链路 0 改动）
- ❌ 不升级 Three.js v0.160（不动 package.json 依赖）
- ❌ 不做方案 C 的「射线击中星球就踩星球表面脚印」升级版（§7.6 风险里提了，用户说先做 A，之后再优化）
- ❌ 不做 2D 平面图/D3 力导向图（用户已明确保留 3D）
- ❌ 不做节点学派色 legend 图额外加色卡（如需可以后续加，但不在本次 scope）

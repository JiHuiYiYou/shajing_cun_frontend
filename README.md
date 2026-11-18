# 沙井村 · 舆图

民国沙井村七十二户的交互式村志。据《沙井村72户人物信息归集表》照录人物、时令、经济与村务，
以水墨舆图为底，每月一案，抉择关乎村款、人望与乡里嫌隙，岁末结算。

**现在这张图是可以走进去的。** 镜头跟着主角在村里游走；走近谁，按 E 就与谁说话；
走到村庙看村志，走到村小学校看族属谱，走到公会地议本月案卷，走到谷场过月。
七十二户都是村里人，散在舆图上，走近了才现出姓名。

## 目录

```
沙井村前端.html            页面结构（标记）
assets/css/style.css        旧界面样式（案卷、弹层、户册）
assets/css/world.css        世界层样式（相机、人物、名牌、提示、缩略图）
assets/js/data.js           史料数据（照录原文，未作改写）
assets/js/sites.js          世界坐标表（由舆图识别 + 人工摆位生成）
assets/js/world.js          世界引擎：相机、实体、移动、碰撞、交互
assets/js/app.js            应用逻辑：玩法、面板、择人、存档
assets/fonts/*.woff2        思源宋体 SC 自托管子集（OFL 1.1）
assets/shajing/*            水墨素材（村景 / 枯枝 / 纸纹）
assets/map/                 舆图：world.jpg（主图 6144×4080）· overview.jpg（总览）· base.jpg（粗图底本）
assets/char/*.png           十六张人物立绘（透明底）
build/沙井村前端.单文件.html  打包产物：自包含单页，双击即看
tools/                      出图管线、摆位、字体裁切、打包、巡检
```

## 世界是怎么来的

**图是先生出来的，坐标是从图上认出来的，位置再由人校一遍。**

```
tools/mapgen/gen_map.py     ① 出粗图：MiniMax-H3-Image 文生图，3072×2040，四张候选
tools/mapgen/clean.py       ② 抹掉图上被模型写出的乱码汉字（纸底泛洪 + 墨色笔画修复）
tools/mapgen/describe.py    ③ 视觉模型读图：九格各是什么、院落框、主街、河与桥
tools/mapgen/tiles.py       ④ 切九宫格 → 逐块精修（带参考图的图生图）→ 缝合 → 出主图与总览
tools/mapgen/derive_sites.py ⑤ 认出的框变成世界坐标表：七十二户的门前落点、碰撞盒、道具
tools/placer.html           ⑥ 认错了在这里改：看图、拖点、导出
tools/mapgen/gen_char.py    ⑦ 十六张立绘：生图 → rembg 抠底 → 统一墨调
```

尺寸链全是整数，不拉伸：

```
粗图 3072×2040  →  每格 1024×680  →  精修成 2048×1360  →  主图 6144×4080  →  总览 1536×1020
```

九块精修图各自都有接缝，缝起来才是一张；所以浏览器里只摆**一张**主图，
先用总览顶着，主图到位再整张换上——换的是整张，不会浮出格线。
九块瓦片是中间件，留在 tools/mapgen/work/ 里，不进 assets/。

**位置是反推的**：`describe.py` 让视觉模型在图上找出四十来个院落框、主街折线、
水井与五处地点；`derive_sites.py` 把七十二户按宗族分到这些院子上（一族一片区，
一个大院子住两三家），给每户找一个「不在任何院框里」的门前落点；
认错了就在 `tools/placer.html` 里拖。

## 玩法在哪儿

| 地方 | 做什么 |
|---|---|
| **公会地** | 本月案卷：三个选项，村款、人望、矛盾随之增减 |
| **谷场** | 过月。案卷未结则过不去——门槛与从前一样 |
| **村庙** | 村志：岁时录、悬案牍 |
| **村小学校** | 族属谱：七十二户按宗支画成的谱系，点节点看身家 |
| **白河** | 经济志：地价、地租、赋税、借贷 |
| **七十二户** | 走近按 E，看这一家的户册 |
| **井、碾盘、谷仓、古槐、桥、界碑、戏台、水碓** | 走近按 E，各有一两句闲话 |

顶栏只剩：村款、人望、矛盾、时钟、重开。「寻人」浮层可搜索并把镜头推到那一户。

## 怎么跑

```bash
python -m http.server 8899
# http://127.0.0.1:8899/沙井村前端.html
```

字体请求受 CORS 限制，`file://` 下会被浏览器拦下，退回系统宋体。

若只要一份能双击就看的文件，用打包产物 `build/沙井村前端.单文件.html`：
字体、样式、脚本与总览图都已内联，舆图主图与立绘没有内联（太大），
单文件版里看的是糊的总览、人物是剪影——能玩，不是全的。

## 工具

```bash
C:\Users\liuzhen\miniconda3\python.exe tools\shoot.py            # 浏览器巡检：逐屏截图 + 控制台报错
C:\Users\liuzhen\miniconda3\python.exe tools\subset_fonts.py     # 字体裁切
C:\Users\liuzhen\miniconda3\python.exe tools\build.py            # 打包自包含单文件
C:\Users\liuzhen\miniconda3\python.exe tools\check.py            # 快速体检（开页、择人、走两步）
C:\Users\liuzhen\miniconda3\python.exe tools\walk.py             # 走一遍玩法：议案 → 过月 → 看村志
```

出图管线（要花钱，断了能续）：

```bash
python tools/mapgen/gen_map.py --dry-run   # 只看 prompt
python tools/mapgen/gen_map.py             # 出四张粗图候选
python tools/mapgen/gen_map.py --pick 2    # 定稿
python tools/mapgen/clean.py               # 抹掉乱码汉字
python tools/mapgen/describe.py --show     # 视觉模型读图
python tools/mapgen/tiles.py               # 切九块 → 精修 → 缝合 → 出主图
python tools/mapgen/derive_sites.py        # 生成世界坐标表
python tools/mapgen/gen_char.py            # 十六张立绘
```

H3-Image **没有 seed**：同一 prompt 重跑结果不同。所以每一步都落盘缓存，
已存在就跳过——断了重跑不会重复烧钱。

改过任何文案后要重跑 `subset_fonts.py`：字体是按本页实际用字裁的，
少一个字就是一处豆腐块。该脚本落盘后逐字核对，少字即报错退出。

## 版式与配色

- 强调色只此一色：朱砂 `#a5311d`。
- 圆角一律 2px 直线（档案纸样），仅年轮、表盘、徽记用圆。
- 十五宗族各一色，低饱和低明度差，取色经两两可分（最小 ΔE 12.8）
  与对纸色对比（≥3.2:1）核算。
- 字体思源宋体 SC，衬线取村落方志的语感，非装饰性选择。

## 数据

`assets/js/data.js` 六个部分，全部照录原表：

| 字段 | 内容 |
|---|---|
| `households` | 户，七十二户 |
| `calendar` | 岁时，二十四条 |
| `econ` | 经济参数，十条 |
| `events` | 岁内案卷，十二案 |
| `backlog` | 未结案牍，七条 |
| `places` | 村落之处，五处 |
| `counts` | 族属统计 |

正文中转录存疑、截断之处保留原样，以 `【】` 标出。
数值与结局为推演设定的部分，页面上另行标明，不与原文混同。

族属谱不改动 `data.js`：谱是运行时从「族属」栏推出来的，
推解规则写在 `app.js` 的 `buildKinship()` 里，可复核。

`assets/js/sites.js` 另是一份表：七十二户的门前落点、五处地点、器物、
碰撞盒、主街折线，全是世界像素。**这一份是推出来的**，
生成它的规则写在 `tools/mapgen/derive_sites.py` 里，可复核，也可在
`tools/placer.html` 里改。

立绘是**拟像**，非史实：形貌由模型生成，只求意趣之似。
人物面板里都注明了这一句。

## 已知取舍

- **地图只出一张主图**，不做分块懒加载。九块精修图接起来才无缝，
  分块往页面上摆会浮出格线；总览只当加载中的占位。
- **碰撞盒**由识别出的院落框内缩而成，比屋子略小：走起来有时会蹭到屋檐。
- **主角只有一张立绘**，朝左靠翻转，没有四向行走图。
- **单文件版是轻量版**：没有主图与立绘，看的是总览与剪影。
# shajing_cun_frontend

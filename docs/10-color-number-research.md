# 10 · 色号调研报告

日期：2026-10-26　|　状态：调研完成，未实施任何代码变更　|　执行：Qoder agent（受 LiuMR-del 委托）
方法：开源结构化数据仓库 + 购物平台（淘宝/1688/京东）+ 社交与媒体（小红书转引/知乎/搜狐/什么值得买/中工网/钛媒体）三路交叉验证。
关联：[11 · 市场调研](11-market-research.md)
声明：本报告只做调研分析，未修改 pingdou 项目任何代码。所有 HEX/RGB 为屏幕参考值，**不等同实物色值**。

---

## 1. 结论摘要

1. **主色卡应采用 MARD 221**（色号格式「字母+不补零数字」，A1–M15，9 系共 221 色）。它是国内零售、图纸交流、第三方豆子售卖的**事实互换标准**：中工网/北京青年报原话「MARD 的色号体系逐渐成了大家默认的参考标准」；淘宝/1688 上大量非 MARD 品牌豆以「MARD 同色号」售卖；主流图纸工具全部内置。
2. **数据可直接落地**：开源仓库 HansBug/pindou-color-data（**MIT 授权**）提供 MARD 221 双来源核对版（`mard-221-alfonse-doudou`，建议主用）+ 交叉校验版（`mard-221-github`），含 `colors.json / xlsx / legend.pdf / README` 四件套，官方建议以 git submodule 挂载。数据日期 2026-05-19。
3. **第二梯队**：Artkal/优肯 C197（唯一有**官方 RGB PDF** 出处，含 CT 透明系 RGBA 表达）→ MARD 291（221+70 特殊色）→ COCO 291（性价比品牌）。
4. **五个必须处理的坑**：纯数字码跨品牌撞车；MARD 221 双源 77/221 HEX 不一致；MARD 291/COCO 291 仅单一第三方来源；屏幕值≠实物（批次/磨砂/第三方同色号差）；码格式不统一（补零/不补零混用）。
5. **授权边界**：MIT 覆盖仓库整理成果，**不覆盖品牌商标与官方色卡版权**。可用色号数据，不可冒用品牌官方名义宣传；`verified` 字段应保持 false 直至完成实物抽样核验。

---

## 2. 证据等级说明

| 等级 | 含义 | 本报告中的例子 |
|---|---|---|
| A | 一手媒体/官方文件/可复跑数据 | 中工网报道、Artkal 官方 RGB PDF、HansBug 仓库 JSON |
| B | 平台公开列表页/检索片段/工具站自述 | 淘宝/1688 列表价、pixelbead.art 色卡页 |
| C | 社区转引或 SEO 教程，未必玩家原话 | 搜狐号自述、新京报转引小红书博主 |
| D | 推断 | 授权边界的法律判断 |

---

## 3. 色卡全景（11 套，含主流度评级）

来源：HansBug/pindou-color-data `manifest.json`（2026-05-19）。评级口径：S=国内小店/玩家图纸默认体系；A=成熟常见有官方或工具生态；B=工具/材料包/玩家圈常见。

| 系列 | 色数 | 主流度 | 码格式 | 数据源质量 | 透明表达 |
|---|---:|---|---|---|---|
| MARD 221（alfonse-doudou 核对版） | 221 | S / 5.0 | 字母+不补零（A1） | 双第三方源交叉 | 无 |
| MARD 221（github 源码版） | 221 | S / 5.0 | 同上 | 与上者 77/221 HEX 不同 | 无 |
| MARD 291 | 291 | S / 4.7 | 同上 + P/R/T/Y/ZG/Q | **单一**第三方源 | 无 |
| 优肯 Artkal 418（C197+M221 官方合并） | 418 | A / 4.2 | 零补（C01/MA1） | 官方 PDF+官方色卡图 | CT 系 RGBA |
| 优肯 Artkal C197 | 197 | A / 4.1 | 零补 | **官方 RGB PDF** | CT01–09 RGBA alpha=128 |
| 优肯 Artkal M221 | 221 | A- / 3.9 | 零补（MA1/MH1） | 官方；MH1 透明用 #FFFFFF00 | RGBA |
| COCO 291 | 291 | A- / 3.9 | **混用**（A01 与 D1 并存） | **单一**第三方源 | 无 |
| 漫漫 278 | 278 | B+ / 3.7 | 字母系 | 上游 5 组重复色号已交叉修正 | 无 |
| 盼盼 289 | 289 | B+ / 3.6 | 中文色系名 | 4 个色号不可辨认→`UNKNOWN-*` 占位 | 无 |
| 咪小窝 290 | 290 | B / 3.4 | 中文色系名 | 4 个 `UNKNOWN-*` 占位 | 无 |
| 优肯 174 旧表 | 174 | B- / 3.0 | 零补 | 旧公开表，参考>采购 | 无 |

注：黄豆豆 291、小舞 291 与 MARD 291 公开源码数据**完全重复**，仓库已去重合并；采用 MARD 291 即覆盖二者口径。

---

## 4. MARD 221 色号明细（推荐主色卡）

字段：`{code, hex, rgb, group, source}`。9 系分布与首尾色号（取自 `mard-221-alfonse-doudou/colors.json`）：

| 系 | 色数 | 首色 | 尾色 | 观感 |
|---|---:|---|---|---|
| A | 26 | A1 `#FAF5CD` | A26 `#FFC734` | 黄/暖浅 |
| B | 32 | B1 `#DFF13B` | B32 `#92AD60` | 黄绿/橄榄 |
| C | 29 | C1 `#F0FEE4` | C29 `#364A89` | 浅绿→深蓝 |
| D | 26 | D1 `#ACB7EF` | D26 `#D6C6EB` | 蓝紫/粉紫 |
| E | 24 | E1 `#F6D4CB` | E24 `#DEBEE5` | 肤粉/浅紫 |
| F | 25 | F1 `#FE9381` | F25 `#E84854` | 红/珊瑚 |
| G | 21 | G1 `#FFE4D3` | G21 `#B38561` | 肤/棕 |
| H | 23 | H1 `#FFFFFF` | H23 `#9B9C94` | 白/灰 |
| M | 15 | M1 `#BBC6B6` | M15 `#747D7A` | 莫兰迪灰绿 |

样例：A1 `#FAF5CD`(250,245,205)、A5 `#F0D83A`、F25 `#E84854`、H1 `#FFFFFF`、H23 `#9B9C94`、M15 `#747D7A`。

**MARD 291 增量 70 色**：P(23 珠光/灰，P1 `#F9F9F9`)、R(28 高饱和，R1 `#D40E1F`)、T(1)、Y(5 荧光，Y1 `#FF6FB7`)、ZG(8)、Q(5)。特殊系实物差异大，建议默认不进入转换候选、仅作全色制作可选。

---

## 5. 备选色卡明细

**Artkal/优肯 C197**：C(157) CE(17) CG(7) CP(7) CT(9)。零补码（C01 `#FFFFFF`、C02 `#000000`、C157 `#1D252D`）。**CT01–CT09 为透明材质**，数据用 `#RRGGBBAA`/`[r,g,b,a]`（alpha=128）+ `transparency` 字段显式标记；CG/CP 官方 PDF 未给数值者以官方色卡图采样补齐并标 `official_chart_image_sampled`。尺寸口径：Artkal S=5mm、M=2.6mm；M221 为官方 MARD 兼容线（A1↔MA1、H1[透明]↔MH1）。

**COCO 291**：18 系（A12 B11 C10 D8 E15 F25 G8 GB8 H32 J22 K39 L14 M23 N5 S15 W5 Y15 Z24）。**码格式不统一**（A01 补零、D1/L1 不补零），导入与映射前必须归一化。中工网报道其手工店价 10g≈1000 粒约 1.4 元，是平价常用豆。

---

## 6. 市场与采购证据（购物平台）

| 渠道 | 商品形态 | 价格 | 色号口径 |
|---|---|---|---|
| 1688 批发 | 221色融合豆补充包 袋装 2.6mm | ¥0.41–0.44/袋 | 「MARD 同色号同品质」 |
| 淘宝零售 | 单色补充包（星芒/效融/小糊涂/小森林） | ¥0.5–3.8 | 「MARD 同色号 / mard家同款」 |
| 淘宝零售 | 221色套装/全色补充包 | ¥32–243 | MARD 221 |
| 中工网（A） | COCO 手工店 10g≈1000 粒 | ¥1.4 | COCO |
| 中工网（A） | 婆娑 | ¥25.8 | 婆娑 |
| 钛媒体（A） | **真 MARD 小豆** | **¥225/斤，每日限购秒空，靠消费"配货"拿会员** | MARD |

1688 官方采购指南（2026-10）把「要求供应商提供 221 色以上色卡、确认融合豆与 MARD、Coco 等主流品牌色号兼容」列为验货标准——**MARD 兼容已是 B 端采购门槛**。

规格结论：**色号体系与豆子尺寸正交**。国内零售补充包主流为 2.6mm 融合豆按 MARD 221 色号售卖；5mm 标准豆在 MARD/Perler/Hama/Artkal S 间可互通混用。

---

## 7. 社区使用证据（社交/内容平台）

- 单色号粒度讨论：「MARD 体系 B15 缺货优先用同搭配色号 B16、B13、B5；看色卡 B15 左右相邻色，B14 或 B16 通常最自然。」（库库AI 转载攻略）
- 跨品牌撞车警告：「MARD 体系的 24 号是浅粉，换成另一个国产品牌，24 号可能就成了浅蓝。」（对错牌图纸教程）
- 色差口径：「色号并不通用，混用容易导致色差。建议锁定单一品牌备豆；某色号缺货单独买小袋补充，而不是用其他品牌相近色替代。」「屏幕有色差……优先看色号名称」「色差以色卡为准，电子稿仅供参考。」
- 工具生态：Resprite 内置「MARD 221 / MARD 291」调色板；BeadPattern 支持 MARD/COCO/漫漫/盼盼/Artkal；拼豆大师支持 MARD/COCO/米小窝/Perler/Hama/Artkal；拼豆酱标注「Mard 为国内主流」；PinDou 覆盖 8 品牌。
- 媒体（A）：中工网/北京青年报 2026-02-25「MARD 的色号体系逐渐成了大家默认的参考标准」；MARD 店铺粉丝 35.7 万、回头客超 9000；「好多豆子都很难买」。淮南日报 2026-04 报道拼豆热与 Mard 月均产量。

---

## 8. 数据质量与授权

1. **MIT**：HansBug/pindou-color-data 为 MIT，可商用、需保留版权声明；建议 `git submodule add` 挂载。
2. **双源差异**：MARD 221 两来源 221 个色号集合一致，但 77 个 HEX/RGB 不同、144 一致；差异明细在 `Mard-221-source-differences.json`。主用 alfonse-doudou、github 版交叉校验。
3. **单源风险**：MARD 291 与 COCO 291 仅来自 get-colors-from-beans 一个第三方源；且 MARD 291 的 P/Y/Q 系 HEX 与 COCO 的 M/N/W 系完全相同，疑似同源复制，采用前需独立核验。
4. **官方出处仅 Artkal**：C197 有官方 Shopify CDN RGB PDF；其余品牌无官方机器可读色值。
5. **不可辨认色号不猜测**：盼盼/咪小窝各 4 色用 `UNKNOWN-*` 占位 + `unidentified:true`，下游可过滤——这是好的数据卫生范式，pingdou 导入外部色卡时应沿用。
6. **商标边界（D 级推断）**：MIT 不授予品牌商标权；界面与导出应写「色号数据来源于公开整理，非品牌官方授权；屏幕值不等同实物」，并保持 `verified:false` 直至实物抽样。

---

## 9. 对 pingdou 的落地建议（本次不实施）

1. 主色卡 = MARD 221（alfonse-doudou），以 submodule 挂载替换 Demo 56；`paletteSnapshot` 记录 `source`+`version(2026-05-19)`+`verified:false`+核验日期字段。
2. 作品模型存「品牌+色号」二元组，禁止裸数字码；导入外部色卡先做码格式归一化（补零/不补零/中文系名）。
3. 透明色统一采用 Artkal 的 RGBA+alpha+`transparency` 表达，勿当普通 RGB。
4. 切换色卡必须重新生成/显式重映射（项目 docs/04 已有此规则，保持）。
5. 二梯队顺序：Artkal C197 → MARD 291 → COCO 291；特殊系（荧光/夜光/透明）默认不进转换候选。
6. 实物抽样核验完成前，界面保留「非零售色号/购买对应未核验」或改为「屏幕值仅供参考，色差以色卡实物为准」类提示。

---

## 10. 来源

- [HansBug/pindou-color-data（MIT 色卡数据仓库，manifest/README/colors.json）](https://github.com/HansBug/pindou-color-data)
- [中工网/北京青年报：年轻人涌进 DIY 拼豆店](https://www.workercn.cn/c/2026-02-25/8740893.shtml)
- [钛媒体：马尔德凭什么成为拼豆界的泡泡玛特](https://www.tmtpost.com/8026280.html)
- [淘宝：221色拼豆mard 列表](https://www.taobao.com/list/product/221%E8%89%B2%E6%8B%BC%E8%B1%86mard.htm) ／ [拼豆色号列表](https://www.taobao.com/list/product/%E6%8B%BC%E8%B1%86%E8%89%B2%E5%8F%B7.htm)
- [1688：拼豆工厂热潮采购指南](https://www.1688.com/wiki/zh/WKg1nhys6xnke8) ／ [144色批发报价](https://www.1688.com/zh/product-search/144%E8%89%B2.html)
- [pixelbead.art：MARD 291 色号/HEX/RGB/PDF](https://www.pixelbead.art/zh/guides/mard-bead-color-chart)
- [pindou.online：Mard 221/291 在线查询](https://www.pindou.online/colors) ／ [peiseka MARD 标准色卡](https://peiseka.com/pindouseka.html) ／ [拼豆图鉴 Mard 221](https://pd.anqstar.com/colors) ／ [豆豆工坊 Mard 色卡大全](https://www.doudougongfang.com/kb/beads/mard-palette)
- [库库AI：MARD/Artkal/Hama 色号对照与获取渠道](https://kuku.baidu.com/landing/tscp_doc/a1b924913525798a3e3d9cdaa6c098eb) ／ [B15 缺货替代攻略](https://kuku.baidu.com/landing/tscp_doc/39f29a2c272cf05029a8bceef36693d8) ／ [对错牌教程（24号撞车）](https://kuku.baidu.com/landing/tscp_doc/0fb170cc5ef53d690349387b5496b0a9)
- [淘宝跨品牌色号对照指南](https://world.taobao.com/lang/zh-tw/shopping-guide/2022528881981915136.htm)
- [pindoupic：5mm/3mm/2.6mm 尺寸选购](https://www.pindoupic.com/jiaocheng/bead-size-guide)
- [Resprite：加载 MARD 221/291 调色板](https://resprite.fengeon.com/zh/docs/files/create-bead-pattern) ／ [BeadPattern 关于](https://beadpattern.net/zh/about) ／ [stitchmate 色号对照](https://stitchmate.app/zh/tools/perler-hama-artkal-conversion)
- [什么值得买：Artkal 海外口碑](https://post.smzdm.com/p/a70dx5wo/)

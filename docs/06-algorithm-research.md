# 06 · 算法研究与可复核实验记录

更新时间：2026-10-16

本文件只记录图片转拼豆图纸的算法调查和本地参考实验。它不是正式色卡验证、用户研究或对用户原图的复原报告。

## 1. 当前结论

- 本文记录的是 **PixelOE 原始 Python legacy 入口** 与面积缩小基线的受控参考实验；没有把 PixelOE 接入新 TS 自动路径，也没有据此改写产品默认算法。随后独立完成的 TS 区域实验、同色卡对照及失败项另见 [区域实验状态](07-region-experiment-status.md)，不要将两组实验混为一谈。
- 实验使用明确自制样本，不是用户反馈截图的原文件。用户原文件尚不可得，截图不能被裁切后冒充原图；因此本实验不能证明对用户反馈图同样有效。
- 在本样本上，32 格时面积、PixelOE contrast、PixelOE weak-outline 三种结果的 `eye_dark_recall` 都是 `0.0`；64 格时三者都是 `1.0`。这只能说明本样本的小黑眼睛在 32 格条件下没有被该指标捕获，不能外推为所有图片或算法的普遍结论。
- `mae_vs_area_rgb` 只是与面积基线的数值差异，不是质量优劣分数。较大或较小的 MAE 都不能单独证明轮廓、眼睛、衣物纹理或拼制效果更好。
- PixelOE 不包含脸、眼睛、衣服等语义理解，也不保证物理色卡/零售色号约束。以下输出没有映射到 Demo 56 测试色卡、MARD、Perler、COCO 或其他零售色卡。

## 2. 来源和固定版本

| 项目 | 用途/调查结论 | 固定 revision | 来源 |
|---|---|---|---|
| PixelOE | contrast-aware outline expansion 与 contrast downscale 的 Python 参考实现 | `7ce444b36d3876a151d845d4493240e904454d89` | https://github.com/KohakuBlueleaf/PixelOE |
| Pixelated Image Abstraction Rust 参考 | PIA 结构/颜色联合优化方向的资料参考，未在本轮运行 | `820c527f6a9192c14fba73e6739ed7db1f921ac1` | https://github.com/AlexandreBinninger/pixelization |
| SAM | 提示式分割能力调查，未在本轮运行 | `dca509fe793f601edb92606367a655c15ac00fdf` | https://github.com/facebookresearch/segment-anything |
| SlimSAM | 轻量 SAM 方向调查，未在本轮运行 | `2ddb8f7a8400344b4e64ed32f0197af9007a9aa0` | https://github.com/czg1225/SlimSAM |
| OpenCV | `INTER_AREA` 缩小、形态学处理和图像基础设施参考 | `5e581286e4c27f0623d67dcdac174faf6b4443d1` | https://github.com/opencv/opencv |

本地保存的来源快照和许可证位于：

- `docs/assets/algorithm/sources/PixelOE-README.md`
- `docs/assets/algorithm/sources/PixelOE-LICENSE.txt`
- `docs/assets/algorithm/sources/PIA-README.md`
- `docs/assets/algorithm/sources/PIA-LICENSE.txt`
- `docs/assets/algorithm/sources/SAM-README.md`
- `docs/assets/algorithm/sources/SAM-LICENSE.txt`
- `docs/assets/algorithm/sources/SlimSAM-README.md`
- `docs/assets/algorithm/sources/SlimSAM-LICENSE.txt`
- `docs/assets/algorithm/sources/OpenCV-README.md`
- `docs/assets/algorithm/sources/OpenCV-LICENSE.txt`

PixelOE 和 SAM/SlimSAM/OpenCV 的 GitHub 许可证标记为 Apache-2.0；PIA Rust 参考仓库为 MIT。保存这些文件是为了让来源和许可核对不依赖当前网络状态。

## 3. 实验范围和环境

### 3.1 自制输入

脚本确定性生成一张 256×256 RGB 图像，包含：

- 有渐变的卡通肤色脸部和耳朵；
- 小黑眼睛、眼睛高光、鼻子和窄嘴；
- 细花纹衣服；
- 右侧确定性毛绒/绒面模拟纹理；
- 手工轮廓和脸/衣服边界。

输入文件：`docs/assets/algorithm/pixeloe-experiment/input-selfmade-cartoon-texture.png`。

没有读取、裁剪、上传用户图片，也没有使用现有研究截图作为算法输入。该样本不是零售色卡或实物色卡。

### 3.2 Python 依赖检查

本机已有依赖检查结果：

- Python 3.9.6（系统解释器）；
- `torch 2.8.0`；
- `opencv 4.13.0`；
- `numpy 2.0.2`；
- `Pillow 11.3.0`。

同时使用了独立 `venv --system-site-packages` 复跑，没有向系统全局安装依赖，没有执行巨量安装。PixelOE 新版 torch 入口包含 Python 3.10 的 `match` 语法，本机 Python 3.9 不能直接导入该入口；因此本轮没有为此升级或安装大依赖，而是使用同一 pinned checkout 中可导入、可运行的 `legacy` 参考函数。该限制已真实记录，不声称新版 torch/slang pipeline 已运行。

## 4. 实际运行的入口和条件

实验脚本：`scripts/research/run_pixeloe_experiment.py`

实际使用的 PixelOE legacy 入口：

- `pixeloe.legacy.downscale.contrast_based.contrast_based_downscale`
- `pixeloe.legacy.outline.outline_expansion`

所有方法都输入同一张 256×256 自制图，并输出 32×32 或 64×64 网格；没有颜色量化、没有抖动、没有 Demo56/零售色卡映射。

### 4.1 area 基线

使用 OpenCV：

```python
cv2.resize(image_bgr, (grid, grid), interpolation=cv2.INTER_AREA)
```

### 4.2 PixelOE contrast

直接调用：

```python
contrast_based_downscale(image_bgr, target_size=grid)
```

这是 PixelOE legacy 的 contrast-based luminance 选择和 Lab 中值通道处理，不是产品当前 `linear-area-lab-kmeans12-ciede2000-v1` 的完整流程，也不是新 TS 实现。

### 4.3 PixelOE weak-outline

先调用 PixelOE legacy 轮廓扩展，再调用同一 contrast downscale：

```python
expanded, weight = outline_expansion(
    image_bgr,
    erode=1,
    dilate=1,
    k=max(2, 256 // grid),
    avg_scale=9,
    dist_scale=4,
)
result = contrast_based_downscale(expanded, target_size=grid)
```

这里的 “weak-outline” 是本实验对较弱参数的命名，不是 PixelOE 官方独立模式。它**组合了**：

1. 亮度局部统计得到的 expansion weight；
2. 一次 `cv2.erode` 和一次 `cv2.dilate` 的轮廓扩展混合；
3. PixelOE legacy `outline_expansion` 内部的形态学平滑序列（erode/dilate/erode）；
4. 随后的 contrast downscale。

它没有额外调用双边滤波、Gaussian blur、SLIC、颜色量化或抖动。也没有把 `weight` 当作语义 mask。

## 5. 实际结果

完整逐行数据：`docs/assets/algorithm/pixeloe-experiment/metrics.csv`。

运行清单和依赖版本：`docs/assets/algorithm/pixeloe-experiment/manifest.json`。

### 5.1 结果表

| 网格 | 方法 | 唯一 RGB 单元数 | 相对 area 的 MAE | 平均亮度边跳 | 眼睛暗像素召回 | 衣服 RGB std | 毛绒区域 RGB std |
|---:|---|---:|---:|---:|---:|---:|---:|
| 32 | area | 294 | 0.00000 | 8.69254 | 0.00000 | 21.45320 | 11.95373 |
| 32 | PixelOE contrast | 89 | 12.52376 | 13.93145 | 0.00000 | 48.03318 | 25.95139 |
| 32 | PixelOE weak-outline | 159 | 10.57454 | 10.42238 | 0.00000 | 32.56177 | 3.72238 |
| 64 | area | 484 | 0.00000 | 6.55965 | 1.00000 | 25.00745 | 11.14128 |
| 64 | PixelOE contrast | 145 | 8.94938 | 6.88703 | 1.00000 | 41.15557 | 18.65936 |
| 64 | PixelOE weak-outline | 343 | 8.79867 | 6.26488 | 1.00000 | 31.79502 | 4.21950 |

眼睛指标定义为：将自制输入的眼睛 mask 按网格缩小后，在该 mask 中统计输出灰度值小于 90 的格子比例；不是人类辨识度评分，也不是语义检测。32 格眼睛的 `0.0` 是该定义下的实际运行结果，不表示图像中所有深色五官都必然消失。64 格的 `1.0` 也不能证明真实图片、真人眼睛或其他尺寸都会保持。

### 5.2 时间记录

时间会受 Python、CPU 和缓存影响，仅作为本机参考，不是产品性能承诺。一次独立 venv 复跑记录如下：

| 网格 | area (ms) | PixelOE contrast (ms) | PixelOE weak-outline (ms) |
|---:|---:|---:|---:|
| 32 | 0.00446 | 76.97971 | 12.84975 |
| 64 | 0.00092 | 2.24083 | 8.04804 |

32 格 contrast 首次调用时间可能包含 Torch/函数初始化等影响；不能用这组小样本数据宣称 PixelOE 快慢优于产品实现。

### 5.3 输出文件

每种方法均保存了网格原图和 nearest-neighbor 放大预览：

- `area-32grid.png`、`area-32grid-preview.png`
- `pixeloe_contrast-32grid.png`、`pixeloe_contrast-32grid-preview.png`
- `pixeloe_weak_outline-32grid.png`、`pixeloe_weak_outline-32grid-preview.png`
- 对应的 64 格六个文件

这些是 raw RGB 参考输出，不是最终拼豆图纸，不带合法色号、用量统计或物理制作保证。

## 6. 未运行、未证明和限制

本轮没有运行：

- PixelOE 新版 torch/slang 入口；
- 新 TS 自动路径；
- PIA Rust 实现；
- SAM 或 SlimSAM 模型；
- 双边滤波、SLIC、ICM 空间色卡优化；
- Demo56 或任何零售色卡映射；
- 用户原图、用户截图原文件、30 张测试集、盲评、真人新手测试、实物拼制。

因此不能声称：

- PixelOE 优于当前产品算法或所有参考算法；
- weak-outline 会普遍减少碎点且不吞掉五官；
- 32 格一定不适合用户反馈图，或 64 格一定能保留细节；
- 输出符合任一品牌色卡、实体豆颜色或购买 SKU；
- 任何结果具有人脸、衣物、毛绒等语义理解；
- MAE、唯一色数或区域标准差单项可以替代人类可辨识度和实际拼制验证。

## 7. 后续边界

在用户原文件可合法取得前，只能继续使用授权/自制样本，并保持同裁剪、同网格、同颜色预算、同色卡条件。新 TS 自动路径完成后，应把它作为独立方法加入对照，不能把本次 Python legacy 结果写成 TS 已完成或已对比全部算法。若要进入正式默认算法，还需要保留 Demo56 非零售提示，另行验证最终色卡约束、统计一致性、编辑/导出和至少代表图的实际拼制表现。

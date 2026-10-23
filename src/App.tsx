import { useEffect, useRef, useState } from "react";
import {
  Upload,
  ArrowUpRight,
  ArrowRight,
  ImagePlus,
  Layers3,
  ShieldCheck,
  Crop,
  ChevronDown,
  Check,
  Download,
  SlidersHorizontal,
  Palette as PaletteIcon,
  ListChecks,
  X,
  LoaderCircle,
  FolderOpen,
  RotateCcw,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  FileImage,
  FileText,
  FileJson,
  Table2,
  Pencil,
  Plus,
  Minus,
} from "lucide-react";
import { useStudio } from "./app/store";
import {
  EMPTY,
  geometryKey,
  type Settings,
  type ConvertResponse,
  type Project,
  type Tool,
  type SourceImage,
  type Pattern,
  type RegionConstraints,
} from "./model";
import { palettes, defaultPalette } from "./palettes";
import { usage, totalBeads } from "./core/statistics";
import { readImage, preparePixels, sampleSource } from "./image";
import { PatternCanvas } from "./components/PatternCanvas";
import { Modal } from "./components/Modal";
import { CropModal } from "./components/CropModal";
import { RegionPanel } from "./components/RegionPanel";
import { growRegion } from "./editor/regions";
import {
  exportPng,
  exportPdf,
  exportCsv,
  exportProject,
  importProject,
} from "./export";
import { saveDraft, loadDraft, saveRecovery, loadRecovery } from "./storage";

export default function App() {
  const state = useStudio();
  const { project } = state;
  const { source, settings, pattern } = project;
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    request = useRef(0),
    saveRevision = useRef(0);
  const [selection, setSelection] = useState<number[]>([]),
    [tolerance, setTolerance] = useState(14),
    [comparison, setComparison] = useState<{
      baseline: Pattern;
      candidate: Pattern;
    } | null>(null),
    [compareOpen, setCompareOpen] = useState(false);
  const [replacement, setReplacement] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [busyText, setBusyText] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [saveStatus, setSaveStatus] = useState(""),
    [tab, setTab] = useState<"settings" | "usage">("settings"),
    [mobilePanel, setMobilePanel] = useState(false),
    [cropOpen, setCropOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [confirm, setConfirm] = useState<"generate" | "replace" | null>(null),
    [pendingSource, setPendingSource] = useState<SourceImage | null>(null),
    [draft, setDraft] = useState<Project | null>(null),
    [tool, setTool] = useState<Tool>("move"),
    [editing, setEditing] = useState(false),
    [regionsOpen, setRegionsOpen] = useState(false),
    [allColors, setAllColors] = useState(false),
    [color, setColor] = useState(0),
    [highlight, setHighlight] = useState<number | null>(null),
    [view, setView] = useState<"preview" | "grid" | "codes">("preview"),
    [original, setOriginal] = useState(false),
    [preview, setPreview] = useState(""),
    [reserve, setReserve] = useState(5),
    [pack, setPack] = useState(""),
    [exporting, setExporting] = useState(""),
    [labels, setLabels] = useState(true),
    [grid, setGrid] = useState(true),
    [coord, setCoord] = useState({ x: 1, y: 1 }),
    [advanced, setAdvanced] = useState(false),
    [drag, setDrag] = useState(false);
  const palette =
    palettes.find((p) => p.id === settings.paletteId) ?? defaultPalette;
  const used = pattern ? usage(pattern).sort((a, b) => b.count - a.count) : [];
  const total = pattern ? totalBeads(pattern) : 0;
  const dirty =
    !!pattern &&
    (JSON.stringify(settings) !== JSON.stringify(pattern.settings) ||
      JSON.stringify(project.constraints) !==
        JSON.stringify(project.generatedConstraints));
  const constraintsStale =
    !!project.constraints &&
    project.constraints.geometryKey !== geometryKey(settings);
  const activeConstraints = constraintsStale ? undefined : project.constraints;
  useEffect(() => {
    setSelection([]);
    setComparison(null);
    setEditing(false);
    setRegionsOpen(false);
    setAllColors(false);
    setTool("move");
  }, [project.id]);
  useEffect(() => {
    setSelection([]);
  }, [pattern?.width, pattern?.height]);
  useEffect(() => {
    loadDraft()
      .then(setDraft)
      .catch(() => setError("无法读取本机草稿，仍可正常转换并下载项目。"));
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!source && !pattern) return;
    const rev = ++saveRevision.current;
    setSaveStatus("保存中");
    const timer = setTimeout(
      () =>
        saveDraft(project)
          .then(() => {
            if (rev === saveRevision.current) setSaveStatus("已保存到本机");
          })
          .catch(() => {
            if (rev === saveRevision.current)
              setSaveStatus("保存失败，请下载项目备份");
          }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    if (!source) {
      setPreview("");
      return;
    }
    let active = true;
    preparePixels(source, settings)
      .then((v) => {
        if (active) setPreview(v.preview);
      })
      .catch(() => {
        if (active) setError("图片预览失败，请重新选择图片。");
      });
    return () => {
      active = false;
    };
  }, [source, settings.crop, settings.rotation]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        e.shiftKey ? state.redo() : state.undo();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state.undo, state.redo]);
  async function receive(file?: File) {
    if (!file) return;
    setError("");
    try {
      const image = await readImage(file);
      if (source || pattern) {
        setPendingSource(image);
        setConfirm("replace");
      } else {
        state.setSource(image);
        setDraft(null);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function cancel() {
    request.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setBusyText("");
    setToast("已取消生成，原有作品未改变");
  }
  async function generate(backedUp = false) {
    if (!source || busy) return;
    if (project.edited && !backedUp) {
      setConfirm("generate");
      return;
    }
    setError("");
    setBusy(true);
    setBusyText("正在准备图片…");
    const id = ++request.current;
    try {
      const input = await preparePixels(source, settings);
      if (id !== request.current) return;
      worker.current?.terminate();
      const w = new Worker(
        new URL("./workers/convert.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      setBusyText("正在采样并匹配色卡…");
      w.onmessage = (event: MessageEvent<ConvertResponse>) => {
        if (id !== request.current) return;
        const data = event.data;
        if ("error" in data) setError(data.error);
        else {
          state.setPattern(
            data.pattern,
            settings.algorithm === "region" ? activeConstraints : undefined,
          );
          setSelection([]);
          setEditing(false);
          setRegionsOpen(false);
          setOriginal(false);
          setTool("move");
          setHighlight(null);
          setColor(data.pattern.cells.find((c) => c !== EMPTY) ?? 0);
          setToast(
            `图纸已生成 · ${data.pattern.width} × ${data.pattern.height} 格`,
          );
        }
        setBusy(false);
        w.terminate();
        worker.current = null;
      };
      w.onerror = () => {
        if (id === request.current) {
          setError("转换出现错误，请重试或降低图纸尺寸。");
          setBusy(false);
        }
        w.terminate();
      };
      w.postMessage(
        {
          id,
          input: {
            pixels: input.pixels,
            width: input.width,
            height: input.height,
            settings,
            palette,
            constraints:
              settings.algorithm === "region" ? activeConstraints : undefined,
          },
        },
        [input.pixels.buffer],
      );
    } catch (e) {
      if (id === request.current) {
        setError(message(e));
        setBusy(false);
      }
    }
  }
  async function confirmAction() {
    try {
      await saveRecovery(project);
      if (confirm === "replace" && pendingSource) {
        state.setSource(pendingSource);
        setPendingSource(null);
        setOriginal(false);
        setDraft(null);
        setTool("move");
        setConfirm(null);
      } else {
        setConfirm(null);
        await generate(true);
      }
    } catch {
      setError("恢复点保存失败。请先下载项目文件备份，再重试。");
      setConfirm(null);
    }
  }
  async function restoreRecovery() {
    try {
      const p = await loadRecovery();
      if (!p) {
        setToast("暂无恢复点");
        return;
      }
      state.setProject(p);
      setToast("已恢复上一次替换前的作品");
    } catch (e) {
      setError(message(e));
    }
  }
  async function doExport(format: string) {
    if (!pattern || exporting) return;
    setExporting(format);
    setError("");
    try {
      if (format === "png")
        await exportPng(pattern, project.title, { labels, grid });
      if (format === "pdf") await exportPdf(pattern, project.title);
      if (format === "csv")
        exportCsv(pattern, project.title, reserve, pack ? +pack : null);
      if (format === "json") exportProject(project);
      setToast("文件已准备好，请在浏览器下载或文件中查看");
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting("");
    }
  }
  function mainAction() {
    if (busy) cancel();
    else if (!source) fileInput.current?.click();
    else if (!pattern || dirty) void generate();
    else setExportOpen(true);
  }
  const mainLabel = busy
    ? "取消生成"
    : !source
      ? "选择图片"
      : !pattern
        ? "生成图纸"
        : dirty
          ? "应用并重新生成"
          : "下载图纸";
  function setParam<K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K],
  ) {
    state.updateSettings({ [key]: value });
  }
  function toggleEditing() {
    const next = !editing;
    setEditing(next);
    setTool(next ? "brush" : "move");
    setOriginal(false);
    if (!next) setRegionsOpen(false);
  }
  function selectCell(index: number, mode: "seed" | "add" | "remove") {
    if (!pattern) return;
    if (mode === "seed") {
      setSelection(growRegion(pattern, index, tolerance));
      return;
    }
    setSelection((current) =>
      mode === "add"
        ? [...new Set([...current, index])]
        : current.filter((i) => i !== index),
    );
  }
  async function compareAlgorithms() {
    if (!source || busy) return;
    setError("");
    setBusy(true);
    setBusyText("正在生成同参数前后对照…");
    const id = ++request.current;
    try {
      const prepared = await preparePixels(source, settings);
      if (id !== request.current) return;
      const run = (algorithm: "baseline" | "region") =>
        new Promise<Pattern>((resolve, reject) => {
          if (id !== request.current) {
            reject(new Error("对照已取消"));
            return;
          }
          const w = new Worker(
            new URL("./workers/convert.worker.ts", import.meta.url),
            { type: "module" },
          );
          worker.current = w;
          w.onmessage = (e: MessageEvent<ConvertResponse>) => {
            w.terminate();
            if ("error" in e.data) reject(new Error(e.data.error));
            else resolve(e.data.pattern);
          };
          w.onerror = () => {
            w.terminate();
            reject(new Error("对照计算失败"));
          };
          const options: Settings = {
            ...settings,
            algorithm,
            dithering: false,
            cleanup: false,
          };
          w.postMessage({
            id,
            input: {
              pixels: prepared.pixels,
              width: prepared.width,
              height: prepared.height,
              settings: options,
              palette,
            },
          });
        });
      const baseline = await run("baseline");
      if (id !== request.current) return;
      const candidate = await run("region");
      if (id !== request.current) return;
      setComparison({ baseline, candidate });
      setCompareOpen(true);
      setBusy(false);
      worker.current = null;
    } catch (e) {
      if (id === request.current) {
        setError(message(e));
        setBusy(false);
      }
    }
  }
  function replaceColor(from: number, to: number) {
    if (!pattern || from === to) return;
    state.commit(
      pattern.cells.flatMap((v, index) =>
        v === from ? [{ index, before: v, after: to }] : [],
      ),
    );
    setToast("已替换对应颜色，可撤销");
    setHighlight(null);
  }
  const settingsPanel = (
    <>
      <div className="panel-heading">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h2>把想法变成图纸</h2>
        <p>可直接使用默认设置生成，尺寸和颜色按需调整。</p>
      </div>

      {source && (
        <div className="source-card">
          <img src={source.dataUrl} alt="已选择的原图缩略图" />
          <div>
            <strong>{source.name}</strong>
            <span>
              {source.width} × {source.height} px · 本机处理
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="更换图片"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={19} />
          </button>
        </div>
      )}
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="mode">图片类型</label>
        </div>
        <div className="segmented" id="mode">
          <button
            className={settings.mode === "photo" ? "selected" : ""}
            aria-pressed={settings.mode === "photo"}
            onClick={() => setParam("mode", "photo")}
          >
            照片 / 插画
          </button>
          <button
            className={settings.mode === "pixel" ? "selected" : ""}
            aria-pressed={settings.mode === "pixel"}
            onClick={() => setParam("mode", "pixel")}
          >
            像素画
          </button>
        </div>
      </div>
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="long-side">图纸尺寸</label>
          <span>长边 · 格</span>
        </div>
        <div className="number-stepper">
          <button
            aria-label="减少格数"
            disabled={busy || settings.longSide <= 16}
            onClick={() =>
              setParam("longSide", Math.max(16, settings.longSide - 8))
            }
          >
            <Minus size={16} />
          </button>
          <input
            id="long-side"
            type="number"
            min="16"
            max="128"
            value={settings.longSide}
            onChange={(e) =>
              setParam(
                "longSide",
                Math.min(128, Math.max(16, +e.target.value || 16)),
              )
            }
          />
          <span>格</span>
          <button
            aria-label="增加格数"
            disabled={busy || settings.longSide >= 128}
            onClick={() =>
              setParam("longSide", Math.min(128, settings.longSide + 8))
            }
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="presets">
          {[32, 48, 64, 96].map((n) => (
            <button
              key={n}
              className={settings.longSide === n ? "selected" : ""}
              onClick={() => setParam("longSide", n)}
              aria-pressed={settings.longSide === n}
            >
              {n}
              {settings.longSide === n && <Check size={12} />}
            </button>
          ))}
        </div>
        <p className="field-note">保留裁剪比例。格数越多，细节和耗豆越多。</p>
      </div>
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="max-colors">最大颜色数</label>
          <span className="value-badge">{settings.maxColors} 色</span>
        </div>
        <input
          id="max-colors"
          type="range"
          min="4"
          max="32"
          value={settings.maxColors}
          onChange={(e) => setParam("maxColors", +e.target.value)}
        />
        <div className="range-labels">
          <span>更简洁</span>
          <span>更多层次</span>
        </div>
        <div className="presets">
          {[8, 12, 16, 24].map((n) => (
            <button
              key={n}
              className={settings.maxColors === n ? "selected" : ""}
              onClick={() => setParam("maxColors", n)}
            >
              {n} 色
            </button>
          ))}
        </div>
      </div>
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="palette">拼豆色卡</label>
          <span className="tiny-tag">测试版</span>
        </div>
        {palettes.length > 1 ? (
          <select
            id="palette"
            value={palette.id}
            onChange={(e) => setParam("paletteId", e.target.value)}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="palette-summary">{palette.name}</p>
        )}
        <p className="field-note warning-text">
          开发测试色号，尚未核验实物和购买对应。请勿直接照此采购。
        </p>
      </div>
      <details className="advanced-section experiment-section">
        <summary>
          <span>
            <strong>实验转换设置</strong>
            <small>
              {settings.algorithm === "region"
                ? "区域连贯实验版已启用"
                : "当前使用标准转换"}
            </small>
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="advanced-section-body">
          <label htmlFor="algorithm">转换算法</label>
          <select
            id="algorithm"
            value={settings.algorithm ?? "baseline"}
            onChange={(e) =>
              state.updateSettings({
                algorithm: e.target.value as "baseline" | "region",
                dithering: false,
              })
            }
          >
            <option value="baseline">标准转换</option>
            <option value="region">区域连贯 · 实验版</option>
          </select>
          <p className="field-note">
            实验版先简化纹理，再约束相邻配色；不自动识别脸和衣服。
          </p>
          {settings.algorithm === "region" && (
            <>
              <label className="inline-field">
                去纹理强度
                <select
                  aria-label="去纹理强度"
                  value={settings.smoothing ?? 1}
                  onChange={(e) =>
                    setParam("smoothing", +e.target.value as 0 | 1 | 2)
                  }
                >
                  <option value={0}>关闭</option>
                  <option value={1}>轻度</option>
                  <option value={2}>中度</option>
                </select>
              </label>
              <label className="inline-field">
                区域连贯强度
                <select
                  aria-label="区域连贯强度"
                  value={settings.spatialStrength ?? 1}
                  onChange={(e) =>
                    setParam("spatialStrength", +e.target.value as 0 | 1 | 2)
                  }
                >
                  <option value={0}>关闭</option>
                  <option value={1}>轻度</option>
                  <option value={2}>中度</option>
                </select>
              </label>
              <label className="inline-field">
                缩格方式
                <select
                  aria-label="缩格方式"
                  value={settings.sampling ?? "area"}
                  onChange={(e) =>
                    setParam("sampling", e.target.value as "area" | "contrast")
                  }
                >
                  <option value="area">区域平均</option>
                  <option value="contrast">对比保留（实验）</option>
                </select>
              </label>
              <label className="switch-row">
                <span>
                  <strong>加强边界保护</strong>
                  <small>降低强边界两侧的合色，不会扩张轮廓</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.outline ?? false}
                  onChange={(e) => setParam("outline", e.target.checked)}
                />
              </label>
            </>
          )}
          {source && (
            <button
              className="secondary advanced-compare-button"
              onClick={() => void compareAlgorithms()}
              disabled={busy}
            >
              查看算法对照
            </button>
          )}
          {constraintsStale && (
            <p className="field-note warning-text">
              尺寸或裁剪已变化，旧选区约束不会套用。重新生成后请重新选择。
            </p>
          )}
        </div>
      </details>
      <button
        className="advanced-toggle"
        aria-expanded={advanced}
        onClick={() => setAdvanced((v) => !v)}
      >
        <SlidersHorizontal size={16} />
        高级设置
        <ChevronDown size={16} className={advanced ? "rotated" : ""} />
      </button>
      {advanced && (
        <div className="advanced-fields">
          <label className="inline-field">
            精确颜色上限
            <input
              aria-label="精确颜色上限"
              type="number"
              min="4"
              max="32"
              value={settings.maxColors}
              onChange={(e) =>
                setParam(
                  "maxColors",
                  Math.min(32, Math.max(4, +e.target.value || 4)),
                )
              }
            />
          </label>
          <label className="switch-row">
            <span>
              <strong>渐变抖动</strong>
              <small>渐变更细腻，也可能增加零散色点</small>
            </span>
            <input
              type="checkbox"
              disabled={settings.algorithm === "region"}
              checked={
                settings.algorithm === "region" ? false : settings.dithering
              }
              onChange={(e) => setParam("dithering", e.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>
              <strong>轻度去杂点</strong>
              <small>可能影响单格高光，建议对比后使用</small>
            </span>
            <input
              type="checkbox"
              checked={settings.cleanup}
              onChange={(e) => setParam("cleanup", e.target.checked)}
            />
          </label>
          <label className="inline-field">
            豆子标称规格
            <select
              value={settings.beadSize}
              onChange={(e) => setParam("beadSize", +e.target.value)}
            >
              <option value={2.6}>2.6 mm</option>
              <option value={5}>5 mm</option>
            </select>
          </label>
          <label className="inline-field">
            半透明衬底
            <input
              type="color"
              value={settings.background}
              onChange={(e) => setParam("background", e.target.value)}
            />
          </label>
          <label className="inline-field">
            透明阈值
            <input
              type="number"
              min="0"
              max="255"
              value={settings.alphaThreshold}
              onChange={(e) =>
                setParam(
                  "alphaThreshold",
                  Math.min(255, Math.max(0, +e.target.value)),
                )
              }
            />
          </label>
        </div>
      )}
    </>
  );
  const usagePanel = (
    <>
      <div className="panel-heading">
        <span className="eyebrow">YOUR MATERIALS</span>
        <h2>每一颗，都有数</h2>
        <p>随图纸修改更新，空白格不计入用量。</p>
      </div>
      {!pattern ? (
        <div className="quiet-empty">
          <ListChecks size={30} />
          <p>生成图纸后，这里会显示色号和用量。</p>
        </div>
      ) : (
        <>
          <div className="usage-summary">
            <div>
              <strong>{total.toLocaleString()}</strong>
              <span>颗拼豆</span>
            </div>
            <div>
              <strong>{used.length}</strong>
              <span>种颜色</span>
            </div>
          </div>
          <div className="supply-controls">
            <label>
              备损余量
              <select
                value={reserve}
                onChange={(e) => setReserve(+e.target.value)}
              >
                {[0, 5, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </label>
            <label>
              每包颗数
              <input
                type="number"
                min="1"
                max="100000"
                placeholder="自行填写"
                value={pack}
                onChange={(e) =>
                  setPack(
                    e.target.value
                      ? String(Math.min(100000, Math.max(1, +e.target.value)))
                      : "",
                  )
                }
              />
            </label>
          </div>
          <p className="field-note warning-text">
            仅备料估算，测试色号不可直接用于购买。
          </p>
          <div className="usage-list">
            {used.map((u) => (
              <div
                className={`usage-row ${highlight === u.index ? "highlighted" : ""}`}
                key={u.index}
              >
                <button
                  className="color-cell"
                  onClick={() => {
                    setColor(u.index);
                    setHighlight(highlight === u.index ? null : u.index);
                    setOriginal(false);
                  }}
                  aria-label={`高亮 ${u.color.code}`}
                >
                  <span style={{ background: u.color.hex }} />
                  <div>
                    <strong>{u.color.code}</strong>
                    <small>{u.color.name}</small>
                  </div>
                </button>
                <div className="usage-count">
                  <strong>{u.count} 颗</strong>
                  <small>
                    备 {Math.ceil(u.count * (1 + reserve / 100))}
                    {pack
                      ? ` · ${Math.ceil(Math.ceil(u.count * (1 + reserve / 100)) / +pack)} 包`
                      : ""}
                  </small>
                </div>
              </div>
            ))}
          </div>
          {highlight !== null && (
            <button className="text-button" onClick={() => setHighlight(null)}>
              退出颜色高亮
            </button>
          )}
          <button
            className="secondary full"
            onClick={() =>
              exportCsv(pattern, project.title, reserve, pack ? +pack : null)
            }
          >
            <Table2 size={17} />
            导出用量 / 备料 CSV
          </button>
        </>
      )}
    </>
  );
  return (
    <div className="app-shell">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void receive(e.target.files?.[0])}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const p = await importProject(f);
            if (source || pattern) await saveRecovery(project);
            state.setProject(p);
            setDraft(null);
            setToast("项目已打开");
          } catch (e) {
            setError(message(e));
          } finally {
            if (projectInput.current) projectInput.current.value = "";
          }
        }}
      />
      <header className="topbar">
        <a className="brand" href="./" aria-label="豆格首页">
          <span className="brand-mark">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <strong>
            豆格<span>Bead Studio</span>
          </strong>
        </a>
        <div className="top-divider" />
        <span className="top-title">图片转拼豆</span>
        <span className="beta">BETA</span>
        <div className="top-actions">
          {saveStatus && (
            <span
              className={`save-status ${saveStatus.includes("失败") ? "warning-text" : ""}`}
            >
              <CheckCircle2 size={14} />
              {saveStatus}
            </span>
          )}
          <button
            className="quiet-button"
            onClick={() => projectInput.current?.click()}
            disabled={busy}
          >
            <FolderOpen size={17} />
            <span>打开项目</span>
          </button>
          <button
            className="icon-button"
            aria-label="帮助"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            A LITTLE IMAGE. A LOT OF POSSIBILITIES.
          </span>
          <h1>把喜欢，拼成一颗颗。</h1>
          <p>从一张图片，到一份属于你的拼豆图纸。</p>
        </div>
        <div className="privacy-pill">
          <ShieldCheck size={17} />
          <span>图片留在你的设备</span>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      <main className="workspace">
        <section
          className={`canvas-panel ${!source ? "empty-panel" : ""}`}
          aria-label="图片与图纸工作区"
        >
          <div className="canvas-topbar">
            <div className="view-tabs">
              <button
                className={!original ? "selected" : ""}
                onClick={() => setOriginal(false)}
              >
                图纸预览
              </button>
              <button
                className={original ? "selected" : ""}
                disabled={!source}
                onClick={() => setOriginal(true)}
              >
                原始图片
              </button>
            </div>
            <div className="canvas-top-actions">
              {source && (
                <button
                  className="quiet-button"
                  onClick={() => setCropOpen(true)}
                  disabled={busy}
                >
                  <Crop size={16} />
                  <span>裁剪</span>
                </button>
              )}
              {pattern && (
                <select
                  aria-label="图纸视图"
                  value={view}
                  onChange={(e) => setView(e.target.value as typeof view)}
                >
                  <option value="preview">纯色预览</option>
                  <option value="grid">显示网格</option>
                  <option value="codes">显示色号</option>
                </select>
              )}
              <span className="local-badge">
                <span />
                本地处理
              </span>
            </div>
          </div>
          {!source && !pattern ? (
            <div
              className={`upload-empty ${drag ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void receive(e.dataTransfer.files[0]);
              }}
            >
              <div className="empty-art">
                <div className="mini-pattern">
                  {Array.from({ length: 64 }, (_, i) => (
                    <i key={i} className={`pixel p${i}`} />
                  ))}
                </div>
                <div className="art-tag">
                  <Sparkles size={13} /> 小图，也有大灵感
                </div>
                <span className="deco-dot d1" />
                <span className="deco-dot d2" />
              </div>
              <h2>你的下一件作品，从这里开始</h2>
              <p>
                放入一张照片、插画或像素图
                <br />
                我们帮你整理成清晰的格子与色号
              </p>
              <button
                className="primary primary-action upload-button"
                onClick={() => fileInput.current?.click()}
              >
                <ImagePlus size={19} />
                选择图片
                <ArrowUpRight size={17} />
              </button>
              <span className="upload-formats">
                或拖放图片到这里 · JPG / PNG / WebP · 最大 20 MB
              </span>
              <button
                className="sample-link"
                onClick={() => {
                  state.setSource(sampleSource());
                  setDraft(null);
                }}
              >
                先用一张自制示例试试
                <ArrowRight size={14} />
              </button>
              {draft && (
                <div className="draft-card">
                  <div>
                    <strong>上次的灵感还在</strong>
                    <span>
                      {draft.title} ·{" "}
                      {new Date(draft.updatedAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      state.setProject(draft);
                      setDraft(null);
                    }}
                  >
                    继续编辑
                  </button>
                </div>
              )}
            </div>
          ) : pattern && !original ? (
            <PatternCanvas
              pattern={pattern}
              tool={editing ? tool : "move"}
              setTool={setTool}
              editing={editing}
              color={color}
              onPick={(i) => {
                if (i !== EMPTY) {
                  setColor(i);
                  setTool("brush");
                }
              }}
              commit={state.commit}
              highlight={highlight}
              selection={editing && regionsOpen ? selection : []}
              protectedCells={
                editing && regionsOpen
                  ? project.constraints?.protectedCells
                  : []
              }
              regionEditing={regionsOpen}
              onSelect={selectCell}
              view={view}
              undo={state.undo}
              redo={state.redo}
              canUndo={!!state.undoStack.length}
              canRedo={!!state.redoStack.length}
            />
          ) : (
            <div className="source-preview">
              <img src={preview || source?.dataUrl} alt="当前裁剪图片预览" />
              {!pattern && (
                <div className="preview-caption">
                  <span className="step-number">01</span>
                  <div>
                    <strong>图片已就位</strong>
                    <span>直接点击生成图纸，也可先调整尺寸和颜色</span>
                  </div>
                </div>
              )}
            </div>
          )}
          {busy && (
            <div className="processing-overlay" role="status">
              <LoaderCircle className="spin" size={34} />
              <strong>{busyText}</strong>
              <span>图片在本机处理，不会上传</span>
              <button className="secondary" onClick={cancel}>
                取消生成
              </button>
            </div>
          )}
          <div className="canvas-status">
            <span>
              {pattern ? (
                <>
                  <b>
                    {pattern.width} × {pattern.height}
                  </b>{" "}
                  格 <i /> {used.length} 色 <i /> {total.toLocaleString()} 颗
                </>
              ) : (
                <>
                  <Layers3 size={15} />
                  你的作品将在这里预览
                </>
              )}
            </span>
            <span>
              {dirty
                ? "新设置尚未应用"
                : pattern
                  ? `${(pattern.durationMs / 1000).toFixed(2)}s · ${project.edited ? "已手工微调" : "生成完成"}`
                  : "准备好，让灵感落到格子里"}
            </span>
          </div>
        </section>
        <aside className="side-panel">
          <div className="panel-tabs">
            <button
              className={tab === "settings" ? "selected" : ""}
              onClick={() => setTab("settings")}
            >
              <SlidersHorizontal size={17} />
              转换设置
            </button>
            <button
              className={tab === "usage" ? "selected" : ""}
              onClick={() => setTab("usage")}
            >
              <ListChecks size={17} />
              用量清单{used.length > 0 && <b>{used.length}</b>}
            </button>
          </div>
          <div className="panel-scroll">
            <fieldset disabled={busy}>
              {tab === "settings" ? settingsPanel : usagePanel}
            </fieldset>
          </div>
          <div
            className={`panel-action ${!source && !pattern ? "no-source" : ""}`}
          >
            {dirty && (
              <p className="warning-text">设置已变化，预览仍为上次结果</p>
            )}
            <button
              className="primary primary-action full"
              onClick={mainAction}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : pattern && !dirty ? (
                <Download size={18} />
              ) : (
                <Sparkles size={18} />
              )}{" "}
              {mainLabel}
              <ArrowRight size={17} />
            </button>
            {pattern && (
              <button
                className="secondary full edit-mode-button"
                onClick={toggleEditing}
                disabled={busy}
                aria-pressed={editing}
              >
                <Pencil size={17} />
                {editing ? "完成微调" : "微调图纸"}
              </button>
            )}
          </div>
        </aside>
      </main>
      {pattern && editing && (
        <section className="editing-strip">
          <div className="active-color">
            <span
              style={{
                background: pattern.palette.colors[color]?.hex ?? "#fff",
              }}
            />
            <div>
              <small>当前画笔颜色</small>
              <strong>
                {pattern.palette.colors[color]?.code ?? "请选择颜色"}
              </strong>
            </div>
          </div>
          <div className="swatch-list" aria-label="画笔颜色">
            {pattern.palette.colors
              .map((c, i) => ({ c, i }))
              .filter(
                ({ i }) =>
                  allColors || i === color || used.some((u) => u.index === i),
              )
              .map(({ c, i }) => (
                <button
                  key={c.code}
                  title={`${c.code} ${c.name}`}
                  aria-label={`选择颜色 ${c.code}`}
                  aria-pressed={color === i}
                  className={color === i ? "selected" : ""}
                  style={{ "--swatch": c.hex } as React.CSSProperties}
                  onClick={() => setColor(i)}
                >
                  <span />
                  {color === i && <Check size={12} />}
                </button>
              ))}
          </div>
          <button
            className="text-button"
            onClick={() => setAllColors((v) => !v)}
            aria-pressed={allColors}
          >
            {allColors ? "仅看已用颜色" : "全部颜色"}
          </button>
          <details className="more-editing">
            <summary>更多编辑</summary>
            <div className="replace-control">
              <label>
                全局换色
                <select
                  aria-label="全局换色目标"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      const target = +e.target.value;
                      setReplacement({ from: color, to: target });
                    }
                  }}
                >
                  <option value="">替换为…</option>
                  {pattern.palette.colors.map((c, i) => (
                    <option key={c.code} value={i}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details className="coordinate-editor">
              <summary>坐标选格</summary>
              <div>
                <label>
                  列
                  <input
                    type="number"
                    min="1"
                    max={pattern.width}
                    value={coord.x}
                    onChange={(e) =>
                      setCoord((v) => ({
                        ...v,
                        x: Math.min(
                          pattern.width,
                          Math.max(1, +e.target.value),
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  行
                  <input
                    type="number"
                    min="1"
                    max={pattern.height}
                    value={coord.y}
                    onChange={(e) =>
                      setCoord((v) => ({
                        ...v,
                        y: Math.min(
                          pattern.height,
                          Math.max(1, +e.target.value),
                        ),
                      }))
                    }
                  />
                </label>
                <button
                  className="secondary"
                  onClick={() => {
                    const index = (coord.y - 1) * pattern.width + coord.x - 1;
                    state.commit([
                      { index, before: pattern.cells[index], after: color },
                    ]);
                  }}
                >
                  涂色
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const index = (coord.y - 1) * pattern.width + coord.x - 1;
                    state.commit([
                      { index, before: pattern.cells[index], after: EMPTY },
                    ]);
                  }}
                >
                  擦除
                </button>
              </div>
            </details>
          </details>
        </section>
      )}
      {pattern && editing && (
        <details
          className="region-section advanced-section"
          open={regionsOpen}
          onToggle={(e) => {
            const open = e.currentTarget.open;
            setRegionsOpen(open);
            if (open) {
              setTool("select");
              setOriginal(false);
            } else if (tool.startsWith("select")) setTool("move");
          }}
        >
          <summary>
            <span>
              <strong>局部调整（高级）</strong>
              <small>
                {selection.length} 格选区 ·{" "}
                {project.constraints?.protectedCells.length ?? 0} 格保护 ·{" "}
                {project.constraints?.regions.length ?? 0} 条约束
              </small>
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="advanced-section-body">
            <div className="region-intro">
              <div>
                <h2>局部合色与细节保护</h2>
                <p>
                  选出衣服底色或脸部主色区，排除眼睛、嘴巴，再局部调整。不是自动部位识别。
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setTool("select");
                  setOriginal(false);
                  setToast("点击图纸选择相近色连通区域，也可用坐标选区");
                }}
              >
                进入选区工具
              </button>
            </div>
            <RegionPanel
              pattern={pattern}
              selection={selection}
              constraints={project.constraints}
              selectedColor={color}
              tolerance={tolerance}
              onTolerance={setTolerance}
              onSelection={setSelection}
              onConstraints={(c) => {
                state.setConstraints(c);
                state.updateSettings({ algorithm: "region", dithering: false });
              }}
              commit={state.commit}
              onNotice={setToast}
            />
            {state.constraintHistory.length > 0 && (
              <button className="secondary" onClick={state.undoConstraints}>
                撤销上次区域约束
              </button>
            )}
          </div>
        </details>
      )}
      <div
        className={`mobile-controls ${!source && !pattern ? "no-source" : ""}`}
      >
        <button
          onClick={() => {
            setTab("settings");
            setMobilePanel(true);
          }}
        >
          <SlidersHorizontal size={18} />
          参数
        </button>
        {pattern && (
          <button
            onClick={toggleEditing}
            disabled={busy}
            aria-pressed={editing}
          >
            <Pencil size={18} />
            {editing ? "完成" : "微调"}
          </button>
        )}
        <button
          onClick={() => {
            setTab("usage");
            setMobilePanel(true);
          }}
        >
          <ListChecks size={18} />
          用量
        </button>
        <button className="primary primary-action" onClick={mainAction}>
          {pattern && !dirty ? <Download size={17} /> : <Sparkles size={17} />}{" "}
          {mainLabel}
        </button>
      </div>
      <footer className="app-footer">
        <span>豆格 · 让灵感，一颗一颗成形</span>
        <span>本机处理 · 无需注册 · 测试色卡</span>
        <button onClick={() => void restoreRecovery()}>
          <RotateCcw size={13} />
          恢复替换前作品
        </button>
      </footer>
      <Modal
        open={mobilePanel}
        onClose={() => setMobilePanel(false)}
        title={tab === "settings" ? "转换设置" : "用量与备料"}
      >
        <div className="mobile-panel-tabs">
          <button
            className={tab === "settings" ? "selected" : ""}
            onClick={() => setTab("settings")}
          >
            设置
          </button>
          <button
            className={tab === "usage" ? "selected" : ""}
            onClick={() => setTab("usage")}
          >
            用量
          </button>
        </div>
        <div className="mobile-panel-content">
          <fieldset disabled={busy}>
            {tab === "settings" ? settingsPanel : usagePanel}
          </fieldset>
        </div>
        {tab === "settings" && dirty && (
          <p className="field-note warning-text">
            设置已保存，返回后点击“应用并重新生成”查看结果。
          </p>
        )}
        <div className="modal-footer">
          <button
            className="primary full"
            onClick={() => setMobilePanel(false)}
          >
            {tab === "settings" ? "完成" : "返回图纸"}
          </button>
        </div>
      </Modal>
      {cropOpen && source && (
        <CropModal
          source={source}
          settings={settings}
          onClose={() => setCropOpen(false)}
          onApply={(crop, rotation) => {
            state.updateSettings({ crop, rotation });
            setCropOpen(false);
          }}
        />
      )}
      <Modal
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        title="把作品带走"
        description="图纸与清单来自当前预览版本。测试色卡尚未核验购买对应。"
        wide
      >
        <div className="export-body">
          <div className="export-summary">
            <div className="export-illustration">
              <Download size={40} />
            </div>
            <h3>{project.title}</h3>
            <p>
              {pattern?.width} × {pattern?.height} 格 · {used.length} 色 ·{" "}
              {total} 颗
            </p>
            <p className="warning-text">开发测试色卡，非真实零售色号。</p>
          </div>
          <div className="export-options">
            <label>
              <input
                type="checkbox"
                checked={grid}
                onChange={(e) => setGrid(e.target.checked)}
              />{" "}
              PNG 显示网格
            </label>
            <label>
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />{" "}
              PNG 显示色号
            </label>
            {[
              ["png", FileImage, "PNG 图纸", "清晰图片，附色号与用量"],
              ["pdf", FileText, "PDF 打印图纸", "A4 分页，适合大图"],
              ["csv", Table2, "CSV 用量清单", "含备损与包装数量设置"],
              ["json", FileJson, "项目文件", "保留图片与图纸，可继续编辑"],
            ].map(([format, Icon, title, desc]) => {
              const I = Icon as typeof FileImage;
              return (
                <button
                  className="export-option"
                  key={format as string}
                  disabled={!!exporting}
                  onClick={() => void doExport(format as string)}
                >
                  <I size={23} />
                  <div>
                    <strong>{title as string}</strong>
                    <span>{desc as string}</span>
                  </div>
                  {exporting === format ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Download size={17} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {exporting && (
          <p role="status" className="export-progress">
            正在准备文件，请稍候…
          </p>
        )}
      </Modal>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm === "generate"
            ? "保留你的手工修改"
            : "更换图片前，先留一份备份"
        }
        description="会先在本机建立恢复点。你也可以下载项目文件，作为独立备份。"
      >
        <div className="confirm-body">
          <p>
            {confirm === "generate"
              ? "重新生成会替换当前图纸，手工改色不会自动迁移到新结果。"
              : "新图片会建立新的作品。当前作品可以从页面底部的恢复入口找回。"}
          </p>
          <button className="secondary" onClick={() => exportProject(project)}>
            <Download size={16} />
            先下载项目备份
          </button>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={() => setConfirm(null)}>
            保留当前作品
          </button>
          <button className="primary" onClick={() => void confirmAction()}>
            备份并{confirm === "generate" ? "重新生成" : "更换图片"}
          </button>
        </div>
      </Modal>
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="同参数算法对照"
        description="相同原图、裁剪、格数、色卡与颜色上限；均关闭抖动，不套用选区。只比较自动路径，不替换你的作品。"
        wide
      >
        {comparison && (
          <div className="comparison-grid">
            <PatternThumbnail
              pattern={comparison.baseline}
              title="原版 · 全局限色"
            />
            <PatternThumbnail
              pattern={comparison.candidate}
              title="实验版 · 结构与区域优化"
            />
            <button
              className="secondary"
              onClick={() =>
                void exportPng(
                  comparison.baseline,
                  project.title + "_原版对照",
                  { labels: false, grid: false },
                )
              }
            >
              下载原版对照 PNG
            </button>
            <button
              className="secondary"
              onClick={() =>
                void exportPng(
                  comparison.candidate,
                  project.title + "_区域实验对照",
                  { labels: false, grid: false },
                )
              }
            >
              下载实验对照 PNG
            </button>
          </div>
        )}
        <p className="field-note">
          请同时检查衣服碎点和眼睛嘴巴。碎点更少不代表效果一定更好；实验版不会自动认脸或恢复丢失细节。
        </p>
      </Modal>
      <Modal
        open={!!replacement}
        onClose={() => setReplacement(null)}
        title="确认全局换色"
        description="会修改当前图纸中该色号的全部格子，完成后可以撤销。"
      >
        <div className="confirm-body">
          <p>
            将 {replacement && pattern?.palette.colors[replacement.from]?.code}{" "}
            的{" "}
            {replacement &&
              pattern?.cells.filter((c) => c === replacement.from).length}{" "}
            格替换为{" "}
            {replacement && pattern?.palette.colors[replacement.to]?.code}。
          </p>
        </div>
        <div className="modal-footer">
          <button className="secondary" onClick={() => setReplacement(null)}>
            取消
          </button>
          <button
            className="primary"
            onClick={() => {
              if (replacement) replaceColor(replacement.from, replacement.to);
              setReplacement(null);
            }}
          >
            替换颜色
          </button>
        </div>
      </Modal>
      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="从图片，到一份能看懂的图纸"
        description="这是图片转换测试版，基础处理在你的设备中完成。"
      >
        <ol className="help-list">
          <li>
            <strong>选择清晰图片</strong>
            <p>主体突出、背景简单的图片更容易在小格数下辨认。</p>
          </li>
          <li>
            <strong>选择尺寸和颜色</strong>
            <p>格数越大细节越多，也更费材料。初次可从48格、16色开始。</p>
          </li>
          <li>
            <strong>检查并微调</strong>
            <p>放大后修正格子，或在用量中高亮、替换颜色。支持撤销。</p>
          </li>
          <li>
            <strong>下载图纸和清单</strong>
            <p>
              目前使用自定义测试色卡。D开头编号不是零售色号，不可直接照此购买。
            </p>
          </li>
        </ol>
        <p className="field-note">
          本机草稿可能因浏览器清理而丢失，重要作品请下载项目文件。图片已降采样到最长1600px用于处理；屏幕颜色不代表实物颜色。
        </p>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function PatternThumbnail({
  pattern,
  title,
}: {
  pattern: Pattern;
  title: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = pattern.width;
    canvas.height = pattern.height;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < pattern.height; y++)
      for (let x = 0; x < pattern.width; x++) {
        const color = pattern.cells[y * pattern.width + x];
        ctx.fillStyle =
          color === EMPTY ? "#f0f2ef" : pattern.palette.colors[color].hex;
        ctx.fillRect(x, y, 1, 1);
      }
  }, [pattern]);
  return (
    <figure>
      <h3>{title}</h3>
      <canvas ref={ref} aria-label={title + "对比图"} />
      <figcaption>
        {pattern.width}×{pattern.height} · {usage(pattern).length}色 ·{" "}
        {(pattern.durationMs / 1000).toFixed(2)}秒
        {pattern.diagnostics && (
          <>
            <br />
            小连通块 {pattern.diagnostics.smallComponentsBefore} →{" "}
            {pattern.diagnostics.smallComponentsAfter}
          </>
        )}
      </figcaption>
    </figure>
  );
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

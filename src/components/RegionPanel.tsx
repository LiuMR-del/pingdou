import { useEffect, useRef, useState } from "react";
import {
  EMPTY,
  geometryKey,
  type CellChange,
  type Pattern,
  type RegionConstraints,
} from "../model";
import { growRegion } from "../editor/regions";

interface Props {
  pattern: Pattern;
  selection: number[];
  constraints: RegionConstraints | undefined;
  selectedColor: number;
  tolerance?: number;
  onTolerance?(value: number): void;
  onSelection(indices: number[]): void;
  onConstraints(c: RegionConstraints): void;
  commit(changes: CellChange[]): void;
  onNotice(message: string): void;
}

const unique = (indices: number[]) =>
  [...new Set(indices)].filter(Number.isInteger).sort((a, b) => a - b);
const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `region-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function RegionPanel({
  pattern,
  selection,
  constraints,
  selectedColor,
  tolerance: suppliedTolerance,
  onTolerance,
  onSelection,
  onConstraints,
  commit,
  onNotice,
}: Props) {
  const [localTolerance, setLocalTolerance] = useState(14);
  const tolerance = suppliedTolerance ?? localTolerance;
  function setTolerance(value: number) {
    setLocalTolerance(value);
    onTolerance?.(value);
  }
  const [seedX, setSeedX] = useState(1);
  const [seedY, setSeedY] = useState(1);
  const [regionColors, setRegionColors] = useState<number[]>([selectedColor]);
  const selectionHistory = useRef<number[][]>([]);
  const previousSelection = useRef(selection);
  const protectedCells = new Set(constraints?.protectedCells ?? []);
  const currentKey = geometryKey(pattern.settings);
  const activeConstraints =
    constraints && constraints.geometryKey === currentKey
      ? constraints
      : undefined;
  const selected = unique(selection);

  useEffect(() => {
    selectionHistory.current = [];
    previousSelection.current = selection;
  }, [pattern.width, pattern.height, pattern.settings.longSide]);
  useEffect(() => {
    if (
      previousSelection.current !== selection &&
      JSON.stringify(previousSelection.current) !== JSON.stringify(selection)
    ) {
      selectionHistory.current.push(previousSelection.current);
      if (selectionHistory.current.length > 30)
        selectionHistory.current.shift();
    }
    previousSelection.current = selection;
  }, [selection]);
  useEffect(() => {
    if (!regionColors.length) setRegionColors([selectedColor]);
  }, [selectedColor, regionColors.length]);

  function select(indices: number[]) {
    onSelection(unique(indices));
  }
  function undoSelection() {
    const prior = selectionHistory.current.pop();
    if (!prior) {
      onNotice("暂无选区操作可撤销");
      return;
    }
    previousSelection.current = prior;
    onSelection(prior);
  }
  function seedIndex() {
    const x = Math.min(pattern.width, Math.max(1, Math.round(seedX)));
    const y = Math.min(pattern.height, Math.max(1, Math.round(seedY)));
    setSeedX(x);
    setSeedY(y);
    return (y - 1) * pattern.width + x - 1;
  }
  function grow() {
    const seed = seedIndex();
    if (pattern.cells[seed] === EMPTY) {
      onNotice("该坐标是空格，不能恢复已丢失的子格。");
      return;
    }
    const indices = growRegion(pattern, seed, tolerance);
    if (!indices.length) {
      onNotice("没有找到可选区域。");
      return;
    }
    select(indices);
  }
  function toggleColor(color: number) {
    setRegionColors((values) =>
      values.includes(color)
        ? values.filter((value) => value !== color)
        : values.length < 3
          ? [...values, color]
          : values,
    );
  }
  function fillSelection() {
    if (!selected.length) {
      onNotice("请先建立选区。");
      return;
    }
    const changes = selected
      .filter(
        (index) =>
          !protectedCells.has(index) &&
          pattern.cells[index] !== EMPTY &&
          pattern.cells[index] !== selectedColor,
      )
      .map((index) => ({
        index,
        before: pattern.cells[index],
        after: selectedColor,
      }));
    if (!changes.length) {
      onNotice("选区内没有可填充的格子，保护格不会被修改。");
      return;
    }
    commit(changes);
  }
  function updateConstraints(next: RegionConstraints) {
    onConstraints({
      ...next,
      width: pattern.width,
      height: pattern.height,
      geometryKey: currentKey,
      protectedCells: unique(next.protectedCells),
      regions: next.regions.map((region) => ({
        ...region,
        indices: unique(region.indices),
        colors: unique(region.colors).slice(0, 3),
      })),
    });
  }
  function protectSelection(protect: boolean) {
    if (
      protect &&
      (activeConstraints?.regions ?? []).some((r) =>
        r.indices.some((i) => selected.includes(i)),
      )
    ) {
      onNotice("所选格已有锁色约束，请先移除对应约束再保护细节。");
      return;
    }
    const next = protect
      ? unique([...protectedCells, ...selected])
      : [...protectedCells].filter((index) => !selected.includes(index));
    updateConstraints({
      width: pattern.width,
      height: pattern.height,
      geometryKey: currentKey,
      protectedCells: next,
      regions: activeConstraints?.regions ?? [],
    });
    onNotice(
      protect
        ? `已保护 ${selected.length} 格细节。`
        : `已取消 ${selected.length} 格保护。`,
    );
  }
  function addConstraint() {
    if (!selected.length) {
      onNotice("请先建立选区。");
      return;
    }
    const colors = unique(regionColors).slice(0, 3);
    if (!colors.length) {
      onNotice("至少选择一个色号。");
      return;
    }
    const overlapping = (activeConstraints?.regions ?? []).some((region) =>
      region.indices.some((index) => selected.includes(index)),
    );
    if (overlapping) {
      onNotice("该选区与已有生成约束重叠，请先移除旧约束或选择未约束的格子。");
      return;
    }
    const lockedElsewhere = new Set(
      (activeConstraints?.regions ?? []).flatMap((region) => region.colors),
    );
    const newTotal = new Set([...lockedElsewhere, ...colors]).size;
    if (newTotal > pattern.settings.maxColors) {
      onNotice(
        `锁色总量 ${newTotal} 超过当前最大颜色数 ${pattern.settings.maxColors}，当前上限为 ${pattern.settings.maxColors} 色，请减少色号或调整设置。`,
      );
      return;
    }
    if (
      !selected.some(
        (i) => !protectedCells.has(i) && pattern.cells[i] !== EMPTY,
      )
    ) {
      onNotice("选区仅含空格或保护格，请先排除五官保护区后选择底色。");
      return;
    }
    const regions = [
      ...(activeConstraints?.regions ?? []),
      {
        id: id(),
        indices: selected.filter(
          (i) => !protectedCells.has(i) && pattern.cells[i] !== EMPTY,
        ),
        colors,
      },
    ];
    updateConstraints({
      width: pattern.width,
      height: pattern.height,
      geometryKey: currentKey,
      protectedCells: [...protectedCells],
      regions,
    });
    onNotice("已建立选区生成约束。");
  }
  function removeConstraint(regionId: string) {
    updateConstraints({
      width: pattern.width,
      height: pattern.height,
      geometryKey: currentKey,
      protectedCells: [...protectedCells],
      regions: (activeConstraints?.regions ?? []).filter(
        (region) => region.id !== regionId,
      ),
    });
    onNotice("已移除生成约束。");
  }
  return (
    <section className="region-panel" aria-label="区域编辑">
      <div className="region-panel-heading">
        <h3>区域选择</h3>
        <span>{selected.length} 格</span>
      </div>
      <p className="field-note">
        仅按颜色和四邻接扩展，不会自动识别人脸、衣服等语义区域。
      </p>
      <div className="region-field">
        <label htmlFor="region-tolerance">选择容差</label>
        <div className="region-range">
          <input
            id="region-tolerance"
            type="range"
            min="0"
            max="100"
            step="1"
            value={tolerance}
            onChange={(e) => setTolerance(+e.target.value)}
          />
          <input
            aria-label="选择容差数值"
            type="number"
            min="0"
            max="100"
            value={tolerance}
            onChange={(e) =>
              setTolerance(Math.min(100, Math.max(0, +e.target.value || 0)))
            }
          />
        </div>
      </div>
      <div className="region-seed">
        <label>
          坐标列
          <input
            aria-label="区域种子列"
            type="number"
            min="1"
            max={pattern.width}
            value={seedX}
            onChange={(e) => setSeedX(+e.target.value || 1)}
          />
        </label>
        <label>
          行
          <input
            aria-label="区域种子行"
            type="number"
            min="1"
            max={pattern.height}
            value={seedY}
            onChange={(e) => setSeedY(+e.target.value || 1)}
          />
        </label>
        <button className="secondary" onClick={grow}>
          按坐标扩展
        </button>
      </div>
      <div className="region-actions">
        <button className="secondary" onClick={undoSelection}>
          撤销选区
        </button>
        <button className="secondary" onClick={() => select([])}>
          清除选区
        </button>
        <button className="secondary" onClick={fillSelection}>
          选区内填当前色号
        </button>
      </div>
      <details className="advanced-section region-constraints">
        <summary>
          <span>
            <strong>下次生成的细节保护与锁色（实验）</strong>
            <small>
              修改保护或锁色设置将启用区域实验算法，重新生成后生效。
            </small>
          </span>
        </summary>
        <div className="region-actions">
          <button
            className="secondary"
            disabled={!selected.length}
            onClick={() => protectSelection(true)}
          >
            保护所选细节
          </button>
          <button className="secondary" onClick={() => protectSelection(false)}>
            取消所选保护
          </button>
        </div>
        <div className="region-constraints">
          <div className="region-panel-heading">
            <h4>生成约束</h4>
            <span>当前上限 {pattern.settings.maxColors} 色</span>
          </div>
          <p className="field-note">
            为当前选区锁定 1–3 个色号，约束会绑定当前图纸几何。
          </p>
          <div className="region-color-list">
            {pattern.palette.colors.map((color, index) => (
              <label key={color.code}>
                <input
                  type="checkbox"
                  checked={regionColors.includes(index)}
                  disabled={
                    !regionColors.includes(index) && regionColors.length >= 3
                  }
                  onChange={() => toggleColor(index)}
                />
                <span style={{ background: color.hex }} />
                {color.code}
              </label>
            ))}
          </div>
          <button className="secondary" onClick={addConstraint}>
            为选区建立约束
          </button>
          {activeConstraints?.regions.length ? (
            <div className="region-lock-list">
              {activeConstraints.regions.map((region) => (
                <div className="region-lock" key={region.id}>
                  <span>
                    {region.indices.length} 格 ·{" "}
                    {region.colors
                      .map(
                        (color) =>
                          pattern.palette.colors[color]?.code ?? `#${color}`,
                      )
                      .join("、")}
                  </span>
                  <button
                    className="text-button"
                    onClick={() => removeConstraint(region.id)}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="field-note">暂无可移除的约束。</p>
          )}
        </div>
      </details>
      {protectedCells.size > 0 && (
        <p className="field-note">
          已保护 {protectedCells.size}{" "}
          格。保护只影响区域填充与后续约束，不会改变现有格子。
        </p>
      )}
      <p className="field-note">
        区域工具不会恢复已经丢失的子格；空格会被跳过。
      </p>
    </section>
  );
}

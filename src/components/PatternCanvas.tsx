import { useEffect, useRef, useState } from "react";
import {
  Minus,
  Plus,
  Scan,
  Move,
  Paintbrush,
  Eraser,
  Pipette,
  Undo2,
  Redo2,
  MousePointer2,
  ListPlus,
  ListMinus,
} from "lucide-react";
import { EMPTY, type Pattern, type Tool, type CellChange } from "../model";

type SelectionMode = "seed" | "add" | "remove";
interface Props {
  pattern: Pattern;
  tool: Tool;
  setTool(t: Tool): void;
  color: number;
  onPick(i: number): void;
  commit(c: CellChange[]): void;
  highlight: number | null;
  view: "preview" | "grid" | "codes";
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  editing: boolean;
  regionEditing: boolean;
  selection?: number[];
  protectedCells?: number[];
  onSelect?(index: number, mode: SelectionMode): void;
}

export function resolveCanvasTool(
  editing: boolean,
  regionEditing: boolean,
  tool: Tool,
): Tool {
  return !editing || (!regionEditing && tool.startsWith("select"))
    ? "move"
    : tool;
}

export function PatternCanvas(p: Props) {
  const tool = resolveCanvasTool(p.editing, p.regionEditing, p.tool);
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 600, height: 500 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState("");
  const [position, setPosition] = useState("");
  const draft = useRef<Map<number, CellChange>>(new Map());
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; zoom: number } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const selectionAction = useRef(false);
  const base = Math.max(
    1,
    Math.min(
      (box.width - 48) / p.pattern.width,
      (box.height - 48) / p.pattern.height,
    ),
  );
  const cell = base * zoom;
  const ox = (box.width - cell * p.pattern.width) / 2 + pan.x;
  const oy = (box.height - cell * p.pattern.height) / 2 + pan.y;
  const selected = new Set(p.selection ?? []);
  const protectedSet = new Set(p.protectedCells ?? []);

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setBox({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    draft.current.clear();
  }, [p.pattern.width, p.pattern.height]);

  function draw() {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = box.width * dpr;
    c.height = box.height * dpr;
    const x = c.getContext("2d")!;
    x.scale(dpr, dpr);
    x.clearRect(0, 0, box.width, box.height);
    x.imageSmoothingEnabled = false;
    for (let row = 0; row < p.pattern.height; row++)
      for (let col = 0; col < p.pattern.width; col++) {
        const index = row * p.pattern.width + col;
        const value = draft.current.get(index)?.after ?? p.pattern.cells[index];
        const px = ox + col * cell,
          py = oy + row * cell;
        if (px + cell < 0 || py + cell < 0 || px > box.width || py > box.height)
          continue;
        x.globalAlpha =
          p.highlight !== null && value !== p.highlight ? 0.28 : 1;
        x.fillStyle =
          value === EMPTY
            ? (row + col) % 2
              ? "#e5e9e6"
              : "#f7f9f6"
            : (p.pattern.palette.colors[value]?.hex ?? "#ff00ff");
        x.fillRect(px, py, cell + 0.3, cell + 0.3);
        if (p.view !== "preview" && cell >= 7) {
          x.strokeStyle = "#24312f30";
          x.lineWidth = 0.6;
          x.strokeRect(px, py, cell, cell);
        }
        if (selected.has(index)) {
          x.globalAlpha = 0.32;
          x.fillStyle = "#2388ff";
          x.fillRect(px, py, cell + 0.3, cell + 0.3);
          x.globalAlpha = 1;
          x.strokeStyle = "#1478e8";
          x.lineWidth = Math.max(1, Math.min(2.5, cell / 8));
          x.strokeRect(
            px + 0.5,
            py + 0.5,
            Math.max(0, cell - 1),
            Math.max(0, cell - 1),
          );
        }
        if (protectedSet.has(index)) {
          x.globalAlpha = 1;
          x.strokeStyle = "#f28c28";
          x.lineWidth = Math.max(1.5, Math.min(3, cell / 6));
          x.strokeRect(
            px + 0.75,
            py + 0.75,
            Math.max(0, cell - 1.5),
            Math.max(0, cell - 1.5),
          );
        }
        if (p.view === "codes" && cell >= 29 && value !== EMPTY) {
          const color = p.pattern.palette.colors[value];
          if (color) {
            const hex = color.hex;
            const lightness =
              parseInt(hex.slice(1, 3), 16) * 0.299 +
              parseInt(hex.slice(3, 5), 16) * 0.587 +
              parseInt(hex.slice(5, 7), 16) * 0.114;
            x.globalAlpha = 1;
            x.fillStyle = lightness > 145 ? "#172b25" : "#ffffff";
            x.font = `${Math.min(12, cell / 4)}px system-ui`;
            x.textAlign = "center";
            x.textBaseline = "middle";
            x.fillText(color.code, px + cell / 2, py + cell / 2);
          }
        }
      }
    x.globalAlpha = 1;
  }
  useEffect(draw, [
    p.pattern,
    p.view,
    p.highlight,
    p.selection,
    p.protectedCells,
    box,
    zoom,
    pan,
  ]);

  function at(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - ox) / cell),
      row = Math.floor((e.clientY - r.top - oy) / cell);
    return col >= 0 &&
      row >= 0 &&
      col < p.pattern.width &&
      row < p.pattern.height
      ? { index: row * p.pattern.width + col, col, row }
      : null;
  }
  function selectAt(index: number, mode: SelectionMode, touch = false) {
    if (!p.editing || !p.regionEditing || !p.onSelect) return;
    if (touch && cell < 20) {
      setHint("先放大到每格清晰可点，再进行选区操作");
      return;
    }
    p.onSelect(index, mode);
    setHint(
      mode === "seed"
        ? "已替换为新选区"
        : mode === "add"
          ? "已加入选区"
          : "已从选区移除",
    );
  }
  function paint(e: { clientX: number; clientY: number }, touch = false) {
    const a = at(e);
    if (!a) return;
    setPosition(`${a.col + 1}, ${a.row + 1}`);
    if (!p.editing) return;
    if (
      tool === "select" ||
      tool === "select-add" ||
      tool === "select-remove"
    ) {
      if (!selectionAction.current) {
        selectionAction.current = true;
        selectAt(
          a.index,
          tool === "select" ? "seed" : tool === "select-add" ? "add" : "remove",
          touch,
        );
      }
      return;
    }
    if (tool === "pick") {
      p.onPick(p.pattern.cells[a.index]);
      return;
    }
    if (tool === "move") return;
    if (touch && cell < 20) {
      setHint("先放大到每格清晰可点，再进行微调");
      return;
    }
    const before = p.pattern.cells[a.index],
      after = tool === "erase" ? EMPTY : p.color;
    if (before === after && !draft.current.has(a.index)) return;
    draft.current.set(a.index, {
      index: a.index,
      before: draft.current.get(a.index)?.before ?? before,
      after,
    });
    draw();
  }
  function finish() {
    const changes = [...draft.current.values()].filter(
      (c) => c.before !== c.after,
    );
    draft.current.clear();
    if (p.editing && changes.length) p.commit(changes);
    last.current = null;
  }
  const tools: [Tool, typeof Move, string][] = [
    ["move", Move, "移动"],
    ["brush", Paintbrush, "画笔"],
    ["erase", Eraser, "擦除"],
    ["pick", Pipette, "取色"],
    ["select", MousePointer2, "选区"],
    ["select-add", ListPlus, "增选"],
    ["select-remove", ListMinus, "减选"],
  ];
  const selecting =
    tool === "select" || tool === "select-add" || tool === "select-remove";
  return (
    <div className="canvas-stage">
      {p.editing && (
        <div
          className="drawing-toolbar"
          role="toolbar"
          aria-label="图纸编辑工具"
        >
          {tools
            .filter(([id]) => p.regionEditing || !id.startsWith("select"))
            .map(([id, Icon, label]) => (
              <button
                key={id}
                className={`tool-button ${tool === id ? "active" : ""}`}
                aria-pressed={tool === id}
                onClick={() => {
                  finish();
                  draft.current.clear();
                  p.setTool(id);
                  setHint(
                    id === "move"
                      ? "拖动画布浏览，双指可缩放"
                      : id === "pick"
                        ? "点击格子选择对应颜色"
                        : selecting ||
                            id === "select" ||
                            id === "select-add" ||
                            id === "select-remove"
                          ? "选区操作只改变选区，不会修改格子"
                          : "编辑后用量自动更新",
                  );
                }}
                title={label}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          <i />
          <button
            className="tool-button"
            onClick={p.undo}
            disabled={!p.canUndo}
            aria-label="撤销"
          >
            <Undo2 size={18} />
          </button>
          <button
            className="tool-button"
            onClick={p.redo}
            disabled={!p.canRedo}
            aria-label="重做"
          >
            <Redo2 size={18} />
          </button>
        </div>
      )}
      <div className="canvas-host" ref={host}>
        <canvas
          ref={canvas}
          aria-label="拼豆图纸画布，支持缩放平移，精确修改也可使用下方坐标选格"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              draft.current.clear();
              draw();
              const [a, b] = [...pointers.current.values()];
              gesture.current = {
                distance: Math.hypot(a.x - b.x, a.y - b.y),
                zoom,
              };
              last.current = null;
              return;
            }
            selectionAction.current = false;
            last.current = { x: e.clientX, y: e.clientY };
            paint(e, e.pointerType === "touch");
          }}
          onPointerMove={(e) => {
            if (!pointers.current.has(e.pointerId)) {
              const a = at(e);
              if (a) setPosition(`${a.col + 1}, ${a.row + 1}`);
              return;
            }
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2 && gesture.current) {
              const [a, b] = [...pointers.current.values()];
              setZoom(
                Math.min(
                  12,
                  Math.max(
                    0.5,
                    (gesture.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
                      Math.max(1, gesture.current.distance),
                  ),
                ),
              );
              return;
            }
            if (gesture.current) return;
            if (tool === "move" && last.current) {
              setPan((v) => ({
                x: v.x + e.clientX - last.current!.x,
                y: v.y + e.clientY - last.current!.y,
              }));
              last.current = { x: e.clientX, y: e.clientY };
            } else if (!selecting) paint(e, e.pointerType === "touch");
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId);
            if (pointers.current.size === 0) {
              if (!gesture.current) finish();
              gesture.current = null;
              selectionAction.current = false;
            }
          }}
          onPointerCancel={() => {
            draft.current.clear();
            pointers.current.clear();
            gesture.current = null;
            last.current = null;
            selectionAction.current = false;
            draw();
          }}
        />
      </div>
      <div className="canvas-controls">
        <div>
          <button
            aria-label="缩小"
            onClick={() => setZoom((v) => Math.max(0.5, v / 1.3))}
          >
            <Minus size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="放大"
            onClick={() => setZoom((v) => Math.min(12, v * 1.3))}
          >
            <Plus size={17} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Scan size={16} />
            <span>适应</span>
          </button>
        </div>
        <span className="coordinate">
          {position ? `坐标 ${position}` : "拖动浏览 · 双指缩放"}
        </span>
      </div>
      {p.editing && hint && (
        <div className="canvas-hint" role="status">
          {hint}
        </div>
      )}
    </div>
  );
}

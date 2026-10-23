import { z } from "zod";
import type { PDFFont, PDFDocument } from "pdf-lib";
import type {
  BeadColor,
  Palette,
  Pattern,
  Project,
  Settings,
  SourceImage,
} from "../model";
import { EMPTY } from "../model";

export const MAX_CELLS = 16_384;
export const MAX_PROJECT_BYTES = 12 * 1024 * 1024;
const MAX_CANVAS_AREA = 20_000_000;
const MAX_DIMENSION = 16_384;

const shortText = (max: number) => z.string().max(max);
const finiteNumber = z.number().finite();

const cropSchema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber,
    height: finiteNumber,
  })
  .strict();

const settingsSchema = z
  .object({
    longSide: z.number().int().min(1).max(128),
    maxColors: z.number().int().min(1).max(32),
    mode: z.enum(["photo", "pixel"]),
    dithering: z.boolean(),
    cleanup: z.boolean(),
    alphaThreshold: z.number().int().min(0).max(255),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    beadSize: z.number().finite().positive().max(100),
    crop: cropSchema.nullable(),
    rotation: z.number().finite(),
    paletteId: shortText(100),
    algorithm: z.enum(["baseline", "region"]).optional(),
    smoothing: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    sampling: z.enum(["area", "contrast"]).optional(),
    outline: z.boolean().optional(),
    spatialStrength: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .optional(),
  })
  .strict();

const colorSchema = z
  .object({
    code: shortText(64).min(1),
    name: shortText(160),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();

const paletteSchema = z
  .object({
    id: shortText(100).min(1),
    name: shortText(160),
    version: shortText(100),
    source: shortText(240),
    license: shortText(5000),
    verified: z.boolean(),
    colors: z.array(colorSchema).min(1).max(256),
  })
  .strict()
  .superRefine((palette, ctx) => {
    const codes = new Set<string>();
    palette.colors.forEach((color, index) => {
      if (codes.has(color.code))
        ctx.addIssue({
          code: "custom",
          path: ["colors", index, "code"],
          message: "色卡色号必须唯一",
        });
      codes.add(color.code);
    });
  });

const sourceSchema = z
  .object({
    name: shortText(200),
    dataUrl: z
      .string()
      .max(MAX_PROJECT_BYTES)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]*={0,2}$/i),
    width: z.number().int().min(1).max(MAX_DIMENSION),
    height: z.number().int().min(1).max(MAX_DIMENSION),
  })
  .strict();

const patternSchema = z
  .object({
    width: z.number().int().min(1).max(MAX_DIMENSION),
    height: z.number().int().min(1).max(MAX_DIMENSION),
    cells: z.array(z.number().int()),
    palette: paletteSchema,
    settings: settingsSchema,
    algorithmVersion: shortText(100).min(1),
    durationMs: z.number().finite().min(0).max(31_536_000),
    diagnostics: z
      .object({
        energy: z.array(z.number().finite()).max(30),
        smallComponentsBefore: z.number().int().nonnegative(),
        smallComponentsAfter: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((pattern, ctx) => {
    if (pattern.width * pattern.height > MAX_CELLS) {
      ctx.addIssue({
        code: "custom",
        path: ["width"],
        message: `图纸最多支持 ${MAX_CELLS} 格`,
      });
    }
    if (pattern.cells.length !== pattern.width * pattern.height) {
      ctx.addIssue({
        code: "custom",
        path: ["cells"],
        message: "cells 长度必须等于 width × height",
      });
    }
    const colorCount = pattern.palette.colors.length;
    pattern.cells.forEach((cell, index) => {
      if (cell !== EMPTY && (cell < 0 || cell >= colorCount)) {
        ctx.addIssue({
          code: "custom",
          path: ["cells", index],
          message: "cells 含有超出色卡范围的索引",
        });
      }
    });
  });

const constraintsSchema = z
  .object({
    width: z.number().int().min(1).max(128),
    height: z.number().int().min(1).max(128),
    geometryKey: shortText(1000),
    protectedCells: z.array(z.number().int().nonnegative()).max(MAX_CELLS),
    regions: z
      .array(
        z
          .object({
            id: shortText(100),
            indices: z.array(z.number().int().nonnegative()).max(MAX_CELLS),
            colors: z.array(z.number().int().nonnegative()).min(1).max(3),
          })
          .strict(),
      )
      .max(64),
  })
  .strict()
  .superRefine((c, ctx) => {
    const size = c.width * c.height;
    if (
      c.protectedCells.some((i) => i >= size) ||
      c.regions.some((r) => r.indices.some((i) => i >= size))
    )
      ctx.addIssue({ code: "custom", message: "选区索引超出图纸范围" });
  });

const projectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: shortText(100).min(1),
    title: shortText(200),
    source: sourceSchema.nullable(),
    settings: settingsSchema,
    pattern: patternSchema.nullable(),
    edited: z.boolean(),
    updatedAt: z.string().datetime({ offset: true }),
    constraints: constraintsSchema.optional(),
    generatedConstraints: constraintsSchema.optional(),
  })
  .strict();

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`)
    .join("; ");
}

/** Validate project data and return a trusted, schema-shaped value. Statistics are never read from input. */
export function validateProject(value: unknown): Project {
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(`项目文件校验失败：${formatIssues(parsed.error)}`);
  const project = parsed.data as Project;
  const bytes = new TextEncoder().encode(JSON.stringify(project)).byteLength;
  if (bytes > MAX_PROJECT_BYTES)
    throw new Error(`项目文件超过 ${MAX_PROJECT_BYTES / 1024 / 1024}MB 限制`);
  if (
    project.pattern &&
    project.pattern.settings.paletteId !== project.pattern.palette.id
  ) {
    throw new Error("图纸设置中的色卡 ID 与图纸色卡不一致");
  }
  if (
    project.pattern &&
    project.settings.paletteId !== project.pattern.palette.id
  ) {
    throw new Error("项目设置中的色卡 ID 与图纸色卡不一致");
  }
  for (const c of [project.constraints, project.generatedConstraints]) {
    if (!c) continue;
    if (
      !project.pattern ||
      c.width !== project.pattern.width ||
      c.height !== project.pattern.height
    )
      throw new Error("区域约束与图纸尺寸不一致");
    if (
      c.regions.some((r) =>
        r.colors.some((i) => i >= project.pattern!.palette.colors.length),
      )
    )
      throw new Error("区域约束含无效色号");
    const claimed = new Set<number>();
    for (const r of c.regions)
      for (const i of r.indices) {
        if (claimed.has(i)) throw new Error("区域约束存在重叠格子");
        claimed.add(i);
      }
  }
  return project;
}

export function parseProject(text: string): Project {
  if (typeof text !== "string" || text.length > MAX_PROJECT_BYTES * 2)
    throw new Error("项目文件过大");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("项目文件不是有效 JSON");
  }
  return validateProject(value);
}

function assertPattern(pattern: Pattern): Pattern {
  const parsed = patternSchema.safeParse(pattern);
  if (!parsed.success)
    throw new Error(`图纸校验失败：${formatIssues(parsed.error)}`);
  return parsed.data as Pattern;
}

function safeTitle(title: string): string {
  return (
    String(title || "pixelbeads")
      .slice(0, 200)
      .trim() || "pixelbeads"
  );
}

function fileName(title: string, extension: string): string {
  const clean = safeTitle(title)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 120);
  return `${clean || "pixelbeads"}.${extension}`;
}

function downloadBlob(blob: Blob, name: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined")
    throw new Error("当前环境不支持浏览器下载");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function usage(pattern: Pattern): Map<number, number> {
  const counts = new Map<number, number>();
  for (const cell of pattern.cells)
    if (cell !== EMPTY) counts.set(cell, (counts.get(cell) || 0) + 1);
  return counts;
}

function totalBeads(pattern: Pattern): number {
  let total = 0;
  for (const cell of pattern.cells) if (cell !== EMPTY) total++;
  return total;
}

function canvasSize(
  width: number,
  height: number,
  labels: boolean,
  usedColors: number,
): {
  cell: number;
  width: number;
  height: number;
  legendWidth: number;
  header: number;
} {
  const legendWidth = labels ? 320 : 0;
  const header = 110;
  let cell = width * height <= 4096 ? 32 : width * height <= 8192 ? 24 : 16;
  while (
    (width * cell + legendWidth) * (height * cell + header) > MAX_CANVAS_AREA &&
    cell > 4
  )
    cell--;
  const area = (width * cell + legendWidth) * (height * cell + header);
  if (area > MAX_CANVAS_AREA)
    throw new Error("图纸过大，PNG 请改用 PDF 分页导出");
  const outputWidth = Math.max(600, width * cell + legendWidth);
  const outputHeight = Math.max(
    height * cell + header,
    labels ? header + usedColors * 25 + 50 : 0,
  );
  if (outputWidth * outputHeight > MAX_CANVAS_AREA)
    throw new Error("图纸过大，请改用 PDF 分页导出");
  return {
    cell,
    width: outputWidth,
    height: outputHeight,
    legendWidth,
    header,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG 编码失败"))),
      "image/png",
    ),
  );
}

export async function exportPng(
  pattern: Pattern,
  title: string,
  options: { labels: boolean; grid: boolean },
): Promise<void> {
  const checked = assertPattern(pattern);
  if (typeof document === "undefined")
    throw new Error("当前环境不支持 PNG 导出");
  const dimensions = canvasSize(
    checked.width,
    checked.height,
    options.labels,
    usage(checked).size,
  );
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 Canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#222222";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(safeTitle(title), 12, 28);
  ctx.font = "13px sans-serif";
  ctx.fillText(
    `${checked.width} × ${checked.height} 格 · ${totalBeads(checked)} 颗 · 色卡 ${checked.palette.name} ${checked.palette.version}`,
    12,
    52,
  );
  ctx.fillStyle = "#8a4b08";
  ctx.fillText("测试色卡 · 非零售色号 · 购买对应未核验", 12, 76);
  const counts = usage(checked);
  const cell = dimensions.cell;
  for (let y = 0; y < checked.height; y++)
    for (let x = 0; x < checked.width; x++) {
      const value = checked.cells[y * checked.width + x];
      const px = x * cell;
      const py = dimensions.header + y * cell;
      if (value === EMPTY) {
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(px, py, cell, cell);
      } else {
        ctx.fillStyle = checked.palette.colors[value].hex;
        ctx.fillRect(px, py, cell, cell);
      }
      if (options.grid) {
        ctx.strokeStyle = "rgba(0,0,0,.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
      if (options.labels && value !== EMPTY && cell >= 12) {
        const color = checked.palette.colors[value];
        const [r, g, b] = hexRgb(color.hex);
        ctx.fillStyle =
          r * 299 + g * 587 + b * 114 > 150000 ? "#111111" : "#ffffff";
        ctx.font = `${Math.max(8, Math.floor(cell * 0.32))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(color.code.slice(0, 6), px + cell / 2, py + cell / 2);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
    }
  if (options.labels) {
    const x = checked.width * cell + 14;
    let y = dimensions.header;
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#222";
    ctx.fillText("色卡与统计", x, y - 12);
    ctx.font = "12px sans-serif";
    for (let i = 0; i < checked.palette.colors.length; i++) {
      const color = checked.palette.colors[i];
      const count = counts.get(i) || 0;
      if (!count) continue;
      ctx.fillStyle = color.hex;
      ctx.fillRect(x, y, 18, 18);
      ctx.strokeStyle = "#777";
      ctx.strokeRect(x, y, 18, 18);
      ctx.fillStyle = "#222";
      ctx.fillText(`${color.code} ${color.name}：${count}`, x + 25, y + 14);
      y += 25;
      if (y > canvas.height - 20) break;
    }
    ctx.fillStyle = "#875b00";
    ctx.fillText(
      "色卡/购买适配未核验，请以实物测试为准。",
      x,
      canvas.height - 12,
    );
  }
  downloadBlob(await canvasToBlob(canvas), fileName(title, "png"));
}

function csvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvText(
  pattern: Pattern,
  reservePercent: number,
  packSize: number | null,
): string {
  const checked = assertPattern(pattern);
  if (
    !Number.isFinite(reservePercent) ||
    reservePercent < 0 ||
    reservePercent > 100
  )
    throw new Error("预留百分比必须在 0 到 100 之间");
  if (packSize !== null && (!Number.isInteger(packSize) || packSize <= 0))
    throw new Error("包装数量必须是正整数或 null");
  const rows: (string | number)[][] = [
    [
      "色卡名称",
      "色卡版本",
      "色号",
      "颜色名",
      "图纸数量",
      "额外备损",
      "建议准备数量",
      "每包颗数",
      "建议包数",
      "采购核验状态",
    ],
  ];
  const counts = usage(checked);
  for (let i = 0; i < checked.palette.colors.length; i++) {
    const count = counts.get(i) || 0;
    if (!count) continue;
    const reserve = Math.ceil((count * reservePercent) / 100);
    const purchase = count + reserve;
    const packs = packSize === null ? "" : Math.ceil(purchase / packSize);
    const color = checked.palette.colors[i];
    rows.push([
      checked.palette.name,
      checked.palette.version,
      color.code,
      color.name,
      count,
      reserve,
      purchase,
      packSize ?? "",
      packs,
      checked.palette.verified
        ? "来源已核对，实物和店铺规格需另确认"
        : "测试色卡，非零售色号，购买对应未核验",
    ]);
  }
  return (
    "\ufeff" +
    rows.map((row) => row.map(csvField).join(",")).join("\r\n") +
    "\r\n"
  );
}

export function exportCsv(
  pattern: Pattern,
  title: string,
  reservePercent: number,
  packSize: number | null,
): void {
  downloadBlob(
    new Blob([csvText(pattern, reservePercent, packSize)], {
      type: "text/csv;charset=utf-8",
    }),
    fileName(title, "csv"),
  );
}

function asciiFallback(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

let fontBytes: ArrayBuffer | null = null;
async function loadPdfFont(
  pdf: PDFDocument,
): Promise<{ font: PDFFont; chinese: boolean }> {
  if (!fontBytes) {
    const response = await fetch(
      `${import.meta.env.BASE_URL}fonts/NotoSansCJKsc-Regular.otf`,
    );
    if (!response.ok)
      throw new Error("中文打印字体加载失败，请重试或先下载 PNG。");
    fontBytes = await response.arrayBuffer();
  }
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  pdf.registerFontkit(fontkit);
  return {
    font: await pdf.embedFont(fontBytes, { subset: true }),
    chinese: true,
  };
}

function pdfText(font: PDFFont, text: string, chinese: boolean): string {
  return chinese ? text : asciiFallback(text);
}

export async function exportPdf(
  pattern: Pattern,
  title: string,
): Promise<void> {
  const checked = assertPattern(pattern);
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const { font, chinese } = await loadPdfFont(pdf);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 32;
  const header = 74;
  const footer = 28;
  const cell = 18;
  const colsPerPage = Math.max(1, Math.floor((pageWidth - margin * 2) / cell));
  const rowsPerPage = Math.max(
    1,
    Math.floor((pageHeight - margin * 2 - header - footer) / cell),
  );
  const counts = usage(checked);
  const pagesX = Math.ceil(checked.width / colsPerPage);
  const pagesY = Math.ceil(checked.height / rowsPerPage);
  const totalPages = pagesX * pagesY;
  let pageNo = 0;
  for (let pageY = 0; pageY < pagesY; pageY++)
    for (let pageX = 0; pageX < pagesX; pageX++) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      pageNo++;
      const startX = margin;
      const startY = pageHeight - margin - header;
      const fromX = pageX * colsPerPage;
      const fromY = pageY * rowsPerPage;
      const cols = Math.min(colsPerPage, checked.width - fromX);
      const rows = Math.min(rowsPerPage, checked.height - fromY);
      page.drawText(pdfText(font, safeTitle(title), chinese), {
        x: margin,
        y: pageHeight - margin - 16,
        size: 16,
        font,
      });
      page.drawText(
        pdfText(
          font,
          `${checked.width} × ${checked.height} 格 · ${totalBeads(checked)} 颗 · ${checked.palette.name} ${checked.palette.version}`,
          chinese,
        ),
        { x: margin, y: pageHeight - margin - 35, size: 9, font },
      );
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const value = checked.cells[(fromY + y) * checked.width + fromX + x];
          const px = startX + x * cell;
          const py = startY - (y + 1) * cell;
          if (value !== EMPTY) {
            const [r, g, b] = hexRgb(checked.palette.colors[value].hex);
            page.drawRectangle({
              x: px,
              y: py,
              width: cell,
              height: cell,
              color: rgb(r / 255, g / 255, b / 255),
            });
          }
          page.drawRectangle({
            x: px,
            y: py,
            width: cell,
            height: cell,
            borderColor: rgb(0.35, 0.35, 0.35),
            borderWidth: 0.35,
          });
          if (value !== EMPTY) {
            const [r, g, b] = hexRgb(checked.palette.colors[value].hex);
            page.drawText(
              pdfText(font, checked.palette.colors[value].code, chinese),
              {
                x: px + 1,
                y: py + 6,
                size: 5.5,
                font,
                color:
                  r * 0.299 + g * 0.587 + b * 0.114 > 145
                    ? rgb(0.08, 0.12, 0.1)
                    : rgb(1, 1, 1),
              },
            );
          }
        }
      let legendY = margin + 10;
      const legendText = `${fromX + 1}-${fromX + cols}, ${fromY + 1}-${fromY + rows}`;
      page.drawText(
        pdfText(
          font,
          `区域 ${legendText} · 第 ${pageNo}/${totalPages} 页`,
          chinese,
        ),
        { x: margin, y: legendY, size: 8, font },
      );
      page.drawText(
        pdfText(
          font,
          chinese
            ? "色卡/购买适配未核验，请以实物测试为准。"
            : "Color card and purchase fit are unverified; test physical beads.",
          chinese,
        ),
        { x: margin + 180, y: legendY, size: 7, font },
      );
    }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const legendPages = Math.max(1, Math.ceil(entries.length / 28));
  for (let lp = 0; lp < legendPages; lp++) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawText("材料用量清单", {
      x: margin,
      y: pageHeight - 52,
      size: 18,
      font,
    });
    page.drawText(
      `${totalBeads(checked)} 颗 · ${entries.length} 色 · ${checked.palette.name}`,
      { x: margin, y: pageHeight - 75, size: 10, font },
    );
    page.drawText("测试数据，非零售色号。购买对应及实物色差未核验。", {
      x: margin,
      y: pageHeight - 96,
      size: 9,
      font,
      color: rgb(0.55, 0.3, 0.03),
    });
    entries.slice(lp * 28, (lp + 1) * 28).forEach(([index, count], row) => {
      const color = checked.palette.colors[index],
        y = pageHeight - 135 - row * 23;
      const [r, g, b] = hexRgb(color.hex);
      page.drawRectangle({
        x: margin,
        y: y - 3,
        width: 15,
        height: 15,
        color: rgb(r / 255, g / 255, b / 255),
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.4,
      });
      page.drawText(`${color.code}  ${color.name}`, {
        x: margin + 27,
        y,
        size: 10,
        font,
      });
      page.drawText(`${count} 颗`, {
        x: pageWidth - margin - 65,
        y,
        size: 10,
        font,
      });
    });
  }
  const bytes = await pdf.save();
  downloadBlob(
    new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }),
    fileName(title, "pdf"),
  );
}

export function exportProject(project: Project): void {
  const checked = validateProject(project);
  const text = JSON.stringify(checked, null, 2);
  downloadBlob(
    new Blob([text], { type: "application/json;charset=utf-8" }),
    fileName(checked.title, "json"),
  );
}

export async function importProject(file: File): Promise<Project> {
  if (!file || file.size > MAX_PROJECT_BYTES)
    throw new Error(`项目文件超过 ${MAX_PROJECT_BYTES / 1024 / 1024}MB 限制`);
  return parseProject(await file.text());
}

export type { BeadColor, Palette, Pattern, Project, Settings, SourceImage };

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PatternCanvas,
  resolveCanvasTool,
} from "../src/components/PatternCanvas";
import { convertBaseline } from "../src/core/convert";
import { defaultSettings, type Tool } from "../src/model";
import { defaultPalette } from "../src/palettes";

const pattern = convertBaseline({
  width: 1,
  height: 1,
  pixels: new Uint8ClampedArray([255, 192, 138, 255]),
  settings: { ...defaultSettings, longSide: 16 },
  palette: defaultPalette,
});
function render(editing: boolean, regionEditing = false) {
  return renderToStaticMarkup(
    createElement(PatternCanvas, {
      pattern,
      editing,
      regionEditing,
      tool: "brush",
      color: 0,
      setTool: vi.fn(),
      onPick: vi.fn(),
      commit: vi.fn(),
      highlight: null,
      view: "preview",
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
    }),
  );
}

describe("progressive editor controls", () => {
  it("keeps zoom and pan controls but hides editing tools in browse mode", () => {
    const html = render(false);
    expect(html).toContain('aria-label="放大"');
    expect(html).toContain('aria-label="缩小"');
    expect(html).not.toContain('role="toolbar"');
    expect(html).not.toContain('title="画笔"');
  });
  it("shows basic tools without region tools during ordinary editing", () => {
    const html = render(true);
    expect(html).toContain('title="画笔"');
    expect(html).toContain('title="擦除"');
    expect(html).toContain('aria-label="撤销"');
    expect(html).not.toContain('title="选区"');
    expect(html).not.toContain('title="增选"');
  });
  it("exposes region tools only when local adjustment is open", () => {
    const html = render(true, true);
    expect(html).toContain('title="选区"');
    expect(html).toContain('title="增选"');
    expect(html).toContain('title="减选"');
    expect(html).not.toContain('aria-label="坐标选区"');
  });
  it("forces movement for stale editing tools after their mode closes", () => {
    const tools: Tool[] = [
      "move",
      "brush",
      "erase",
      "pick",
      "select",
      "select-add",
      "select-remove",
    ];
    for (const tool of tools)
      expect(resolveCanvasTool(false, true, tool)).toBe("move");
    for (const tool of ["select", "select-add", "select-remove"] as Tool[]) {
      expect(resolveCanvasTool(true, false, tool)).toBe("move");
      expect(resolveCanvasTool(true, true, tool)).toBe(tool);
    }
    expect(resolveCanvasTool(true, false, "brush")).toBe("brush");
  });
});

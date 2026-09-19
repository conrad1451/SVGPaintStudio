// CHQ: drafted by Gemini AI, modified by Claude AI

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MousePointer,
  Pencil,
  Minus,
  Square,
  Circle,
  Triangle,
  Type as TypeIcon,
  Eraser,
  Copy,
  Download,
  Upload,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Code,
  Eye,
  Trash2,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Palette,
  Check,
  Sparkles,
  FileText,
  RotateCw,
  Plus
} from 'lucide-react';

// Type definitions for elements, tools, and styles
type ToolType = 'select' | 'pencil' | 'line' | 'rect' | 'circle' | 'triangle' | 'text' | 'eraser';

interface SVGElementData {
  id: string;
  type: 'path' | 'line' | 'rect' | 'circle' | 'polygon' | 'text';
  // Common attributes
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDasharray?: string;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  transform?: string; // raw transform carried over from imported SVG (own + parent <g> transforms)
  // Shape-specific attributes
  d?: string; // for path
  x1?: number; y1?: number; x2?: number; y2?: number; // for line
  x?: number; y?: number; width?: number; height?: number; rx?: number; // for rect
  cx?: number; cy?: number; r?: number; // for circle
  points?: string; // for polygon
  textContent?: string; fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string; // for text
  textAnchor?: 'start' | 'middle' | 'end'; // for text
  rotation?: number;
}

interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
  showGrid: boolean;
  // Raw inner markup of <defs> (gradients, patterns, ...). Kept verbatim so it
  // survives code <-> canvas round trips even though the editor can't edit it.
  defs: string;
}

type ExportSettings = Pick<CanvasSettings, 'width' | 'height' | 'viewBox' | 'defs'>;

const PRESET_TEMPLATES = [
  {
    name: 'Star Icon',
    svg: `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <polygon points="200,40 247,135 352,151 276,225 294,330 200,280 106,330 124,225 48,151 153,135" fill="#f59e0b" stroke="#d97706" stroke-width="8" stroke-linejoin="round" />
  <circle cx="200" cy="200" r="40" fill="#ffffff" stroke="#d97706" stroke-width="4" />
</svg>`
  },
  {
    name: 'Robot Mascot',
    svg: `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect x="120" y="140" width="160" height="140" rx="20" fill="#3b82f6" stroke="#1d4ed8" stroke-width="6" />
  <circle cx="160" cy="190" r="20" fill="#ffffff" stroke="#1d4ed8" stroke-width="4" />
  <circle cx="240" cy="190" r="20" fill="#ffffff" stroke="#1d4ed8" stroke-width="4" />
  <circle cx="160" cy="190" r="8" fill="#1e293b" />
  <circle cx="240" cy="190" r="8" fill="#1e293b" />
  <rect x="160" y="240" width="80" height="12" rx="6" fill="#93c5fd" />
  <line x1="200" y1="140" x2="200" y2="80" stroke="#1d4ed8" stroke-width="6" stroke-linecap="round" />
  <circle cx="200" cy="70" r="16" fill="#ef4444" stroke="#b91c1c" stroke-width="4" />
</svg>`
  },
  {
    name: 'Simple Badge',
    svg: `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <circle cx="200" cy="200" r="150" fill="#10b981" stroke="#047857" stroke-width="10" />
  <circle cx="200" cy="200" r="130" fill="none" stroke="#a7f3d0" stroke-width="4" stroke-dasharray="10 10" />
  <text x="200" y="215" fill="#ffffff" font-size="42" font-family="sans-serif" font-weight="bold" text-anchor="middle">SVG ART</text>
</svg>`
  }
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Escape a value for use in XML text or a double-quoted attribute
const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Internal "transparent" <-> SVG "none"
const paint = (v: string) => (v === 'transparent' ? 'none' : v);

const normPaint = (v: string | undefined, fallback: string): string => {
  if (v === undefined || v.trim() === '') return fallback;
  const t = v.trim();
  if (t === 'none') return 'transparent';
  if (t.toLowerCase() === 'currentcolor') return '#000000';
  return t;
};

const num = (v: string | null | undefined, fallback: number): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

// <input type="color"> only accepts #rrggbb
const toColorInput = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');

const parsePoints = (points?: string): [number, number][] => {
  const nums = (points || '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
};

// Measure real geometry (paths, text) with a hidden <svg> so we get an exact bounding box
type Box = { x: number; y: number; width: number; height: number };
let measureSvg: SVGSVGElement | null = null;
const bboxCache = new Map<string, Box>();

const measureBBox = (tag: 'path' | 'text', attrs: Record<string, string>, text?: string): Box | null => {
  if (typeof document === 'undefined') return null;
  const key = tag + JSON.stringify(attrs) + (text ?? '');
  const cached = bboxCache.get(key);
  if (cached) return cached;
  try {
    if (!measureSvg || !measureSvg.isConnected) {
      measureSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      measureSvg.setAttribute('width', '1');
      measureSvg.setAttribute('height', '1');
      measureSvg.setAttribute('aria-hidden', 'true');
      measureSvg.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:visible';
      document.body.appendChild(measureSvg);
    }
    const node = document.createElementNS(SVG_NS, tag) as SVGGraphicsElement;
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    measureSvg.appendChild(node);
    const b = node.getBBox();
    measureSvg.removeChild(node);
    const box = { x: b.x, y: b.y, width: b.width, height: b.height };
    if (bboxCache.size > 500) bboxCache.clear();
    bboxCache.set(key, box);
    return box;
  } catch {
    return null;
  }
};

// Center of an element's geometry, used as the pivot for rotation
const getElementCenter = (el: SVGElementData): { x: number; y: number } => {
  switch (el.type) {
    case 'rect':
      return { x: (el.x || 0) + (el.width || 0) / 2, y: (el.y || 0) + (el.height || 0) / 2 };
    case 'circle':
      return { x: el.cx || 0, y: el.cy || 0 };
    case 'line':
      return { x: ((el.x1 || 0) + (el.x2 || 0)) / 2, y: ((el.y1 || 0) + (el.y2 || 0)) / 2 };
    case 'polygon': {
      const pts = parsePoints(el.points);
      if (!pts.length) return { x: 0, y: 0 };
      const xs = pts.map(p => p[0]);
      const ys = pts.map(p => p[1]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    case 'path': {
      const box = measureBBox('path', { d: el.d || '' });
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 0, y: 0 };
    }
    case 'text': {
      const box = measureBBox(
        'text',
        {
          x: String(el.x ?? 0),
          y: String(el.y ?? 0),
          'font-size': String(el.fontSize ?? 16),
          'font-family': el.fontFamily || 'sans-serif',
          'font-weight': el.fontWeight || 'normal',
          'font-style': el.fontStyle || 'normal',
          'text-anchor': el.textAnchor || 'middle'
        },
        el.textContent || ''
      );
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: el.x || 0, y: el.y || 0 };
    }
    default:
      return { x: 0, y: 0 };
  }
};

// Combined transform: imported transform first, then our rotation about the element's center.
// Used by both the canvas and the exported code so they always agree.
const getTransform = (el: SVGElementData): string | undefined => {
  const parts: string[] = [];
  if (el.transform) parts.push(el.transform);
  if (el.rotation) {
    const c = getElementCenter(el);
    parts.push(`rotate(${el.rotation} ${round2(c.x)} ${round2(c.y)})`);
  }
  return parts.length ? parts.join(' ') : undefined;
};

// Converts elements array to clean formatted SVG string
const elementsToSVG = (elements: SVGElementData[], settings: ExportSettings): string => {
  const innerElements = elements.map(el => {
    const fillAttrs = `fill="${esc(paint(el.fill))}" fill-opacity="${el.fillOpacity}"`;
    const strokeAttrs = [
      `stroke="${esc(paint(el.stroke))}"`,
      `stroke-width="${el.strokeWidth}"`,
      `stroke-opacity="${el.strokeOpacity}"`,
      el.strokeDasharray ? `stroke-dasharray="${esc(el.strokeDasharray)}"` : '',
      el.strokeLinecap ? `stroke-linecap="${el.strokeLinecap}"` : '',
      el.strokeLinejoin ? `stroke-linejoin="${el.strokeLinejoin}"` : ''
    ].filter(Boolean).join(' ');
    const tf = getTransform(el);
    const transformAttr = tf ? ` transform="${esc(tf)}"` : '';

    switch (el.type) {
      case 'path':
        return `  <path d="${esc(el.d)}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'line':
        return `  <line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${strokeAttrs}${transformAttr} />`;
      case 'rect':
        return `  <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.rx || 0}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'circle':
        return `  <circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'polygon':
        return `  <polygon points="${esc(el.points)}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'text': {
        const textStroke = el.stroke !== 'transparent' && el.strokeWidth > 0 ? ` ${strokeAttrs}` : '';
        return `  <text x="${el.x}" y="${el.y}" ${fillAttrs}${textStroke} font-size="${el.fontSize}" font-family="${esc(el.fontFamily)}" font-weight="${esc(el.fontWeight)}" font-style="${esc(el.fontStyle)}" text-anchor="${el.textAnchor || 'middle'}"${transformAttr}>${esc(el.textContent)}</text>`;
      }
      default:
        return '';
    }
  }).filter(Boolean).join('\n');

  const defsBlock = settings.defs.trim() ? `  <defs>\n${settings.defs}\n  </defs>\n` : '';

  return `<svg width="${settings.width}" height="${settings.height}" viewBox="${esc(settings.viewBox)}" xmlns="${SVG_NS}">
${defsBlock}${innerElements}
</svg>`;
};

// Presentation properties that cascade from <svg>/<g> down to shapes
const INHERITED_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor'
];

const parseStyleDecls = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  text.split(';').forEach(decl => {
    const i = decl.indexOf(':');
    if (i === -1) return;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (prop && val) out[prop] = val;
  });
  return out;
};

// Strip anything executable from markup we re-inject via innerHTML
const sanitizeNode = (root: Element) => {
  root.querySelectorAll('script, foreignObject').forEach(n => n.remove());
  [root, ...Array.from(root.querySelectorAll('*'))].forEach(n => {
    Array.from(n.attributes).forEach(a => {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
};

// SVG string parser: handles <defs>, <style> classes, inline style, <g> inheritance, transforms, text.
// Throws if the markup is not well-formed XML.
const parseSVGToElements = (svgString: string): { elements: SVGElementData[]; settings: CanvasSettings } => {
  let input = svgString.trim();

  // Wrap bare fragments; anything with an <svg> tag (even after an <?xml?> prolog or comments) is parsed as-is
  if (!/<svg[\s>]/i.test(input)) {
    input = `<svg xmlns="${SVG_NS}" viewBox="0 0 700 600" width="700" height="600">${input}</svg>`;
  }

  const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG markup');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error('No <svg> element found');

  // CSS rules from embedded <style> tags (simple .class selectors, including comma groups)
  const styleMap: Record<string, Record<string, string>> = {};
  doc.querySelectorAll('style').forEach(tag => {
    const css = (tag.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const ruleRe = /([^{}]+)\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(css)) !== null) {
      const decls = parseStyleDecls(m[2]);
      m[1].split(',').map(s => s.trim()).filter(s => /^\.[\w-]+$/.test(s)).forEach(sel => {
        const cls = sel.slice(1);
        styleMap[cls] = { ...styleMap[cls], ...decls };
      });
    }
  });

  // Presentation attributes < class rules < inline style (CSS precedence)
  const readProps = (node: Element): Record<string, string> => {
    const out: Record<string, string> = {};
    INHERITED_PROPS.forEach(p => {
      const v = node.getAttribute(p);
      if (v !== null) out[p] = v;
    });
    (node.getAttribute('class') || '').split(/\s+/).filter(Boolean).forEach(c => Object.assign(out, styleMap[c] || {}));
    Object.assign(out, parseStyleDecls(node.getAttribute('style') || ''));
    return out;
  };

  // Canvas size: honor width/height, fall back to viewBox, then to defaults
  const readLen = (v: string | null) => (v && !v.trim().endsWith('%') ? parseFloat(v) : NaN);
  const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const vbValid = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  let width = readLen(svgEl.getAttribute('width'));
  let height = readLen(svgEl.getAttribute('height'));
  if (vbValid) {
    if (!Number.isFinite(width) && !Number.isFinite(height)) {
      const s = 480 / Math.max(vb[2], vb[3]);
      width = vb[2] * s;
      height = vb[3] * s;
    } else if (!Number.isFinite(width)) {
      width = (height * vb[2]) / vb[3];
    } else if (!Number.isFinite(height)) {
      height = (width * vb[3]) / vb[2];
    }
  }
  if (!Number.isFinite(width)) width = 700;
  if (!Number.isFinite(height)) height = 600;
  width = Math.round(width);
  height = Math.round(height);
  const viewBox = vbValid ? vb.join(' ') : `0 0 ${width} ${height}`;

  // Preserve <defs> contents (gradients etc.) verbatim
  const defsParts: string[] = [];
  const serializer = new XMLSerializer();
  const keepInDefs = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'foreignobject') return;
    const clone = node.cloneNode(true) as Element;
    sanitizeNode(clone);
    defsParts.push('    ' + serializer.serializeToString(clone));
  };
  doc.querySelectorAll('defs > *').forEach(child => {
    if (child.tagName.toLowerCase() !== 'style') keepInDefs(child);
  });

  const elements: SVGElementData[] = [];
  let counter = 0;

  const traverse = (nodes: Element[], inherited: Record<string, string>, parentTransform: string) => {
    nodes.forEach(node => {
      const tag = node.tagName.toLowerCase();

      if (['defs', 'style', 'metadata', 'title', 'desc'].includes(tag)) return;
      if (['lineargradient', 'radialgradient', 'pattern'].includes(tag)) {
        keepInDefs(node);
        return;
      }

      const props = { ...inherited, ...readProps(node) };
      const transform = [parentTransform, node.getAttribute('transform') || ''].filter(Boolean).join(' ');

      if (tag === 'g') {
        traverse(Array.from(node.children), props, transform);
        return;
      }

      const base = {
        id: node.getAttribute('id') || `el-${Date.now()}-${counter++}-${Math.random().toString(36).substring(2, 6)}`,
        fill: normPaint(props['fill'], '#000000'), // SVG default fill is black
        fillOpacity: num(props['fill-opacity'], 1),
        stroke: normPaint(props['stroke'], 'transparent'),
        strokeWidth: num(props['stroke-width'], 1),
        strokeOpacity: num(props['stroke-opacity'], 1),
        strokeDasharray: props['stroke-dasharray'] && props['stroke-dasharray'] !== 'none' ? props['stroke-dasharray'] : '',
        strokeLinecap: props['stroke-linecap'] as SVGElementData['strokeLinecap'],
        strokeLinejoin: props['stroke-linejoin'] as SVGElementData['strokeLinejoin'],
        transform: transform || undefined,
        rotation: 0
      };

      if (tag === 'path') {
        elements.push({ ...base, type: 'path', d: node.getAttribute('d') || '' });
      } else if (tag === 'rect') {
        elements.push({
          ...base, type: 'rect',
          x: num(node.getAttribute('x'), 0), y: num(node.getAttribute('y'), 0),
          width: num(node.getAttribute('width'), 50), height: num(node.getAttribute('height'), 50),
          rx: num(node.getAttribute('rx'), 0)
        });
      } else if (tag === 'circle') {
        elements.push({
          ...base, type: 'circle',
          cx: num(node.getAttribute('cx'), 0), cy: num(node.getAttribute('cy'), 0), r: num(node.getAttribute('r'), 25)
        });
      } else if (tag === 'line') {
        elements.push({
          ...base, type: 'line',
          x1: num(node.getAttribute('x1'), 0), y1: num(node.getAttribute('y1'), 0),
          x2: num(node.getAttribute('x2'), 50), y2: num(node.getAttribute('y2'), 50)
        });
      } else if (tag === 'polyline' || tag === 'polygon') {
        elements.push({ ...base, type: 'polygon', points: node.getAttribute('points') || '' });
      } else if (tag === 'text') {
        const anchor = props['text-anchor'];
        elements.push({
          ...base, type: 'text',
          x: num(node.getAttribute('x'), 0), y: num(node.getAttribute('y'), 0),
          textContent: (node.textContent || '').replace(/\s+/g, ' ').trim(),
          fontSize: num(props['font-size'], 16),
          fontFamily: props['font-family'] || 'sans-serif',
          fontWeight: props['font-weight'] || 'normal',
          fontStyle: props['font-style'] || 'normal',
          textAnchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start'
        });
      }
    });
  };

  traverse(Array.from(svgEl.children), readProps(svgEl), svgEl.getAttribute('transform') || '');

  return {
    elements,
    settings: { width, height, viewBox, defs: defsParts.join('\n'), backgroundColor: 'transparent', showGrid: true }
  };
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SVGPaintStudio() {
  // Canvas Settings State
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    width: 600,
    height: 500,
    viewBox: '0 0 600 500',
    backgroundColor: '#ffffff',
    showGrid: true,
    defs: ''
  });

  // Vector Elements State & History Stack
  const [elements, setElements] = useState<SVGElementData[]>([]);
  const [history, setHistory] = useState<SVGElementData[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Active Tool & Style Defaults
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default drawing properties
  const [fillColor, setFillColor] = useState<string>('#3b82f6');
  const [fillOpacity, setFillOpacity] = useState<number>(1);
  const [strokeColor, setStrokeColor] = useState<string>('#1d4ed8');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [strokeOpacity, setStrokeOpacity] = useState<number>(1);
  const [cornerRadius, setCornerRadius] = useState<number>(0);
  const [strokeDash, setStrokeDash] = useState<string>('');

  // Text Tool options
  const [fontSize, setFontSize] = useState<number>(28);
  const [fontFamily, setFontFamily] = useState<string>('sans-serif');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);

  // Realtime Raw SVG Code Textarea
  const [svgCode, setSvgCode] = useState<string>('');
  const [codeError, setCodeError] = useState<boolean>(false);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [activeViewTab, setActiveViewTab] = useState<'split' | 'canvas' | 'code'>('split');

  // Interactive Drawing & Dragging Internal State
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const svgRef = useRef<SVGSVGElement | null>(null);
  // Set when the change came from typing in the code editor, so the sync effect
  // below doesn't rewrite (and reformat) the text the user is typing.
  const skipCodeSyncRef = useRef<boolean>(false);

  // Record changes to history stack
  const updateElementsWithHistory = useCallback((newElements: SVGElementData[]) => {
    setElements(newElements);
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, newElements]);
    setHistoryIndex(newHistory.length);
  }, [history, historyIndex]);

  const applyParsedSettings = useCallback((s: CanvasSettings) => {
    setCanvasSettings(prev => ({ ...prev, width: s.width, height: s.height, viewBox: s.viewBox, defs: s.defs }));
  }, []);

  // Sync canvas state to SVG code output whenever the drawing changes.
  // Only depends on settings that appear in the markup (not e.g. the grid toggle).
  const { width: cw, height: ch, viewBox: cvb, defs: cdefs } = canvasSettings;
  useEffect(() => {
    if (skipCodeSyncRef.current) {
      skipCodeSyncRef.current = false;
      return;
    }
    setSvgCode(elementsToSVG(elements, { width: cw, height: ch, viewBox: cvb, defs: cdefs }));
    setCodeError(false);
  }, [elements, cw, ch, cvb, cdefs]);

  // Initialize with star template on initial load
  useEffect(() => {
    const parsed = parseSVGToElements(PRESET_TEMPLATES[0].svg);
    setElements(parsed.elements);
    applyParsedSettings(parsed.settings);
    setHistory([parsed.elements]);
    setHistoryIndex(0);
  }, [applyParsedSettings]);

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  // Handle raw SVG text edit/paste from user
  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSvgCode(val);
    try {
      const parsed = parseSVGToElements(val);
      skipCodeSyncRef.current = true; // keep the user's text exactly as typed
      setElements(parsed.elements);
      applyParsedSettings(parsed.settings);
      setSelectedId(null);
      setCodeError(false);
    } catch {
      // Not well-formed yet (mid-typing): keep the last valid canvas and flag it
      setCodeError(true);
    }
  };

  // Map mouse position into SVG user space (respects viewBox, sizing and zoom)
  const getCanvasCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: round2(p.x), y: round2(p.y) };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getCanvasCoords(e);
    setDragStart(coords);

    if (activeTool === 'select') return;

    if (activeTool === 'eraser') {
      return; // Eraser handles directly on element click
    }

    setIsDrawing(true);

    if (activeTool === 'pencil') {
      setCurrentPoints([coords]);
    } else if (activeTool === 'line') {
      const newEl: SVGElementData = {
        id: `line-${Date.now()}`,
        type: 'line',
        x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y,
        fill: 'transparent', fillOpacity: 1,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      };
      setElements(prev => [...prev, newEl]);
      setSelectedId(newEl.id);
    } else if (activeTool === 'rect') {
      const newEl: SVGElementData = {
        id: `rect-${Date.now()}`,
        type: 'rect',
        x: coords.x, y: coords.y, width: 1, height: 1, rx: cornerRadius,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      };
      setElements(prev => [...prev, newEl]);
      setSelectedId(newEl.id);
    } else if (activeTool === 'circle') {
      const newEl: SVGElementData = {
        id: `circle-${Date.now()}`,
        type: 'circle',
        cx: coords.x, cy: coords.y, r: 1,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      };
      setElements(prev => [...prev, newEl]);
      setSelectedId(newEl.id);
    } else if (activeTool === 'triangle') {
      const points = `${coords.x},${coords.y} ${coords.x},${coords.y} ${coords.x},${coords.y}`;
      const newEl: SVGElementData = {
        id: `triangle-${Date.now()}`,
        type: 'polygon',
        points,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      };
      setElements(prev => [...prev, newEl]);
      setSelectedId(newEl.id);
    } else if (activeTool === 'text') {
      const textVal = prompt('Enter text for SVG shape:', 'Hello SVG') || 'Hello SVG';
      const newEl: SVGElementData = {
        id: `text-${Date.now()}`,
        type: 'text',
        x: coords.x, y: coords.y,
        textContent: textVal,
        fontSize, fontFamily,
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        textAnchor: 'middle',
        fill: fillColor, fillOpacity,
        stroke: 'transparent', strokeWidth: 0, strokeOpacity: 1
      };
      updateElementsWithHistory([...elements, newEl]);
      setSelectedId(newEl.id);
      setIsDrawing(false);
      setActiveTool('select');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !dragStart) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'pencil') {
      setCurrentPoints(prev => [...prev, coords]);
    } else if (activeTool === 'line') {
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, x2: coords.x, y2: coords.y } : el));
    } else if (activeTool === 'rect') {
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const width = Math.abs(coords.x - dragStart.x);
      const height = Math.abs(coords.y - dragStart.y);
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, x, y, width, height } : el));
    } else if (activeTool === 'circle') {
      const r = round2(Math.sqrt(Math.pow(coords.x - dragStart.x, 2) + Math.pow(coords.y - dragStart.y, 2)));
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, r } : el));
    } else if (activeTool === 'triangle') {
      const x1 = dragStart.x;
      const y1 = dragStart.y;
      const x2 = coords.x;
      const y2 = coords.y;
      const x3 = round2(x1 - (x2 - x1));
      const points = `${x1},${y1} ${x2},${y2} ${x3},${y2}`;
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, points } : el));
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (activeTool === 'pencil' && currentPoints.length > 1) {
      const d = currentPoints.reduce((acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
      const newEl: SVGElementData = {
        id: `path-${Date.now()}`,
        type: 'path',
        d,
        fill: 'transparent', fillOpacity: 1,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      };
      updateElementsWithHistory([...elements, newEl]);
      setSelectedId(newEl.id);
      setCurrentPoints([]);
    } else {
      updateElementsWithHistory(elements);
    }
  };

  // Element interaction handlers
  const handleElementClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      const filtered = elements.filter(el => el.id !== id);
      updateElementsWithHistory(filtered);
      if (selectedId === id) setSelectedId(null);
    } else if (activeTool === 'select') {
      setSelectedId(id);
      // Populate inspector controls with selected element attributes
      const selected = elements.find(el => el.id === id);
      if (selected) {
        setFillColor(selected.fill);
        setStrokeColor(selected.stroke);
        setStrokeWidth(selected.strokeWidth);
        if (selected.type === 'rect' && selected.rx !== undefined) setCornerRadius(selected.rx);
      }
    }
  };

  // Property updates for selected shape
  const updateSelectedElement = (key: keyof SVGElementData, value: unknown) => {
    if (!selectedId) return;
    const updated = elements.map(el => el.id === selectedId ? { ...el, [key]: value } : el);
    updateElementsWithHistory(updated);
  };

  // Layer order operations
  const moveLayer = (direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (!selectedId) return;
    const idx = elements.findIndex(el => el.id === selectedId);
    if (idx === -1) return;

    const newArr = [...elements];
    const [item] = newArr.splice(idx, 1);

    if (direction === 'up' && idx < elements.length - 1) newArr.splice(idx + 1, 0, item);
    else if (direction === 'down' && idx > 0) newArr.splice(idx - 1, 0, item);
    else if (direction === 'top') newArr.push(item);
    else if (direction === 'bottom') newArr.unshift(item);

    updateElementsWithHistory(newArr);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateElementsWithHistory(elements.filter(el => el.id !== selectedId));
    setSelectedId(null);
  };

  // Copy code feedback
  const handleCopyCode = () => {
    navigator.clipboard.writeText(svgCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Export SVG / PNG
  const downloadFile = (format: 'svg' | 'png') => {
    if (format === 'svg') {
      const blob = new Blob([svgCode], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vector-artwork.svg';
      a.click();
    } else {
      const img = new Image();
      const svgBlob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvasSettings.width;
        canvas.height = canvasSettings.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = 'vector-artwork.png';
          downloadLink.click();
        }
      };
      img.src = url;
    }
  };

  const selectedElement = elements.find(el => el.id === selectedId);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* HEADER */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide text-white flex items-center gap-2">
              SVG Paint Studio
              <span className="text-xs font-normal px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Vector Editor
              </span>
            </h1>
          </div>
        </div>

        {/* Action Controls & Templates */}
        <div className="flex items-center gap-2">
          {/* Preset Template Selector */}
          <select
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              if (!isNaN(idx)) {
                const parsed = parseSVGToElements(PRESET_TEMPLATES[idx].svg);
                setElements(parsed.elements);
                applyParsedSettings(parsed.settings);
                setSelectedId(null);
                setHistory([parsed.elements]);
                setHistoryIndex(0);
              }
            }}
            className="bg-slate-700 text-xs text-slate-200 border border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
            defaultValue=""
          >
            <option value="" disabled>Load Preset Template...</option>
            {PRESET_TEMPLATES.map((tmpl, index) => (
              <option key={index} value={index}>{tmpl.name}</option>
            ))}
          </select>

          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 rounded transition"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 rounded transition"
            title="Redo"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-700 mx-1" />

          {/* Download Buttons */}
          <button
            onClick={() => downloadFile('svg')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition"
          >
            <Download className="w-3.5 h-3.5" /> SVG
          </button>
          <button
            onClick={() => downloadFile('png')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition"
          >
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT TOOLBAR: Drawing Tools */}
        <aside className="w-16 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-3 gap-2 z-10">
          {[
            { id: 'select', label: 'Select / Move', icon: MousePointer },
            { id: 'pencil', label: 'Pencil / Freehand', icon: Pencil },
            { id: 'line', label: 'Line Tool', icon: Minus },
            { id: 'rect', label: 'Rectangle', icon: Square },
            { id: 'circle', label: 'Circle', icon: Circle },
            { id: 'triangle', label: 'Triangle', icon: Triangle },
            { id: 'text', label: 'Text Tool', icon: TypeIcon },
            { id: 'eraser', label: 'Eraser', icon: Eraser },
          ].map((tool) => {
            const IconComponent = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as ToolType)}
                className={`p-2.5 rounded-lg flex flex-col items-center justify-center transition relative group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                }`}
                title={tool.label}
              >
                <IconComponent className="w-5 h-5" />
                <span className="absolute left-16 bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  {tool.label}
                </span>
              </button>
            );
          })}
        </aside>

        {/* MIDDLE SECTION: View switcher & Interactive Canvas / Code Split */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {/* Top Canvas View Bar */}
          <div className="h-10 bg-slate-800/80 border-b border-slate-700 px-4 flex items-center justify-between">
            {/* View Mode Toggle Buttons */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-md border border-slate-700">
              <button
                onClick={() => setActiveViewTab('split')}
                className={`px-3 py-1 text-xs rounded transition flex items-center gap-1.5 ${
                  activeViewTab === 'split' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="w-3 h-3" /> Split View
              </button>
              <button
                onClick={() => setActiveViewTab('canvas')}
                className={`px-3 py-1 text-xs rounded transition flex items-center gap-1.5 ${
                  activeViewTab === 'canvas' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3 h-3" /> Canvas Only
              </button>
              <button
                onClick={() => setActiveViewTab('code')}
                className={`px-3 py-1 text-xs rounded transition flex items-center gap-1.5 ${
                  activeViewTab === 'code' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3 h-3" /> Code Only
              </button>
            </div>

            {/* Canvas Zoom & Grid Toggle */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.1))}
                  className="p-1 hover:text-white rounded"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span>{Math.round(zoomLevel * 100)}%</span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.1))}
                  className="p-1 hover:text-white rounded"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setCanvasSettings(s => ({ ...s, showGrid: !s.showGrid }))}
                className={`p-1.5 rounded text-xs flex items-center gap-1 border ${
                  canvasSettings.showGrid
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                    : 'text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle Grid Background"
              >
                <Grid className="w-3.5 h-3.5" /> Grid
              </button>
            </div>
          </div>

          {/* Canvas + Code panes */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* CANVAS WORKSPACE PANEL */}
            {(activeViewTab === 'split' || activeViewTab === 'canvas') && (
              <div className="flex-1 flex items-center justify-center p-6 overflow-auto relative">
                <div
                  className="relative shadow-2xl transition-transform"
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                >
                  {/* Grid or Plain background */}
                  <div
                    className={`rounded border border-slate-700 overflow-hidden ${
                      canvasSettings.showGrid
                        ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]'
                        : ''
                    }`}
                    style={{ backgroundColor: canvasSettings.backgroundColor }}
                  >
                    <svg
                      ref={svgRef}
                      width={canvasSettings.width}
                      height={canvasSettings.height}
                      viewBox={canvasSettings.viewBox}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      className="cursor-crosshair block"
                    >
                      {/* Gradients, patterns etc. carried over from imported SVG */}
                      {canvasSettings.defs && <defs dangerouslySetInnerHTML={{ __html: canvasSettings.defs }} />}

                      {/* Rendered SVG Elements */}
                      {elements.map((el) => {
                        const isSelected = selectedId === el.id;
                        const strokeAttrs = {
                          stroke: el.stroke,
                          strokeWidth: el.strokeWidth,
                          strokeOpacity: el.strokeOpacity,
                          strokeDasharray: el.strokeDasharray,
                          strokeLinecap: el.strokeLinecap,
                          strokeLinejoin: el.strokeLinejoin,
                        };

                        const transform = getTransform(el);

                        return (
                          <g key={el.id} onClick={(e) => handleElementClick(e, el.id)}>
                            {el.type === 'path' && (
                              <path d={el.d} fill={el.fill} fillOpacity={el.fillOpacity} {...strokeAttrs} transform={transform} />
                            )}
                            {el.type === 'rect' && (
                              <rect x={el.x} y={el.y} width={el.width} height={el.height} rx={el.rx || 0} fill={el.fill} fillOpacity={el.fillOpacity} {...strokeAttrs} transform={transform} />
                            )}
                            {el.type === 'circle' && (
                              <circle cx={el.cx} cy={el.cy} r={el.r} fill={el.fill} fillOpacity={el.fillOpacity} {...strokeAttrs} transform={transform} />
                            )}
                            {el.type === 'line' && (
                              <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...strokeAttrs} transform={transform} />
                            )}
                            {el.type === 'polygon' && (
                              <polygon points={el.points} fill={el.fill} fillOpacity={el.fillOpacity} {...strokeAttrs} transform={transform} />
                            )}
                            {el.type === 'text' && (
                              <text
                                x={el.x} y={el.y} fill={el.fill} fillOpacity={el.fillOpacity}
                                {...strokeAttrs}
                                fontSize={el.fontSize} fontFamily={el.fontFamily}
                                fontWeight={el.fontWeight} fontStyle={el.fontStyle}
                                textAnchor={el.textAnchor || 'middle'} transform={transform}
                              >
                                {el.textContent}
                              </text>
                            )}

                            {/* Render Active Selection Bounding Box (follows the element's transform) */}
                            {isSelected && (
                              <g className="pointer-events-none" transform={transform}>
                                {el.type === 'rect' && (
                                  <rect
                                    x={(el.x || 0) - 4} y={(el.y || 0) - 4}
                                    width={(el.width || 0) + 8} height={(el.height || 0) + 8}
                                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4"
                                  />
                                )}
                                {el.type === 'circle' && (
                                  <circle
                                    cx={el.cx} cy={el.cy} r={(el.r || 0) + 4}
                                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4"
                                  />
                                )}
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {/* Realtime Drawing Preview Path for Pencil Tool */}
                      {isDrawing && activeTool === 'pencil' && currentPoints.length > 1 && (
                        <path
                          d={currentPoints.reduce((acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '')}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeOpacity={strokeOpacity}
                        />
                      )}
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* RAW SVG CODE EDITOR PANEL */}
            {(activeViewTab === 'split' || activeViewTab === 'code') && (
              <div
                className={`bg-slate-900 border-l border-slate-700 flex flex-col ${
                  activeViewTab === 'split' ? 'w-1/2' : 'w-full'
                }`}
              >
                <div className="h-9 bg-slate-800/60 border-b border-slate-700 px-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-blue-400" /> SVG Code Editor
                  </span>

                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition"
                  >
                    {codeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {codeCopied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>

                {codeError && (
                  <div className="px-3 py-1.5 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/30">
                    Invalid SVG markup. The canvas is showing the last valid version.
                  </div>
                )}

                <textarea
                  value={svgCode}
                  onChange={handleCodeChange}
                  spellCheck={false}
                  className="flex-1 bg-slate-950 text-emerald-400 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed tracking-wide"
                  placeholder="Paste or edit raw SVG XML code here..."
                />
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANEL: Settings, Inspector, Layers */}
        <aside className="w-72 bg-slate-800 border-l border-slate-700 flex flex-col overflow-y-auto text-xs z-10">
          {/* Canvas Dimensions Section */}
          <div className="p-4 border-b border-slate-700 space-y-3">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" /> Canvas Settings
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Width (px)</label>
                <input
                  type="number"
                  value={canvasSettings.width}
                  onChange={(e) => {
                    const w = parseInt(e.target.value, 10) || 100;
                    setCanvasSettings(s => ({ ...s, width: w, viewBox: `0 0 ${w} ${s.height}` }));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Height (px)</label>
                <input
                  type="number"
                  value={canvasSettings.height}
                  onChange={(e) => {
                    const h = parseInt(e.target.value, 10) || 100;
                    setCanvasSettings(s => ({ ...s, height: h, viewBox: `0 0 ${s.width} ${h}` }));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Style & Fill Properties */}
          <div className="p-4 border-b border-slate-700 space-y-3">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-blue-400" /> Fill & Stroke
            </h3>

            {/* Fill Color */}
            <div className="space-y-1">
              <label className="text-slate-400 flex justify-between">
                <span>Fill Color</span>
                <button
                  onClick={() => {
                    setFillColor('transparent');
                    if (selectedId) updateSelectedElement('fill', 'transparent');
                  }}
                  className="text-blue-400 hover:underline text-[10px]"
                >
                  Set Transparent
                </button>
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={toColorInput(fillColor)}
                  onChange={(e) => {
                    setFillColor(e.target.value);
                    if (selectedId) updateSelectedElement('fill', e.target.value);
                  }}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer border border-slate-700"
                />
                <input
                  type="text"
                  value={fillColor}
                  onChange={(e) => {
                    setFillColor(e.target.value);
                    if (selectedId) updateSelectedElement('fill', e.target.value);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Stroke Color */}
            <div className="space-y-1">
              <label className="text-slate-400 block">Stroke Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={toColorInput(strokeColor)}
                  onChange={(e) => {
                    setStrokeColor(e.target.value);
                    if (selectedId) updateSelectedElement('stroke', e.target.value);
                  }}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer border border-slate-700"
                />
                <input
                  type="text"
                  value={strokeColor}
                  onChange={(e) => {
                    setStrokeColor(e.target.value);
                    if (selectedId) updateSelectedElement('stroke', e.target.value);
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Stroke Width Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Stroke Width</span>
                <span>{strokeWidth}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={strokeWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setStrokeWidth(val);
                  if (selectedId) updateSelectedElement('strokeWidth', val);
                }}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Corner Radius for Rectangles */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Corner Radius (rx)</span>
                <span>{cornerRadius}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={cornerRadius}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCornerRadius(val);
                  if (selectedId) updateSelectedElement('rx', val);
                }}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* ELEMENT INSPECTOR */}
          {selectedElement && (
            <div className="p-4 border-b border-slate-700 space-y-3 bg-slate-800/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">
                  Element Inspector
                </h3>
                <button
                  onClick={deleteSelected}
                  className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-700 rounded"
                  title="Delete Shape"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Rotation Handle */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span className="flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotation</span>
                  <span>{selectedElement.rotation || 0}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={selectedElement.rotation || 0}
                  onChange={(e) => updateSelectedElement('rotation', parseInt(e.target.value, 10))}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Text specific settings */}
              {selectedElement.type === 'text' && (
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <label className="text-slate-400 block">Text Content</label>
                  <input
                    type="text"
                    value={selectedElement.textContent || ''}
                    onChange={(e) => updateSelectedElement('textContent', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* LAYER MANAGEMENT PANEL */}
          <div className="p-4 flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" /> Layer Stack ({elements.length})
              </h3>

              {/* Layer Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveLayer('top')}
                  disabled={!selectedId}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Bring to Front"
                >
                  <ChevronsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveLayer('up')}
                  disabled={!selectedId}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Bring Forward"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveLayer('down')}
                  disabled={!selectedId}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Send Backward"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveLayer('bottom')}
                  disabled={!selectedId}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Send to Back"
                >
                  <ChevronsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Layer List */}
            <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg overflow-y-auto divide-y divide-slate-800">
              {elements.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">No shapes on canvas</div>
              ) : (
                [...elements].reverse().map((el) => {
                  const isSelected = selectedId === el.id;
                  return (
                    <div
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                        isSelected ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="capitalize flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 opacity-60" />
                        {el.type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {el.id.split('-')[2] || ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
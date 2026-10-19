// CHQ: drafted by Gemini AI, modified by Claude AI

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Folder,
  FolderOpen
} from 'lucide-react';

type ToolType = 'select' | 'pencil' | 'line' | 'rect' | 'circle' | 'triangle' | 'text' | 'eraser';

interface SVGElementData {
  id: string;
  type: 'path' | 'line' | 'rect' | 'circle' | 'polygon' | 'text' | 'group';
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDasharray?: string;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  transform?: string;
  d?: string;
  x1?: number; y1?: number; x2?: number; y2?: number;
  x?: number; y?: number; width?: number; height?: number; rx?: number;
  cx?: number; cy?: number; r?: number;
  points?: string;
  textContent?: string; fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string;
  textAnchor?: 'start' | 'middle' | 'end';
  rotation?: number;
  children?: SVGElementData[];
}

interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
  showGrid: boolean;
  defs: string;
}

type ExportSettings = Pick<CanvasSettings, 'width' | 'height' | 'viewBox' | 'defs'>;

interface Snapshot extends ExportSettings {
  elements: SVGElementData[];
}

type Box = { x: number; y: number; width: number; height: number };

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

const MAX_HISTORY = 100;
const FONT_FAMILIES = ['sans-serif', 'serif', 'monospace', 'cursive'];
const DASH_STYLES = [
  { label: 'Solid', value: '' },
  { label: 'Dashed', value: '10 6' },
  { label: 'Dotted', value: '2 6' },
  { label: 'Dash-dot', value: '12 4 2 4' }
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const round2 = (n: number) => Math.round(n * 100) / 100;

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

const toColorInput = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000');
const isBoldWeight = (w?: string) => w === 'bold' || w === 'bolder' || parseInt(w || '', 10) >= 600;

const parsePoints = (points?: string): [number, number][] => {
  const nums = (points || '').trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
};

const sameSnapshot = (a: Snapshot, b: Snapshot) =>
  a.elements === b.elements && a.width === b.width && a.height === b.height && a.viewBox === b.viewBox && a.defs === b.defs;

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

const getElementBBox = (el: SVGElementData): Box | null => {
  if (el.type === 'group') {
    if (!el.children || el.children.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    el.children.forEach(child => {
      const b = getElementBBox(child);
      if (b) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
    });
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  switch (el.type) {
    case 'rect':
      return { x: el.x || 0, y: el.y || 0, width: el.width || 0, height: el.height || 0 };
    case 'circle': {
      const r = el.r || 0;
      return { x: (el.cx || 0) - r, y: (el.cy || 0) - r, width: r * 2, height: r * 2 };
    }
    case 'line': {
      const x1 = el.x1 || 0, y1 = el.y1 || 0, x2 = el.x2 || 0, y2 = el.y2 || 0;
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    }
    case 'polygon': {
      const pts = parsePoints(el.points);
      if (!pts.length) return null;
      const xs = pts.map(p => p[0]);
      const ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
    case 'path':
      return measureBBox('path', { d: el.d || '' });
    case 'text':
      return measureBBox(
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
    default:
      return null;
  }
};

const getElementCenter = (el: SVGElementData): { x: number; y: number } => {
  const b = getElementBBox(el);
  if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  return el.type === 'text' ? { x: el.x || 0, y: el.y || 0 } : { x: 0, y: 0 };
};

const getTransform = (el: SVGElementData): string | undefined => {
  const parts: string[] = [];
  if (el.transform) parts.push(el.transform);
  if (el.rotation) {
    const c = getElementCenter(el);
    parts.push(`rotate(${el.rotation} ${round2(c.x)} ${round2(c.y)})`);
  }
  return parts.length ? parts.join(' ') : undefined;
};

const TRANSLATE_RE = /^\s*translate\(\s*([-+]?[\d.]+(?:e[-+]?\d+)?)(?:[\s,]+([-+]?[\d.]+(?:e[-+]?\d+)?))?\s*\)\s*(.*)$/i;
const shiftTransform = (transform: string | undefined, dx: number, dy: number): string => {
  const m = transform ? TRANSLATE_RE.exec(transform) : null;
  if (m) {
    const nx = round2(parseFloat(m[1]) + dx);
    const ny = round2((m[2] !== undefined ? parseFloat(m[2]) : 0) + dy);
    return `translate(${nx} ${ny}) ${m[3]}`.trim();
  }
  return `translate(${round2(dx)} ${round2(dy)}) ${transform || ''}`.trim();
};

const moveElement = (el: SVGElementData, dx: number, dy: number): SVGElementData => {
  if (el.transform || el.type === 'path' || el.type === 'group') {
    return { ...el, transform: shiftTransform(el.transform, dx, dy) };
  }
  switch (el.type) {
    case 'rect':
      return { ...el, x: round2((el.x || 0) + dx), y: round2((el.y || 0) + dy) };
    case 'circle':
      return { ...el, cx: round2((el.cx || 0) + dx), cy: round2((el.cy || 0) + dy) };
    case 'line':
      return {
        ...el,
        x1: round2((el.x1 || 0) + dx), y1: round2((el.y1 || 0) + dy),
        x2: round2((el.x2 || 0) + dx), y2: round2((el.y2 || 0) + dy)
      };
    case 'text':
      return { ...el, x: round2((el.x || 0) + dx), y: round2((el.y || 0) + dy) };
    case 'polygon':
      return {
        ...el,
        points: parsePoints(el.points).map(([x, y]) => `${round2(x + dx)},${round2(y + dy)}`).join(' ')
      };
    default:
      return el;
  }
};

const elementToLine = (el: SVGElementData): string => {
  if (el.type === 'group') {
    const tf = getTransform(el);
    const transformAttr = tf ? ` transform="${esc(tf)}"` : '';
    const inner = (el.children || []).map(elementToLine).filter(Boolean).join('\n');
    return `  <g${transformAttr}>\n${inner.split('\n').map(l => '  ' + l).join('\n')}\n  </g>`;
  }

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
};

const elementsToSVG = (elements: SVGElementData[], settings: ExportSettings): string => {
  const innerElements = elements.map(elementToLine).filter(Boolean).join('\n');
  const defsBlock = settings.defs.trim() ? `  <defs>\n${settings.defs}\n  </defs>\n` : '';

  return `<svg width="${settings.width}" height="${settings.height}" viewBox="${esc(settings.viewBox)}" xmlns="${SVG_NS}">
${defsBlock}${innerElements}
</svg>`;
};

const computeElementLineRanges = (
  elements: SVGElementData[],
  settings: ExportSettings
): Record<string, { start: number; end: number }> => {
  const header = `<svg width="${settings.width}" height="${settings.height}" viewBox="${esc(settings.viewBox)}" xmlns="${SVG_NS}">\n`;
  const defsBlock = settings.defs.trim() ? `  <defs>\n${settings.defs}\n  </defs>\n` : '';

  const ranges: Record<string, { start: number; end: number }> = {};
  let offset = header.length + defsBlock.length;
  let wroteLine = false;
  elements.forEach(el => {
    const line = elementToLine(el);
    if (!line) return;
    if (wroteLine) offset += 1;
    const start = offset;
    const end = start + line.length;
    ranges[el.id] = { start, end };
    offset = end;
    wroteLine = true;
  });
  return ranges;
};

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

const sanitizeNode = (root: Element) => {
  root.querySelectorAll('script, foreignObject').forEach(n => n.remove());
  [root, ...Array.from(root.querySelectorAll('*'))].forEach(n => {
    Array.from(n.attributes).forEach(a => {
      if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
  });
};

const parseSVGToElements = (svgString: string): { elements: SVGElementData[]; settings: CanvasSettings } => {
  let input = svgString.trim();
  if (!/<svg[\s>]/i.test(input)) {
    input = `<svg xmlns="${SVG_NS}" viewBox="0 0 700 600" width="700" height="600">${input}</svg>`;
  }

  const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG markup');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) throw new Error('No <svg> element found');

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

  const traverse = (nodes: Element[], inherited: Record<string, string>, parentTransform: string, targetArr: SVGElementData[]) => {
    nodes.forEach(node => {
      const tag = node.tagName.toLowerCase();

      if (['defs', 'style', 'metadata', 'title', 'desc'].includes(tag)) return;
      if (['lineargradient', 'radialgradient', 'pattern'].includes(tag)) {
        keepInDefs(node);
        return;
      }

      const props = { ...inherited, ...readProps(node) };
      const transform = [parentTransform, node.getAttribute('transform') || ''].filter(Boolean).join(' ');

      const id = node.getAttribute('id') || `el-${Date.now()}-${counter++}-${Math.random().toString(36).substring(2, 6)}`;
      const base = {
        id,
        fill: normPaint(props['fill'], '#000000'),
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

      if (tag === 'g') {
        const groupChildren: SVGElementData[] = [];
        traverse(Array.from(node.children), props, '', groupChildren);
        if (groupChildren.length > 0) {
          targetArr.push({
            ...base,
            type: 'group',
            fill: 'transparent',
            stroke: 'transparent',
            children: groupChildren
          });
        }
        return;
      }

      if (tag === 'path') {
        targetArr.push({ ...base, type: 'path', d: node.getAttribute('d') || '' });
      } else if (tag === 'rect') {
        targetArr.push({
          ...base, type: 'rect',
          x: num(node.getAttribute('x'), 0), y: num(node.getAttribute('y'), 0),
          width: num(node.getAttribute('width'), 50), height: num(node.getAttribute('height'), 50),
          rx: num(node.getAttribute('rx'), 0)
        });
      } else if (tag === 'circle') {
        targetArr.push({
          ...base, type: 'circle',
          cx: num(node.getAttribute('cx'), 0), cy: num(node.getAttribute('cy'), 0), r: num(node.getAttribute('r'), 25)
        });
      } else if (tag === 'line') {
        targetArr.push({
          ...base, type: 'line',
          x1: num(node.getAttribute('x1'), 0), y1: num(node.getAttribute('y1'), 0),
          x2: num(node.getAttribute('x2'), 50), y2: num(node.getAttribute('y2'), 50)
        });
      } else if (tag === 'polyline' || tag === 'polygon') {
        targetArr.push({ ...base, type: 'polygon', points: node.getAttribute('points') || '' });
      } else if (tag === 'text') {
        const anchor = props['text-anchor'];
        targetArr.push({
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

  traverse(Array.from(svgEl.children), readProps(svgEl), svgEl.getAttribute('transform') || '', elements);

  return {
    elements,
    settings: { width, height, viewBox, defs: defsParts.join('\n'), backgroundColor: 'transparent', showGrid: true }
  };
};

type ScaleMap = { ax: number; ay: number; sx: number; sy: number; dx: number; dy: number };
const mapX = (m: ScaleMap, x: number) => round2(m.ax + m.sx * (x - m.ax) + m.dx);
const mapY = (m: ScaleMap, y: number) => round2(m.ay + m.sy * (y - m.ay) + m.dy);

const PATH_PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const PATH_NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;

const scalePathData = (d: string, m: ScaleMap): string | null => {
  const out: string[] = [];
  let i = 0;
  let cmd = '';
  let fresh = false;
  const skipSep = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const readNum = (): number | null => {
    skipSep();
    const hit = PATH_NUM_RE.exec(d.slice(i));
    if (!hit) return null;
    i += hit[0].length;
    return parseFloat(hit[0]);
  };
  const readFlag = (): number | null => {
    skipSep();
    if (d[i] !== '0' && d[i] !== '1') return null;
    return parseInt(d[i++], 10);
  };

  skipSep();
  while (i < d.length) {
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) {
      if (!(ch.toLowerCase() in PATH_PARAMS)) return null;
      cmd = ch;
      fresh = true;
      i++;
      if (cmd === 'z' || cmd === 'Z') out.push('Z');
      skipSep();
      if (cmd.toLowerCase() === 'z') continue;
    } else if (!cmd || cmd.toLowerCase() === 'z') {
      return null;
    }

    const lower = cmd.toLowerCase();
    const abs = cmd === cmd.toUpperCase();
    const nums: number[] = [];
    for (let k = 0; k < PATH_PARAMS[lower]; k++) {
      const v = lower === 'a' && (k === 3 || k === 4) ? readFlag() : readNum();
      if (v === null) return null;
      nums.push(v);
    }

    let mapped: number[];
    if (lower === 'h') mapped = [abs ? mapX(m, nums[0]) : round2(nums[0] * m.sx)];
    else if (lower === 'v') mapped = [abs ? mapY(m, nums[0]) : round2(nums[0] * m.sy)];
    else if (lower === 'a') {
      mapped = [
        round2(nums[0] * m.sx), round2(nums[1] * m.sy), nums[2], nums[3], nums[4],
        abs ? mapX(m, nums[5]) : round2(nums[5] * m.sx),
        abs ? mapY(m, nums[6]) : round2(nums[6] * m.sy)
      ];
    } else {
      mapped = nums.map((v, k) =>
        k % 2 === 0
          ? (abs ? mapX(m, v) : round2(v * m.sx))
          : (abs ? mapY(m, v) : round2(v * m.sy))
      );
    }
    out.push(fresh ? `${cmd} ${mapped.join(' ')}` : mapped.join(' '));
    fresh = false;
    skipSep();
  }
  return out.join(' ');
};

const scaleElement = (el: SVGElementData, m: ScaleMap): SVGElementData => {
  if (el.type === 'group') {
    return {
      ...el,
      transform: shiftTransform(el.transform, m.dx, m.dy),
      children: (el.children || []).map(child => scaleElement(child, m))
    };
  }
  switch (el.type) {
    case 'rect':
      return {
        ...el,
        x: mapX(m, el.x || 0), y: mapY(m, el.y || 0),
        width: round2((el.width || 0) * m.sx), height: round2((el.height || 0) * m.sy)
      };
    case 'circle':
      return { ...el, cx: mapX(m, el.cx || 0), cy: mapY(m, el.cy || 0), r: round2((el.r || 0) * m.sx) };
    case 'line':
      return {
        ...el,
        x1: mapX(m, el.x1 || 0), y1: mapY(m, el.y1 || 0),
        x2: mapX(m, el.x2 || 0), y2: mapY(m, el.y2 || 0)
      };
    case 'polygon':
      return {
        ...el,
        points: parsePoints(el.points).map(([x, y]) => `${mapX(m, x)},${mapY(m, y)}`).join(' ')
      };
    case 'path': {
      const d = scalePathData(el.d || '', m);
      return d === null ? el : { ...el, d };
    }
    case 'text':
      return {
        ...el,
        x: mapX(m, el.x || 0), y: mapY(m, el.y || 0),
        fontSize: Math.max(1, round2((el.fontSize ?? 16) * m.sx))
      };
    default:
      return el;
  }
};

type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];
const OPPOSITE: Record<Corner, Corner> = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' };
const MIN_RESIZE = 4;

const cornerPoint = (b: Box, c: Corner) => ({
  x: c === 'tl' || c === 'bl' ? b.x : b.x + b.width,
  y: c === 'tl' || c === 'tr' ? b.y : b.y + b.height
});

const isUniformOnly = (el: SVGElementData) => el.type === 'circle' || el.type === 'text';

let matrixGroup: SVGGElement | null = null;
const getElementMatrix = (el: SVGElementData): DOMMatrix => {
  const tf = getTransform(el);
  if (!tf || typeof document === 'undefined') return new DOMMatrix();
  try {
    if (!matrixGroup) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      matrixGroup = document.createElementNS(SVG_NS, 'g');
      svg.appendChild(matrixGroup);
    }
    matrixGroup.setAttribute('transform', tf);
    const list = matrixGroup.transform.baseVal;
    return list.numberOfItems ? DOMMatrix.fromMatrix(list.consolidate()!.matrix) : new DOMMatrix();
  } catch {
    return new DOMMatrix();
  }
};

const resizeElement = (
  orig: SVGElementData,
  box: Box,
  corner: Corner,
  inverse: DOMMatrix,
  grab: { x: number; y: number },
  pointer: { x: number; y: number },
  keepAspect: boolean
): SVGElementData => {
  const p = inverse.transformPoint(pointer);
  const handle = cornerPoint(box, corner);
  const anchor = cornerPoint(box, OPPOSITE[corner]);
  const dirX = handle.x >= anchor.x ? 1 : -1;
  const dirY = handle.y >= anchor.y ? 1 : -1;

  const wantW = Math.max(MIN_RESIZE, dirX * (p.x - grab.x - anchor.x));
  const wantH = Math.max(MIN_RESIZE, dirY * (p.y - grab.y - anchor.y));
  let sx = box.width > 1e-6 ? wantW / box.width : 1;
  let sy = box.height > 1e-6 ? wantH / box.height : 1;

  if (keepAspect || isUniformOnly(orig)) {
    const flatX = box.width <= 1e-6, flatY = box.height <= 1e-6;
    const s = flatX ? sy : flatY ? sx : Math.max(sx, sy);
    sx = s;
    sy = s;
  }

  const base: ScaleMap = { ax: anchor.x, ay: anchor.y, sx, sy, dx: 0, dy: 0 };
  const rot = ((orig.rotation || 0) * Math.PI) / 180;
  if (!rot) return scaleElement(orig, base);

  const co = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cn = { x: anchor.x + sx * (co.x - anchor.x), y: anchor.y + sy * (co.y - anchor.y) };
  const vx = co.x - cn.x, vy = co.y - cn.y;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const dx = vx - (cos * vx - sin * vy);
  const dy = vy - (sin * vx + cos * vy);
  return scaleElement(orig, { ...base, dx, dy });
};

const SelectionOutline = ({ el, transform }: { el: SVGElementData; transform?: string }) => {
  const b = getElementBBox(el);
  if (!b) return null;
  const pad = 4 + (el.strokeWidth || 0) / 2;
  return (
    <rect
      className="pointer-events-none"
      transform={transform}
      x={b.x - pad} y={b.y - pad}
      width={b.width + pad * 2} height={b.height + pad * 2}
      fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4"
    />
  );
};

const LabeledSlider = ({
  label, valueLabel, min, max, step = 1, value, onChange, onCommit
}: {
  label: React.ReactNode;
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
}) => (
  <div className="space-y-1">
    <div className="flex justify-between text-slate-400">
      <span className="flex items-center gap-1">{label}</span>
      <span>{valueLabel}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onPointerUp={onCommit}
      onKeyUp={onCommit}
      onBlur={onCommit}
      className="w-full accent-blue-500"
    />
  </div>
);

export default function SVGPaintStudio() {
  const [initial] = useState(() => parseSVGToElements(PRESET_TEMPLATES[0].svg));

  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>(() => ({
    ...initial.settings,
    backgroundColor: '#ffffff',
    showGrid: true
  }));

  const [elements, setElements] = useState<SVGElementData[]>(initial.elements);
  const [hist, setHist] = useState<{ stack: Snapshot[]; index: number }>(() => ({
    stack: [{
      elements: initial.elements,
      width: initial.settings.width,
      height: initial.settings.height,
      viewBox: initial.settings.viewBox,
      defs: initial.settings.defs
    }],
    index: 0
  }));

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[0] || null;

  const [fillColor, setFillColor] = useState<string>('#3b82f6');
  const [fillOpacity, setFillOpacity] = useState<number>(1);
  const [strokeColor, setStrokeColor] = useState<string>('#1d4ed8');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [strokeOpacity, setStrokeOpacity] = useState<number>(1);
  const [cornerRadius, setCornerRadius] = useState<number>(0);
  const [strokeDash, setStrokeDash] = useState<string>('');

  const [fontSize, setFontSize] = useState<number>(28);
  const [fontFamily, setFontFamily] = useState<string>('sans-serif');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [isItalic, setIsItalic] = useState<boolean>(false);

  const [svgCode, setSvgCode] = useState<string>('');
  const [codeError, setCodeError] = useState<boolean>(false);
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [activeViewTab, setActiveViewTab] = useState<'split' | 'canvas' | 'code'>('split');
  const [notice, setNotice] = useState<string | null>(null);

  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  // --- MARQUEE SELECTION STATE ---
  const [marqueeBox, setMarqueeBox] = useState<Box | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const codeHighlightRef = useRef<HTMLPreElement | null>(null);
  const codeHighlightSpanRef = useRef<HTMLSpanElement | null>(null);
  const skipCodeSyncRef = useRef<boolean>(false);

  const dragRef = useRef<{
    id: string;
    orig: SVGElementData;
    start: { x: number; y: number };
    startClient: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const resizeRef = useRef<{
    id: string;
    orig: SVGElementData;
    box: Box;
    corner: Corner;
    inverse: DOMMatrix;
    grab: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const drawRef = useRef<{
    id: string;
    base: SVGElementData[];
    startClient: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const commitTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const settingsRef = useRef(canvasSettings);
  settingsRef.current = canvasSettings;
  const histRef = useRef(hist);
  histRef.current = hist;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const pushHistory = useCallback((snap: Snapshot) => {
    setHist(h => {
      if (sameSnapshot(h.stack[h.index], snap)) return h;
      const stack = [...h.stack.slice(0, h.index + 1), snap].slice(-MAX_HISTORY);
      return { stack, index: stack.length - 1 };
    });
  }, []);

  const currentSnapshot = useCallback((): Snapshot => {
    const s = settingsRef.current;
    return { elements: elementsRef.current, width: s.width, height: s.height, viewBox: s.viewBox, defs: s.defs };
  }, []);

  const isDirtyNow = useCallback(() => {
    const h = histRef.current;
    return !sameSnapshot(h.stack[h.index], currentSnapshot());
  }, [currentSnapshot]);

  const commitHistory = useCallback(() => {
    pushHistory(currentSnapshot());
  }, [pushHistory, currentSnapshot]);

  const commitElements = useCallback((next: SVGElementData[]) => {
    setElements(next);
    const s = settingsRef.current;
    pushHistory({ elements: next, width: s.width, height: s.height, viewBox: s.viewBox, defs: s.defs });
  }, [pushHistory]);

  const clearPendingCommit = useCallback(() => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const applyParsedSettings = useCallback((s: CanvasSettings) => {
    setCanvasSettings(prev => ({ ...prev, width: s.width, height: s.height, viewBox: s.viewBox, defs: s.defs }));
  }, []);

  const restoreSnapshot = useCallback((s: Snapshot) => {
    setElements(s.elements);
    applyParsedSettings({ ...settingsRef.current, width: s.width, height: s.height, viewBox: s.viewBox, defs: s.defs });
  }, [applyParsedSettings]);

  const undo = useCallback(() => {
    clearPendingCommit();
    const h = histRef.current;
    if (isDirtyNow()) {
      restoreSnapshot(h.stack[h.index]);
      return;
    }
    if (h.index > 0) {
      setHist({ stack: h.stack, index: h.index - 1 });
      restoreSnapshot(h.stack[h.index - 1]);
    }
  }, [clearPendingCommit, isDirtyNow, restoreSnapshot]);

  const redo = useCallback(() => {
    clearPendingCommit();
    const h = histRef.current;
    if (isDirtyNow()) {
      commitHistory();
      return;
    }
    if (h.index < h.stack.length - 1) {
      setHist({ stack: h.stack, index: h.index + 1 });
      restoreSnapshot(h.stack[h.index + 1]);
    }
  }, [clearPendingCommit, isDirtyNow, commitHistory, restoreSnapshot]);

  const liveSnapshot: Snapshot = {
    elements,
    width: canvasSettings.width,
    height: canvasSettings.height,
    viewBox: canvasSettings.viewBox,
    defs: canvasSettings.defs
  };
  const isDirty = !sameSnapshot(hist.stack[hist.index], liveSnapshot);
  const canUndo = isDirty || hist.index > 0;
  const canRedo = !isDirty && hist.index < hist.stack.length - 1;

  const { width: cw, height: ch, viewBox: cvb, defs: cdefs } = canvasSettings;
  useEffect(() => {
    if (skipCodeSyncRef.current) {
      skipCodeSyncRef.current = false;
      return;
    }
    setSvgCode(elementsToSVG(elements, { width: cw, height: ch, viewBox: cvb, defs: cdefs }));
    setCodeError(false);
  }, [elements, cw, ch, cvb, cdefs]);

  const codeRanges = useMemo(
    () => computeElementLineRanges(elements, { width: cw, height: ch, viewBox: cvb, defs: cdefs }),
    [elements, cw, ch, cvb, cdefs]
  );
  const codeHighlightRange = selectedId && !codeError ? codeRanges[selectedId] : undefined;

  useEffect(() => {
    if (!codeHighlightRange) return;
    const ta = codeTextareaRef.current;
    const span = codeHighlightSpanRef.current;
    if (!ta || !span) return;
    const target = span.offsetTop - ta.clientHeight / 2 + span.offsetHeight / 2;
    ta.scrollTop = Math.max(0, Math.min(target, ta.scrollHeight - ta.clientHeight));
  }, [selectedId, codeHighlightRange, activeViewTab]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const selectElement = useCallback((id: string, multi = false) => {
    setSelectedIds(prev => {
      if (multi) {
        if (prev.includes(id)) return prev.filter(i => i !== id);
        return [...prev, id];
      }
      return [id];
    });
    const el = elementsRef.current.find(e => e.id === id);
    if (!el) return;
    if (el.type !== 'group') {
      setFillColor(el.fill);
      setStrokeColor(el.stroke);
      setStrokeWidth(el.strokeWidth);
      setFillOpacity(el.fillOpacity);
      setStrokeOpacity(el.strokeOpacity);
      setStrokeDash(el.strokeDasharray || '');
      if (el.type === 'rect' && el.rx !== undefined) setCornerRadius(el.rx);
      if (el.type === 'text') {
        setFontSize(el.fontSize ?? 28);
        setFontFamily(el.fontFamily || 'sans-serif');
        setIsBold(isBoldWeight(el.fontWeight));
        setIsItalic(el.fontStyle === 'italic');
      }
    }
  }, []);

  const updateSelectedElement = <K extends keyof SVGElementData>(key: K, value: SVGElementData[K], commit = false) => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const next = elementsRef.current.map(el => (ids.includes(el.id) ? ({ ...el, [key]: value } as SVGElementData) : el));
    if (commit) commitElements(next);
    else setElements(next);
  };

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    commitElements(elementsRef.current.filter(el => !ids.includes(el.id)));
    setSelectedIds([]);
  }, [commitElements]);

  const groupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const currentElements = elementsRef.current;
    const itemsToGroup = currentElements.filter(el => ids.includes(el.id));
    if (itemsToGroup.length === 0) return;

    const newGroupId = `group-${Date.now()}`;
    const newGroup: SVGElementData = {
      id: newGroupId,
      type: 'group',
      fill: 'transparent',
      fillOpacity: 1,
      stroke: 'transparent',
      strokeWidth: 0,
      strokeOpacity: 1,
      rotation: 0,
      children: itemsToGroup
    };

    let replaced = false;
    const nextElements: SVGElementData[] = [];
    currentElements.forEach(el => {
      if (ids.includes(el.id)) {
        if (!replaced) {
          nextElements.push(newGroup);
          replaced = true;
        }
      } else {
        nextElements.push(el);
      }
    });

    commitElements(nextElements);
    setSelectedIds([newGroupId]);
  }, [commitElements]);

  const ungroupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length !== 1) return;
    const currentElements = elementsRef.current;
    const targetGroup = currentElements.find(el => el.id === ids[0] && el.type === 'group');
    if (!targetGroup || !targetGroup.children) return;

    const children = targetGroup.children;
    const nextElements: SVGElementData[] = [];
    currentElements.forEach(el => {
      if (el.id === targetGroup.id) {
        nextElements.push(...children);
      } else {
        nextElements.push(el);
      }
    });

    commitElements(nextElements);
    setSelectedIds(children.map(c => c.id));
  }, [commitElements]);

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

    commitElements(newArr);
  };

  const flashNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000);
  };

  const loadSvgString = (svg: string) => {
    const parsed = parseSVGToElements(svg);
    clearPendingCommit();
    setElements(parsed.elements);
    applyParsedSettings(parsed.settings);
    setSelectedIds([]);
    pushHistory({
      elements: parsed.elements,
      width: parsed.settings.width,
      height: parsed.settings.height,
      viewBox: parsed.settings.viewBox,
      defs: parsed.settings.defs
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      loadSvgString(text);
    } catch {
      flashNotice('Could not import: that file is not valid SVG.');
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSvgCode(val);
    try {
      const parsed = parseSVGToElements(val);
      skipCodeSyncRef.current = true;
      setElements(parsed.elements);
      applyParsedSettings(parsed.settings);
      setSelectedIds([]);
      setCodeError(false);
    } catch {
      setCodeError(true);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          (t.tagName === 'INPUT' && !['range', 'color', 'checkbox', 'radio', 'button', 'file'].includes((t as HTMLInputElement).type)));
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
      } else if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, deleteSelected, groupSelected, ungroupSelected]);

  const getCanvasCoords = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: round2(p.x), y: round2(p.y) };
  };

  const handleElementMouseDown = (e: React.MouseEvent, id: string) => {
    if (activeTool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    commitHistory();
    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    selectElement(id, isMulti);
    const orig = elementsRef.current.find(el => el.id === id);
    if (!orig) return;
    dragRef.current = {
      id,
      orig,
      start: getCanvasCoords(e),
      startClient: { x: e.clientX, y: e.clientY },
      moved: false
    };
  };

  const handleResizeMouseDown = (e: React.MouseEvent, corner: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    commitHistory();
    const id = selectedId;
    const orig = elementsRef.current.find(el => el.id === id);
    const box = orig && getElementBBox(orig);
    if (!orig || !box) return;
    const inverse = getElementMatrix(orig).inverse();
    const local = inverse.transformPoint(getCanvasCoords(e));
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return;
    const hit = cornerPoint(box, corner);
    resizeRef.current = {
      id: orig.id, orig, box, corner, inverse,
      grab: { x: local.x - hit.x, y: local.y - hit.y },
      moved: false
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    commitHistory();
    const coords = getCanvasCoords(e);
    setDragStart(coords);

    if (activeTool === 'select') {
      // If clicking on the background empty space, initiate Marquee Selection Box
      setMarqueeBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setSelectedIds([]);
      }
      return;
    }

    if (activeTool === 'eraser') return;

    setIsDrawing(true);

    const startShape = (newEl: SVGElementData) => {
      drawRef.current = {
        id: newEl.id,
        base: elementsRef.current,
        startClient: { x: e.clientX, y: e.clientY },
        moved: false
      };
      setElements(prev => [...prev, newEl]);
      setSelectedIds([newEl.id]);
    };

    if (activeTool === 'pencil') {
      setCurrentPoints([coords]);
    } else if (activeTool === 'line') {
      startShape({
        id: `line-${Date.now()}`,
        type: 'line',
        x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y,
        fill: 'transparent', fillOpacity: 1,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      });
    } else if (activeTool === 'rect') {
      startShape({
        id: `rect-${Date.now()}`,
        type: 'rect',
        x: coords.x, y: coords.y, width: 1, height: 1, rx: cornerRadius,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      });
    } else if (activeTool === 'circle') {
      startShape({
        id: `circle-${Date.now()}`,
        type: 'circle',
        cx: coords.x, cy: coords.y, r: 1,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      });
    } else if (activeTool === 'triangle') {
      const points = `${coords.x},${coords.y} ${coords.x},${coords.y} ${coords.x},${coords.y}`;
      startShape({
        id: `triangle-${Date.now()}`,
        type: 'polygon',
        points,
        fill: fillColor, fillOpacity,
        stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
      });
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
      commitElements([...elementsRef.current, newEl]);
      setSelectedIds([newEl.id]);
      setIsDrawing(false);
      setActiveTool('select');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rs = resizeRef.current;
    if (rs) {
      rs.moved = true;
      const resized = resizeElement(rs.orig, rs.box, rs.corner, rs.inverse, rs.grab, getCanvasCoords(e), !e.shiftKey);
      setElements(elementsRef.current.map(el => (el.id === rs.id ? resized : el)));
      if (resized.type === 'text' && resized.fontSize !== undefined) setFontSize(Math.round(resized.fontSize));
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y) < 3) return;
      drag.moved = true;
      const c = getCanvasCoords(e);
      const moved = moveElement(drag.orig, round2(c.x - drag.start.x), round2(c.y - drag.start.y));
      setElements(elementsRef.current.map(el => (el.id === drag.id ? moved : el)));
      return;
    }

    // --- MARQUEE SELECTION DRAG LOGIC ---
    if (activeTool === 'select' && marqueeBox && dragStart) {
      const coords = getCanvasCoords(e);
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const width = Math.abs(coords.x - dragStart.x);
      const height = Math.abs(coords.y - dragStart.y);
      setMarqueeBox({ x, y, width, height });
      return;
    }

    if (!isDrawing || !dragStart) return;
    const draw = drawRef.current;
    if (draw && !draw.moved && Math.hypot(e.clientX - draw.startClient.x, e.clientY - draw.startClient.y) >= 4) {
      draw.moved = true;
    }
    const coords = getCanvasCoords(e);
    const id = draw?.id;

    if (activeTool === 'pencil') {
      setCurrentPoints(prev => [...prev, coords]);
    } else if (activeTool === 'line') {
      setElements(prev => prev.map(el => el.id === id ? { ...el, x2: coords.x, y2: coords.y } : el));
    } else if (activeTool === 'rect') {
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const width = Math.abs(coords.x - dragStart.x);
      const height = Math.abs(coords.y - dragStart.y);
      setElements(prev => prev.map(el => el.id === id ? { ...el, x, y, width, height } : el));
    } else if (activeTool === 'circle') {
      const r = round2(Math.sqrt(Math.pow(coords.x - dragStart.x, 2) + Math.pow(coords.y - dragStart.y, 2)));
      setElements(prev => prev.map(el => el.id === id ? { ...el, r } : el));
    } else if (activeTool === 'triangle') {
      const x1 = dragStart.x;
      const y1 = dragStart.y;
      const x2 = coords.x;
      const y2 = coords.y;
      const x3 = round2(x1 - (x2 - x1));
      const points = `${x1},${y1} ${x2},${y2} ${x3},${y2}`;
      setElements(prev => prev.map(el => el.id === id ? { ...el, points } : el));
    }
  };

  const handleMouseUp = () => {
    const rs = resizeRef.current;
    if (rs) {
      resizeRef.current = null;
      if (rs.moved) commitHistory();
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      if (drag.moved) commitHistory();
      return;
    }

    // --- FINALIZE MARQUEE SELECTION ---
    if (marqueeBox) {
      const mBox = marqueeBox;
      setMarqueeBox(null);
      if (mBox.width > 3 || mBox.height > 3) {
        // Find all shapes whose bounding boxes intersect the marquee selection box
        const matchingIds: string[] = [];
        elementsRef.current.forEach(el => {
          const b = getElementBBox(el);
          if (b) {
            const intersects = !(
              b.x > mBox.x + mBox.width ||
              b.x + b.width < mBox.x ||
              b.y > mBox.y + mBox.height ||
              b.y + b.height < mBox.y
            );
            if (intersects) matchingIds.push(el.id);
          }
        });
        if (matchingIds.length > 0) {
          setSelectedIds(matchingIds);
        }
      }
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    const draw = drawRef.current;
    drawRef.current = null;

    if (activeTool === 'pencil') {
      if (currentPoints.length > 1) {
        const d = currentPoints.reduce((acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
        const newEl: SVGElementData = {
          id: `path-${Date.now()}`,
          type: 'path',
          d,
          fill: 'transparent', fillOpacity: 1,
          stroke: strokeColor, strokeWidth, strokeOpacity, strokeDasharray: strokeDash
        };
        commitElements([...elementsRef.current, newEl]);
        setSelectedIds([newEl.id]);
      }
      setCurrentPoints([]);
      return;
    }

    if (draw && !draw.moved) {
      setElements(draw.base);
      setSelectedIds([]);
      return;
    }
    commitHistory();
  };

  const handleElementClick = (e: React.MouseEvent, id: string) => {
    if (activeTool !== 'eraser') return;
    e.stopPropagation();
    commitElements(elementsRef.current.filter(el => el.id !== id));
    if (selectedIds.includes(id)) setSelectedIds(prev => prev.filter(i => i !== id));
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(svgCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

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
  const isTextSelected = selectedElement?.type === 'text';
  const showTextPanel = activeTool === 'text' || isTextSelected;
  const dashOptions = DASH_STYLES.some(d => d.value === strokeDash)
    ? DASH_STYLES
    : [...DASH_STYLES, { label: `Custom (${strokeDash})`, value: strokeDash }];
  const fontOptions = FONT_FAMILIES.includes(fontFamily) ? FONT_FAMILIES : [fontFamily, ...FONT_FAMILIES];

  const resizeHandles = (() => {
    if (activeTool !== 'select' || !selectedElement || selectedIds.length > 1) return null;
    const box = getElementBBox(selectedElement);
    if (!box || (box.width <= 0 && box.height <= 0)) return null;
    const m = getElementMatrix(selectedElement);
    const vbWidth = parseFloat(canvasSettings.viewBox.split(/[\s,]+/)[2]);
    const unitsPerPx = (vbWidth > 0 && canvasSettings.width > 0 ? vbWidth / canvasSettings.width : 1) / zoomLevel;
    const pad = 4 + (selectedElement.strokeWidth || 0) / 2;
    const center = m.transformPoint({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    return {
      size: 10 * unitsPerPx,
      items: CORNERS.map(corner => {
        const pt = cornerPoint(box, corner);
        const w = m.transformPoint({
          x: corner === 'tl' || corner === 'bl' ? pt.x - pad : pt.x + pad,
          y: corner === 'tl' || corner === 'tr' ? pt.y - pad : pt.y + pad
        });
        const cursor = (w.x - center.x) * (w.y - center.y) > 0 ? 'nwse-resize' : 'nesw-resize';
        return { corner, x: w.x, y: w.y, cursor };
      })
    };
  })();

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
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

        <div className="flex items-center gap-2">
          {notice && <span className="text-xs text-rose-300 mr-1">{notice}</span>}

          <button
            onClick={groupSelected}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded font-medium transition"
            title="Group selected elements (Ctrl+G)"
          >
            <Folder className="w-3.5 h-3.5 text-blue-400" /> Group
          </button>
          <button
            onClick={ungroupSelected}
            disabled={selectedIds.length !== 1 || elements.find(el => el.id === selectedId)?.type !== 'group'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded font-medium transition"
            title="Ungroup selected group (Ctrl+Shift+G)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> Ungroup
          </button>

          <div className="h-5 w-px bg-slate-700 mx-1" />

          <select
            value=""
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              if (!isNaN(idx)) loadSvgString(PRESET_TEMPLATES[idx].svg);
            }}
            className="bg-slate-700 text-xs text-slate-200 border border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="" disabled>Load Preset Template...</option>
            {PRESET_TEMPLATES.map((tmpl, index) => (
              <option key={index} value={index}>{tmpl.name}</option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition"
            title="Import an SVG file"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>

          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 rounded transition"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 disabled:opacity-40 rounded transition"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-700 mx-1" />

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

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-16 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-3 gap-2 z-10">
          {[
            { id: 'select', label: 'Select / Marquee', icon: MousePointer },
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

        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          <div className="h-10 bg-slate-800/80 border-b border-slate-700 px-4 flex items-center justify-between">
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

          <div className="flex-1 flex overflow-hidden relative">
            {(activeViewTab === 'split' || activeViewTab === 'canvas') && (
              <div className="flex-1 flex items-center justify-center p-6 overflow-auto relative">
                <div
                  className="relative shadow-2xl transition-transform"
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                >
                  <div
                    className="rounded border border-slate-700 overflow-hidden"
                    style={{
                      backgroundColor: canvasSettings.backgroundColor,
                      ...(canvasSettings.showGrid
                        ? { backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', backgroundSize: '16px 16px' }
                        : {})
                    }}
                  >
                    <svg
                      ref={svgRef}
                      width={canvasSettings.width}
                      height={canvasSettings.height}
                      viewBox={canvasSettings.viewBox}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className={`block ${activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
                    >
                      {canvasSettings.defs && <defs dangerouslySetInnerHTML={{ __html: canvasSettings.defs }} />}

                      {elements.map((el) => {
                        const isSelected = selectedIds.includes(el.id);
                        const strokeAttrs = {
                          stroke: el.stroke,
                          strokeWidth: el.strokeWidth,
                          strokeOpacity: el.strokeOpacity,
                          strokeDasharray: el.strokeDasharray,
                          strokeLinecap: el.strokeLinecap,
                          strokeLinejoin: el.strokeLinejoin,
                        };

                        const transform = getTransform(el);

                        const renderNode = (node: SVGElementData): React.ReactNode => {
                          const nodeTf = getTransform(node);
                          const nodeStrokeAttrs = {
                            stroke: node.stroke,
                            strokeWidth: node.strokeWidth,
                            strokeOpacity: node.strokeOpacity,
                            strokeDasharray: node.strokeDasharray,
                            strokeLinecap: node.strokeLinecap,
                            strokeLinejoin: node.strokeLinejoin,
                          };

                          switch (node.type) {
                            case 'group':
                              return (
                                <g key={node.id} transform={nodeTf}>
                                  {(node.children || []).map(renderNode)}
                                </g>
                              );
                            case 'path':
                              return <path key={node.id} d={node.d} fill={node.fill} fillOpacity={node.fillOpacity} {...nodeStrokeAttrs} transform={nodeTf} />;
                            case 'rect':
                              return <rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} rx={node.rx || 0} fill={node.fill} fillOpacity={node.fillOpacity} {...nodeStrokeAttrs} transform={nodeTf} />;
                            case 'circle':
                              return <circle key={node.id} cx={node.cx} cy={node.cy} r={node.r} fill={node.fill} fillOpacity={node.fillOpacity} {...nodeStrokeAttrs} transform={nodeTf} />;
                            case 'line':
                              return <line key={node.id} x1={node.x1} y1={node.y1} x2={node.x2} y2={node.y2} {...nodeStrokeAttrs} transform={nodeTf} />;
                            case 'polygon':
                              return <polygon key={node.id} points={node.points} fill={node.fill} fillOpacity={node.fillOpacity} {...nodeStrokeAttrs} transform={nodeTf} />;
                            case 'text': {
                              const nodeTextStroke = node.stroke !== 'transparent' && node.strokeWidth > 0 ? nodeStrokeAttrs : {};
                              return (
                                <text
                                  key={node.id}
                                  x={node.x} y={node.y} fill={node.fill} fillOpacity={node.fillOpacity}
                                  {...nodeTextStroke}
                                  fontSize={node.fontSize} fontFamily={node.fontFamily}
                                  fontWeight={node.fontWeight} fontStyle={node.fontStyle}
                                  textAnchor={node.textAnchor || 'middle'} transform={nodeTf}
                                >
                                  {node.textContent}
                                </text>
                              );
                            }
                            default:
                              return null;
                          }
                        };

                        return (
                          <g
                            key={el.id}
                            onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                            onClick={(e) => handleElementClick(e, el.id)}
                            style={{ cursor: activeTool === 'select' ? 'move' : undefined }}
                          >
                            {renderNode(el)}
                            {isSelected && <SelectionOutline el={el} transform={transform} />}
                          </g>
                        );
                      })}

                      {/* Marquee Selection Visual Box */}
                      {marqueeBox && (
                        <rect
                          className="pointer-events-none"
                          x={marqueeBox.x}
                          y={marqueeBox.y}
                          width={marqueeBox.width}
                          height={marqueeBox.height}
                          fill="rgba(59, 130, 246, 0.15)"
                          stroke="#3b82f6"
                          strokeWidth="1.5"
                          strokeDasharray="4 4"
                        />
                      )}

                      {resizeHandles && resizeHandles.items.map(h => (
                        <rect
                          key={h.corner}
                          x={h.x - resizeHandles.size / 2} y={h.y - resizeHandles.size / 2}
                          width={resizeHandles.size} height={resizeHandles.size}
                          fill="#ffffff" stroke="#3b82f6" strokeWidth={resizeHandles.size * 0.15}
                          style={{ cursor: h.cursor }}
                          onMouseDown={(e) => handleResizeMouseDown(e, h.corner)}
                        />
                      ))}

                      {isDrawing && activeTool === 'pencil' && currentPoints.length > 1 && (
                        <path
                          d={currentPoints.reduce((acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '')}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          strokeOpacity={strokeOpacity}
                          strokeDasharray={strokeDash || undefined}
                        />
                      )}
                    </svg>
                  </div>
                </div>
              </div>
            )}

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

                <div className="flex-1 relative bg-slate-950">
                  <pre
                    ref={codeHighlightRef}
                    aria-hidden="true"
                    className="absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words font-mono text-xs p-4 leading-relaxed tracking-wide text-transparent pointer-events-none"
                  >
                    {codeHighlightRange ? (
                      <>
                        {svgCode.slice(0, codeHighlightRange.start)}
                        <span ref={codeHighlightSpanRef} className="bg-blue-500/30 rounded-sm">
                          {svgCode.slice(codeHighlightRange.start, codeHighlightRange.end)}
                        </span>
                        {svgCode.slice(codeHighlightRange.end)}
                      </>
                    ) : (
                      svgCode
                    )}
                    {'\n'}
                  </pre>

                  <textarea
                    ref={codeTextareaRef}
                    value={svgCode}
                    onChange={handleCodeChange}
                    onScroll={(e) => {
                      const hl = codeHighlightRef.current;
                      if (hl) {
                        hl.scrollTop = e.currentTarget.scrollTop;
                        hl.scrollLeft = e.currentTarget.scrollLeft;
                      }
                    }}
                    spellCheck={false}
                    className="absolute inset-0 w-full h-full bg-transparent text-emerald-400 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed tracking-wide whitespace-pre-wrap break-words"
                    placeholder="Paste or edit raw SVG XML code here..."
                  />
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className="w-72 bg-slate-800 border-l border-slate-700 flex flex-col overflow-y-auto text-xs z-10">
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
                  onBlur={commitHistory}
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
                  onBlur={commitHistory}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-slate-700 space-y-3">
            <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-blue-400" /> Fill & Stroke
            </h3>

            <div className="space-y-1">
              <label className="text-slate-400 flex justify-between">
                <span>Fill Color</span>
                <button
                  onClick={() => {
                    setFillColor('transparent');
                    updateSelectedElement('fill', 'transparent', true);
                  }}
                  className="text-blue-400 hover:underline"
                  style={{ fontSize: 10 }}
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
                    updateSelectedElement('fill', e.target.value);
                  }}
                  onBlur={commitHistory}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer border border-slate-700"
                />
                <input
                  type="text"
                  value={fillColor}
                  onChange={(e) => {
                    setFillColor(e.target.value);
                    updateSelectedElement('fill', e.target.value);
                  }}
                  onBlur={commitHistory}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <LabeledSlider
              label="Fill Opacity"
              valueLabel={`${Math.round(fillOpacity * 100)}%`}
              min={0} max={1} step={0.05}
              value={fillOpacity}
              onChange={(v) => {
                setFillOpacity(v);
                updateSelectedElement('fillOpacity', v);
              }}
              onCommit={commitHistory}
            />

            <div className="space-y-1">
              <label className="text-slate-400 block">Stroke Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={toColorInput(strokeColor)}
                  onChange={(e) => {
                    setStrokeColor(e.target.value);
                    updateSelectedElement('stroke', e.target.value);
                  }}
                  onBlur={commitHistory}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer border border-slate-700"
                />
                <input
                  type="text"
                  value={strokeColor}
                  onChange={(e) => {
                    setStrokeColor(e.target.value);
                    updateSelectedElement('stroke', e.target.value);
                  }}
                  onBlur={commitHistory}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <LabeledSlider
              label="Stroke Width"
              valueLabel={`${strokeWidth}px`}
              min={0} max={30}
              value={strokeWidth}
              onChange={(v) => {
                setStrokeWidth(v);
                updateSelectedElement('strokeWidth', v);
              }}
              onCommit={commitHistory}
            />

            <LabeledSlider
              label="Stroke Opacity"
              valueLabel={`${Math.round(strokeOpacity * 100)}%`}
              min={0} max={1} step={0.05}
              value={strokeOpacity}
              onChange={(v) => {
                setStrokeOpacity(v);
                updateSelectedElement('strokeOpacity', v);
              }}
              onCommit={commitHistory}
            />

            <div className="space-y-1">
              <label className="text-slate-400 block">Stroke Style</label>
              <select
                value={strokeDash}
                onChange={(e) => {
                  setStrokeDash(e.target.value);
                  updateSelectedElement('strokeDasharray', e.target.value, true);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {dashOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <LabeledSlider
              label="Corner Radius (rx)"
              valueLabel={`${cornerRadius}px`}
              min={0} max={50}
              value={cornerRadius}
              onChange={(v) => {
                setCornerRadius(v);
                updateSelectedElement('rx', v);
              }}
              onCommit={commitHistory}
            />
          </div>

          {showTextPanel && (
            <div className="p-4 border-b border-slate-700 space-y-3">
              <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
                <TypeIcon className="w-3.5 h-3.5 text-blue-400" /> Text
              </h3>

              <div className="space-y-1">
                <label className="text-slate-400 block">Font</label>
                <select
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    if (isTextSelected) updateSelectedElement('fontFamily', e.target.value, true);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {fontOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <LabeledSlider
                label="Font Size"
                valueLabel={`${fontSize}px`}
                min={8} max={200}
                value={fontSize}
                onChange={(v) => {
                  setFontSize(v);
                  if (isTextSelected) updateSelectedElement('fontSize', v);
                }}
                onCommit={commitHistory}
              />

              <div className="flex gap-2">
                <button
                  aria-pressed={isBold}
                  onClick={() => {
                    const v = !isBold;
                    setIsBold(v);
                    if (isTextSelected) updateSelectedElement('fontWeight', v ? 'bold' : 'normal', true);
                  }}
                  className={`w-9 h-8 rounded border font-bold transition ${
                    isBold
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                  title="Bold"
                >
                  B
                </button>
                <button
                  aria-pressed={isItalic}
                  onClick={() => {
                    const v = !isItalic;
                    setIsItalic(v);
                    if (isTextSelected) updateSelectedElement('fontStyle', v ? 'italic' : 'normal', true);
                  }}
                  className={`w-9 h-8 rounded border italic transition ${
                    isItalic
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                  title="Italic"
                >
                  I
                </button>
              </div>
            </div>
          )}

          {selectedElement && selectedIds.length === 1 && (
            <div className="p-4 border-b border-slate-700 space-y-3 bg-slate-800/50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase">
                  Element Inspector
                </h3>
                <button
                  onClick={deleteSelected}
                  className="text-rose-400 hover:text-rose-300 p-1 hover:bg-slate-700 rounded"
                  title="Delete Shape (Del)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <LabeledSlider
                label={<><RotateCw className="w-3 h-3" /> Rotation</>}
                valueLabel={`${selectedElement.rotation || 0}°`}
                min={0} max={360}
                value={selectedElement.rotation || 0}
                onChange={(v) => updateSelectedElement('rotation', v)}
                onCommit={commitHistory}
              />

              {selectedElement.type === 'text' && (
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <label className="text-slate-400 block">Text Content</label>
                  <input
                    type="text"
                    value={selectedElement.textContent || ''}
                    onChange={(e) => updateSelectedElement('textContent', e.target.value)}
                    onBlur={commitHistory}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          <div className="p-4 flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 text-xs tracking-wider uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" /> Layer Stack ({elements.length})
              </h3>

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

            <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg overflow-y-auto divide-y divide-slate-800">
              {elements.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">No shapes on canvas</div>
              ) : (
                [...elements].reverse().map((el) => {
                  const isSelected = selectedIds.includes(el.id);
                  return (
                    <div
                      key={el.id}
                      onClick={(e) => selectElement(el.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer transition ${
                        isSelected ? 'bg-blue-600/20 text-blue-300 font-medium' : 'text-slate-400 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="capitalize flex items-center gap-2">
                        {el.type === 'group' ? <Folder className="w-3.5 h-3.5 opacity-60 text-amber-400" /> : <FileText className="w-3.5 h-3.5 opacity-60" />}
                        {el.type}
                      </span>
                      <span className="text-slate-500 font-mono" style={{ fontSize: 10 }}>
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
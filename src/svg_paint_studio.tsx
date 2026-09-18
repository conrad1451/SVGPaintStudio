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
  transform?: string;
  // Shape-specific attributes
  d?: string; // for path
  x1?: number; y1?: number; x2?: number; y2?: number; // for line
  x?: number; y?: number; width?: number; height?: number; rx?: number; // for rect
  cx?: number; cy?: number; r?: number; // for circle
  points?: string; // for polygon
  textContent?: string; fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string; // for text
  rotation?: number;
}

interface CanvasSettings {
  width: number;
  height: number;
  viewBox: string;
  backgroundColor: string;
  showGrid: boolean;
}

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

// Converts elements array to clean formatted SVG string
const elementsToSVG = (elements: SVGElementData[], settings: CanvasSettings): string => {
  const innerElements = elements.map(el => {
    const strokeAttrs = `stroke="${el.stroke}" stroke-width="${el.strokeWidth}" stroke-opacity="${el.strokeOpacity}"${
      el.strokeDasharray ? ` stroke-dasharray="${el.strokeDasharray}"` : ''
    }${el.strokeLinecap ? ` stroke-linecap="${el.strokeLinecap}"` : ''}${
      el.strokeLinejoin ? ` stroke-linejoin="${el.strokeLinejoin}"` : ''
    }`;
    const fillAttrs = `fill="${el.fill}" fill-opacity="${el.fillOpacity}"`;
    const transformAttr = el.rotation ? ` transform="rotate(${el.rotation} ${getElementCenter(el).x} ${getElementCenter(el).y})"` : '';

    switch (el.type) {
      case 'path':
        return `  <path d="${el.d}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'line':
        return `  <line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${strokeAttrs}${transformAttr} />`;
      case 'rect':
        return `  <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.rx || 0}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'circle':
        return `  <circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'polygon':
        return `  <polygon points="${el.points}" ${fillAttrs} ${strokeAttrs}${transformAttr} />`;
      case 'text':
        return `  <text x="${el.x}" y="${el.y}" fill="${el.fill}" font-size="${el.fontSize}" font-family="${el.fontFamily}" font-weight="${el.fontWeight}" font-style="${el.fontStyle}" text-anchor="middle"${transformAttr}>${el.textContent}</text>`;
      default:
        return '';
    }
  }).filter(Boolean).join('\n');

  return `<svg width="${settings.width}" height="${settings.height}" viewBox="${settings.viewBox}" xmlns="http://www.w3.org/2000/svg">
${innerElements}
</svg>`;
};

// Calculate center point of an element for rotation transforms
const getElementCenter = (el: SVGElementData): { x: number; y: number } => {
  switch (el.type) {
    case 'rect':
      return { x: (el.x || 0) + (el.width || 0) / 2, y: (el.y || 0) + (el.height || 0) / 2 };
    case 'circle':
      return { x: el.cx || 0, y: el.cy || 0 };
    case 'line':
      return { x: ((el.x1 || 0) + (el.x2 || 0)) / 2, y: ((el.y1 || 0) + (el.y2 || 0)) / 2 };
    case 'text':
      return { x: el.x || 0, y: el.y || 0 };
    default:
      return { x: el.x || 0, y: el.y || 0 };
  }
};

// Expanded SVG string parser supporting <defs>, <style>, <g>, and complex elements
const parseSVGToElements = (svgString: string): { elements: SVGElementData[]; settings: CanvasSettings } => {
  let cleanedInput = svgString.trim();

  if (!cleanedInput.startsWith('<svg')) {
    cleanedInput = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 600" width="700" height="600">${cleanedInput}</svg>`;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanedInput, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  if (!svgEl) return { elements: [], settings: { width: 700, height: 600, viewBox: '0 0 700 600', backgroundColor: 'transparent', showGrid: true } };

  // Parse CSS rules from embedded <style> tags
  const styleMap: Record<string, Record<string, string>> = {};
  doc.querySelectorAll('style').forEach(styleTag => {
    const cssText = styleTag.textContent || '';
    const rules = cssText.match(/(\.[^{]+)\s*\{([^}]+)\}/g) || [];
    rules.forEach(rule => {
      const match = rule.match(/\.([^{]+)\s*\{([^}]+)\}/);
      if (match) {
        const className = match[1].trim();
        const declarations = match[2].split(';');
        styleMap[className] = styleMap[className] || {};
        declarations.forEach(decl => {
          const [prop, val] = decl.split(':').map(s => s?.trim());
          if (prop && val) styleMap[className][prop] = val;
        });
      }
    });
  });

  const width = parseInt(svgEl.getAttribute('width') || '700', 10);
  const height = parseInt(svgEl.getAttribute('height') || '600', 10);
  const viewBox = svgEl.getAttribute('viewBox') || `0 0 ${width} ${height}`;

  const elements: SVGElementData[] = [];

  const traverseNodes = (nodes: Element[]) => {
    nodes.forEach((node, index) => {
      const tagName = node.tagName.toLowerCase();

      if (['defs', 'style', 'filter', 'metadata', 'title', 'desc'].includes(tagName)) return;

      if (tagName === 'g') {
        traverseNodes(Array.from(node.children));
        return;
      }

      // Merge inline attributes with CSS class styles
      const classes = (node.getAttribute('class') || '').split(' ').filter(Boolean);
      let mergedStyles: Record<string, string> = {};
      classes.forEach(c => {
        if (styleMap[c]) Object.assign(mergedStyles, styleMap[c]);
      });

      const fill = node.getAttribute('fill') || mergedStyles['fill'] || 'transparent';
      const stroke = node.getAttribute('stroke') || mergedStyles['stroke'] || 'transparent';
      const strokeWidth = parseFloat(node.getAttribute('stroke-width') || mergedStyles['stroke-width'] || '1');

      const id = node.getAttribute('id') || `el-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;

      const baseEl = {
        id,
        fill: fill === 'none' ? 'transparent' : fill,
        fillOpacity: parseFloat(node.getAttribute('fill-opacity') || '1'),
        stroke: stroke === 'none' ? 'transparent' : stroke,
        strokeWidth,
        strokeOpacity: parseFloat(node.getAttribute('stroke-opacity') || mergedStyles['opacity'] || '1'),
        strokeDasharray: node.getAttribute('stroke-dasharray') || '',
        strokeLinecap: (node.getAttribute('stroke-linecap') || mergedStyles['stroke-linecap'] || undefined) as any,
        strokeLinejoin: (node.getAttribute('stroke-linejoin') || mergedStyles['stroke-linejoin'] || undefined) as any,
        rotation: 0
      };

      if (tagName === 'path') elements.push({ ...baseEl, type: 'path', d: node.getAttribute('d') || '' });
      else if (tagName === 'rect') elements.push({ ...baseEl, type: 'rect', x: parseFloat(node.getAttribute('x') || '0'), y: parseFloat(node.getAttribute('y') || '0'), width: parseFloat(node.getAttribute('width') || '50'), height: parseFloat(node.getAttribute('height') || '50'), rx: parseFloat(node.getAttribute('rx') || '0') });
      else if (tagName === 'circle') elements.push({ ...baseEl, type: 'circle', cx: parseFloat(node.getAttribute('cx') || '0'), cy: parseFloat(node.getAttribute('cy') || '0'), r: parseFloat(node.getAttribute('r') || '25') });
      else if (tagName === 'line') elements.push({ ...baseEl, type: 'line', x1: parseFloat(node.getAttribute('x1') || '0'), y1: parseFloat(node.getAttribute('y1') || '0'), x2: parseFloat(node.getAttribute('x2') || '50'), y2: parseFloat(node.getAttribute('y2') || '50') });
      else if (tagName === 'polyline' || tagName === 'polygon') elements.push({ ...baseEl, type: 'polygon', points: node.getAttribute('points') || '' });
    });
  };

  traverseNodes(Array.from(svgEl.children));

  return { elements, settings: { width, height, viewBox, backgroundColor: 'transparent', showGrid: true } };
};

export default function SVGPaintStudio() {
  // Canvas Settings State
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({
    width: 600,
    height: 500,
    viewBox: '0 0 600 500',
    backgroundColor: '#ffffff',
    showGrid: true
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
  const [codeCopied, setCodeCopied] = useState<boolean>(false);
  const [activeViewTab, setActiveViewTab] = useState<'split' | 'canvas' | 'code'>('split');

  // Interactive Drawing & Dragging Internal State
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Record changes to history stack
  const updateElementsWithHistory = useCallback((newElements: SVGElementData[]) => {
    setElements(newElements);
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, newElements]);
    setHistoryIndex(newHistory.length);
  }, [history, historyIndex]);

  // Sync canvas state to SVG code output whenever elements change
  useEffect(() => {
    const code = elementsToSVG(elements, canvasSettings);
    setSvgCode(code);
  }, [elements, canvasSettings]);

  // Initialize with star template on initial load
  useEffect(() => {
    const parsed = parseSVGToElements(PRESET_TEMPLATES[0].svg);
    setElements(parsed.elements);
    setCanvasSettings(prev => ({ ...prev, width: parsed.settings.width, height: parsed.settings.height, viewBox: parsed.settings.viewBox }));
    setHistory([parsed.elements]);
    setHistoryIndex(0);
  }, []);

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
      if (parsed.elements.length > 0 || val.trim() === '') {
        setElements(parsed.elements);
        setCanvasSettings(prev => ({ ...prev, width: parsed.settings.width, height: parsed.settings.height, viewBox: parsed.settings.viewBox }));
      }
    } catch {
      // Ignore syntax errors while typing
    }
  };

  // Get SVG mouse coordinates relative to SVG viewBox
  const getCanvasCoords = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasSettings.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasSettings.height / rect.height);
    return { x: Math.round(x), y: Math.round(y) };
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
      const r = Math.round(Math.sqrt(Math.pow(coords.x - dragStart.x, 2) + Math.pow(coords.y - dragStart.y, 2)));
      setElements(prev => prev.map(el => el.id === selectedId ? { ...el, r } : el));
    } else if (activeTool === 'triangle') {
      const x1 = dragStart.x;
      const y1 = dragStart.y;
      const x2 = coords.x;
      const y2 = coords.y;
      const x3 = x1 - (x2 - x1);
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
      {}
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
                setCanvasSettings(prev => ({ ...prev, width: parsed.settings.width, height: parsed.settings.height, viewBox: parsed.settings.viewBox }));
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

      {}
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

          {}
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

                        const transform = el.rotation ? `rotate(${el.rotation} ${getElementCenter(el).x} ${getElementCenter(el).y})` : undefined;

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
                                fontSize={el.fontSize} fontFamily={el.fontFamily}
                                fontWeight={el.fontWeight} fontStyle={el.fontStyle}
                                textAnchor="middle" transform={transform}
                              >
                                {el.textContent}
                              </text>
                            )}

                            {/* Render Active Selection Bounding Box & Handles */}
                            {isSelected && (
                              <g className="pointer-events-none">
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

        {}
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
                  value={fillColor === 'transparent' ? '#000000' : fillColor}
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
                  value={strokeColor === 'transparent' ? '#000000' : strokeColor}
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

          {}
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
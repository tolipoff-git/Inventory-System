import { CONFIG } from '../config/constants';
import { T } from '../i18n';

function createSvgEl(tag: string, attrs: Record<string, any>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export interface RadarPoint {
  pillar: string;
  score: number;
  desc: string;
  onClick?: () => void;
}

export function renderRadarSvg(
  svgId: string,
  data: RadarPoint[],
  opts: { max?: number; rings?: number; fill?: string } = {}
): void {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';

  const max = opts.max || 5;
  const rings = opts.rings || 5;
  const cx = 150;
  const cy = 100;
  const r = 70;
  const n = data.length;
  if (!n) return;

  const step = (Math.PI * 2) / n;
  const pt = (i: number, rad: number) =>
    `${cx + rad * Math.cos(i * step - Math.PI / 2)},${cy + rad * Math.sin(i * step - Math.PI / 2)}`;

  // Draw background rings
  for (let ring = 1; ring <= rings; ring++) {
    const rad = (r * ring) / rings;
    const pts = Array.from({ length: n }, (_, i) => pt(i, rad)).join(' ');
    svg.appendChild(createSvgEl('polygon', {
      points: pts,
      fill: 'none',
      stroke: 'rgba(255, 255, 255, 0.08)',
      'stroke-width': '1',
    }));
  }

  // Draw spokes
  data.forEach((_, i) => {
    const spoke = createSvgEl('line', {
      x1: cx,
      y1: cy,
      x2: cx + r * Math.cos(i * step - Math.PI / 2),
      y2: cy + r * Math.sin(i * step - Math.PI / 2),
      stroke: 'rgba(255, 255, 255, 0.12)',
      'stroke-width': '1',
    });
    svg.appendChild(spoke);
  });

  // Draw score polygon
  const scorePts = data.map((d, i) => {
    const rad = (r * Math.min(d.score, max)) / max;
    return pt(i, rad);
  }).join(' ');

  svg.appendChild(createSvgEl('polygon', {
    points: scorePts,
    fill: opts.fill || 'rgba(0, 210, 255, 0.25)',
    stroke: '#00d2ff',
    'stroke-width': '2',
  }));

  // Draw labels and dots
  data.forEach((d, i) => {
    const rad = (r * Math.min(d.score, max)) / max;
    const dotX = cx + rad * Math.cos(i * step - Math.PI / 2);
    const dotY = cy + rad * Math.sin(i * step - Math.PI / 2);

    const dot = createSvgEl('circle', {
      cx: dotX,
      cy: dotY,
      r: 4,
      fill: '#00d2ff',
      stroke: '#05080e',
      'stroke-width': '1.5',
      style: 'cursor: pointer;',
    });
    if (d.onClick) {
      dot.onclick = d.onClick;
    }
    svg.appendChild(dot);

    // Label position
    const labelRad = r + 18;
    const lx = cx + labelRad * Math.cos(i * step - Math.PI / 2);
    const ly = cy + labelRad * Math.sin(i * step - Math.PI / 2) + 4;

    const label = createSvgEl('text', {
      x: lx,
      y: ly,
      fill: '#94a3b8',
      'font-size': '10px',
      'font-weight': '600',
      'text-anchor': Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end',
      style: 'cursor: pointer;',
    });
    label.textContent = `${d.pillar} (${d.score})`;
    if (d.onClick) {
      label.onclick = d.onClick;
    }
    svg.appendChild(label);
  });
}

export function renderDonutSvg(
  svgId: string,
  data: Record<string, number>,
  onFilterStatus?: (status: string) => void
): void {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';

  const cx = 85;
  const cy = 85;
  const r = 55;
  const strokeWidth = 20;
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return;

  let angle = -Math.PI / 2;
  let legendY = 20;

  for (const [key, val] of Object.entries(data)) {
    if (val === 0) continue;
    const slice = (val / total) * 2 * Math.PI;

    let shape: SVGElement | null = null;
    if (val === total) {
      shape = createSvgEl('circle', {
        cx,
        cy,
        r,
        fill: 'none',
        stroke: (CONFIG.STATUS_COLORS as any)[key] || '#999',
        'stroke-width': strokeWidth,
        style: 'cursor: pointer;',
      });
    } else if (slice > 0.001) {
      const sx = cx + r * Math.cos(angle);
      const sy = cy + r * Math.sin(angle);
      const ex = cx + r * Math.cos(angle + slice);
      const ey = cy + r * Math.sin(angle + slice);

      shape = createSvgEl('path', {
        d: `M ${sx} ${sy} A ${r} ${r} 0 ${slice > Math.PI ? 1 : 0} 1 ${ex} ${ey}`,
        fill: 'none',
        stroke: (CONFIG.STATUS_COLORS as any)[key] || '#999',
        'stroke-width': strokeWidth,
        style: 'cursor: pointer;',
      });
    }

    if (shape) {
      if (onFilterStatus) {
        shape.onclick = () => onFilterStatus(key);
      }
      svg.appendChild(shape);
    }

    // Legend on the right side
    const legendColor = (CONFIG.STATUS_COLORS as any)[key] || '#999';
    svg.appendChild(createSvgEl('rect', {
      x: 180,
      y: legendY,
      width: 10,
      height: 10,
      fill: legendColor,
      rx: 2,
    }));

    const label = createSvgEl('text', {
      x: 196,
      y: legendY + 9,
      fill: '#cbd5e1',
      'font-size': '11px',
      'font-weight': '500',
    });
    label.textContent = `${T(key)}: ${val}`;
    svg.appendChild(label);

    angle += slice;
    legendY += 20;
  }
}

export function renderBarSvg(
  svgId: string,
  data: Record<string, number>,
  onFilterWs?: (ws: string) => void
): void {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';

  const entries = Object.entries(data);
  if (!entries.length) return;

  const maxVal = Math.max(...entries.map(e => e[1]), 4);
  const barWidth = 260 / entries.length;

  entries.forEach(([key, val], idx) => {
    const height = (val / maxVal) * 90;
    const x = 20 + idx * barWidth;
    const y = 120 - height;
    const bw = Math.max(12, barWidth - 12);

    const rect = createSvgEl('rect', {
      x,
      y,
      width: bw,
      height,
      fill: '#00d2ff',
      rx: 3,
      style: 'cursor: pointer; opacity: 0.85; transition: opacity 0.2s;',
    });
    if (onFilterWs) {
      rect.onclick = () => onFilterWs(key);
    }
    svg.appendChild(rect);

    // X axis label
    const label = createSvgEl('text', {
      x: x + bw / 2,
      y: 138,
      fill: '#94a3b8',
      'font-size': '10px',
      'text-anchor': 'end',
      transform: `rotate(-35, ${x + bw / 2}, 138)`,
    });
    label.textContent = key;
    svg.appendChild(label);

    // Value text above bar
    const valText = createSvgEl('text', {
      x: x + bw / 2,
      y: height === 0 ? 116 : y - 4,
      fill: '#ffffff',
      'font-size': '10px',
      'text-anchor': 'middle',
      'font-weight': 'bold',
    });
    valText.textContent = String(val);
    svg.appendChild(valText);
  });
}

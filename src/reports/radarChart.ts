import { CONFIG } from '../config/constants';
import { T } from '../i18n';
import { esc } from '../utils/formatters';
import { showTooltip, hideTooltip } from '../utils/tooltip';

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
  rated?: boolean;
  color?: string;
  mark?: string;
  tooltipHtml?: string;
  onClick?: () => void;
}

export function renderRadarSvg(
  svgId: string,
  data: RadarPoint[],
  opts: { max?: number; rings?: number; fill?: string; stroke?: string } = {}
): void {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = '';

  const max = opts.max || 5;
  const rings = opts.rings || 5;
  const cx = 150;
  const cy = 100;
  const r = 75;
  const n = data.length;
  if (!n) return;

  const step = (Math.PI * 2) / n;
  const pt = (i: number, rad: number) =>
    `${cx + rad * Math.cos(i * step - Math.PI / 2)},${cy + rad * Math.sin(i * step - Math.PI / 2)}`;

  // Whole-ray interactivity: spoke, label and node all answer to hover/click.
  const bindPoint = (el: SVGElement, d: RadarPoint): void => {
    const scoreTxt = d.rated === false ? T('Not rated') : `${T('Score:')} ${d.score}/${max}`;
    const tip = d.tooltipHtml || `<strong>${esc(d.pillar)}</strong><br>${scoreTxt}<br>${d.desc}`;
    el.addEventListener('mousemove', (e) => showTooltip(e as MouseEvent, tip));
    el.addEventListener('mouseleave', () => hideTooltip());
    if (d.onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => d.onClick!());
    }
  };

  // Background rings (decorative — never swallow pointer events)
  for (let ring = 1; ring <= rings; ring++) {
    const rad = (r * ring) / rings;
    const pts = Array.from({ length: n }, (_, i) => pt(i, rad)).join(' ');
    const poly = createSvgEl('polygon', {
      points: pts,
      fill: 'none',
      stroke: 'var(--border)',
    });
    poly.setAttribute('pointer-events', 'none');
    svg.appendChild(poly);
  }

  // Spokes + labels (★ best / ▼ worst)
  data.forEach((d, i) => {
    const [x2, y2] = pt(i, r).split(',');

    // Invisible fat line so the whole ray is easy to hover on touch/mouse.
    const hit = createSvgEl('line', {
      x1: cx, y1: cy, x2, y2,
      stroke: 'transparent',
      'stroke-width': 14,
    });
    hit.setAttribute('pointer-events', 'stroke');
    bindPoint(hit, d);
    svg.appendChild(hit);

    svg.appendChild(createSvgEl('line', {
      x1: cx, y1: cy, x2, y2, stroke: 'var(--border)', 'pointer-events': 'none',
    }));

    const angle = i * step - Math.PI / 2;
    const cosA = Math.cos(angle);
    const labelR = r + 20;
    const [tx, ty] = pt(i, labelR).split(',');
    let anchor = 'middle';
    if (cosA > 0.3) anchor = 'start';
    else if (cosA < -0.3) anchor = 'end';

    // Truncate the NAME first, then append the best/worst mark — otherwise the
    // mark would be cut off by the truncation and never visible.
    const mark = d.mark ? ' ' + d.mark : '';
    const maxLen = n <= 3 ? 18 : 14;
    const nameMax = Math.max(4, maxLen - mark.length);
    let name = d.pillar;
    if (name.length > nameMax) name = name.slice(0, Math.max(1, nameMax - 1)) + '…';
    const label = name + mark;
    const fontSize = label.length > 12 ? '9.5px' : '11px';

    const text = createSvgEl('text', {
      x: tx,
      y: ty,
      fill: d.color || 'var(--text-main)',
      'font-size': fontSize,
      'font-weight': 'bold',
      'text-anchor': anchor,
      'alignment-baseline': 'middle',
    });
    text.textContent = label;
    bindPoint(text, d);
    svg.appendChild(text);
  });

  // Score polygon (decorative — keep it from blocking the rays)
  const scorePoly = createSvgEl('polygon', {
    points: data.map((d, i) => pt(i, (r / max) * Math.min(d.score, max))).join(' '),
    fill: opts.fill || 'rgba(0, 210, 255, 0.25)',
    stroke: opts.stroke || 'var(--primary)',
    'stroke-width': '2',
  });
  scorePoly.setAttribute('pointer-events', 'none');
  svg.appendChild(scorePoly);

  // Interactive nodes
  data.forEach((d, i) => {
    const [nx, ny] = pt(i, (r / max) * Math.min(d.score, max)).split(',');
    const node = createSvgEl('circle', {
      cx: nx,
      cy: ny,
      r: 5.5,
      fill: d.color || 'var(--primary)',
      class: 'svg-node',
    });
    bindPoint(node, d);
    svg.appendChild(node);
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
    const tip = `<strong>${T(key)}</strong><br>${T('Count:')} ${val}<br>${T('Percent:')} ${((val / total) * 100).toFixed(1)}%`;

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
      shape.onmousemove = (e) => showTooltip(e, tip);
      shape.onmouseleave = hideTooltip;
      if (onFilterStatus) {
        shape.onclick = () => onFilterStatus(key);
      }
      svg.appendChild(shape);
    }

    // Legend on the right side
    const legendColor = (CONFIG.STATUS_COLORS as any)[key] || '#999';
    const legendRect = createSvgEl('rect', {
      x: 180,
      y: legendY,
      width: 10,
      height: 10,
      fill: legendColor,
      rx: 2,
      style: onFilterStatus ? 'cursor: pointer;' : '',
    });
    if (onFilterStatus) {
      legendRect.onclick = () => onFilterStatus(key);
    }
    svg.appendChild(legendRect);

    const label = createSvgEl('text', {
      x: 196,
      y: legendY + 9,
      fill: 'var(--text-main)',
      'font-size': '11px',
      'font-weight': '500',
      style: onFilterStatus ? 'cursor: pointer;' : '',
    });
    label.textContent = `${T(key)}: ${val}`;
    if (onFilterStatus) {
      label.onclick = () => onFilterStatus(key);
    }
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

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;

  const maxVal = Math.max(...entries.map(e => e[1]), 4);
  const barWidth = 260 / entries.length;

  entries.forEach(([key, val], idx) => {
    const height = (val / maxVal) * 90;
    const x = 20 + idx * barWidth;
    const y = 120 - height;
    const bw = Math.max(12, barWidth - 12);

    const tip = `<strong>${esc(key)}</strong><br>${T('Tools:')} ${val}<br>${T('Capacity:')} ${Math.min(100, Math.round((val / 10) * 100))}%`;

    const rect = createSvgEl('rect', {
      x,
      y,
      width: bw,
      height,
      fill: 'var(--primary)',
      rx: 3,
      style: 'cursor: pointer; opacity: 0.85; transition: opacity 0.2s;',
    });
    rect.onmousemove = (e) => showTooltip(e, tip);
    rect.onmouseleave = hideTooltip;
    if (onFilterWs) {
      rect.onclick = () => onFilterWs(key);
    }
    svg.appendChild(rect);

    // X axis label
    const label = createSvgEl('text', {
      x: x + bw / 2,
      y: 138,
      fill: 'var(--text-main)',
      'font-size': '10px',
      'text-anchor': 'end',
      transform: `rotate(-35, ${x + bw / 2}, 138)`,
      style: onFilterWs ? 'cursor: pointer;' : '',
    });
    label.textContent = key;
    if (onFilterWs) {
      label.onclick = () => onFilterWs(key);
    }
    svg.appendChild(label);

    // Value text above bar
    const valText = createSvgEl('text', {
      x: x + bw / 2,
      y: height === 0 ? 116 : y - 4,
      fill: '#ffffff',
      'font-size': '10px',
      'text-anchor': 'middle',
      'font-weight': 'bold',
      style: onFilterWs ? 'cursor: pointer;' : '',
    });
    valText.textContent = String(val);
    if (onFilterWs) {
      valText.onclick = () => onFilterWs(key);
    }
    svg.appendChild(valText);
  });
}

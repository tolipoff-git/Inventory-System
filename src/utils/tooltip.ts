// ============================================================================
// Shared floating tooltip for SVG charts / cards (#svgTooltip).
// The element is created on demand and survives re-renders. Position is
// clamped to the viewport so it never runs off-screen (phones included).
// ============================================================================

function ensureTooltipEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('svgTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'svgTooltip';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

export function showTooltip(evt: MouseEvent, html: string): void {
  const tt = ensureTooltipEl();
  if (!tt) return;
  tt.innerHTML = html;
  tt.style.display = 'block';

  const w = tt.offsetWidth;
  const h = tt.offsetHeight;
  const maxX = window.pageXOffset + window.innerWidth;
  const maxY = window.pageYOffset + window.innerHeight;
  let x = evt.pageX + 15;
  let y = evt.pageY + 15;
  if (x + w > maxX - 8) x = evt.pageX - w - 10;  // flip left if it overflows
  if (y + h > maxY - 8) y = evt.pageY - h - 10;  // flip up if it overflows
  tt.style.left = Math.max(window.pageXOffset + 8, x) + 'px';
  tt.style.top = Math.max(window.pageYOffset + 8, y) + 'px';
}

export function hideTooltip(): void {
  const tt = typeof document !== 'undefined' ? document.getElementById('svgTooltip') : null;
  if (tt) tt.style.display = 'none';
}

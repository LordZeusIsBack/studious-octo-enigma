// Original top-down drawing of the table. Coordinates are in the SVG's viewBox; seats sit on a ring outside the rail.
// The three face-down decks in the middle stand for the three games on the ballot.
export const table = {
  w: 480,
  h: 330,
  rx: 200,
  ry: 128,
  svg: `<svg viewBox="0 0 480 330" aria-hidden="true" class="table-art"><defs>
    <radialGradient id="t-felt" cx="50%" cy="40%" r="62%"><stop offset="0" stop-color="#2f7049"/><stop offset=".65" stop-color="#1c4c31"/><stop offset="1" stop-color="#113321"/></radialGradient>
    <linearGradient id="t-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#83583a"/><stop offset=".45" stop-color="#5c3b23"/><stop offset="1" stop-color="#341f12"/></linearGradient>
    <radialGradient id="t-shade"><stop offset=".72" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <pattern id="t-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="5" fill="#ec7a4a" opacity=".35"/></pattern>
    <filter id="t-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <g id="t-holdem"><rect x="-17" y="-24" width="34" height="48" rx="3" fill="#6e2424" stroke="#efe6cf" stroke-opacity=".55"/><rect x="-13" y="-20" width="26" height="40" rx="2" fill="none" stroke="#efe6cf" stroke-opacity=".3"/></g>
    <g id="t-kittens"><rect x="-17" y="-24" width="34" height="48" rx="3" fill="#27211f" stroke="#ec7a4a" stroke-opacity=".8"/><rect x="-13" y="-20" width="26" height="40" rx="2" fill="url(#t-hatch)"/><circle r="6" fill="#27211f" stroke="#ec7a4a" stroke-width="1.2"/></g>
    <g id="t-uno"><rect x="-17" y="-24" width="34" height="48" rx="3" fill="#1d1c1b" stroke="#efe8d8" stroke-opacity=".4"/><rect x="-11" y="-3" width="5" height="6" fill="#d9493f"/><rect x="-5.5" y="-3" width="5" height="6" fill="#e9b83c"/><rect x="0" y="-3" width="5" height="6" fill="#3f9b61"/><rect x="5.5" y="-3" width="5" height="6" fill="#3d74c6"/></g>
    </defs>
    <ellipse cx="240" cy="173" rx="182" ry="114" fill="url(#t-shade)"/>
    <ellipse cx="240" cy="165" rx="158" ry="92" fill="url(#t-rail)"/>
    <ellipse cx="240" cy="165" rx="156" ry="90" fill="none" stroke="#f0d8a6" stroke-opacity=".22"/>
    <ellipse cx="240" cy="165" rx="140" ry="76" fill="url(#t-felt)" stroke="#0a1d12" stroke-width="2"/>
    <ellipse cx="240" cy="165" rx="140" ry="76" fill="#fff" opacity=".07" filter="url(#t-grain)"/>
    <ellipse cx="240" cy="165" rx="106" ry="52" fill="none" stroke="#efe6cf" stroke-opacity=".16"/>
    ${['holdem', 'kittens', 'uno']
      .map((id, i) => {
        const x = 192 + i * 48
        const r = [-7, 2, 9][i]
        return `<g transform="translate(${x} 165) rotate(${r})"><use href="#t-${id}" x="3" y="3" opacity=".55"/><use href="#t-${id}" x="1.5" y="1.5" opacity=".8"/><use href="#t-${id}"/></g>`
      })
      .join('')}
  </svg>`,
}

// n points spaced evenly by arc length (not by angle) around an ellipse, starting at the top, clockwise.
// Each point carries the outward-facing angle so chairs can turn their backs to the table.
export function ring(n: number, rx: number, ry: number): { x: number; y: number; deg: number }[] {
  const steps = 720
  const pts: [number, number][] = []
  const len = [0]
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI * 2
    pts.push([rx * Math.cos(a), ry * Math.sin(a)])
    if (i) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  return Array.from({ length: n }, (_, k) => {
    const target = ((k + 0.5) / n) * len[steps]
    const [x, y] = pts[len.findIndex((l) => l >= target)]
    return { x, y, deg: (Math.atan2(y / (ry * ry), x / (rx * rx)) * 180) / Math.PI + 90 }
  })
}

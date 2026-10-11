// Wire geometry for the Houdini gestures: dropping a node onto a wire to insert it, and the Y knife that cuts wires.
// A wire's shape is read from its drawn path (in map coordinates), sampled into short straight pieces.
type Pt = { x: number; y: number }

/** Points along a drawn wire, in map coordinates; empty when the wire is not on the page. */
export function wirePoints(edgeId: string, steps = 32): Pt[] {
  const path = document.querySelector<SVGPathElement>(`.react-flow__edge[data-id="${CSS.escape(edgeId)}"] path.react-flow__edge-path`)
  if (!path) return []
  const len = path.getTotalLength()
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) { const p = path.getPointAtLength((len * i) / steps); pts.push({ x: p.x, y: p.y }) }
  return pts
}

function cross(a: Pt, b: Pt, c: Pt) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) }

/** Do segments a-b and c-d cross? */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Does a polyline cross another polyline anywhere? */
export function polylinesCross(p: Pt[], q: Pt[]) {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) if (segmentsCross(p[i - 1], p[i], q[j - 1], q[j])) return true
  return false
}

/** Does the wire pass under a box (x, y, w, h), shrunk by `inset` so a wire grazing its edge does not count? */
export function wireUnderBox(pts: Pt[], r: { x: number; y: number; w: number; h: number }, inset = 6) {
  return pts.some((p) => p.x > r.x + inset && p.x < r.x + r.w - inset && p.y > r.y + inset && p.y < r.y + r.h - inset)
}

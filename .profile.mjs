import { load } from './.probe-common.mjs';
const { t, server, course, hw, support } = await load('hwy-193-georgetown-710-1042');
const pts = course.points,
  rows = [];
for (let i = 2; i < pts.length - 3; i++) {
  const [ax, az] = pts[i],
    [bx, bz] = pts[i + 1],
    l = Math.hypot(bx - ax, bz - az),
    dx = (bx - ax) / l,
    dz = (bz - az) / l;
  for (const s of [-1, 1]) {
    const h = (d) => t.heightAt(ax - s * dz * d, az + s * dx * d);
    const base = h(hw),
      rise = h(hw + support + 3) - base;
    let slope = 0;
    for (let d = hw; d < hw + support + 3; d += 0.25)
      slope = Math.max(slope, Math.abs(h(d + 0.25) - h(d)) / 0.25);
    rows.push({
      i,
      s,
      rise: +rise.toFixed(1),
      slope: +((Math.atan(slope) * 180) / Math.PI).toFixed(0),
    });
  }
}
rows.sort((a, b) => Math.abs(b.rise) - Math.abs(a.rise));
console.log(rows.slice(0, 8));
const r = rows.map((x) => Math.abs(x.rise)).sort((a, b) => a - b);
console.log(
  'rise p50',
  r[r.length >> 1],
  'p90',
  r[Math.floor(r.length * 0.9)],
  'steeper than 45°:',
  rows.filter((x) => x.slope > 45).length,
  '/',
  rows.length,
);
const w = rows[0];
const [ax, az] = pts[w.i],
  [bx, bz] = pts[w.i + 1],
  l = Math.hypot(bx - ax, bz - az),
  dx = (bx - ax) / l,
  dz = (bz - az) / l;
console.log(
  'profile',
  Array.from({ length: 24 }, (_, k) => k * 0.75)
    .map(
      (o) =>
        `${(hw + o).toFixed(1)}:${(t.heightAt(ax - w.s * dz * (hw + o), az + w.s * dx * (hw + o)) - t.heightAt(ax - w.s * dz * hw, az + w.s * dx * hw)).toFixed(1)}`,
    )
    .join(' '),
);
await server.close();

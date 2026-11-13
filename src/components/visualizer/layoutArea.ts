export interface AreaRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell {
  id: string;
  area: number;
}

/** Squarified layout. Call it when the graph payload or the pane size changes. */
export function squarify(items: { id: string; size: number }[], width: number, height: number): AreaRect[] {
  const usable = items.filter((item) => item.size > 0);
  const total = usable.reduce((sum, item) => sum + item.size, 0);
  if (total <= 0 || width <= 0 || height <= 0) return [];
  const cells = usable
    .map((item) => ({ id: item.id, area: (item.size / total) * width * height }))
    .sort((a, b) => b.area - a.area);
  const rects: AreaRect[] = [];
  place(cells, { x: 0, y: 0, w: width, h: height }, rects);
  return rects;
}

function worst(areas: number[], side: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  if (sum <= 0 || side <= 0 || min <= 0) return Number.POSITIVE_INFINITY;
  const side2 = side * side;
  return Math.max((side2 * max) / (sum * sum), (sum * sum) / (side2 * min));
}

function place(cells: Cell[], box: { x: number; y: number; w: number; h: number }, out: AreaRect[]): void {
  if (cells.length === 0 || box.w <= 0 || box.h <= 0) return;
  if (cells.length === 1) {
    out.push({ id: cells[0].id, x: box.x, y: box.y, w: box.w, h: box.h });
    return;
  }
  const side = Math.min(box.w, box.h);
  const row: Cell[] = [];
  let cursor = 0;
  let score = Number.POSITIVE_INFINITY;
  while (cursor < cells.length) {
    const trial = row.concat(cells[cursor]);
    const next = worst(
      trial.map((cell) => cell.area),
      side,
    );
    if (row.length > 0 && next > score) break;
    row.push(cells[cursor]);
    cursor += 1;
    score = next;
  }
  const rowArea = row.reduce((sum, cell) => sum + cell.area, 0);
  const rest = cells.slice(cursor);
  if (box.w <= box.h) {
    const thickness = rowArea / box.w;
    let x = box.x;
    for (const cell of row) {
      const w = thickness > 0 ? cell.area / thickness : 0;
      out.push({ id: cell.id, x, y: box.y, w, h: thickness });
      x += w;
    }
    place(rest, { x: box.x, y: box.y + thickness, w: box.w, h: box.h - thickness }, out);
    return;
  }
  const thickness = rowArea / box.h;
  let y = box.y;
  for (const cell of row) {
    const h = thickness > 0 ? cell.area / thickness : 0;
    out.push({ id: cell.id, x: box.x, y, w: thickness, h });
    y += h;
  }
  place(rest, { x: box.x + thickness, y: box.y, w: box.w - thickness, h: box.h }, out);
}

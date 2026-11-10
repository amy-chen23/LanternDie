export type Box = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function imagePoint(point: Point, displayWidth: number, displayHeight: number, width: number, height: number): Point {
  if (![point.x, point.y, displayWidth, displayHeight, width, height].every(Number.isFinite)
    || Math.min(displayWidth, displayHeight, width, height) <= 0) throw new Error('Photo dimensions unavailable.');
  return { x: clamp(point.x / displayWidth * width, 0, width), y: clamp(point.y / displayHeight * height, 0, height) };
}
export function validBox(box: Box | null, width: number, height: number): box is Box {
  return Boolean(box && [box.x, box.y, box.width, box.height, width, height].every(Number.isFinite)
    && width > 0 && height > 0 && box.x >= 0 && box.y >= 0 && box.width >= 1 && box.height >= 1
    && box.x + box.width <= width && box.y + box.height <= height);
}
export function dragBox(mode: 'draw' | 'move' | 'resize', start: Point, end: Point, initial: Box | null, width: number, height: number): Box {
  if (![start.x, start.y, end.x, end.y, width, height].every(Number.isFinite) || width < 1 || height < 1) throw new Error('Invalid geometry.');
  const a = { x: clamp(Math.round(start.x), 0, width), y: clamp(Math.round(start.y), 0, height) };
  const b = { x: clamp(Math.round(end.x), 0, width), y: clamp(Math.round(end.y), 0, height) };
  if (mode === 'draw') {
    const x = Math.min(a.x, b.x, width - 1), y = Math.min(a.y, b.y, height - 1);
    return { x, y, width: clamp(Math.abs(b.x - a.x), 1, width - x), height: clamp(Math.abs(b.y - a.y), 1, height - y) };
  }
  if (!validBox(initial, width, height)) throw new Error('Select a valid box first.');
  const dx = Math.round(end.x - start.x), dy = Math.round(end.y - start.y);
  if (mode === 'move') return { ...initial, x: clamp(initial.x + dx, 0, width - initial.width), y: clamp(initial.y + dy, 0, height - initial.height) };
  return { ...initial, width: clamp(initial.width + dx, 1, width - initial.x), height: clamp(initial.height + dy, 1, height - initial.y) };
}

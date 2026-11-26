export type Side = 'red' | 'blue';
export type Orientation = '/' | '\\';
export type Direction = 0 | 1 | 2 | 3;
export interface Move { x: number; y: number; orientation: Orientation; side: Side }
export interface RayStep { x: number; y: number; direction: Direction; action?: 'reflect' | 'transmit' }
export interface Outcome { winner: Side | 'draw'; path: RayStep[]; reason: 'connection' | 'full' | 'no-moves' | 'agreement' | 'resign' }
export interface GameState { moves: Move[]; turn: Side; outcome: Outcome | null }
export const SIZE = 13;
export const SOURCES = { red: { x: 5, y: 9 }, blue: { x: 9, y: 5 } };
export const OPEN: Record<Side, Direction[]> = { red: [0, 3], blue: [1, 2] };
export const DELTA = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
const FORBIDDEN = new Set(['5,9', '9,5', '4,9', '5,10', '10,5', '9,4']);
export const other = (side: Side): Side => side === 'red' ? 'blue' : 'red';
export const key = (x: number, y: number) => `${x},${y}`;
export const emptyGame = (): GameState => ({ moves: [], turn: 'red', outcome: null });
export const isForbidden = (x: number, y: number) => FORBIDDEN.has(key(x, y));
export function reflect(direction: Direction, orientation: Orientation): Direction {
  return (orientation === '/' ? [1, 0, 3, 2] : [3, 2, 1, 0])[direction] as Direction;
}
export function legalCell(moves: Move[], x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 1 && x <= SIZE && y >= 1 && y <= SIZE
    && !isForbidden(x, y) && !moves.some(move => move.x === x && move.y === y);
}
export function connectsOwnMirrors(moves: Move[], move: Move): boolean {
  return moves.some(existing => {
    if (existing.side !== move.side || existing.orientation !== move.orientation) return false;
    const dx = move.x - existing.x;
    const dy = move.y - existing.y;
    return Math.abs(dx) === 1 && dy === (move.orientation === '/' ? dx : -dx);
  });
}
export function legalMove(moves: Move[], move: Move): boolean {
  return (move.side === 'red' || move.side === 'blue')
    && (move.orientation === '/' || move.orientation === '\\')
    && legalCell(moves, move.x, move.y) && !connectsOwnMirrors(moves, move);
}
export function hasLegalMove(moves: Move[], side: Side): boolean {
  for (let y = 1; y <= SIZE; y++) for (let x = 1; x <= SIZE; x++) {
    if (legalMove(moves, { x, y, side, orientation: '/' })
      || legalMove(moves, { x, y, side, orientation: '\\' })) return true;
  }
  return false;
}
export function winningPath(moves: Move[], side: Side): RayStep[] | null {
  const board = new Map(moves.map(move => [key(move.x, move.y), move]));
  const source = SOURCES[side];
  const target = SOURCES[other(side)];
  const queue: { step: RayStep; parent: number }[] = OPEN[side].map(direction => ({ step: { ...source, direction }, parent: -1 }));
  const visited = new Set<number>();
  for (let index = 0; index < queue.length; index++) {
    const { step } = queue[index];
    const [dx, dy] = DELTA[step.direction];
    const x = step.x + dx;
    const y = step.y + dy;
    if (x < 1 || x > SIZE || y < 1 || y > SIZE) continue;
    if (x === source.x && y === source.y) continue;
    if (x === target.x && y === target.y) {
      const entry = ((step.direction + 2) % 4) as Direction;
      if (!OPEN[other(side)].includes(entry)) continue;
      const path: RayStep[] = [{ x, y, direction: step.direction }];
      for (let cursor = index; cursor >= 0; cursor = queue[cursor].parent) path.push(queue[cursor].step);
      return path.reverse();
    }
    const stateKey = ((y - 1) * SIZE + x - 1) * 4 + step.direction;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);
    const mirror = board.get(key(x, y));
    if (mirror) {
      queue.push({ step: { x, y, direction: reflect(step.direction, mirror.orientation), action: 'reflect' }, parent: index });
      if (mirror.side === side) queue.push({ step: { x, y, direction: step.direction, action: 'transmit' }, parent: index });
    } else {
      queue.push({ step: { x, y, direction: step.direction }, parent: index });
    }
  }
  return null;
}
export function placeMove(state: GameState, move: Move): GameState {
  if (state.outcome) throw new Error('本局已经结束');
  if (move.side !== state.turn) throw new Error('请等待你的回合');
  if (move.orientation !== '/' && move.orientation !== '\\') throw new Error('请选择镜面朝向');
  if (!legalCell(state.moves, move.x, move.y)) throw new Error('这个位置不能放置镜子');
  if (connectsOwnMirrors(state.moves, move)) throw new Error('同阵营镜子不能首尾相接成直线，请换个朝向或位置');
  const moves = [...state.moves, move];
  return resolvePosition(moves, move.side);
}
function resolvePosition(moves: Move[], lastSide: Side): GameState {
  let outcome: Outcome | null = null;
  for (const side of [other(lastSide), lastSide]) {
    const path = winningPath(moves, side);
    if (path) { outcome = { winner: side, path, reason: 'connection' }; break; }
  }
  if (!outcome && moves.length === 163) outcome = { winner: 'draw', path: [], reason: 'full' };
  const turn = other(lastSide);
  if (!outcome && !hasLegalMove(moves, turn)) outcome = { winner: 'draw', path: [], reason: 'no-moves' };
  return { moves, turn, outcome };
}
export function restoreGame(saved: GameState): GameState {
  // Existing saves can contain connected mirrors placed under the earlier rules.
  // Validate their original placement constraints and apply the new rule to future moves.
  if (!saved || !Array.isArray(saved.moves)) throw new Error('对局存档无效');
  const moves: Move[] = [];
  for (const move of saved.moves) {
    if (!move || move.side !== (moves.length % 2 === 0 ? 'red' : 'blue')
      || (move.orientation !== '/' && move.orientation !== '\\')
      || !legalCell(moves, move.x, move.y)) throw new Error('对局存档无效');
    moves.push({ ...move });
  }
  const restored = moves.length ? resolvePosition(moves, moves.at(-1)!.side) : emptyGame();
  if (saved.outcome?.reason === 'resign') restored.outcome = saved.outcome;
  return restored;
}

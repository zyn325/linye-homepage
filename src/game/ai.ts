import { DELTA, OPEN, SIZE, SOURCES, connectsOwnMirrors, isForbidden, key, legalCell, legalMove, other, reflect, winningPath, type Direction, type GameState, type Move, type Side } from './rules';

// A 0–1 shortest-path search estimates how many additional mirrors a route needs.
// Existing own mirrors offer both transitions. A hypothetical turn at an empty cell costs one.
function routeCost(moves: Move[], side: Side): number {
  const board = new Map(moves.map(move => [key(move.x, move.y), move]));
  const source = SOURCES[side];
  const target = SOURCES[other(side)];
  const distance = new Int16Array(SIZE * SIZE * 4).fill(300);
  const queues: number[][] = Array.from({ length: 15 }, () => []);
  const encode = (x: number, y: number, d: number) => ((y - 1) * SIZE + x - 1) * 4 + d;
  for (const d of OPEN[side]) {
    const id = encode(source.x, source.y, d);
    distance[id] = 0;
    queues[0].push(id);
  }
  for (let cost = 0; cost < queues.length; cost++) {
    for (let cursor = 0; cursor < queues[cost].length; cursor++) {
      const id = queues[cost][cursor];
      if (distance[id] !== cost) continue;
      const d = (id % 4) as Direction;
      const cell = Math.floor(id / 4);
      const [dx, dy] = DELTA[d];
      const x = cell % SIZE + 1 + dx;
      const y = Math.floor(cell / SIZE) + 1 + dy;
      if (x < 1 || x > SIZE || y < 1 || y > SIZE || (x === source.x && y === source.y)) continue;
      if (x === target.x && y === target.y) {
        if (OPEN[other(side)].includes(((d + 2) % 4) as Direction)) return cost;
        continue;
      }
      const push = (direction: Direction, extra: number) => {
        const next = encode(x, y, direction);
        const nextCost = cost + extra;
        if (nextCost >= queues.length || distance[next] <= nextCost) return;
        distance[next] = nextCost;
        queues[nextCost].push(next);
      };
      const mirror = board.get(key(x, y));
      if (mirror) {
        push(reflect(d, mirror.orientation), 0);
        if (mirror.side === side) push(d, 0);
      } else {
        push(d, 0);
        if (!isForbidden(x, y)) {
          if (!connectsOwnMirrors(moves, { x, y, side, orientation: '/' })) push(reflect(d, '/'), 1);
          if (!connectsOwnMirrors(moves, { x, y, side, orientation: '\\' })) push(reflect(d, '\\'), 1);
        }
      }
    }
  }
  return 15;
}
function candidates(state: GameState): Move[] {
  const moves: Move[] = [];
  for (let y = 1; y <= SIZE; y++) for (let x = 1; x <= SIZE; x++) {
    if (legalCell(state.moves, x, y)) {
      for (const orientation of ['/', '\\'] as const) {
        const move = { x, y, side: state.turn, orientation };
        if (legalMove(state.moves, move)) moves.push(move);
      }
    }
  }
  return moves;
}
export function chooseMove(state: GameState, difficulty: 'easy' | 'standard'): Move | null {
  if (state.outcome) return null;
  const side = state.turn;
  const enemy = other(side);
  const options = candidates(state);
  const ranked: { move: Move; score: number }[] = [];
  for (const move of options) {
    const board = [...state.moves, move];
    if (winningPath(board, enemy)) continue;
    if (winningPath(board, side)) return move;
    const mine = routeCost(board, side);
    const theirs = routeCost(board, enemy);
    const score = theirs * 120 - mine * 155 + Math.random() * (difficulty === 'easy' ? 130 : 9);
    ranked.push({ move, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (!ranked.length) return options[0] ?? null;
  if (difficulty === 'easy') return ranked[0].move;
  // Check every opponent reply for an immediate loss, then compare their best
  // route-building replies. Each candidate uses the same legality and win rules.
  const deadline = performance.now() + 1600;
  let best = ranked[0];
  let bestValue = -Infinity;
  for (const candidate of ranked.slice(0, 6)) {
    const board = [...state.moves, candidate.move];
    let worst = Infinity;
    const replies = candidates({ moves: board, turn: enemy, outcome: null });
    for (const reply of replies) {
      const next = [...board, reply];
      if (winningPath(next, side)) continue;
      if (winningPath(next, enemy)) { worst = -100000; break; }
      const value = routeCost(next, enemy) * 120 - routeCost(next, side) * 155;
      worst = Math.min(worst, value);
    }
    const value = worst + candidate.score * 0.1;
    if (value > bestValue) { best = candidate; bestValue = value; }
    if (performance.now() >= deadline) break;
  }
  return best.move;
}

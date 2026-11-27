import { DELTA, OPEN, SIZE, SOURCES, connectsOwnMirrors, isForbidden, key, legalCell, legalMove, other, reflect, winningPath, type Direction, type GameState, type Move, type Side } from './rules';

// A 0–1 shortest-path search estimates how many additional mirrors a route needs.
// Existing own mirrors offer both transitions. A hypothetical turn at an empty cell costs one.
export function routeCost(moves: Move[], side: Side): number {
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
export function candidates(state: GameState): Move[] {
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
export type Difficulty = 'easy' | 'standard' | 'hard';
export const difficultyNames: Record<Difficulty, string> = { easy: '入门', standard: '标准', hard: '挑战' };
export const parseDifficulty = (value: unknown): Difficulty => value === 'easy' || value === 'hard' ? value : 'standard';

// Start at the target's open sides and trace backwards. On an empty square the
// attacker could eventually turn; enemy-owned mirrors force reflection. This is
// an optimistic accessibility test, not a claim that a future route is playable.
// Use the local room to manoeuvre as an early signal; routeCost detects a full
// enclosure, including pockets that contain empty but unreachable-from-source cells.
export function sourceAccess(moves: Move[], attacker: Side): number {
  const target = SOURCES[other(attacker)];
  const board = new Map(moves.map(move => [key(move.x, move.y), move]));
  const queue = OPEN[other(attacker)].map(direction => ({ ...target, direction }));
  const visited = new Set<number>();
  const cells = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const step = queue[i], [dx, dy] = DELTA[step.direction];
    const x = step.x + dx, y = step.y + dy;
    if (x < 1 || x > SIZE || y < 1 || y > SIZE || (x === target.x && y === target.y)) continue;
    const id = ((y - 1) * SIZE + x - 1) * 4 + step.direction;
    if (visited.has(id)) continue;
    visited.add(id);
    if (x === SOURCES[attacker].x && y === SOURCES[attacker].y) continue;
    const mirror = board.get(key(x, y));
    const push = (direction: Direction) => queue.push({ x, y, direction });
    if (mirror) {
      push(reflect(step.direction, mirror.orientation));
      if (mirror.side === attacker) push(step.direction);
    } else {
      push(step.direction);
      if (!isForbidden(x, y)) {
        if (Math.abs(x - target.x) <= 3 && Math.abs(y - target.y) <= 3) cells.add(key(x, y));
        for (const orientation of ['/', '\\'] as const) {
          if (!connectsOwnMirrors(moves, { x, y, side: attacker, orientation })) push(reflect(step.direction, orientation));
        }
      }
    }
  }
  return cells.size;
}

function evaluate(moves: Move[], side: Side): number {
  const mine = routeCost(moves, side), theirs = routeCost(moves, other(side));
  // Keep a route into the opponent's source open, and value one's own shelter.
  // The smooth local term notices construction before the final sealing mirror.
  const access = sourceAccess(moves, side), enemyAccess = sourceAccess(moves, other(side));
  if (mine === 15 && theirs === 15) return -200;
  return theirs * 120 - mine * 155 + (access - enemyAccess) * 14
    + (theirs === 15 ? 3500 : 0) - (mine === 15 ? 5500 : 0)
    + (enemyAccess === 0 ? 2500 : 0) - (access === 0 ? 5000 : 0);
}

export function chooseMove(state: GameState, difficulty: Difficulty): Move | null {
  if (state.outcome) return null;
  const side = state.turn;
  const enemy = other(side);
  const options = candidates(state);
  const enclosureThreats = difficulty === 'easy' ? [] : candidates({ ...state, turn: enemy }).filter(move => {
    const next = [...state.moves, move];
    return routeCost(next, side) === 15 && !winningPath(next, side);
  });
  let ranked: { move: Move; score: number; permitsEnclosure: boolean }[] = [];
  for (const move of options) {
    const board = [...state.moves, move];
    if (winningPath(board, enemy)) continue;
    if (winningPath(board, side)) return move;
    const permitsEnclosure = enclosureThreats.some(threat => legalMove(board, threat)
      && routeCost([...board, threat], side) === 15 && !winningPath([...board, threat], side));
    const score = evaluate(board, side) - (permitsEnclosure ? 12000 : 0);
    ranked.push({ move, score, permitsEnclosure });
  }
  // A completed enclosure cannot be dismantled. If a safe response exists,
  // preserve it before spending the search budget on offensive variations.
  if (ranked.some(candidate => !candidate.permitsEnclosure)) ranked = ranked.filter(candidate => !candidate.permitsEnclosure);
  ranked.sort((a, b) => b.score - a.score);
  if (!ranked.length) return options[0] ?? null;
  if (difficulty === 'easy') {
    const pool = ranked.filter(option => option.score >= ranked[0].score - 180).slice(0, 8);
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  // Check every opponent reply for an immediate loss, then compare their best
  // route-building replies. Each candidate uses the same legality and win rules.
  const deadline = performance.now() + (difficulty === 'hard' ? 3500 : 1500);
  let best = ranked[0];
  let bestValue = -Infinity;
  for (const candidate of ranked.slice(0, difficulty === 'hard' ? 12 : 6)) {
    const board = [...state.moves, candidate.move];
    let worst = Infinity;
    const replies = candidates({ moves: board, turn: enemy, outcome: null });
    const danger: { moves: Move[]; value: number }[] = [];
    for (const reply of replies) {
      const next = [...board, reply];
      if (winningPath(next, side)) continue;
      if (winningPath(next, enemy)) { worst = -100000; break; }
      const value = evaluate(next, side);
      worst = Math.min(worst, value);
      if (difficulty === 'hard') danger.push({ moves: next, value });
    }
    if (difficulty === 'hard' && worst > -100000 && performance.now() < deadline) {
      danger.sort((a, b) => a.value - b.value);
      const recoveries: number[] = [];
      for (const reply of danger.slice(0, 3)) {
        let recovery = -100000;
        for (const move of candidates({ moves: reply.moves, turn: side, outcome: null })) {
          const next = [...reply.moves, move];
          if (winningPath(next, enemy)) continue;
          if (winningPath(next, side)) { recovery = 100000; break; }
          recovery = Math.max(recovery, evaluate(next, side));
        }
        recoveries.push(recovery);
        if (performance.now() >= deadline) break;
      }
      if (recoveries.length) worst = worst * 0.65 + Math.min(...recoveries) * 0.35;
    }
    const value = worst + candidate.score * 0.1;
    if (value > bestValue) { best = candidate; bestValue = value; }
    if (performance.now() >= deadline) break;
  }
  return best.move;
}

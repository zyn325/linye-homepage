import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGame, legalCell, placeMove, reflect, winningPath, type Direction, type Move } from '../src/game/rules';
import { chooseMove } from '../src/game/ai';

const example: Move[] = [
  { x: 5, y: 11, orientation: '\\', side: 'red' },
  { x: 6, y: 11, orientation: '\\', side: 'blue' },
  { x: 5, y: 13, orientation: '/', side: 'red' },
  { x: 6, y: 3, orientation: '\\', side: 'blue' },
  { x: 12, y: 13, orientation: '\\', side: 'red' },
  { x: 9, y: 3, orientation: '/', side: 'blue' },
  { x: 12, y: 5, orientation: '/', side: 'red' }
];
test('all reflection directions match the document', () => {
  for (const d of [0, 1, 2, 3] as Direction[]) {
    assert.equal(reflect(d, '/'), [1, 0, 3, 2][d]);
    assert.equal(reflect(d, '\\'), [3, 2, 1, 0][d]);
  }
});
test('six reserved cells and existing mirrors reject placement', () => {
  for (const [x, y] of [[5, 9], [9, 5], [4, 9], [5, 10], [10, 5], [9, 4], [0, 1], [14, 1], [1.5, 1]]) assert.equal(legalCell([], x, y), false);
  const next = placeMove(emptyGame(), { x: 1, y: 1, orientation: '/', side: 'red' });
  assert.throws(() => placeMove(next, { x: 1, y: 1, orientation: '\\', side: 'blue' }));
  assert.throws(() => placeMove(emptyGame(), { x: 1, y: 1, orientation: '/', side: 'blue' }));
});
test('document example wins for red with transmission and blocks blue', () => {
  const path = winningPath(example, 'red');
  assert.ok(path);
  assert.ok(path.some(step => step.x === 5 && step.y === 11 && step.action === 'transmit'));
  assert.equal(winningPath(example, 'blue'), null);
  let state = emptyGame();
  for (const move of example) state = placeMove(state, move);
  assert.equal(state.outcome?.winner, 'red');
});
test('a purely reflective connection gives the opponent priority', () => {
  const mirrors: Move[] = [
    { x: 5, y: 13, orientation: '/', side: 'red' },
    { x: 12, y: 13, orientation: '\\', side: 'blue' }
  ];
  const move: Move = { x: 12, y: 5, orientation: '/', side: 'red' };
  assert.ok(winningPath([...mirrors, move], 'red'));
  assert.ok(winningPath([...mirrors, move], 'blue'));
  assert.equal(placeMove({ moves: mirrors, turn: 'red', outcome: null }, move).outcome?.winner, 'blue');
});
test('target wall absorbs a ray approaching from above', () => {
  const mirrors: Move[] = [
    { x: 5, y: 11, orientation: '/', side: 'red' },
    { x: 9, y: 11, orientation: '\\', side: 'red' }
  ];
  assert.equal(winningPath(mirrors, 'red'), null);
});
test('a loop terminates and search still explores own-mirror branches', () => {
  const mirrors: Move[] = [
    { x: 5, y: 11, orientation: '/', side: 'red' },
    { x: 7, y: 11, orientation: '\\', side: 'blue' },
    { x: 7, y: 12, orientation: '/', side: 'blue' },
    { x: 5, y: 12, orientation: '\\', side: 'blue' }
  ];
  assert.equal(winningPath(mirrors, 'red'), null);
});
test('computer takes a winning move and avoids giving the opponent a connection', () => {
  const before = { moves: example.slice(0, -1), turn: 'red' as const, outcome: null };
  const move = chooseMove(before, 'easy');
  assert.ok(move);
  assert.equal(placeMove(before, move).outcome?.winner, 'red');
  const opening = chooseMove(emptyGame(), 'standard');
  assert.ok(opening);
  assert.equal(legalCell([], opening.x, opening.y), true);
  assert.notEqual(placeMove(emptyGame(), opening).outcome?.winner, 'blue');
});

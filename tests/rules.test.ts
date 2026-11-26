import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyGame, hasLegalMove, isForbidden, legalCell, legalMove, placeMove, reflect, restoreGame, winningPath, type Direction, type Move } from '../src/game/rules';
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
test('same-side mirrors cannot connect at either endpoint along their surface', () => {
  for (const side of ['red', 'blue'] as const) {
    for (const orientation of ['/', '\\'] as const) {
      const first: Move = { x: 7, y: 7, side, orientation };
      for (const dx of [-1, 1]) {
        const move = { x: 7 + dx, y: 7 + (orientation === '/' ? dx : -dx), side, orientation };
        assert.equal(legalMove([first], move), false);
        assert.throws(() => placeMove({ moves: [first], turn: side, outcome: null }, move), /首尾相接/);
        assert.equal(legalMove([first], { ...move, side: side === 'red' ? 'blue' : 'red' }), true);
        assert.equal(legalMove([first], { ...move, orientation: orientation === '/' ? '\\' : '/' }), true);
      }
      assert.equal(legalMove([first], { ...first, x: 10, y: orientation === '/' ? 10 : 4 }), true);
      assert.equal(legalMove([first], { ...first, x: 8 }), true);
      assert.equal(legalMove([first], { ...first, y: 8 }), true);
    }
  }
  assert.equal(legalMove([{ x: 1, y: 1, side: 'red', orientation: '/' }], { x: 2, y: 2, side: 'red', orientation: '/' }), false);
  assert.equal(legalMove([{ x: 1, y: 2, side: 'red', orientation: '\\' }], { x: 2, y: 1, side: 'red', orientation: '\\' }), false);
});
test('no legal orientation ends the game in a draw after checking connections', () => {
  const moves: Move[] = [];
  for (let y = 1; y <= 13; y++) for (let x = 1; x <= 13; x++) {
    if (isForbidden(x, y) || (x === 7 && y === 7) || (x === 1 && y === 1)) continue;
    moves.push({ x, y, side: 'blue', orientation: x === 8 && y === 6 ? '\\' : '/' });
  }
  assert.equal(legalCell(moves, 7, 7), true);
  assert.equal(hasLegalMove([...moves, { x: 1, y: 1, side: 'red', orientation: '/' }], 'blue'), false);
  const state = placeMove({ moves, turn: 'red', outcome: null }, { x: 1, y: 1, side: 'red', orientation: '/' });
  assert.equal(state.outcome?.reason, 'no-moves');
  assert.equal(state.outcome?.winner, 'draw');
  assert.equal(state.moves.length, 162);
});
test('old saves retain previously placed connected mirrors', () => {
  const saved = { moves: [
    { x: 1, y: 1, side: 'red', orientation: '/' },
    { x: 13, y: 1, side: 'blue', orientation: '/' },
    { x: 2, y: 2, side: 'red', orientation: '/' }
  ] as Move[], turn: 'blue' as const, outcome: null };
  assert.deepEqual(restoreGame(saved).moves, saved.moves);
  assert.equal(legalMove(saved.moves, { x: 3, y: 3, side: 'red', orientation: '/' }), false);
});
test('both computer difficulties choose a legal move under the new rule', () => {
  const state = { moves: [
    { x: 1, y: 1, side: 'red', orientation: '/' },
    { x: 13, y: 1, side: 'blue', orientation: '\\' },
    { x: 1, y: 3, side: 'red', orientation: '\\' },
    { x: 13, y: 3, side: 'blue', orientation: '/' }
  ] as Move[], turn: 'red' as const, outcome: null };
  assert.equal(legalMove(state.moves, { x: 2, y: 2, side: 'red', orientation: '/' }), false);
  assert.equal(legalMove(state.moves, { x: 2, y: 2, side: 'red', orientation: '\\' }), false);
  for (const difficulty of ['easy', 'standard'] as const) {
    const move = chooseMove(state, difficulty);
    assert.ok(move);
    assert.equal(legalMove(state.moves, move), true);
    assert.doesNotThrow(() => placeMove(state, move));
  }
});

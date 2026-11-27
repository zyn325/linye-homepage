import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMove, routeCost, type Difficulty } from '../src/game/ai';
import { lessons, lessonState } from '../src/game/tutorial';
import { invitationCode } from '../src/game/invitation';
import { emptyGame, legalMove, other, placeMove, type GameState, type Move, type RayStep } from '../src/game/rules';

const enclosure: Move[] = [
  { x: 1, y: 9, orientation: '\\', side: 'red' },
  { x: 2, y: 9, orientation: '/', side: 'red' },
  { x: 3, y: 9, orientation: '\\', side: 'red' },
  { x: 4, y: 10, orientation: '/', side: 'red' },
  { x: 5, y: 11, orientation: '\\', side: 'red' },
  { x: 5, y: 12, orientation: '/', side: 'red' },
  { x: 5, y: 13, orientation: '\\', side: 'red' }
];

test('seven-mirror enclosure is legal, seals the source and is detected for either color', () => {
  for (const side of ['red', 'blue'] as const) {
    const moves = side === 'red' ? enclosure : enclosure.map(move => ({ ...move, x: 14 - move.x, y: 14 - move.y, side }));
    for (let i = 0; i < moves.length; i++) assert.equal(legalMove(moves.slice(0, i), moves[i]), true);
    assert.equal(routeCost(moves, other(side)), 15);
    assert.ok(routeCost(moves, side) < 15);
    for (let i = 0; i < moves.length; i++) assert.ok(routeCost(moves.filter((_, j) => i !== j), other(side)) < 15);
  }
});

test('standard and challenge prevent the final enclosure move instead of continuing a doomed attack', () => {
  for (const difficulty of ['standard', 'hard'] as Difficulty[]) {
    for (const sealIndex of [3, 6]) {
      const moves = enclosure.filter((_, index) => index !== sealIndex);
      const state: GameState = { moves, turn: 'blue', outcome: null };
      const move = chooseMove(state, difficulty);
      assert.ok(move);
      assert.equal(legalMove(moves, move), true);
      const next = [...moves, move];
      const final = enclosure[sealIndex];
      assert.ok(!legalMove(next, final) || routeCost([...next, final], 'blue') < 15 || placeMove(state, move).outcome?.winner === 'blue');
    }
  }
});

test('all three levels take a legal immediate win and return no move after a result', () => {
  const state = lessonState(3);
  for (const difficulty of ['easy', 'standard', 'hard'] as Difficulty[]) {
    const move = chooseMove(state, difficulty);
    assert.ok(move);
    assert.equal(placeMove(state, move).outcome?.winner, 'red');
    assert.equal(chooseMove({ ...emptyGame(), outcome: { winner: 'draw', path: [], reason: 'agreement' } }, difficulty), null);
  }
});

test('enclosure prevention still works with a full alternating move history', () => {
  let state = emptyGame();
  for (let i = 0; i < 6; i++) {
    state = placeMove(state, enclosure[i]);
    if (i < 5) state = placeMove(state, { x: 13, y: i + 1, side: 'blue', orientation: '/' });
  }
  const move = chooseMove(state, 'standard');
  assert.ok(move);
  const next = [...state.moves, move];
  assert.ok(!legalMove(next, enclosure[6]) || routeCost([...next, enclosure[6]], 'blue') < 15);
});

test('each teaching task uses a legal move, and the final task demonstrates transmission and a win', () => {
  lessons.forEach((lesson, index) => {
    const before = lessonState(index);
    assert.equal(legalMove(before.moves, lesson.target), true);
    const after = placeMove(before, lesson.target);
    if (index === 3) {
      assert.equal(after.outcome?.winner, 'red');
      assert.ok(after.outcome.path.some(step => step.action === 'transmit'));
    } else {
      assert.equal(after.outcome, null);
      if (lesson.path) for (let i = 1; i < lesson.path.length; i++) {
        const a: RayStep = lesson.path[i - 1], b: RayStep = lesson.path[i];
        assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1);
      }
    }
  });
});

test('invitation accepts codes and links without navigating to pasted destinations', () => {
  assert.equal(invitationCode(' ab12cd '), 'AB12CD');
  assert.equal(invitationCode('https://guangluqi.com/?room=ab12cd'), 'AB12CD');
  for (const input of ['', '12345', 'https://guangluqi.com/?room=TOOLONG', 'javascript:alert(1)', 'not a link']) assert.equal(invitationCode(input), null);
});

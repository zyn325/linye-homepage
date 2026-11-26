const WebSocket = require('ws');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';
const wsOrigin = origin.replace(/^http/, 'ws');
let code;
function client() {
  const ws = new WebSocket(wsOrigin + '/ws?room=' + code);
  const messages = [];
  ws.on('message', data => messages.push(JSON.parse(String(data))));
  return {
    ws, messages,
    send(payload) { ws.send(JSON.stringify(payload)); },
    async wait(predicate, start = 0) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const message = messages.slice(start).find(predicate);
        if (message) return message;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('消息超时 ' + JSON.stringify(messages));
    },
    async open() { await new Promise(resolve => ws.once('open', resolve)); }
  };
}
(async () => {
  const redToken = randomBytes(32).toString('hex');
  const created = await fetch(origin + '/api/rooms', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'create',name:'红方',token:redToken})});
  assert.equal(created.status,200);
  code = (await created.json()).code;
  const a = client(), b = client(), intruder = client();
  await Promise.all([a.open(), b.open(), intruder.open()]);
  const blueToken = randomBytes(32).toString('hex');
  a.send({ type: 'join', code, name: '红方', token: redToken });
  let room = await a.wait(m => m.type === 'room');
  assert.equal(room.code, code);
  b.send({ type: 'join', code, name: '蓝方', token: blueToken });
  room = await b.wait(m => m.type === 'room');
  assert.equal(room.side, 'blue');
  intruder.send({ type: 'join', code, name: '第三人', token: randomBytes(32).toString('hex') });
  assert.match((await intruder.wait(m => m.type === 'error')).message, /已满/);
  a.send({ type: 'ready', version: room.version });
  room = await a.wait(m => m.type === 'room' && m.players.red.ready);
  b.send({ type: 'ready', version: room.version });
  room = await b.wait(m => m.type === 'room' && m.started);
  b.send({ type: 'move', version: room.version, x: 1, y: 1, orientation: '/' });
  assert.match((await b.wait(m => m.type === 'error')).message, /回合/);
  a.send({ type: 'move', version: room.version, x: 5, y: 9, orientation: '/' });
  assert.match((await a.wait(m => m.type === 'error')).message, /不能/);
  a.send({ type: 'move', version: room.version, x: 1, y: 1, orientation: '/' });
  room = await b.wait(m => m.type === 'room' && m.state.moves.length === 1);
  const oldVersion = room.version - 1;
  b.send({ type: 'move', version: oldVersion, x: 2, y: 1, orientation: '/' });
  assert.match((await b.wait(m => m.type === 'error' && m.message.includes('更新'))).message, /更新/);
  b.ws.close();
  await a.wait(m => m.type === 'room' && m.players.blue?.online === false);
  const resumed = client(); await resumed.open();
  resumed.send({ type: 'join', code, name: '蓝方', token: blueToken });
  room = await resumed.wait(m => m.type === 'room');
  assert.equal(room.side, 'blue'); assert.equal(room.state.moves.length, 1);
  a.send({ type: 'draw', version: room.version });
  room = await resumed.wait(m => m.type === 'room' && m.drawOffer === 'red');
  resumed.send({ type: 'draw', version: room.version });
  room = await a.wait(m => m.type === 'room' && m.state.outcome?.reason === 'agreement');
  assert.equal(room.state.outcome.winner, 'draw');
  a.send({ type: 'rematch', version: room.version });
  room = await resumed.wait(m => m.type === 'room' && m.rematch.includes('red'));
  resumed.send({ type: 'rematch', version: room.version });
  room = await a.wait(m => m.type === 'room' && m.version > room.version && m.state.moves.length === 0 && !m.state.outcome);
  resumed.send({ type: 'resign', version: room.version });
  room = await a.wait(m => m.type === 'room' && m.state.outcome?.reason === 'resign');
  assert.equal(room.state.outcome.winner, 'red');
  for (const c of [a, b, intruder, resumed]) c.ws.close();
  console.log('通过：创建、加入、满员拒绝、准备、轮次限制、非法落子、同步、旧版本拒绝、断线重连、和棋、再来一局、认输。房间 ' + code);
})().catch(error => { console.error(error); process.exit(1); });

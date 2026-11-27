const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';
const shots = '/tmp/lightpath-screenshots';
const example = [
  [5,11,'\\','red'],[6,11,'\\','blue'],[5,13,'/','red'],[6,3,'\\','blue'],
  [12,13,'\\','red'],[9,3,'/','blue'],[12,5,'/','red']
].map(([x,y,orientation,side])=>({x,y,orientation,side}));
async function cell(page,x,y){
  const box=await page.locator('#board canvas').boundingBox();
  await page.locator('#board canvas').click({position:{x:(30+(x-.5)*40)/580*box.width,y:(30+(13.5-y)*40)/580*box.height}});
}
async function count(page,n){await page.waitForFunction(n=>document.querySelector('#history-count').textContent===String(n),n);}
(async()=>{
  fs.mkdirSync(shots,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const errors=[];
  const context=await browser.newContext({viewport:{width:1365,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('#open-tutorial').click(); await page.locator('#board canvas').waitFor();
  for(const [i,[x,y,o]] of [[5,11,'/'],[8,8,'/'],[2,2,'\\'],[12,5,'/']].entries()){
    await page.waitForFunction(i=>document.querySelector('#mode-label').textContent.includes(`${i+1} / 4`),i);
    await cell(page,x,y);
    if(i===2){assert.equal(await page.locator('#confirm-move').isDisabled(),true);assert.match(await page.locator('#status-copy').textContent(),/首尾相接/);}
    await page.locator(o==='/'?'#slash':'#backslash').click();
    await page.locator('#confirm-move').click();
    await page.locator('#lesson-next').waitFor({state:'visible'});
    assert.match(await page.locator('#status-title').textContent(),/学会/);
    if(i===0)await page.screenshot({path:`${shots}/tutorial.png`,fullPage:true});
    if(i===3){await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${shots}/tutorial-mobile.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    await page.locator('#lesson-next').click();
  }
  assert.equal(await page.locator('#difficulty').inputValue(),'easy');
  await page.locator('#difficulty').selectOption('hard');
  assert.match(await page.locator('#difficulty-note').textContent(),/推演/);
  await page.locator('#human-side').selectOption('blue');
  await page.locator('#start-game').click(); await count(page,1);
  assert.match(await page.locator('#mode-label').textContent(),/挑战/);
  await page.reload(); await page.locator('.resume').click();
  assert.match(await page.locator('#mode-label').textContent(),/挑战/);
  await page.locator('#home-back').click();
  await page.evaluate(example=>localStorage.setItem('lightpath-ai',JSON.stringify({state:{moves:example,turn:'blue',outcome:null},human:'red',difficulty:'hard'})),example);
  await page.reload();await page.locator('.resume').click();
  await page.locator('#ray-review').waitFor({state:'visible'});
  assert.match(await page.locator('#ray-description').textContent(),/1 次透射/);
  await page.locator('#ray-next').click();assert.match(await page.locator('#ray-description').textContent(),/出发/);
  await page.locator('#ray-next').click();assert.match(await page.locator('#ray-description').textContent(),/透过己方/);
  await page.locator('#ray-play').click();
  await page.waitForFunction(()=>document.querySelector('#ray-description').textContent.includes('开放侧'),null,{timeout:10000});
  await page.screenshot({path:`${shots}/ray-review-mobile.png`,fullPage:true});
  await page.locator('#ray-full').click();assert.equal(await page.locator('#ray-position').textContent(),'完整路线');
  await page.setViewportSize({width:1365,height:1000});await page.screenshot({path:`${shots}/ray-review.png`,fullPage:true});
  await page.locator('#home-back').click();
  await page.locator('#open-friend').click();await page.locator('#nickname').fill('邀请方');await page.locator('#start-game').click();
  await page.locator('#room-code').waitFor({state:'visible'});
  const code=await page.locator('#room-code').textContent();
  assert.equal(await page.locator('#ready').isDisabled(),true);
  await page.locator('#invite-copy').click();
  assert.equal(await page.locator('#invite-code').textContent(),code);
  const invite=await page.locator('#invite-url').inputValue();
  await page.locator('#link-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),invite);
  await page.screenshot({path:`${shots}/invite.png`,fullPage:true});
  await page.locator('#invite-close').click();
  const guestContext=await browser.newContext();const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
  await guest.goto(origin);await guest.locator('#open-friend').click();await guest.locator('#join-code').fill(invite);await guest.locator('#nickname').fill('受邀方');await guest.locator('#start-game').click();
  await page.waitForFunction(()=>document.querySelector('#connection-label').textContent.includes('双方在线'));
  await page.locator('#ready').click();await guest.waitForFunction(()=>document.querySelector('#red-detail').textContent.includes('已准备'));await guest.locator('#ready').click();
  await page.locator('#move-controls').waitFor({state:'visible'});await cell(page,1,1);await page.locator('#confirm-move').click();await count(guest,1);
  await guestContext.setOffline(true);await guest.evaluate(()=>window.dispatchEvent(new Event('offline')));
  await page.waitForFunction(()=>document.querySelector('#connection-label').textContent.includes('断线'));
  await guest.locator('#reconnect-now').waitFor({state:'visible'});
  await guest.locator('#reconnect-now').click();await guestContext.setOffline(false);
  await guest.waitForFunction(()=>document.querySelector('#connection-label').textContent.includes('双方在线'));
  await count(guest,1);
  await cell(guest,13,1);await guest.locator('#confirm-move').click();await count(page,2);
  // Application heartbeats must keep the connection healthy while both players are idle.
  await guest.waitForTimeout(16000);assert.match(await guest.locator('#connection-label').textContent(),/双方在线/);
  await page.locator('#offer-draw').click();await guest.locator('#accept-draw').waitFor({state:'visible'});await guest.locator('#accept-draw').click();
  await page.locator('#restart').waitFor({state:'visible'});await page.locator('#restart').click();
  assert.equal(await page.locator('#restart').isDisabled(),true);
  await guest.waitForFunction(()=>document.querySelector('#status-copy').textContent.includes('对手想再来一局'));await guest.locator('#restart').click();await count(page,0);
  assert.deepEqual(errors,[]);
  console.log('升级验收通过：四课教学、非法朝向、挑战档与存档、透射讲解及回放、复制邀请与粘贴加入、断网恢复、心跳保活、重赛反馈、手机布局。');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});

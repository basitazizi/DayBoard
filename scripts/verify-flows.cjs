const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.DAYBOARD_TEST_URL || 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(`${base}/focus`);
    await page.getByPlaceholder('Study linear algebra').fill('Manual finish check');
    await page.getByRole('button', {name: 'Start focus', exact: true}).click();
    await page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
    await page.clock.fastForward(12000);
    await page.getByRole('button', {name: 'Pause', exact: true}).click();
    await page.getByRole('button', {name: 'Resume', exact: true}).waitFor();
    const paused = await page.evaluate(() => JSON.parse(localStorage.getItem('dayboard-focus-session')));
    await page.clock.fastForward(20000);
    await page.getByRole('button', {name: 'Finish session', exact: true}).click();
    await page.getByRole('button', {name: 'Finish', exact: true}).click();
    await page.getByPlaceholder('Study linear algebra').waitFor();
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('dayboard:focus-history')));
    assert.equal(history.length, 1);
    assert.equal(history[0].focusedSeconds, paused.focused_seconds);
    assert.ok(history[0].focusedSeconds >= 12 && history[0].focusedSeconds < 15);
    assert.equal(await page.evaluate(() => localStorage.getItem('dayboard-focus-session')), null);
    await page.clock.fastForward(90000);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dayboard:focus-history')).length), 1);
    console.log('PASS: ending a paused timer credits only focus once and clears the timer');

    await page.getByPlaceholder('Study linear algebra').fill('Automatic completion check');
    await page.getByRole('spinbutton').first().fill('0');
    await page.getByRole('tab', {name: 'Custom', exact: true}).first().click();
    await page.getByRole('spinbutton', {name: 'Custom Focus minutes'}).fill('1');
    await page.getByRole('button', {name: 'Start focus', exact: true}).click();
    await page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
    await page.clock.fastForward(120000);
    await page.getByPlaceholder('Study linear algebra').waitFor();
    const automatic = await page.evaluate(() => JSON.parse(localStorage.getItem('dayboard:focus-history')));
    assert.equal(automatic.length, 2);
    assert.equal(automatic[0].focusedSeconds, 60);
    console.log('PASS: zero-break session ends automatically and caps recorded time at 60 seconds');

    await page.getByPlaceholder('Study linear algebra').fill('Break cycle check');
    await page.getByRole('spinbutton').first().fill('1');
    await page.getByRole('button', {name: 'Start focus', exact: true}).click();
    await page.getByRole('button', {name: 'Pause', exact: true}).waitFor();
    await page.clock.fastForward(61000);
    await page.getByRole('button', {name:'Skip break', exact:true}).waitFor();
    await page.clock.fastForward(301000);
    await page.getByRole('button', {name:'Start next session', exact:true}).waitFor();
    await page.getByRole('button', {name:'End focus', exact:true}).click();
    await page.getByRole('button', {name:'Finish', exact:true}).click();
    await page.getByPlaceholder('Study linear algebra').waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dayboard:focus-history'))[0].focusedSeconds), 60);
    console.log('PASS: break ends, session can be ended while waiting, and break time is excluded');

    await page.getByPlaceholder('Study linear algebra').fill('Immersive layout check');
    await page.getByRole('spinbutton').first().fill('0');
    await page.getByRole('button', {name:'Start focus', exact:true}).click();
    const immersive = page.getByRole('region', {name:'Focus session', exact:true});
    await immersive.waitFor();
    for (const size of [{width:1440,height:900},{width:390,height:844}]) {
      await page.setViewportSize(size);
      const bounds = await immersive.boundingBox();
      assert.equal(bounds.x, 0); assert.equal(bounds.y, 0);
      assert.equal(bounds.width, size.width); assert.equal(bounds.height, size.height);
      assert.equal(await page.locator('[data-app-shell]').evaluate(el => el.inert), true);
      assert.equal(await page.getByRole('navigation', {name:'Main',exact:true}).count(), 0);
      const timer = await page.getByRole('timer').boundingBox();
      assert.ok(Math.abs(timer.x + timer.width / 2 - size.width / 2) < 2);
    }
    await page.getByRole('button', {name:'Take a break',exact:true}).click();
    await page.getByRole('button', {name:'Skip break',exact:true}).waitFor();
    await page.getByRole('button', {name:'End focus',exact:true}).click();
    await page.getByRole('button', {name:'Finish',exact:true}).click();
    await page.getByPlaceholder('Study linear algebra').waitFor();
    assert.equal(await page.locator('[data-app-shell]').evaluate(el => el.inert), false);
    await page.setViewportSize({width:1280,height:900});
    console.log('PASS: full viewport, centered timer, hidden navigation, manual break on final round, and shell restored');

    await page.evaluate(() => {
      const key = 'dayboard:guest-data:v2';
      const data = JSON.parse(localStorage.getItem(key));
      data.assignments = [{id:'verify-assignment', title:'Verification assignment', courseId:'', assignmentType:'homework', dueDate:'2026-12-01', dueTime:'', estimatedMinutes:60, actualMinutes:0, difficulty:3, status:'not_started'}];
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.goto(`${base}/school`);
    await page.getByRole('button', {name:'Steps', exact:true}).first().click();
    await page.getByRole('textbox', {name:'New step', exact:true}).fill('Read the instructions');
    await page.getByRole('button', {name:'Add', exact:true}).click();
    await page.getByRole('checkbox', {name:'Mark step Read the instructions done'}).check();
    await page.reload();
    await page.getByRole('button', {name:'Steps', exact:true}).first().click();
    assert.equal(await page.getByRole('checkbox', {name:'Mark step Read the instructions done'}).isChecked(), true);
    await page.getByRole('button', {name:'Remove step Read the instructions'}).click();
    assert.equal(await page.getByRole('checkbox', {name:'Mark step Read the instructions done'}).count(), 0);
    console.log('PASS: assignment steps add, complete, persist across reload, and remove');
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name:'Delete Verification assignment', exact:true}).click();
    assert.equal(await page.getByText('Verification assignment', {exact:true}).count(), 0);
    console.log('PASS: assignment deletion');

    const display = await context.newPage();
    await display.goto(`${base}/display`);
    await page.evaluate(() => localStorage.setItem('dayboard:prefs', JSON.stringify({accent:'teal'})));
    await display.waitForFunction(() => document.documentElement.dataset.accent === 'teal');
    await page.evaluate(() => localStorage.setItem('dayboard-theme-mode','night'));
    await display.waitForFunction(() => document.documentElement.dataset.theme === 'night');
    assert.equal(await display.locator('main').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(15, 17, 22)');
    console.log('PASS: LCD theme and accent synchronize from another tab');
    await display.getByRole('button', {name:'Sleep screen', exact:true}).click();
    const sleep = display.getByRole('button', {name:'Screen asleep. Tap or press any key to wake.', exact:true});
    assert.equal(await sleep.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(0, 0, 0)');
    await display.keyboard.press('Escape');
    await sleep.waitFor({state:'detached'});
    console.log('PASS: black sleep screen and keyboard wake');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });


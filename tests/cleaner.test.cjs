const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { Cleaner, isWatchLater, rows, removeItem } = require('../extension/core.js');

function fixture({ count = 3, label = 'Remove from Watch later', menuDelay = 1, removalDelay = 1, confirm = true, url = 'https://www.youtube.com/playlist?list=WL', modern = false } = {}) {
  const dom = new JSDOM('<ytd-playlist-video-list-renderer></ytd-playlist-video-list-renderer>', { url });
  const { window: win } = dom;
  win.scrollTo = () => {};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  const doc = win.document;
  const list = doc.querySelector('ytd-playlist-video-list-renderer');
  let actionClicks = 0;
  let menuClicks = 0;
  const add = () => {
    const row = doc.createElement(modern ? 'yt-lockup-view-model' : 'ytd-playlist-video-renderer');
    row.innerHTML = '<ytd-menu-renderer><button aria-haspopup="menu">Menu</button></ytd-menu-renderer>';
    row.querySelector('button').onclick = () => {
      menuClicks++;
      win.setTimeout(() => {
        doc.querySelectorAll('ytd-menu-popup-renderer').forEach(el => el.remove());
        const popup = doc.createElement('ytd-menu-popup-renderer');
        const action = doc.createElement('ytd-menu-service-item-renderer');
        action.textContent = label;
        action.onclick = () => {
          actionClicks++;
          popup.remove();
          if (confirm) win.setTimeout(() => row.remove(), removalDelay);
        };
        popup.append(action); doc.body.append(popup);
      }, menuDelay);
    };
    list.append(row);
    return row;
  };
  for (let i = 0; i < count; i++) add();
  const cleaner = new Cleaner(doc, () => {}, { poll: 2, menuTimeout: 100, removalTimeout: 150, pace: 2, loadWait: 5 });
  return { dom, win, doc, list, cleaner, add, get actionClicks() { return actionClicks; }, get menuClicks() { return menuClicks; } };
}
async function until(fn) {
  for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 2)); }
  throw new Error('Timed out waiting for test condition');
}
test('Only exact HTTPS Watch later URL is allowed', () => {
  assert.equal(isWatchLater('https://www.youtube.com/playlist?list=WL&x=1'), true);
  for (const url of ['http://www.youtube.com/playlist?list=WL', 'https://youtube.com.evil.test/playlist?list=WL', 'https://www.youtube.com/playlist?list=OTHER', 'https://www.youtube.com/watch?v=1&list=WL', 'invalid']) assert.equal(isWatchLater(url), false);
});
test('English UI: sequential cleanup and accurate count', async () => {
  const f = fixture({ menuDelay: 20, removalDelay: 25 });
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 3); assert.equal(f.cleaner.state.removed, 3); assert.equal(rows(f.doc).length, 0); assert.equal(f.cleaner.state.error, false); assert.equal(f.cleaner.state.running, false); } finally { f.win.close(); }
});
test('Russian UI and newer lockup renderer', async () => {
  const f = fixture({ label: 'Удалить из плейлиста «Смотреть позже»', modern: true });
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 3); assert.equal(f.cleaner.state.removed, 3); } finally { f.win.close(); }
});
test('A different playlist is never modified', async () => {
  const f = fixture({ url: 'https://www.youtube.com/playlist?list=OTHER' });
  try { await f.cleaner.start(); assert.equal(f.menuClicks, 0); assert.equal(f.actionClicks, 0); assert.equal(f.cleaner.state.error, true); } finally { f.win.close(); }
});
test('Empty playlist finishes without errors or clicks', async () => {
  const f = fixture({ count: 0 });
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 0); assert.equal(f.cleaner.state.error, false); } finally { f.win.close(); }
});
test('Unknown menu text fails closed rather than clicking another action', async () => {
  const f = fixture({ label: 'Delete playlist' });
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 0); assert.equal(f.cleaner.state.error, true); } finally { f.win.close(); }
});
test('No confirmed removal means no retry and no false count', async () => {
  const f = fixture({ confirm: false });
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 1); assert.equal(f.cleaner.state.removed, 0); assert.equal(f.cleaner.state.error, true); } finally { f.win.close(); }
});
test('Stop while waiting for menu prevents the removal click', async () => {
  const f = fixture({ menuDelay: 50 });
  try { const run = f.cleaner.start(); await until(() => f.menuClicks === 1); f.cleaner.stop(); await run; assert.equal(f.actionClicks, 0); assert.equal(f.cleaner.state.error, false); } finally { f.win.close(); }
});
test('Stop after action counts its result but sends no next action', async () => {
  const f = fixture({ removalDelay: 35 });
  try { const run = f.cleaner.start(); await until(() => f.actionClicks === 1); f.cleaner.stop(); await run; assert.equal(f.actionClicks, 1); assert.equal(f.cleaner.state.removed, 1); assert.equal(f.cleaner.state.running, false); } finally { f.win.close(); }
});
test('Repeated start cannot create concurrent cleanup loops', async () => {
  const f = fixture();
  try { await Promise.all([f.cleaner.start(), f.cleaner.start(), f.cleaner.start()]); assert.equal(f.actionClicks, 3); assert.equal(f.cleaner.state.removed, 3); } finally { f.win.close(); }
});
test('SPA navigation stops before next click', async () => {
  const f = fixture({ menuDelay: 35 });
  try { const run = f.cleaner.start(); await until(() => f.menuClicks === 1); f.win.history.pushState({}, '', '/playlist?list=OTHER'); await run; assert.equal(f.actionClicks, 0); assert.equal(f.cleaner.state.error, true); } finally { f.win.close(); }
});
test('Scroll loads the next batch and cleanup continues', async () => {
  const f = fixture({ count: 1 });
  let added = false;
  f.win.scrollTo = () => { if (!added) { added = true; f.add(); f.add(); } };
  try { await f.cleaner.start(); assert.equal(f.actionClicks, 3); assert.equal(f.cleaner.state.removed, 3); } finally { f.win.close(); }
});
test('Hidden and unrelated menu actions are ignored; ambiguity fails closed', () => {
  const f = fixture({ count: 0 });
  try {
    f.doc.body.insertAdjacentHTML('beforeend', '<ytd-menu-popup-renderer hidden><ytd-menu-service-item-renderer>Remove from Watch later</ytd-menu-service-item-renderer></ytd-menu-popup-renderer><div role="menuitem">Remove from Watch later</div>');
    assert.equal(removeItem(f.doc), null);
    f.doc.body.insertAdjacentHTML('beforeend', '<ytd-menu-popup-renderer><ytd-menu-service-item-renderer>Remove from Watch later</ytd-menu-service-item-renderer><ytd-menu-service-item-renderer>Remove from Watch later</ytd-menu-service-item-renderer></ytd-menu-popup-renderer>');
    assert.throws(() => removeItem(f.doc), /More than one/);
  } finally { f.win.close(); }
});
test('Recommendation lockups outside playlist are never targeted', () => {
  const f = fixture({ count: 0 });
  try { f.doc.body.insertAdjacentHTML('beforeend', '<yt-lockup-view-model><button aria-haspopup="menu">Menu</button></yt-lockup-view-model>'); assert.equal(rows(f.doc).length, 0); } finally { f.win.close(); }
});
test('Unrecognized page layout is an error, not a successful cleanup', async () => {
  const f = fixture({ count: 0 });
  try { f.list.remove(); await f.cleaner.start(); assert.equal(f.cleaner.state.error, true); assert.equal(f.actionClicks, 0); } finally { f.win.close(); }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('Content injection is idempotent; popup start and stop control the shadow panel', async () => {
  const dom = new JSDOM('<ytd-playlist-video-list-renderer><ytd-playlist-video-renderer><ytd-menu-renderer><button>Menu</button></ytd-menu-renderer></ytd-playlist-video-renderer></ytd-playlist-video-list-renderer>', { url: 'https://www.youtube.com/playlist?list=WL', runScripts: 'outside-only' });
  const win = dom.window;
  let listener;
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.chrome = { runtime: { id: 'test-extension', onMessage: { addListener(fn) { assert.equal(listener, undefined); listener = fn; } } } };
  const core = fs.readFileSync(path.join(__dirname, '../extension/core.js'), 'utf8');
  const content = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
  try {
    win.eval(core); win.eval(content); win.eval(core); win.eval(content);
    const send = (type, id = 'test-extension') => { let response; listener({ type }, { id }, data => { response = data; }); return response; };
    assert.equal(send('laterzero:status').running, false);
    assert.equal(win.document.querySelector('#laterzero-panel'), null);
    assert.equal(send('laterzero:start', 'other-extension'), undefined);
    assert.equal(send('laterzero:start').running, true);
    const host = win.document.querySelector('#laterzero-panel');
    assert.ok(host.shadowRoot);
    assert.equal(host.shadowRoot.querySelector('.action').textContent, '■ Stop');
    assert.equal(host.shadowRoot.querySelector('.close').disabled, true);
    host.shadowRoot.querySelector('.action').click();
    assert.equal(send('laterzero:status').stopping, true);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(send('laterzero:status').running, false);
    assert.equal(host.shadowRoot.querySelector('#removed').textContent, '0');
    assert.equal(host.shadowRoot.querySelector('.action').textContent, 'Close');
    host.shadowRoot.querySelector('.close').click();
    assert.equal(host.isConnected, false);
  } finally { win.close(); }
});

test('Manifest contains every referenced asset and only temporary tab permissions', () => {
  const root = path.join(__dirname, '../extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'scripting']);
  assert.equal(manifest.host_permissions, undefined);
  for (const file of [manifest.action.default_popup, ...Object.values(manifest.icons)]) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const file of Object.values(manifest.icons)) assert.equal(fs.readFileSync(path.join(root, file)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

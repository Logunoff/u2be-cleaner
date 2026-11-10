(() => {
  'use strict';
  if (globalThis.__laterZero) return;
  const { Cleaner, isWatchLater } = globalThis.LaterZeroCore;
  const host = document.createElement('div');
  host.id = 'laterzero-panel';
  host.style.cssText = 'position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;max-width:calc(100vw - 24px)!important;color-scheme:light!important';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{all:initial}*{box-sizing:border-box}.panel{width:310px;max-width:calc(100vw - 24px);font:14px/1.5 system-ui,sans-serif;color:#292d26;background:#faf9f5;border:1px solid #d8ddcf;border-radius:14px;padding:20px;box-shadow:0 10px 40px #0003}header{display:flex;align-items:center;justify-content:space-between;gap:12px}b{font-size:18px;letter-spacing:-.7px}b span{color:#df5937}.close{border:0;background:none;color:#737b6c;font-size:24px;padding:0 4px;cursor:pointer}.status{font-size:13px;color:#67755c;margin:16px 0;min-height:39px}.status.error{color:#a43c28}.stats{display:flex;gap:25px}.stat{flex:1}.stat strong{font-size:30px;font-weight:600;display:block;font-variant-numeric:tabular-nums}.stat span{color:#737b6c;font-size:12px}button.action{width:100%;margin-top:18px;padding:12px;border-radius:8px;border:0;background:#df5937;color:white;font:600 14px system-ui;cursor:pointer}button:disabled{opacity:.6;cursor:default}.note{font-size:11px;color:#7b8173;margin:12px 0 0}button:focus-visible{outline:3px solid #768e61;outline-offset:3px}
  </style><section class="panel" aria-label="LaterZero cleanup"><header><b>Later<span>Zero.</span></b><button class="close" aria-label="Close panel">×</button></header><p class="status" role="status" aria-live="polite">Ready when you are</p><div class="stats"><div class="stat"><strong id="removed">0</strong><span>videos removed</span></div><div class="stat"><strong id="time">00:00</strong><span>time elapsed</span></div></div><button class="action">Stop</button><p class="note">Keep this tab open. Stop prevents further removals; the current action may still finish.</p></section>`;
  const $ = s => shadow.querySelector(s);
  let clock = null;
  function show() { if (!host.isConnected) document.documentElement.append(host); }
  function updateTime(state) {
    const seconds = state.startedAt ? Math.max(0, Math.floor(((state.finishedAt || Date.now()) - state.startedAt) / 1000)) : 0;
    $('#time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  const cleaner = new Cleaner(document, state => {
    $('.status').textContent = state.message;
    $('.status').classList.toggle('error', state.error);
    $('#removed').textContent = state.removed;
    $('.action').textContent = state.running ? (state.stopping ? 'Stopping…' : '■ Stop') : 'Close';
    $('.action').disabled = state.stopping;
    $('.close').disabled = state.running;
    clearInterval(clock);
    updateTime(state);
    if (state.running) clock = setInterval(() => updateTime(cleaner.state), 250);
  });
  $('.action').addEventListener('click', () => cleaner.state.running ? cleaner.stop() : host.remove());
  $('.close').addEventListener('click', () => { if (!cleaner.state.running) host.remove(); });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message?.type?.startsWith('laterzero:')) return;
    if (message.type === 'laterzero:status') respond({ ...cleaner.state, validPage: isWatchLater(location.href) });
    if (message.type === 'laterzero:start') {
      if (!isWatchLater(location.href)) { respond({ error: 'Open your Watch later playlist first.' }); return; }
      show();
      void cleaner.start();
      respond({ ...cleaner.state });
    }
    if (message.type === 'laterzero:stop') { cleaner.stop(); respond({ ...cleaner.state }); }
  });
  globalThis.__laterZero = cleaner;
})();

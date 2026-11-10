'use strict';
const $ = selector => document.querySelector(selector);
let tabId;
let busy = false;
function render(state) {
  busy = state.running;
  $('#ready').hidden = busy;
  $('#stop').hidden = !busy;
  $('#stop').disabled = state.stopping;
  $('#status').textContent = busy ? `${state.removed} removed. ${state.message}` : state.message;
}
async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !LaterZeroCore.isWatchLater(tab.url)) {
      $('#status').textContent = 'Open your Watch later playlist on desktop YouTube to begin.';
      $('#open').hidden = false;
      return;
    }
    tabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['core.js', 'content.js'] });
    render(await chrome.tabs.sendMessage(tabId, { type: 'laterzero:status' }));
  } catch {
    $('#status').textContent = 'Could not connect to YouTube. Refresh the playlist and reopen LaterZero.';
  }
}
$('#confirm').addEventListener('change', () => { $('#start').disabled = !$('#confirm').checked; });
$('#start').addEventListener('click', async () => {
  if (busy || !$('#confirm').checked || !tabId) return;
  $('#start').disabled = true;
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: 'laterzero:start' });
    if (state.error) { $('#status').textContent = state.error; return; }
    render(state);
    window.close();
  } catch { $('#status').textContent = 'Connection lost. Reopen LaterZero on the Watch later tab.'; }
  finally { $('#start').disabled = !$('#confirm').checked; }
});
$('#stop').addEventListener('click', async () => {
  try { render(await chrome.tabs.sendMessage(tabId, { type: 'laterzero:stop' })); }
  catch { $('#status').textContent = 'Connection lost. Check the panel on YouTube, or reload the tab to stop.'; }
});
void init();

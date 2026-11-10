/* The interactive preview modifies only the fictional playlist on this page. */
const samples = [
  ['A quiet morning in the mountains', 'Somewhere Outdoors', '18:24', 'mountains'],
  ['The perfect desk setup (finally)', 'Small Spaces', '12:08', 'desk'],
  ['A playlist for a slower Sunday', 'Soft Sounds', '46:32', 'music'],
  ['Things I wish I knew a year ago', 'A Little Perspective', '15:42', 'sunset'],
  ['Making coffee, taking my time', 'Everyday Rituals', '09:16', 'coffee'],
  ['A weekend without a plan', 'Somewhere Outdoors', '22:05', 'mountains'],
];
const art = {
  mountains: '<rect width="160" height="90" fill="#bdcfc9"/><circle cx="125" cy="22" r="12" fill="#f1e7c9"/><path d="M0 80 53 13l60 77H0" fill="#718e82"/><path d="m26 48 27-35 30 38-19-10-11 8-9-11Z" fill="#dde2d6"/><path d="m70 90 54-56 36 40v16" fill="#91a595"/><path d="M0 77q45-15 90 4t70-8v17H0Z" fill="#4e705f"/>',
  desk: '<rect width="160" height="90" fill="#d8c9b5"/><rect x="110" width="50" height="64" fill="#e9e4d8"/><path d="M135 0v64m-25-35h50" stroke="#c1bbaa" stroke-width="3"/><rect x="15" y="60" width="130" height="6" fill="#877455"/><path d="M25 66v24m110-24v24" stroke="#6d5e46" stroke-width="5"/><rect x="48" y="25" width="51" height="33" rx="3" fill="#4c5751"/><rect x="52" y="29" width="43" height="25" fill="#9bada0"/><rect x="69" y="58" width="8" height="4" fill="#5b665b"/><path d="M117 58v-15m0 9-8-10m8 5 8-12" stroke="#6f7a56" stroke-width="3"/><path d="m108 52 3 10h13l3-10" fill="#ac8e70"/>',
  music: '<rect width="160" height="90" fill="#c5b6ac"/><rect x="0" y="0" width="160" height="90" fill="#594e43" opacity=".1"/><circle cx="82" cy="45" r="34" fill="#454940"/><circle cx="82" cy="45" r="27" fill="none" stroke="#777a6c" stroke-width="1"/><circle cx="82" cy="45" r="20" fill="none" stroke="#656959" stroke-width="1"/><circle cx="82" cy="45" r="13" fill="#d5aa7a"/><circle cx="82" cy="45" r="3" fill="#f0d7ad"/><path d="m139 15-9 35-27 13" fill="none" stroke="#d4c7b5" stroke-width="5"/>',
  sunset: '<rect width="160" height="90" fill="#d9b795"/><circle cx="81" cy="43" r="21" fill="#eddbad"/><path d="M0 60q45-18 83 3t77-1v28H0Z" fill="#b68e70"/><path d="M0 77q44-22 91-3t69-1v17H0Z" fill="#8d8268"/><path d="M0 84q45-13 85 1t75-5v10H0Z" fill="#5e705c"/>',
  coffee: '<rect width="160" height="90" fill="#c9b898"/><path d="M0 60h160v30H0Z" fill="#a38a66"/><ellipse cx="77" cy="70" rx="39" ry="8" fill="#dbd2bd"/><path d="M50 31h49v22q-1 19-25 19T50 53Z" fill="#e9e1ca"/><ellipse cx="75" cy="32" rx="24" ry="7" fill="#6d5439"/><path d="M99 39q24-4 17 14-5 8-16 4" fill="none" stroke="#e9e1ca" stroke-width="6"/><path d="M68 22q-9-6 0-14m13 14q-9-6 0-14" fill="none" stroke="#e6dfcc" stroke-width="2"/>',
};
const list = document.getElementById('video-list');
const run = document.getElementById('run-demo');
const status = document.getElementById('status');
const statusDot = document.getElementById('status-dot');
const empty = document.getElementById('empty-state');
let removed = 0;
let elapsed = 0;
let running = false;
let timer = null;
let removal = null;
let pendingRemoval = null;
let autoStartTimer = null;
let autoStartConsumed = false;
let autoStartObserver = null;

function clearAutoStartCue() {
  clearTimeout(autoStartTimer);
  autoStartTimer = null;
  run.classList.remove('is-auto-clicking');
}
function cancelAutoStart() {
  autoStartConsumed = true;
  clearAutoStartCue();
  autoStartObserver?.disconnect();
}
function scheduleAutoStart() {
  if (autoStartConsumed || autoStartTimer !== null || document.hidden) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion) run.classList.add('is-auto-clicking');
  autoStartTimer = setTimeout(() => {
    // Use the same button action as a real click. Never move keyboard focus.
    if (!autoStartConsumed && !document.hidden && !running) run.click();
    else clearAutoStartCue();
  }, reducedMotion ? 700 : 1500);
}

function renderVideos() {
  list.innerHTML = samples.map(([title, channel, duration, type], i) => `<div class="video-row"><span class="video-number">${i + 1}</span><div class="thumbnail"><svg viewBox="0 0 160 90" aria-hidden="true">${art[type]}</svg><span class="duration">${duration}</span></div><div class="video-info"><h3>${title}</h3><p>${channel}<br>Saved a while ago</p></div><span class="video-dots" aria-hidden="true">⋮</span></div>`).join('');
}
function update() {
  document.getElementById('deleted').innerHTML = `${removed}<span> / ${samples.length}</span>`;
  document.getElementById('remaining').textContent = samples.length - removed;
  document.getElementById('elapsed').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  document.getElementById('progress').style.width = `${removed / samples.length * 100}%`;
}
function stopDemo(completed = false) {
  running = false;
  clearInterval(timer);
  clearInterval(removal);
  clearTimeout(pendingRemoval);
  list.querySelector('.removing')?.classList.remove('removing');
  statusDot.classList.remove('running');
  status.textContent = completed ? 'All clear!' : 'Stopped. Your call.';
  run.classList.remove('is-running');
  run.innerHTML = completed ? '↻ Replay demo' : '<svg><use href="#play"/></svg> Continue clearing';
  if (completed) empty.hidden = false;
}
function removeNext() {
  const row = list.querySelector('.video-row');
  if (!row || !running) return;
  row.classList.add('removing');
  pendingRemoval = setTimeout(() => {
    if (!running) return;
    row.remove();
    removed++;
    update();
    if (removed === samples.length) stopDemo(true);
  }, 300);
}
function startDemo() {
  // Any manual start owns the demo from here on: no automatic restart after Stop.
  cancelAutoStart();
  if (running) return;
  if (removed === samples.length) {
    removed = 0;
    elapsed = 0;
    empty.hidden = true;
    renderVideos();
    update();
  }
  running = true;
  status.textContent = 'Clearing your list';
  statusDot.classList.add('running');
  run.classList.add('is-running');
  run.innerHTML = '<span aria-hidden="true">■</span> Stop';
  timer = setInterval(() => { elapsed++; update(); }, 1000);
  removal = setInterval(removeNext, 1800);
}
run.addEventListener('click', () => running ? stopDemo() : startDemo());
['hero-demo', 'second-demo'].forEach(id => document.getElementById(id).addEventListener('click', startDemo));
const dialog = document.getElementById('install-dialog');
document.querySelectorAll('[data-install]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
document.getElementById('dialog-demo').addEventListener('click', () => {
  dialog.close();
  document.getElementById('demo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  startDemo();
  run.focus({ preventScroll: true });
});
document.getElementById('year').textContent = new Date().getFullYear();
renderVideos();
update();

// Wait for the actual control to enter view, especially on mobile.
if ('IntersectionObserver' in window) {
  autoStartObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && entries[0].intersectionRatio >= 1) scheduleAutoStart();
    else clearAutoStartCue();
  }, { threshold: 1 });
  autoStartObserver.observe(run);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearAutoStartCue();
  else {
    const rect = run.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth) scheduleAutoStart();
  }
});

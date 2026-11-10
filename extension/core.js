/* UI-only automation. No cookies, network requests, or YouTube private APIs. */
(() => {
  'use strict';
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  if (root.LaterZeroCore) return;
  const LABELS = [
    /^Remove from Watch later$/i,
    /^Удалить из плейлиста(?:\s+.*)?$/i,
    /^Aus .*Später ansehen.* entfernen$/i,
    /^Supprimer de .* regarder plus tard.*$/i,
    /^Quitar de .*Ver m[aá]s tarde.*$/i,
    /^Remover de .*Assistir mais tarde.*$/i,
  ];
  function isWatchLater(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && ['www.youtube.com', 'youtube.com'].includes(u.hostname)
        && u.pathname === '/playlist' && u.searchParams.get('list') === 'WL';
    } catch { return false; }
  }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const css = n.ownerDocument.defaultView.getComputedStyle(n);
      if (n.hidden || n.getAttribute('aria-hidden') === 'true' || css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function rows(doc) {
    // Restrict newer lockup cards to the playlist list, never recommendation shelves.
    return [...doc.querySelectorAll('ytd-playlist-video-list-renderer ytd-playlist-video-renderer, ytd-playlist-video-list-renderer yt-lockup-view-model')].filter(visible);
  }
  function menuButton(row) {
    return [...row.querySelectorAll('ytd-menu-renderer button, ytd-menu-renderer yt-icon-button, .yt-lockup-metadata-view-model__menu-button button, button[aria-haspopup="menu"]')].find(visible);
  }
  function removeItem(doc) {
    const popups = [...doc.querySelectorAll('ytd-menu-popup-renderer, tp-yt-paper-listbox, yt-sheet-view-model')].filter(visible);
    const candidates = new Set(popups.flatMap(p => [...p.querySelectorAll('ytd-menu-service-item-renderer, yt-list-item-view-model, [role="menuitem"]')]));
    const matches = [...candidates].filter(el => visible(el) && LABELS.some(re => re.test((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())));
    // Some YouTube variants nest a role=menuitem inside a renderer. Keep the innermost match.
    const unique = matches.filter(el => !matches.some(other => other !== el && el.contains(other)));
    if (unique.length > 1) throw new Error('More than one removal action is visible. Close other menus and try again.');
    return unique[0] || null;
  }
  class Cleaner {
    constructor(doc, onChange = () => {}, options = {}) {
      this.doc = doc;
      this.win = doc.defaultView;
      this.onChange = onChange;
      this.options = { poll: 100, menuTimeout: 5000, removalTimeout: 15000, pace: 900, loadWait: 1600, ...options };
      this.state = { running: false, stopping: false, removed: 0, startedAt: null, finishedAt: null, message: 'Ready when you are', error: false };
    }
    emit(patch) { Object.assign(this.state, patch); this.onChange({ ...this.state }); }
    guard() {
      if (!isWatchLater(this.win.location.href)) throw new Error('Cleanup stopped: this is no longer the Watch later page.');
    }
    check() { this.guard(); if (this.controller.signal.aborted) throw new DOMException('Stopped', 'AbortError'); }
    async waitFor(test, timeout, cancel = true) {
      const until = Date.now() + timeout;
      while (true) {
        if (cancel) this.check(); else this.guard();
        const result = test();
        if (result) return result;
        if (Date.now() >= until) return null;
        await new Promise(resolve => this.win.setTimeout(resolve, this.options.poll));
      }
    }
    async pause(ms) {
      const until = Date.now() + ms;
      await this.waitFor(() => Date.now() >= until, ms + this.options.poll);
    }
    stop() {
      if (!this.state.running) return;
      this.controller.abort();
      this.emit({ stopping: true, message: 'Stopping… finishing the current action' });
    }
    async start() {
      if (this.state.running) return;
      this.controller = new AbortController();
      this.emit({ running: true, stopping: false, removed: 0, startedAt: Date.now(), finishedAt: null, error: false, message: 'Looking for videos…' });
      try {
        this.check();
        const playlist = await this.waitFor(() => this.doc.querySelector('ytd-playlist-video-list-renderer'), this.options.menuTimeout);
        if (!playlist) throw new Error('Watch later list not found. Wait for YouTube to load, then try again.');
        let emptyChecks = 0;
        while (true) {
          this.check();
          const row = rows(this.doc)[0];
          if (!row) {
            this.emit({ message: 'Checking for more videos…' });
            if (emptyChecks++ >= 3) {
              if ([...this.doc.querySelectorAll('ytd-playlist-video-list-renderer tp-yt-paper-spinner[active], ytd-playlist-video-list-renderer [aria-busy="true"]')].some(visible)) throw new Error('YouTube is still loading. Wait for the page to finish and start again.');
              this.emit({ message: 'Finished — no more videos found' });
              break;
            }
            this.win.scrollTo(0, this.doc.documentElement.scrollHeight);
            await this.pause(this.options.loadWait);
            continue;
          }
          emptyChecks = 0;
          const button = menuButton(row);
          if (!button) throw new Error('Could not find the video menu. YouTube may have changed its layout.');
          row.scrollIntoView({ block: 'center', behavior: 'instant' });
          this.check();
          this.emit({ message: 'Clearing your list…' });
          button.click();
          const action = await this.waitFor(() => removeItem(this.doc), this.options.menuTimeout);
          if (!action) throw new Error('Removal action not found. Use English or Russian YouTube, close the menu, and try again.');
          // Never click a menu opened for a row that has disappeared during the wait.
          if (!row.isConnected) throw new Error('The playlist changed before removal. Stopped without clicking the action.');
          this.check();
          action.click();
          // Stop prevents the NEXT click; an already-sent removal can still finish.
          const confirmed = await this.waitFor(() => !row.isConnected, this.options.removalTimeout, false);
          if (!confirmed) throw new Error('YouTube did not confirm removal. Stopped without retrying; check the playlist before starting again.');
          this.emit({ removed: this.state.removed + 1 });
          await this.pause(this.options.pace);
        }
      } catch (error) {
        this.emit({ message: error.name === 'AbortError' ? 'Stopped — you’re in control' : error.message, error: error.name !== 'AbortError' });
      } finally {
        this.emit({ running: false, stopping: false, finishedAt: Date.now() });
      }
    }
  }
  const api = { isWatchLater, rows, removeItem, menuButton, Cleaner };
  root.LaterZeroCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})();

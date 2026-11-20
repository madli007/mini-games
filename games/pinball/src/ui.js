/* =====================================================================
   UI — zasloni (začetni, pavza, nastavitve, konec igre, vpis
   inicialk, lestvica), stranski paneli in obvestila.
   ===================================================================== */
import { CFG, MODES, PAL, QUALITY, QUALITY_ORDER } from './config.js';
import { fmt } from './rules.js';
import * as Store from './storage.js';
import * as Board from './leaderboard.js';
import { DW, textWidth } from './render/dmd.js';
import { logoUrl } from './logos.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHARS = 'ABCČDEFGHIJKLMNOPRSŠTUVZŽXYWQ0123456789-· ';

export class UI {
  constructor(app) {
    this.app = app;               // { game, audio, renderer, settings, startGame, resume, quit, setQuality, ... }
    this.ov = $('overlay');
    this.screen = 'none';
    this.dmdOverride = null;
    this.newIdx = -1;
    this.dispScore = 0;
    this.panelT = 0;
    this.toastT = 0;
    this.lastSummary = '';
    this.buildModes();
    this.refreshBoards();
  }

  /* ---------------- pomožno ---------------- */
  open(html, name) {
    this.screen = name;
    this.ov.innerHTML = `<div class="card glass">${html}</div>`;
    requestAnimationFrame(() => this.ov.classList.add('show'));
    const prim = this.ov.querySelector('.btn.primary');
    if (prim && !matchMedia('(pointer:coarse)').matches) setTimeout(() => prim.focus({ preventScroll: true }), 60);
    this.ov.querySelectorAll('.btn, .seg button, .arr').forEach(b => b.addEventListener('click', () => this.app.audio.play('click')));
  }
  close() {
    this.screen = 'none';
    this.dmdOverride = null;
    const c = this.ov.querySelector('.card');
    if (c) c.classList.add('out');
    this.ov.classList.remove('show');
    setTimeout(() => { if (this.screen === 'none') this.ov.innerHTML = ''; }, 420);
  }
  on(id, fn) { const e = $(id); if (e) e.addEventListener('click', fn); }
  toast(text, sec = 2.4) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), sec * 1000);
  }

  controlsHtml() {
    const touch = document.body.classList.contains('touch');
    if (touch) return `<div class="ctl">
      <kbd>levo</kbd><span>tapni levo polovico → levi flipper</span>
      <kbd>desno</kbd><span>tapni desno polovico → desni flipper</span>
      <kbd>plunger</kbd><span>povleci navzdol spodaj desno in spusti</span>
      <kbd>tresenje</kbd><span>hiter poteg navzgor ali gumb ⇡</span></div>`;
    return `<div class="ctl">
      <kbd>Z · ← · L⇧</kbd><span>levi flipper</span>
      <kbd>M · → · D⇧</kbd><span>desni flipper</span>
      <kbd>PRESLEDEK · ↓</kbd><span>drži in spusti za izstrelitev</span>
      <kbd>B · ↑</kbd><span>tresenje mize (pazi na TILT)</span>
      <kbd>P · Esc · O</kbd><span>pavza · zvok</span>
      <kbd>gamepad</kbd><span>LB/RB flipperja · A izstrelitev</span></div>`;
  }

  topHtml() {
    const s = Board.scores().slice(0, 3);
    if (!s.length) return '<div class="hint">Lestvica je še prazna — postavi prvi rekord!</div>';
    return `<ol class="board top3">${s.map(e => `<li><span class="n">${esc(e.name)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')}</ol>`;
  }

  /* ---------------- zasloni ---------------- */
  showStart() {
    const logo = CFG.logotipi ? `<img class="brand-logo" src="${logoUrl('impol')}" alt="Impol" onerror="this.remove()">` : '';
    this.open(`
      ${logo}
      <h1 class="title">${esc(CFG.naslov)}</h1>
      <div class="title-ver">${esc(CFG.verzija)}</div>
      <div class="subtitle">${esc(CFG.podnaslov)}</div>
      <div class="companies">${esc(CFG.imena.podjetja)}</div>
      <div class="btns">
        <button class="btn primary" id="uStart">ZAČNI IGRO</button>
        <div class="btn-row">
          <button class="btn" id="uScores">LESTVICA</button>
          <button class="btn" id="uSettings">NASTAVITVE</button>
        </div>
      </div>
      <div id="uTop">${this.topHtml()}</div>
      ${this.controlsHtml()}
      <div class="hint">ENTER za začetek · misije, multiball in finale te čakajo v livarni ${esc(CFG.imena.scoop)}</div>
      <div class="legal">${esc(CFG.opomba)}</div>
      <a class="hub-back" href="../../">← MINI GAMES HUB</a>`, 'start');
    this.on('uStart', () => this.app.startGame());
    this.on('uScores', () => this.showScores('start'));
    this.on('uSettings', () => this.showSettings('start'));
  }

  showPause() {
    this.open(`
      <div class="h2">PAVZA</div>
      <div class="hint">P ali Esc za nadaljevanje</div>
      <div class="btns">
        <button class="btn primary" id="uResume">NADALJUJ</button>
        <div class="btn-row">
          <button class="btn" id="uSettings">NASTAVITVE</button>
          <button class="btn" id="uQuit">KONČAJ IGRO</button>
        </div>
      </div>
      ${this.controlsHtml()}`, 'pause');
    this.on('uResume', () => this.app.resume());
    this.on('uSettings', () => this.showSettings('pause'));
    this.on('uQuit', () => this.app.quit());
  }

  showSettings(back) {
    const s = this.app.settings;
    const qs = ['auto', ...QUALITY_ORDER];
    const qname = k => k === 'auto' ? 'Samodejno' : QUALITY[k].ime;
    this.open(`
      <div class="h2">NASTAVITVE</div>
      <div class="set">
        <div><label>KAKOVOST IZRISA</label>
          <div class="seg" id="uQ">${qs.map(k => `<button data-q="${k}" class="${s.quality === k ? 'on' : ''}">${qname(k)}</button>`).join('')}</div>
          <div class="hint" id="uQnow"></div></div>
        <div><label>GLASBA</label><input type="range" id="uMus" min="0" max="1" step="0.05" value="${s.music}"></div>
        <div><label>ZVOČNI EFEKTI</label><input type="range" id="uSfx" min="0" max="1" step="0.05" value="${s.sfx}"></div>
        <div class="toggle"><span>Zvok vklopljen</span><input type="checkbox" id="uMute" ${s.muted ? '' : 'checked'}></div>
        <div class="toggle"><span>Prikaži FPS</span><input type="checkbox" id="uFps" ${s.fps ? 'checked' : ''}></div>
      </div>
      <button class="btn primary" id="uBack">NAZAJ</button>`, 'settings');
    const now = () => { const e = $('uQnow'); if (e) e.textContent = 'Trenutno: ' + QUALITY[this.app.renderer.qualityKey].ime + (this.app.renderer.usingGL ? ' · WebGL' : ' · 2D (brez WebGL)'); };
    now();
    this.ov.querySelectorAll('#uQ button').forEach(b => b.addEventListener('click', () => {
      this.ov.querySelectorAll('#uQ button').forEach(x => x.classList.toggle('on', x === b));
      this.app.setQuality(b.dataset.q); now();
    }));
    $('uMus').addEventListener('input', e => this.app.setVolume('music', +e.target.value));
    $('uSfx').addEventListener('input', e => { this.app.setVolume('sfx', +e.target.value); });
    $('uSfx').addEventListener('change', () => this.app.audio.play('bumper', { x: 300, i: 1 }));
    $('uMute').addEventListener('change', e => this.app.setMuted(!e.target.checked));
    $('uFps').addEventListener('change', e => this.app.setFps(e.target.checked));
    this.on('uBack', () => back === 'pause' ? this.showPause() : this.showStart());
  }

  showScores(back, highlight = -1) {
    const s = Board.scores(), st = Store.loadStats();
    const rows = s.length ? s.map((e, i) => `<li class="${i === highlight ? 'new' : ''}"><span class="n">${esc(e.name)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')
      : '<li class="empty"><span></span><span>Še ni rekordov — bodi prvi!</span><span></span></li>';
    const mins = Math.round(st.playSec / 60);
    this.open(`
      <div class="h2 gold-t">${Board.isGlobal() ? 'SKUPNA LESTVICA' : 'LESTVICA'}</div>
      <ol class="board" style="text-align:left;margin:10px 0 14px">${rows}</ol>
      <div class="stats-grid" style="text-align:left">
        <span>Odigranih iger</span><span>${st.games}</span>
        <span>Najboljši rezultat</span><span>${fmt(st.bestScore)}</span>
        <span>Najdaljši combo</span><span>×${st.maxCombo}</span>
        <span>Največji jackpot</span><span>${fmt(st.maxJackpot)}</span>
        <span>Opravljenih misij</span><span>${st.modes}</span>
        <span>Finale (wizard)</span><span>${st.wizards}</span>
        <span>Čas igranja</span><span>${mins} min</span>
      </div>
      <div class="btns"><button class="btn primary" id="uBack">${back === 'over' ? 'ŠE ENKRAT' : 'NAZAJ'}</button>
      ${back === 'over' ? '<button class="btn" id="uMenu">MENI</button>' : ''}</div>`, 'scores');
    this.on('uBack', () => back === 'over' ? this.app.startGame() : this.showStart());
    this.on('uMenu', () => this.showStart());
  }

  showGameOver(d) {
    this.open(`
      <div class="h2">KONEC IGRE</div>
      <div class="big">${fmt(d.score)}</div>
      <div class="stats-grid" style="text-align:left;max-width:300px;margin:10px auto">
        <span>Opravljene misije</span><span>${d.modes} / 4</span>
        <span>Najdaljši combo</span><span>×${d.maxCombo}</span>
        <span>Največji jackpot</span><span>${fmt(d.maxJackpot)}</span>
        <span>Trajanje</span><span>${Math.floor(d.playSec / 60)}:${String(Math.floor(d.playSec % 60)).padStart(2, '0')}</span>
      </div>
      <div class="btns">
        <button class="btn primary" id="uAgain">ŠE ENKRAT</button>
        <div class="btn-row"><button class="btn" id="uScores">LESTVICA</button><button class="btn" id="uMenu">MENI</button></div>
      </div>`, 'over');
    this.on('uAgain', () => this.app.startGame());
    this.on('uScores', () => this.showScores('over'));
    this.on('uMenu', () => this.showStart());
  }

  /* ---------------- arkadni vpis inicialk ---------------- */
  showInitials(d) {
    let last = 'AAA';
    const saved = Store.load('lastName', '');
    if (saved && saved.length === 3) last = saved;
    this.ini = { letters: [...last].map(c => Math.max(0, CHARS.indexOf(c))), pos: 0, score: d.score, data: d };
    const rank = (() => { const s = Board.scores(); let r = 1; for (const e of s) if (e.score >= d.score) r++; return r; })();
    this.open(`
      <div class="h2 gold-t">NOV REKORD!</div>
      <div class="rank">NASLOVNICA METALURGA!</div>
      <div class="rank">${rank}. MESTO NA LESTVICI</div>
      <div class="big">${fmt(d.score)}</div>
      <div class="initials" id="uIni"></div>
      <div class="hint" id="uIniHint"></div>
      <div class="btns"><button class="btn primary" id="uOk">SHRANI</button></div>`, 'initials');
    const touch = document.body.classList.contains('touch');
    $('uIniHint').textContent = touch ? 'tapni ▲ ▼ za črko, nato SHRANI'
      : 'flipperja (← →) menjata črko · PRESLEDEK potrdi · ali tipkaj';
    this.renderInitials();
    this.on('uOk', () => this.saveInitials());
    this.app.audio.play('highScore');
    this.dmdOverride = (dmd) => {
      dmd.text('VPIŠI INICIALKE', DW / 2, 1, { color: [1, 0.82, 0.25], align: 'center' });
      const s = this.ini;
      for (let i = 0; i < 3; i++) {
        const ch = CHARS[s.letters[i]];
        const on = i !== s.pos || Math.floor(performance.now() / 250) % 2;
        dmd.text(ch === ' ' ? '_' : ch, DW / 2 - 24 + i * 24, 12, { scale: 2, color: i === s.pos ? [1, 1, 1] : [1, 0.48, 0.1], align: 'center', alpha: on ? 1 : 0.25 });
      }
    };
  }
  renderInitials() {
    const s = this.ini, box = $('uIni');
    if (!box) return;
    box.innerHTML = s.letters.map((l, i) => `
      <div class="slot ${i === s.pos ? 'cur' : ''}" data-i="${i}">
        <button class="arr" data-d="-1" data-i="${i}">▲</button>
        <div class="ch">${esc(CHARS[l] === ' ' ? '_' : CHARS[l])}</div>
        <button class="arr" data-d="1" data-i="${i}">▼</button>
      </div>`).join('');
    box.querySelectorAll('.arr').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      s.pos = +b.dataset.i; this.stepLetter(+b.dataset.d);
    }));
    box.querySelectorAll('.ch').forEach((c, i) => c.addEventListener('click', () => { s.pos = i; this.renderInitials(); }));
  }
  stepLetter(d) {
    const s = this.ini;
    s.letters[s.pos] = (s.letters[s.pos] + d + CHARS.length) % CHARS.length;
    this.app.audio.play('click');
    this.renderInitials();
  }
  confirmLetter() {
    const s = this.ini;
    this.app.audio.play('select');
    if (s.pos < 2) { s.pos++; this.renderInitials(); }
    else this.saveInitials();
  }
  saveInitials() {
    const s = this.ini;
    if (!s || s.saved) return;
    s.saved = true;
    const name = s.letters.map(i => CHARS[i]).join('').trim() || '???';
    Store.save('lastName', s.letters.map(i => CHARS[i]).join(''));
    this.dmdOverride = null;
    this.open(`<div class="h2">SHRANJUJEM …</div><div class="hint">${Board.enabled() ? 'pošiljam na skupno lestvico' : ''}</div>`, 'saving');
    Board.submit(name, s.data).then(r => {
      if (r.global === false) this.toast('Skupna lestvica: ' + r.error + ' — rekord je shranjen lokalno', 5);
      this.refreshBoards(r.rank);
      if (this.screen === 'saving') this.showScores('over', r.rank);
    });
  }

  /** tipke v menijih; vrne true, če je tipko porabil meni */
  menuKey(e) {
    if (this.screen === 'initials' && this.ini) {
      const c = e.code, k = e.key;
      if (c === 'ArrowLeft' || c === 'KeyZ' || c === 'ShiftLeft' || c === 'ArrowUp') { this.stepLetter(-1); return true; }
      if (c === 'ArrowRight' || c === 'Slash' || c === 'ShiftRight' || c === 'ArrowDown') { this.stepLetter(1); return true; }
      if (c === 'Space' || c === 'Enter') { if (!e.repeat) this.confirmLetter(); return true; }
      if (c === 'Backspace') { this.ini.pos = Math.max(0, this.ini.pos - 1); this.renderInitials(); return true; }
      if (k && k.length === 1) {
        const up = k.toUpperCase(), i = CHARS.indexOf(up);
        if (i >= 0) { this.ini.letters[this.ini.pos] = i; this.confirmLetter(); return true; }
      }
      return true;
    }
    if (this.screen === 'start' && (e.code === 'Space' || e.code === 'Enter') && document.activeElement?.tagName !== 'BUTTON') {
      if (!e.repeat) this.app.startGame(); return true;
    }
    return false;
  }
  menuPad(btn, down) {
    if (this.screen !== 'initials' || !down) return this.screen === 'initials';
    if (btn === 'L') this.stepLetter(-1);
    if (btn === 'R') this.stepLetter(1);
    if (btn === 'A') this.confirmLetter();
    return true;
  }
  /** flipper v menijih (dotik / tipkovnica brez porabe) */
  get blocking() { return this.screen !== 'none'; }

  /* ---------------- stranski paneli ---------------- */
  buildModes() {
    const ul = $('pModes');
    ul.innerHTML = MODES.map((m, i) => `<li id="pm${i}" style="color:${m.barva}"><span class="dot"></span><span>${m.ime}</span><small></small></li>`).join('')
      + `<li id="pmW" class="wiz" style="color:${PAL.gold}"><span class="dot"></span><span>NAROČILO IZPOLNJENO</span><small>FINALE</small></li>`;
  }

  refreshBoards(highlight = -1) {
    const s = Board.scores();
    const ttl = $('pBoardTitle'); if (ttl) ttl.textContent = Board.isGlobal() ? 'SKUPNA LESTVICA' : 'LESTVICA';
    $('pBoard').innerHTML = s.length ? s.map((e, i) => `<li class="${i === highlight ? 'new' : ''}"><span class="n">${esc(e.name)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')
      : '<li class="empty"><span></span><span>Še ni rekordov</span><span></span></li>';
    const st = Store.loadStats();
    $('pStats').innerHTML = `
      <span>Iger</span><span>${st.games}</span>
      <span>Rekord</span><span>${fmt(st.bestScore)}</span>
      <span>Najdaljši combo</span><span>×${st.maxCombo}</span>
      <span>Največji jackpot</span><span>${fmt(st.maxJackpot)}</span>`;
    this.scoresCache = s; this.statsCache = st;
  }

  update(dt, game) {
    const s = game.summary();
    this.dispScore += (s.score - this.dispScore) * Math.min(1, dt * 7);
    if (Math.abs(s.score - this.dispScore) < 5) this.dispScore = s.score;
    if (!document.body.classList.contains('wide')) return;
    const sc = fmt(this.dispScore);
    const e = $('pScore'); if (e.textContent !== sc) e.textContent = sc;
    this.panelT -= dt;
    if (this.panelT > 0) return;
    this.panelT = 0.12;
    const key = JSON.stringify([s.state, s.ball, s.mult, s.modesDone, s.modeLit, s.mode && [s.mode.i, Math.ceil(s.mode.t), s.mode.prog, s.mode.value],
      s.next, s.locks, s.lockLit, s.kickback, Math.ceil(s.ballSave), s.extraBalls, s.extraLit, s.multiball, s.wizard, s.wizardLit, s.jackpot, s.rampsToMode]);
    if (key === this.lastSummary) return;
    this.lastSummary = key;
    const playing = s.state === 'play' || s.state === 'bonus';
    $('pBall').textContent = playing ? s.ball + ' / ' + s.balls : '–';
    $('pMult').textContent = '×' + s.mult;
    MODES.forEach((m, i) => {
      const li = $('pm' + i);
      const run = s.mode && s.mode.i === i, done = s.modesDone[i], lit = s.modeLit && s.next === i && !s.mode;
      li.className = run ? 'run' : done ? 'done' : lit ? 'lit' : '';
      li.querySelector('small').textContent = run ? Math.ceil(s.mode.t) + ' s' : done ? '✓' : lit ? 'PRIŽGANA' : '';
    });
    const w = $('pmW');
    w.className = 'wiz ' + (s.wizard ? 'run' : s.wizardLit ? 'lit' : '');
    const now = $('pModeNow');
    if (s.mode) {
      const m = MODES[s.mode.i];
      let prog = '';
      if (m.id === 'hotfix') prog = 'vrednost: ' + fmt(s.mode.value);
      else prog = s.mode.prog + ' / ' + s.mode.goal + (m.id === 'valjarna' ? ' m' : '');
      now.innerHTML = `<div class="name" style="color:${m.barva}">${esc(m.polno || m.ime)}</div><div class="desc">${esc(m.opis)} · ${esc(prog)}</div>
        <div class="bar" style="color:${m.barva}"><i style="width:${(s.mode.t / s.mode.total * 100).toFixed(1)}%"></i></div>`;
    } else if (s.wizard) {
      now.innerHTML = `<div class="name gold-t">FINALE!</div><div class="desc">Vse je vredno jackpot.</div>`;
    } else if (playing) {
      now.innerHTML = s.modeLit ? `<div class="desc">Misija <b style="color:${MODES[s.next].barva}">${MODES[s.next].ime}</b> čaka v livarni ${esc(CFG.imena.scoop)}.</div>`
        : s.wizardLit ? `<div class="desc gold-t">Finale prižgan — zadeni ${esc(CFG.imena.scoop)}!</div>`
        : `<div class="desc">Še ${s.rampsToMode}× rampa do naslednje misije.</div>`;
    } else now.innerHTML = `<div class="desc">Začni igro in zadeni ${esc(CFG.imena.scoop)}.</div>`;
    const st = (label, on, txt, cls) => `<span>${label}</span><span class="${on ? (cls || 'on') : 'off'}">${txt}</span>`;
    $('pState').innerHTML = [
      st('Lock', s.locks > 0 || s.lockLit, s.lockLit ? 'PRIŽGAN' : s.locks + ' / 2'),
      st('Multiball', s.multiball, s.multiball ? 'AKTIVEN' : '—', 'gold'),
      st('Jackpot', true, fmt(s.jackpot), 'gold'),
      st('Kickback', s.kickback, s.kickback ? 'DA' : 'NE'),
      st('Ball save', s.ballSave > 0, s.ballSave > 0 ? Math.ceil(s.ballSave) + ' s' : '—'),
      st('Extra ball', s.extraBalls > 0 || s.extraLit, s.extraLit ? 'PRIŽGAN' : s.extraBalls),
    ].join('');
  }
}

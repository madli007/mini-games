/* =====================================================================
   UI — zasloni (začetni, pavza, nastavitve, konec igre, lestvica),
   stranski paneli in obvestila. Besedila mize dobi iz view.ui.
   Lestvica je skupna lestvica huba (po uporabniku, engine/leaderboard.js).
   ===================================================================== */
import { QUALITY, QUALITY_ORDER, PHYSICS_VERSION, fmt } from './config.js';
import * as Store from './storage.js';
import * as Board from './leaderboard.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(app, view = {}) {
    this.app = app;               // { game, audio, renderer, settings, startGame, resume, quit, setQuality, ... }
    this.V = Object.assign({ title: 'PINBALL', version: '', subtitle: '', companies: '', hint: 'ENTER za začetek', legal: '',
      modes: [], modesTitle: 'NAČINI', wizard: null, state: () => [], idle: () => '', attract: () => '' }, view.ui || {});
    this.tableId = app.tableId || 'alu';
    this.ov = $('overlay');
    this.screen = 'none';
    this.dmdOverride = null;
    this.dispScore = 0;
    this.panelT = 0;
    this.lastSummary = '';
    this.buildModes();
    this.refreshBoards();
  }

  /* ---------------- pomožno ---------------- */
  open(html, name) {
    this.screen = name;
    this.ov.innerHTML = `<div class="card glass">${html}</div>`;
    requestAnimationFrame(() => { if (this.screen === name) this.ov.classList.add('show'); });   // zaprt v istem frame-u → ne prikaži
    const prim = this.ov.querySelector('.btn.primary');
    if (prim && !matchMedia('(pointer:coarse)').matches) setTimeout(() => prim.focus({ preventScroll: true }), 60);
    this.ov.querySelectorAll('.btn, .seg button').forEach(b => b.addEventListener('click', () => this.app.audio.play('click')));
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
    return `<ol class="board top3">${s.map(e => `<li class="${e.me ? 'me' : ''}"><span class="n">${Board.who(e)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')}</ol>`;
  }

  /* ---------------- zasloni ---------------- */
  showStart() {
    const V = this.V;
    const logo = V.logo ? `<img class="brand-logo" src="${esc(V.logo)}" alt="${esc(V.logoAlt || '')}" onerror="this.remove()">` : '';
    this.open(`
      ${logo}
      <h1 class="title">${esc(V.title)}</h1>
      ${V.version ? `<div class="title-ver">${esc(V.version)}</div>` : ''}
      ${V.subtitle ? `<div class="subtitle">${esc(V.subtitle)}</div>` : ''}
      ${V.companies ? `<div class="companies">${esc(V.companies)}</div>` : ''}
      <div class="btns">
        <button class="btn primary" id="uStart">ZAČNI IGRO</button>
        <div class="btn-row">
          <button class="btn" id="uScores">LESTVICA</button>
          <button class="btn" id="uSettings">NASTAVITVE</button>
        </div>
        ${V.help ? '<button class="btn" id="uHelp">? MAPA STRELOV</button>' : ''}
      </div>
      ${(V.links || []).length ? `<div class="btn-row">${V.links.map(l => `<a class="btn" href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>` : ''}
      <div id="uTop">${this.topHtml()}</div>
      ${this.controlsHtml()}
      <div class="hint">${esc(V.hint)}</div>
      ${V.legal ? `<div class="legal">${esc(V.legal)}</div>` : ''}
      <a class="hub-back" href="../../">← MINI GAMES HUB</a>`, 'start');
    this.on('uStart', () => this.app.startGame());
    this.on('uScores', () => this.showScores('start'));
    this.on('uSettings', () => this.showSettings('start'));
    this.on('uHelp', () => this.showHelp('start'));
  }

  /**
   * pomoč »?«: prekrivna mapa strelov (vsi veliki streli s puščicami in imeni) + legenda barv vstavkov.
   * view.ui.help = { legend: [[barva, besedilo], …], note } — streli in barve so iz T.shots (color, label).
   */
  showHelp(back) {
    const T = this.app.game.T, H = this.V.help || {}, o = T.outline;
    const fl = T.flippers.filter(f => f.layer === 0);
    const low = Math.max(...fl.map(f => f.py));
    const base = fl.filter(f => f.py >= low - 1);
    const fx = base.reduce((a, f) => a + f.px, 0) / (base.length || 1), fy = low - 30;
    const shots = T.shots.filter(sh => !sh.minor);
    const arrows = shots.map((sh, i) => {
      const c = sh.color || '#ffffff', from = sh.from || [fx, fy];
      const lx = sh.labelX ?? sh.x, ly = sh.labelY ?? (sh.y - 16);
      return `<line x1="${from[0]}" y1="${from[1]}" x2="${sh.x}" y2="${sh.y}" stroke="${c}" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#hm${i})" opacity=".85"/>
        <marker id="hm${i}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>
        <circle cx="${sh.x}" cy="${sh.y}" r="9" fill="none" stroke="${c}" stroke-width="2"/>
        <text x="${lx}" y="${ly}" fill="#fff" stroke="#000" stroke-width="5" paint-order="stroke" font-size="30" font-weight="800" text-anchor="middle" font-family="Rajdhani, Segoe UI, sans-serif">${esc(sh.label)}</text>`;
    }).join('');
    const flips = T.flippers.map(f => {
      const tx = f.px + Math.cos(f.rest) * f.len, ty = f.py + Math.sin(f.rest) * f.len;
      return `<line x1="${f.px}" y1="${f.py}" x2="${tx}" y2="${ty}" stroke="#e8eef6" stroke-width="12" stroke-linecap="round"/>`;
    }).join('');
    const legend = (H.legend || []).map(([c, t]) => `<span class="lg"><i style="background:${c}"></i>${esc(t)}</span>`).join('');
    this.open(`
      <div class="h2">MAPA STRELOV</div>
      <svg class="shotmap" viewBox="0 0 600 1000" role="img" aria-label="Mapa strelov">
        <path d="M${o.x1},1000 L${o.x1},${o.cy} A${o.r},${o.r} 0 0 1 ${o.x2},${o.cy} L${o.x2},1000 Z" fill="rgba(20,40,80,.55)" stroke="rgba(255,214,102,.7)" stroke-width="4"/>
        ${flips}${arrows}
      </svg>
      ${legend ? `<div class="legend">${legend}</div>` : ''}
      ${H.note ? `<div class="hint">${esc(H.note)}</div>` : ''}
      <button class="btn primary" id="uBack">NAZAJ</button>`, 'help');
    this.on('uBack', () => back === 'pause' ? this.showPause() : this.showStart());
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
        ${this.V.help ? '<button class="btn" id="uHelp">? MAPA STRELOV</button>' : ''}
      </div>
      ${this.controlsHtml()}`, 'pause');
    this.on('uResume', () => this.app.resume());
    this.on('uSettings', () => this.showSettings('pause'));
    this.on('uQuit', () => this.app.quit());
    this.on('uHelp', () => this.showHelp('pause'));
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
        ${(this.V.toggles || []).map(t => `<div class="toggle"><span>${esc(t.label)}</span><input type="checkbox" data-tg="${esc(t.id)}" ${(s[t.id] ?? t.def) ? 'checked' : ''}></div>`).join('')}
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
    this.ov.querySelectorAll('[data-tg]').forEach(i => i.addEventListener('change', e => this.app.setToggle(i.dataset.tg, e.target.checked)));
    this.on('uBack', () => back === 'pause' ? this.showPause() : this.showStart());
  }

  /**
   * lestvica: zavihki »Ta verzija« (seed trenutne fizike), »Prejšnje verzije«, »Arhiv (pred portalom)«
   * (samo Alu: stara tabela scores z inicialkami, samo branje)
   */
  showScores(back) {
    const st = Store.loadStats(this.tableId);
    const prev = Board.previousSeeds();
    const tabs = [{ id: 'now', label: 'Ta verzija (f' + PHYSICS_VERSION + ')' }];
    if (prev.length) tabs.push({ id: 'prev', label: 'Prejšnje verzije' });
    if (this.V.archive) tabs.push({ id: 'arch', label: 'Arhiv (pred portalom)' });
    const mins = Math.round(st.playSec / 60);
    this.open(`
      <div class="h2 gold-t">LESTVICA</div>
      <div class="seg tabs" id="uTabs">${tabs.map((t, i) => `<button data-t="${t.id}" class="${i ? '' : 'on'}">${esc(t.label)}</button>`).join('')}</div>
      <div id="uBoard" class="hub-board"></div>
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
    const show = id => {
      this.ov.querySelectorAll('#uTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
      const el = $('uBoard'); if (!el) return;
      const { ui } = Board.hubApi();
      if (id === 'arch') {
        el.innerHTML = '<div class="hint">nalagam arhiv …</div>';
        Board.archive().then(rows => {
          if (!$('uBoard')) return;
          el.innerHTML = rows === null ? '<div class="hint">Arhiv je na voljo le s povezavo do strežnika (ne v offline načinu).</div>'
            : rows.length ? `<ol class="board">${rows.map(e => `<li><span class="n">${esc(e.name)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')}</ol>
              <div class="hint">Stara lestvica z inicialkami (pred portalom). Samo za branje.</div>`
              : '<div class="hint">Arhiv je prazen.</div>';
        });
        return;
      }
      if (!ui) { el.innerHTML = '<div class="hint">Lestvica ni dosegljiva.</div>'; return; }
      const fmtS = s => fmt(s);
      if (id === 'now') ui.leaderboard(el, { seed: Board.seed(), title: '', periods: ['all', 'week', 'today'], format: fmtS });
      else ui.leaderboard(el, { tabs: prev.map(p => ({ label: p.label, seed: p.seed })), title: '', format: fmtS });
    };
    this.ov.querySelectorAll('#uTabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
    Board.whenReady().then(() => { if (this.screen === 'scores') show('now'); });
    this.on('uBack', () => back === 'over' ? this.app.startGame() : this.showStart());
    this.on('uMenu', () => this.showStart());
  }

  /** konec igre; rezultat se samodejno shrani na lestvico huba pod uporabnikom */
  showGameOver(d) {
    const V = this.V;
    const nModes = V.modes.length;
    this.open(`
      <div class="h2">KONEC IGRE</div>
      <div class="big">${fmt(d.score)}</div>
      <div class="rank" id="uRank">&nbsp;</div>
      <div class="stats-grid" style="text-align:left;max-width:300px;margin:10px auto">
        ${nModes ? `<span>Opravljene misije</span><span>${d.modes || 0} / ${nModes}</span>` : ''}
        <span>Najdaljši combo</span><span>×${d.maxCombo}</span>
        <span>Največji jackpot</span><span>${fmt(d.maxJackpot)}</span>
        <span>Trajanje</span><span>${Math.floor(d.playSec / 60)}:${String(Math.floor(d.playSec % 60)).padStart(2, '0')}</span>
        ${d.match ? `<span>Match</span><span>${String(d.match.num).padStart(2, '0')}${d.match.hit ? ' · MATCH!' : ''}</span>` : ''}
      </div>
      <div id="uSave"></div>
      <div class="btns">
        <button class="btn primary" id="uAgain">ŠE ENKRAT</button>
        <div class="btn-row"><button class="btn" id="uScores">LESTVICA</button><button class="btn" id="uMenu">MENI</button></div>
      </div>`, 'over');
    this.on('uAgain', () => this.app.startGame());
    this.on('uScores', () => this.showScores('over'));
    this.on('uMenu', () => this.showStart());
    this.saveScore(d);
  }

  async saveScore(d) {
    const box = () => $('uSave'), rank = () => $('uRank');
    if (d._saved) return;
    if (this.app.debug) { if (box()) box().innerHTML = '<div class="hint">Debug način: rezultat se ne shrani na lestvico.</div>'; return; }
    if (!Board.hasProfile()) {
      await Board.whenReady();
      if (!Board.hasHub()) { if (box()) box().innerHTML = '<div class="hint">Lestvica ni dosegljiva.</div>'; return; }
      if (!Board.hasProfile()) {
        if (box()) {
          box().innerHTML = '<button class="btn" id="uProfile">SHRANI NA LESTVICO</button><div class="hint">Za lestvico potrebuješ vzdevek (profil huba).</div>';
          this.on('uProfile', async () => {
            if (await Board.ensureProfile()) this.saveScore(d);
          });
        }
        return;
      }
    }
    d._saved = true;
    if (box()) box().innerHTML = '<div class="hint">shranjujem na lestvico …</div>';
    const r = await Board.submit(d);
    Board.report(d);
    this.refreshBoards(r.rank);
    if (!box()) return;
    if (r.ok) {
      box().innerHTML = '';
      if (rank()) rank().textContent = r.rank >= 0 ? (r.rank + 1) + '. MESTO NA LESTVICI' : 'shranjeno na lestvico';
      if (r.rank >= 0) this.app.audio.play('highScore');
    } else box().innerHTML = '<div class="hint">Rezultata ni bilo mogoče shraniti.</div>';
  }

  /** tipke v menijih; vrne true, če je tipko porabil meni */
  menuKey(e) {
    if (this.screen === 'start' && (e.code === 'Space' || e.code === 'Enter') && document.activeElement?.tagName !== 'BUTTON') {
      if (!e.repeat) this.app.startGame(); return true;
    }
    return false;
  }
  menuPad() { return false; }
  get blocking() { return this.screen !== 'none'; }

  /* ---------------- stranski paneli ---------------- */
  buildModes() {
    const V = this.V, ul = $('pModes');
    const h = $('pModesTitle'); if (h) h.textContent = V.modesTitle;
    ul.innerHTML = V.modes.map((m, i) => `<li id="pm${i}" style="color:${m.color}"><span class="dot"></span><span>${esc(m.name)}</span><small></small></li>`).join('')
      + (V.wizard ? `<li id="pmW" class="wiz" style="color:${this.app.game.PAL.gold}"><span class="dot"></span><span>${esc(V.wizard.name)}</span><small>${esc(V.wizard.short)}</small></li>` : '');
  }

  refreshBoards(highlight = -1) {
    const s = Board.scores();
    const ttl = $('pBoardTitle'); if (ttl) ttl.textContent = 'LESTVICA · f' + PHYSICS_VERSION;
    $('pBoard').innerHTML = s.length ? s.map((e, i) => `<li class="${i === highlight ? 'new' : ''}${e.me ? ' me' : ''}"><span class="n">${Board.who(e)}</span><span class="s">${fmt(e.score)}</span></li>`).join('')
      : '<li class="empty"><span></span><span>Še ni rezultatov</span><span></span></li>';
    const st = Store.loadStats(this.tableId);
    $('pStats').innerHTML = `
      <span>Iger</span><span>${st.games}</span>
      <span>Rekord</span><span>${fmt(st.bestScore)}</span>
      <span>Najdaljši combo</span><span>×${st.maxCombo}</span>
      <span>Največji jackpot</span><span>${fmt(st.maxJackpot)}</span>`;
  }

  update(dt, game) {
    const s = game.summary(), V = this.V;
    this.dispScore += (s.score - this.dispScore) * Math.min(1, dt * 7);
    if (Math.abs(s.score - this.dispScore) < 5) this.dispScore = s.score;
    if (!document.body.classList.contains('wide')) return;
    const sc = fmt(this.dispScore);
    const e = $('pScore'); if (e.textContent !== sc) e.textContent = sc;
    this.panelT -= dt;
    if (this.panelT > 0) return;
    this.panelT = 0.12;
    const key = JSON.stringify([s.state, s.ball, s.mult, s.modesDone, s.modeLit, s.mode && [s.mode.i, Math.ceil(s.mode.t), s.mode.prog, s.mode.value],
      s.next, s.locks, s.lockLit, s.kickback, Math.ceil(s.ballSave), s.extraBalls, s.extraLit, s.multiball, s.wizard, s.wizardLit, s.jackpot, s.rampsToMode, s.panelKey]);
    if (key === this.lastSummary) return;
    this.lastSummary = key;
    const playing = s.state === 'play' || s.state === 'bonus';
    $('pBall').textContent = playing ? s.ball + ' / ' + s.balls : '–';
    $('pMult').textContent = '×' + s.mult;
    V.modes.forEach((m, i) => {
      const li = $('pm' + i);
      if (!li) return;
      const run = s.mode && s.mode.i === i, done = s.modesDone && s.modesDone[i], lit = s.modeLit && s.next === i && !s.mode;
      li.className = run ? 'run' : done ? 'done' : lit ? 'lit' : '';
      li.querySelector('small').textContent = run ? Math.ceil(s.mode.t) + ' s' : done ? '✓' : lit ? 'PRIŽGANA' : '';
    });
    const w = $('pmW');
    if (w) w.className = 'wiz ' + (s.wizard ? 'run' : s.wizardLit ? 'lit' : '');
    const now = $('pModeNow');
    if (s.mode) {
      const m = V.modes[s.mode.i] || { name: s.mode.name, color: s.mode.color, desc: '' };
      const prog = s.mode.info ? s.mode.info.toLowerCase() : s.mode.prog + ' / ' + s.mode.goal + (m.unit || '');
      now.innerHTML = `<div class="name" style="color:${m.color}">${esc(m.full || m.name)}</div><div class="desc">${esc(m.desc || '')} · ${esc(prog)}</div>
        <div class="bar" style="color:${m.color}"><i style="width:${(s.mode.t / s.mode.total * 100).toFixed(1)}%"></i></div>`;
    } else if (s.wizard && V.wizard) {
      now.innerHTML = `<div class="name gold-t">${esc(V.wizard.live)}</div><div class="desc">${esc(V.wizard.liveDesc)}</div>`;
    } else if (playing) {
      now.innerHTML = `<div class="desc">${V.idle(s, esc)}</div>`;
    } else now.innerHTML = `<div class="desc">${V.attract(esc)}</div>`;
    const st = (label, on, txt, cls) => `<span>${esc(label)}</span><span class="${on ? (cls || 'on') : 'off'}">${esc(txt)}</span>`;
    $('pState').innerHTML = V.state(s, fmt).map(r => st(...r)).join('');
  }
}

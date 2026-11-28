/* =====================================================================
   GNEČA — render/lane.js: steza, okolica, top, sovražni stolp, vrata
   (prosojne plošče z napisom iz canvas teksture), ovire in stolpiči.
   Svet: x = x simulacije, z = −z simulacije (top pri z = 0).
   ===================================================================== */
import * as THREE from 'three';
import { B } from '../balance.js';
import { gateLabel, gateGood } from '../level.js';
import { SIDE } from './looks.js';

/* ------------------------------------------------------------ teksture */

function laneTexture(look, W, L) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = look.lane[0]; g.fillRect(0, 0, 256, 1024);
  // pasovi in pesek/kamenčki
  for (let k = 0; k < 32; k++) { g.fillStyle = k % 2 ? look.lane[1] : look.lane[0]; g.fillRect(0, k * 32, 256, 32); }
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '90,50,20'},${0.05 + rnd() * 0.08})`;
    g.fillRect(rnd() * 256, rnd() * 1024, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  // robni črti
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(6, 0, 5, 1024); g.fillRect(245, 0, 5, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, Math.max(1, Math.round(L / 20)));
  t.anisotropy = 4;
  void W;
  return t;
}

/** Napis na vratih ali nad stolpom (canvas tekstura). */
export function labelTexture(text, { w = 256, h = 128, color = '#fff', bg = null, font = 900 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  drawLabel(c, text, { color, bg, font });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function drawLabel(c, text, { color = '#fff', bg = null, font = 900, size = 0.62 } = {}) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 18); g.fill(); }
  g.font = `${font} ${Math.round(c.height * size)}px system-ui, "Segoe UI", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = c.height * 0.08; g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineJoin = 'round';
  g.strokeText(text, c.width / 2, c.height * 0.54);
  g.fillStyle = color; g.fillText(text, c.width / 2, c.height * 0.54);
}

/** Sprite s številko (HP nad velikanom, stolpom). */
export class Tag {
  constructor(parent, { w = 128, h = 48, scale = 1, color = '#fff', bg = 'rgba(10,12,30,.7)' } = {}) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.sp.scale.set(scale * w / h, scale, 1);
    this.sp.renderOrder = 20;
    this.color = color; this.bg = bg; this.text = null;
    parent.add(this.sp);
  }
  set(text, color = this.color) {
    if (text === this.text && color === this._col) return;
    this.text = text; this._col = color;
    drawLabel(this.c, text, { color, bg: this.bg, font: 800, size: 0.66 });
    this.tex.needsUpdate = true;
  }
  dispose() { this.sp.removeFromParent(); this.tex.dispose(); this.sp.material.dispose(); }
}

/* ------------------------------------------------------------ gradnja */

export function buildLane(L, look, { shadows = true, decor = 1 } = {}) {
  const root = new THREE.Group();
  const W = L.width, Ln = L.length, hw = W / 2;
  const disposables = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); disposables.push(m); return m; };
  const geo = g => { disposables.push(g); return g; };

  // tla okolice
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(260, 260)), mat({ color: look.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.06, -Ln / 2); ground.receiveShadow = shadows;
  root.add(ground);
  // steza
  const tex = laneTexture(look, W, Ln + 10); disposables.push(tex);
  const lane = new THREE.Mesh(geo(new THREE.PlaneGeometry(W, Ln + 10)), mat({ map: tex, roughness: 0.92 }));
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0, -Ln / 2 + 1); lane.receiveShadow = shadows;
  root.add(lane);
  // robniki
  const curbMat = mat({ color: look.edge, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(geo(new THREE.BoxGeometry(0.35, 0.35, Ln + 10)), curbMat);
    curb.position.set(s * (hw + 0.17), 0.17, -Ln / 2 + 1); curb.castShadow = shadows; curb.receiveShadow = shadows;
    root.add(curb);
  }

  // okras: kaktusi / skale (puščava) ali visoke stene in mize (kanjon)
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rockMat = mat({ color: look.rock, roughness: 0.95, flatShading: true });
  if (look.deco === 'mesa') {
    for (const s of [-1, 1]) {
      for (let z = 6; z > -Ln - 30; z -= 7) {
        const h = 6 + rnd() * 9, w = 4 + rnd() * 5;
        const m = new THREE.Mesh(geo(new THREE.CylinderGeometry(w * 0.45, w * 0.6, h, 6)), rockMat);
        m.position.set(s * (hw + 3 + w * 0.4 + rnd() * 6), h / 2 - 0.1, z + rnd() * 3);
        m.rotation.y = rnd() * 3;
        m.castShadow = shadows && rnd() < 0.5; m.receiveShadow = shadows;
        root.add(m);
      }
    }
  } else {
    const cactMat = mat({ color: '#4f8a3c', roughness: 0.8 });
    const nDeco = Math.round(26 * decor);
    for (let k = 0; k < nDeco; k++) {
      const s = rnd() < 0.5 ? -1 : 1, x = s * (hw + 1.6 + rnd() * 12), z = 6 - rnd() * (Ln + 40);
      if (rnd() < 0.55) {
        const cg = new THREE.Group();
        const h = 1.2 + rnd() * 1.6;
        const trunk = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.22, h, 3, 8)), cactMat); trunk.position.y = h / 2 + 0.2; cg.add(trunk);
        for (const a of [-1, 1]) if (rnd() < 0.7) {
          const arm = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.14, 0.5, 3, 6)), cactMat);
          arm.position.set(a * 0.36, h * (0.45 + rnd() * 0.3), 0); cg.add(arm);
        }
        cg.position.set(x, 0, z); cg.traverse(o => { o.castShadow = shadows; });
        root.add(cg);
      } else {
        const r = 0.4 + rnd() * 1.2;
        const m = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(r, 0)), rockMat);
        m.position.set(x, r * 0.4, z); m.rotation.set(rnd(), rnd(), rnd()); m.castShadow = shadows;
        root.add(m);
      }
    }
  }

  /* --- top --- */
  const cannon = new THREE.Group();
  const cMat = mat({ color: SIDE.me.cannon, roughness: 0.4, metalness: 0.3 });
  const darkMat = mat({ color: '#1d2a44', roughness: 0.5, metalness: 0.4 });
  const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 18)), darkMat); base.position.y = 0.25; cannon.add(base);
  const body = new THREE.Mesh(geo(new THREE.SphereGeometry(0.62, 18, 12)), cMat); body.position.y = 0.75; cannon.add(body);
  const barrel = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.26, 0.34, 1.4, 14)), cMat);
  barrel.rotation.x = Math.PI / 2 - 0.25; barrel.position.set(0, 0.95, -0.7); cannon.add(barrel);
  const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(0.28, 0.07, 8, 16)), darkMat); rim.position.set(0, 1.12, -1.36); rim.rotation.x = -0.25; cannon.add(rim);
  cannon.traverse(o => { o.castShadow = shadows; });
  cannon.position.set(0, 0, 0.4);
  root.add(cannon);

  /* --- sovražni stolp --- */
  const tower = new THREE.Group();
  const tMat = mat({ color: SIDE.en.tower, roughness: 0.7 });
  const tDark = mat({ color: '#5a1e16', roughness: 0.8 });
  const big = L.boss ? 1.55 : 1;
  const tw = Math.min(W - 1, 4.2) * big;
  const body2 = new THREE.Mesh(geo(new THREE.BoxGeometry(tw, 4.2 * big, 2.4)), tMat); body2.position.y = 2.1 * big; tower.add(body2);
  for (let k = 0; k < 5; k++) {
    const cr = new THREE.Mesh(geo(new THREE.BoxGeometry(tw / 7, 0.6 * big, 2.5)), tMat);
    cr.position.set(-tw / 2 + tw / 14 + k * (tw / 4 - tw / 28), 4.5 * big, 0); tower.add(cr);
  }
  const door = new THREE.Mesh(geo(new THREE.BoxGeometry(tw * 0.42, 1.8 * big, 0.1)), tDark); door.position.set(0, 0.9 * big, 1.21); tower.add(door);
  const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.1, 0.7)), mat({ color: '#ffd23f', side: THREE.DoubleSide }));
  flag.position.set(0.55, 6.1 * big, 0); tower.add(flag);
  const pole = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.05, 0.05, 1.8)), darkMat); pole.position.set(0, 5.6 * big, 0); tower.add(pole);
  tower.traverse(o => { o.castShadow = shadows; o.receiveShadow = shadows; });
  tower.position.set(0, 0, -Ln - 0.6);
  root.add(tower);
  const towerTag = new Tag(tower, { scale: 1.1 * big });
  towerTag.sp.position.set(0, 7.3 * big, 0);

  /* --- vrata --- */
  const gates = L.gates.map(g => {
    const grp = new THREE.Group();
    const good = gateGood(g.op, g.v);
    const pm = new THREE.MeshBasicMaterial({ color: good ? '#38d9ff' : '#ff4d5e', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(geo(new THREE.PlaneGeometry(g.w, 1.7)), pm); panel.position.y = 0.85; grp.add(panel);
    const lt = labelTexture(gateLabel(g.op, g.v), { bg: good ? 'rgba(10,120,170,.92)' : 'rgba(190,30,50,.92)' });
    const lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const label = new THREE.Mesh(geo(new THREE.PlaneGeometry(Math.min(g.w, 2.6), Math.min(g.w, 2.6) / 2)), lm); label.position.set(0, 1.05, 0.02); grp.add(label);
    const postMat = mat({ color: good ? '#1aa8d8' : '#d8323f', roughness: 0.4, metalness: 0.2 });
    for (const s of [-1, 1]) { const post = new THREE.Mesh(geo(new THREE.BoxGeometry(0.16, 1.9, 0.16)), postMat); post.position.set(s * g.w / 2, 0.95, 0); post.castShadow = shadows; grp.add(post); }
    const top = new THREE.Mesh(geo(new THREE.BoxGeometry(g.w + 0.16, 0.14, 0.18)), postMat); top.position.y = 1.86; grp.add(top);
    grp.position.set(g.x, 0, -g.z);
    root.add(grp);
    disposables.push(pm, lm, lt);
    return { grp, pm, lm, lt, postMat, text: gateLabel(g.op, g.v), good, panel, pulse: 0 };
  });

  /* --- ovire --- */
  const obst = L.obstacles.map(o => {
    let m;
    if (o.type === 'fence') {
      m = new THREE.Group();
      const wood = mat({ color: '#8a5a32', roughness: 0.9 });
      const rail = new THREE.Mesh(geo(new THREE.BoxGeometry(o.w, 0.18, 0.12)), wood); rail.position.y = 0.55; m.add(rail);
      const rail2 = rail.clone(); rail2.position.y = 0.28; m.add(rail2);
      for (let k = 0; k <= Math.round(o.w / 0.8); k++) { const p = new THREE.Mesh(geo(new THREE.BoxGeometry(0.14, 0.8, 0.14)), wood); p.position.set(-o.w / 2 + k * (o.w / Math.round(o.w / 0.8)), 0.4, 0); m.add(p); }
    } else if (o.type === 'roller') {
      m = new THREE.Group();
      const steel = mat({ color: '#6e7480', roughness: 0.35, metalness: 0.8 });
      const drum = new THREE.Mesh(geo(new THREE.CylinderGeometry(o.d / 2, o.d / 2, o.w, 18)), steel); drum.rotation.z = Math.PI / 2; drum.position.y = o.d / 2; m.add(drum);
      const stripe = mat({ color: '#ffcf3a', roughness: 0.5 });
      // rumene letve vzdolž valja (lokalna os y valja je njegova dolžina)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const sp = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12, o.w + 0.04, 0.12)), stripe);
        sp.position.set(Math.cos(a) * o.d / 2, 0, Math.sin(a) * o.d / 2);
        drum.add(sp);
      }
      m.userData.drum = drum;
    } else {
      m = new THREE.Group();
      const blade = new THREE.Mesh(geo(new THREE.CylinderGeometry(o.r, o.r, 0.06, 24)), mat({ color: '#c9ced8', roughness: 0.25, metalness: 0.9 }));
      blade.position.y = 0.32; m.add(blade);
      const teethMat = mat({ color: '#e8ecf2', roughness: 0.2, metalness: 0.9 });
      for (let k = 0; k < 12; k++) {
        const tth = new THREE.Mesh(geo(new THREE.ConeGeometry(0.11, 0.26, 4)), teethMat);
        const a = (k / 12) * Math.PI * 2; tth.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r); tth.rotation.set(0, -a, -Math.PI / 2); blade.add(tth);
      }
      const hub2 = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.15, 0.2, 0.36, 10)), mat({ color: '#d8323f' })); hub2.position.y = 0.16; m.add(hub2);
      const slot = new THREE.Mesh(geo(new THREE.BoxGeometry((o.amp || 0) * 2 + o.r * 2 + 0.2, 0.02, 0.22)), mat({ color: '#3a2a20' })); slot.position.y = 0.01; m.add(slot);
      m.userData.blade = blade; m.userData.slot = slot;
    }
    m.traverse(c => { c.castShadow = shadows; });
    m.position.set(o.x, 0, -o.z);
    root.add(m);
    return m;
  });

  /* --- stolpiči ob stezi --- */
  const turrets = L.turrets.map(t => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.5, 0.62, 0.9, 12)), mat({ color: '#6a2a20', roughness: 0.8 })); b.position.y = 0.45; g.add(b);
    const head = new THREE.Group(); head.position.y = 1.05; g.add(head);
    const hb = new THREE.Mesh(geo(new THREE.BoxGeometry(0.62, 0.4, 0.62)), mat({ color: SIDE.en.tower, roughness: 0.6 })); head.add(hb);
    const gun = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 8)), darkMat); gun.rotation.x = Math.PI / 2; gun.position.z = 0.45; head.add(gun);
    g.traverse(c => { c.castShadow = shadows; });
    g.position.set(t.x, 0, -t.z);
    root.add(g);
    const tag = new Tag(g, { scale: 0.55 }); tag.sp.position.y = 1.9;
    return { g, head, tag, alive: true, fall: 0 };
  });

  return {
    root, cannon, barrel, tower, towerTag, gates, obst, turrets,
    towerFall: 0, towerHit: 0,
    update(st, t, dt) {
      cannon.position.x = st.cannon.x;
      barrel.position.z = -0.7 + Math.max(0, this.kick || 0) * 0.25;
      this.kick = Math.max(0, (this.kick || 0) - dt * 6);
      // stolp: tresenje ob zadetku, padec ob zmagi
      this.towerHit = Math.max(0, this.towerHit - dt * 4);
      if (st.over?.won) this.towerFall = Math.min(1, this.towerFall + dt * 0.7);
      tower.position.x = Math.sin(t * 60) * this.towerHit * 0.12;
      tower.position.y = -this.towerFall * 5 * big;
      tower.rotation.z = this.towerFall * 0.25;
      const hp = Math.max(0, Math.ceil(st.tower.hp));
      towerTag.set(hp > 0 ? '🏰 ' + hp : '💥', hp / st.tower.max < 0.3 ? '#ff8a8a' : '#ffffff');
      // vrata
      for (let k = 0; k < gates.length; k++) {
        const G = gates[k], g = st.gates[k];
        G.grp.position.x = g.x;
        const text = gateLabel(g.op, g.v) + (g.op === '+' || g.op === '-' ? '' : '');
        if (text !== G.text) {
          G.text = text;
          const good = gateGood(g.op, g.v);
          drawLabel(G.lt.image, text, { bg: good ? 'rgba(10,120,170,.92)' : g.op === 'x' ? 'rgba(90,96,120,.92)' : 'rgba(190,30,50,.92)' }); G.lt.needsUpdate = true;
          G.pm.color.set(good ? '#38d9ff' : g.op === 'x' ? '#9aa3b8' : '#ff4d5e');
        }
        G.pulse = Math.max(0, G.pulse - dt * 3);
        const target = g.spent ? 0.06 : 0.3 + G.pulse * 0.4;
        G.pm.opacity += (target - G.pm.opacity) * Math.min(1, dt * 8);
        G.lm.opacity = g.spent ? Math.max(0.15, G.lm.opacity - dt * 2) : 1;
      }
      // ovire
      for (let k = 0; k < obst.length; k++) {
        const o = st.obstacles[k], m = obst[k];
        m.position.x = o.x;
        if (m.userData.drum) m.userData.drum.rotation.x = -o.ang;
        if (m.userData.blade) { m.userData.blade.rotation.y = o.ang; if (m.userData.slot) m.userData.slot.position.x = o.x0 - o.x; }
      }
      // stolpiči
      for (let k = 0; k < turrets.length; k++) {
        const T = turrets[k], s = st.turrets[k];
        if (s.alive) {
          T.head.rotation.y = Math.atan2(s.aimX - s.x, -(s.aimZ - s.z)) + Math.PI;
          T.tag.set('' + Math.max(0, Math.ceil(s.hp)));
        } else {
          T.fall = Math.min(1, T.fall + dt * 2);
          T.g.scale.y = 1 - T.fall * 0.8; T.g.rotation.z = T.fall * 0.4;
          T.tag.sp.visible = false;
        }
      }
    },
    dispose() {
      towerTag.dispose(); turrets.forEach(t => t.tag.dispose());
      root.removeFromParent();
      disposables.forEach(d => d.dispose?.());
    },
  };
}

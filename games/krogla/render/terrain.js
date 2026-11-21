/* =====================================================================
   HRČKOVA KROGLA — render/terrain.js: teren proge.
   Ploščice iz višinskega polja fizike (rob na zaslonu = rob v fiziki),
   ločene mreže po vrsti podlage (PBR), vnaprej izračunan AO v vertex
   barvah, gladke normale, zaobljen svetel rob proge (instanciran) in
   detajli stranic/spodnjice glede na lokacijo.
   ===================================================================== */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P, TILE, tileTop, tileIndex } from '../physics.js';
import { surface, cracks } from './textures.js';
import { surfaceMaterial, withFade } from './materials.js';

const col = c => new THREE.Color(c);
/** Vrste tekstur, ki imajo že svojo barvo — tema jih le rahlo obarva. */
const COLORED = new Set(['turf', 'wood', 'hedge', 'soil', 'brass', 'glue', 'hazard', 'basalt', 'iceRock', 'conveyor', 'girder', 'rust', 'stone', 'cloudstone']);
export const tintFor = (kind, c) => COLORED.has(kind) ? col(c).lerp(col('#ffffff'), 0.72) : col(c);

/** Barve robov (emisivni pas) po slogu lokacije. */
const EDGE_GLOW = { warm: 1.1, cool: 1.2, hazard: 1.3, neon: 3.2 };

export function buildTerrain({ L, w, th, look, q, parent }) {
  const g = w.g;
  const out = { meshes: [], convTex: [], fallMeshes: [], dispose: [] };
  const add = m => { parent.add(m); out.meshes.push(m); return m; };
  const ice = !!w.mods.ice;

  // višina površja (za AO): ploščice + trdni kvadri
  const topAt = (x, z) => {
    const i = tileIndex(w, x, z);
    let h = i >= 0 ? tileTop(w, i, x, z) : -Infinity;
    for (const b of L.blocks || []) if (x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d) h = Math.max(h, b.y1);
    for (const d of L.doors || []) if (x >= d.x && x <= d.x + d.w && z >= d.z && z <= d.z + d.d) h = Math.max(h, d.y + (d.h || 1.2));
    return h;
  };
  const AO_DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2), Math.sin(k / 8 * Math.PI * 2)]);
  const aoAt = (x, y, z) => {
    let occ = 0;
    for (const [dx, dz] of AO_DIRS) {
      const h1 = topAt(x + dx * 0.22, z + dz * 0.22), h2 = topAt(x + dx * 0.5, z + dz * 0.5);
      occ += (h1 > y + 0.18 ? 0.6 : 0) + (h2 > y + 0.25 ? 0.4 : 0);
    }
    return 1 - Math.min(1, occ / 8) * 0.62;
  };

  /* ------------------------------------------------ zgornje ploskve po vrsti */
  const bufs = {};
  const buf = k => bufs[k] || (bufs[k] = { pos: [], nrm: [], col: [], uv: [] });
  const conv = { pos: [], nrm: [], col: [], uv: [] };
  const sides = { pos: [], nrm: [], col: [], uv: [] }, wallSides = { pos: [], nrm: [], col: [], uv: [] };
  const edges = [];
  const fallTiles = [];
  const keyOf = t => t === TILE.ice ? 'ice' : t === TILE.glue ? 'glue' : t === TILE.wall ? 'wall' : 'floor';
  const higherNear = (c, r, h) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const cc = c + dx, rr = r + dz;
      if (cc < 0 || rr < 0 || cc >= g.W || rr >= g.D) continue;
      const j = rr * g.W + cc, t = g.type[j];
      if (t === TILE.wall || (t !== TILE.void && t !== TILE.fall && g.h[j] > h + 0.3)) return true;
    }
    for (const b of L.blocks || []) if (b.x < c + 2 && b.x + b.w > c - 1 && b.z < r + 2 && b.z + b.d > r - 1) return true;
    return false;
  };
  const pushV = (b, p, n, c, uv) => { b.pos.push(p[0], p[1], p[2]); b.nrm.push(n[0], n[1], n[2]); b.col.push(c, c, c); b.uv.push(uv[0], uv[1]); };

  for (let r = 0; r < g.D; r++) for (let c = 0; c < g.W; c++) {
    const i = r * g.W + c;
    const t = g.type[i];
    if (t === TILE.void) continue;
    if (t === TILE.fall) { fallTiles.push(i); continue; }
    const H = (x, z) => tileTop(w, i, Math.min(c + 0.9999, Math.max(c + 0.0001, x)), Math.min(r + 0.9999, Math.max(r + 0.0001, z)));
    const nrmAt = (x, z) => {
      const e = 0.02;
      const dx = (H(x + e, z) - H(x - e, z)) / (2 * e), dz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      const l = Math.hypot(dx, 1, dz);
      return [-dx / l, 1 / l, -dz / l];
    };
    const bowl = (L.bowls || []).some(b => (b.x - c - 0.5) ** 2 + (b.z - r - 0.5) ** 2 < (b.r + 1) ** 2);
    const h0 = g.h[i];
    const n = (t === TILE.wave || bowl) ? 8 : (t !== TILE.wall && higherNear(c, r, h0)) ? 3 : 1;
    const checker = (c + r) % 2 ? 1 : 0.95;
    if (t === TILE.conveyor) {
      const dx = g.dx[i], dz = g.dz[i];
      const h = H(c + 0.5, r + 0.5) + 0.002;
      const P4 = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
      const uv = ([x, z]) => {
        const along = dx ? (x - c) * -dx : (z - r) * -dz;
        const across = dx ? (z - r) : (x - c);
        return [across, along];
      };
      const v = P4.map(([x, z]) => [x, h, z]);
      const uvs = P4.map(uv);
      const ao = P4.map(([x, z]) => aoAt(x, h, z));
      for (const k of [0, 2, 1, 0, 3, 2]) pushV(conv, v[k], [0, 1, 0], ao[k], uvs[k]);
    } else {
      const b = buf(keyOf(t));
      for (let a = 0; a < n; a++) for (let bb = 0; bb < n; bb++) {
        const x0 = c + a / n, x1 = c + (a + 1) / n, z0 = r + bb / n, z1 = r + (bb + 1) / n;
        const pts = [[x0, z0], [x1, z1], [x1, z0], [x0, z0], [x0, z1], [x1, z1]];
        for (const [x, z] of pts) {
          const y = H(x, z);
          const hs = 0.93 + 0.07 * Math.min(1, Math.max(0, (y - g.minH) / 6));
          const ao = t === TILE.wall ? 1 : aoAt(x, y, z);
          pushV(b, [x, y, z], nrmAt(x, z), checker * hs * ao, [x, z]);
        }
      }
    }
    // stranice
    const corners = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
    const myTops = corners.map(([x, z]) => H(x, z));
    const bottom = Math.min(...myTops) - (t === TILE.wall ? P.WALL_H + 0.6 : 0.6);
    const nbs = [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]];
    for (const [ox, oz, ia, ib] of nbs) {
      const j = (r + oz >= 0 && r + oz < g.D && c + ox >= 0 && c + ox < g.W) ? (r + oz) * g.W + c + ox : -1;
      const nt = j >= 0 ? g.type[j] : TILE.void;
      const open = nt === TILE.void || nt === TILE.fall;
      const nTop = k => {
        if (open) return -Infinity;
        const [x, z] = corners[k];
        const nc = c + ox, nr = r + oz;
        return tileTop(w, j, Math.min(nc + 0.9999, Math.max(nc + 0.0001, x)), Math.min(nr + 0.9999, Math.max(nr + 0.0001, z)));
      };
      const ta = myTops[ia], tb = myTops[ib];
      const ba = Math.max(nTop(ia), bottom), bb = Math.max(nTop(ib), bottom);
      if (ta - ba < 0.01 && tb - bb < 0.01) continue;
      const [xa, za] = corners[ia], [xb, zb] = corners[ib];
      const sb = t === TILE.wall ? wallSides : sides;
      const nn = [ox, 0, oz];
      const along = ox ? za : xa, along2 = ox ? zb : xb;
      // AO: temneje ob dnu (stik s spodnjimi tlemi), ob praznini le rahlo
      const aoB = open ? 0.55 : 0.42;
      const v = [[xa, ta, za, 1, along, ta], [xb, bb, zb, aoB, along2, bb], [xb, tb, zb, 1, along2, tb], [xa, ta, za, 1, along, ta], [xa, ba, za, aoB, along, ba], [xb, bb, zb, aoB, along2, bb]];
      for (const [x, y, z, a, u, vv] of v) pushV(sb, [x, y, z], nn, a, [u, vv]);
      if (open) edges.push([xa, ta, za, xb, tb, zb, ox, oz, t]);
    }
  }

  const mkGeo = b => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  };
  const mk = (b, mat, cast = true) => {
    if (!b.pos.length) return null;
    const m = new THREE.Mesh(mkGeo(b), mat);
    m.receiveShadow = true; m.castShadow = cast && q.shadows;
    return add(m);
  };

  const floorCol = ice ? col(th.floor || '#3ddc84').lerp(col('#d6f2ff'), 0.7) : tintFor(look.floor, look.tintFloor ? th.floor || '#3ddc84' : '#ffffff');
  const neon = look.floor === 'neon';
  const floorMat = surfaceMaterial(look.floor, {
    color: floorCol, vertexColors: true, fade: true, physical: ice || neon,
    emissive: neon ? th.edge || '#ff4fd8' : look.floor === 'basalt' ? '#ff5a1a' : null, emissiveIntensity: neon ? 1.8 : 1,
    extra: ice ? { clearcoat: 1, clearcoatRoughness: 0.05, roughness: 0.25 } : neon ? { clearcoat: 0.8, clearcoatRoughness: 0.1 } : ['metal', 'rust', 'hazard', 'brass'].includes(look.floor) ? { metalness: 0.45 } : {},
  });
  mk(bufs.floor || { pos: [] }, floorMat);
  // led: prava transmisija na visoki kakovosti (ior 1,31), sicer sijoča prosojna plast
  if (bufs.ice) {
    const s = surface('ice');
    const iceMat = withFade(new THREE.MeshPhysicalMaterial({
      color: '#d4f1ff', map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, roughness: 0.5, metalness: 0, vertexColors: true,
      clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.31, envMapIntensity: 1.3,
      ...(q.glass === 'real' ? { transmission: 0.55, thickness: 0.6, attenuationColor: new THREE.Color('#7fd0ff'), attenuationDistance: 1.2 } : { transparent: true, opacity: 0.9 }),
      emissive: '#5ab8ff', emissiveIntensity: 0.12,
    }));
    mk(bufs.ice, iceMat, false);
  }
  if (bufs.glue) {
    const s = surface('glue');
    mk(bufs.glue, withFade(new THREE.MeshPhysicalMaterial({
      color: '#d2ff5a', map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: s.ormMap, roughness: 1, metalness: 0, vertexColors: true,
      clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.4, sheenColor: new THREE.Color('#f0ffb0'), emissive: '#6a9a00', emissiveIntensity: 0.25,
    })));
  }
  const wallMat = surfaceMaterial(look.wall, { color: tintFor(look.wall, th.wall || '#ff4fd8'), vertexColors: true, fade: true, emissive: look.wall === 'darkmetal' ? th.wall || '#4de1ff' : null, emissiveIntensity: 2.2 });
  mk(bufs.wall || { pos: [] }, wallMat);
  mk(wallSides, wallMat);
  const sideMat = surfaceMaterial(look.side, {
    color: tintFor(look.side, th.side || '#1f6f4a'), vertexColors: true, fade: true,
    emissive: look.side === 'darkmetal' ? th.edge || '#ff4fd8' : look.side === 'basalt' ? '#ff5a1a' : null, emissiveIntensity: look.side === 'darkmetal' ? 1.6 : 1.4,
  });
  mk(sides, sideMat);
  if (conv.pos.length) {
    const s = surface('conveyor');
    const cl = t => { const x = t.clone(); x.userData = { cached: false }; x.needsUpdate = true; out.convTex.push(x); return x; };
    const mat = new THREE.MeshStandardMaterial({ map: cl(s.map), normalMap: cl(s.normalMap), roughnessMap: cl(s.ormMap), metalnessMap: cl(s.ormMap), emissiveMap: cl(s.emissiveMap), emissive: '#ffc61a', emissiveIntensity: 0.9, roughness: 1, metalness: 1, vertexColors: true });
    mk(conv, mat);
  }

  /* ------------------------------------------------ rob proge: zaobljen svetel profil + emisiven pas */
  if (edges.length) {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateZ(Math.PI / 2);
    const capG = new THREE.SphereGeometry(1, 10, 8);
    const edgeC = col(th.edge || '#ffffff');
    const glowK = EDGE_GLOW[look.edge] ?? 1.1;
    const trimMat = new THREE.MeshPhysicalMaterial({ color: edgeC.clone().lerp(col('#ffffff'), 0.25), roughness: 0.18, metalness: look.edge === 'neon' ? 0.2 : 0.65, clearcoat: 1, emissive: edgeC, emissiveIntensity: glowK * 0.55, envMapIntensity: 1.4 });
    const trim = new THREE.InstancedMesh(cyl, trimMat, edges.length);
    const caps = new THREE.InstancedMesh(capG, trimMat, edges.length);
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3(), dir = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    const RAD = 0.034;
    edges.forEach(([xa, ya, za, xb, yb, zb, ox, oz], k) => {
      // pomaknjeno navznoter za polmer, da zunanji rob profila ustreza robu v fiziki
      const ix = -ox * RAD * 0.6, iz = -oz * RAD * 0.6;
      pp.set((xa + xb) / 2 + ix, (ya + yb) / 2 + 0.004, (za + zb) / 2 + iz);
      dir.set(xb - xa, yb - ya, zb - za);
      const len = dir.length();
      qq.setFromUnitVectors(X, dir.normalize());
      trim.setMatrixAt(k, m4.compose(pp, qq, sc.set(len, RAD, RAD)));
      caps.setMatrixAt(k, m4.compose(pp.set(xa + ix, ya + 0.004, za + iz), qq.identity(), sc.set(RAD, RAD, RAD)));
    });
    trim.castShadow = false; caps.castShadow = false;
    add(trim); add(caps);
    out.trimMat = trimMat;
    detailUnder(edges, look, th, q, add);
  }

  /* ------------------------------------------------ padajoče ploščice: kristalne plošče z razpokami */
  if (fallTiles.length) {
    const geo = new RoundedBoxGeometry(0.96, 0.4, 0.96, 3, 0.06);
    const crackGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
    const s = surface('ice');
    out.fallMeshes = fallTiles.map(i => {
      const c = i % g.W, r = (i / g.W) | 0, h = g.h[i];
      const mat = new THREE.MeshPhysicalMaterial({ color: '#e6fbff', map: s.map, normalMap: s.normalMap, roughness: 0.12, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9, emissive: '#3a90c8', emissiveIntensity: 0.35, envMapIntensity: 1.4 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(c + 0.5, h - 0.2, r + 0.5);
      m.userData = { i, base: m.position.clone() };
      m.receiveShadow = true;
      const ck = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a7a').multiplyScalar(1.6), alphaMap: cracks(), transparent: true, opacity: 0, depthWrite: false }));
      ck.position.y = 0.203; m.add(ck); m.userData.crack = ck;
      add(m);
      return m;
    });
  }
  return out;
}

/** Detajli pod robom proge (nosilci, korenine/mah, ledeniki, neonski trakovi, vijaki). */
function detailUnder(edges, look, th, q, add) {
  const step = q.detail >= 2 ? 2 : 4;
  const picks = edges.filter((e, k) => k % step === 0 && e[8] !== TILE.wall);
  if (!picks.length) return;
  const style = { garden: 'roots', kitchen: 'brackets', crystal: 'crystal', factory: 'girders', tower: 'brackets', ice: 'icicles', arena: 'brackets', neon: 'neon', sky: 'puffs', inferno: 'girders' }[look.id] || 'brackets';
  let geo, mat;
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  if (style === 'roots' || style === 'icicles' || style === 'crystal') {
    geo = new THREE.ConeGeometry(1, 1, style === 'roots' ? 5 : 6, 1).rotateX(Math.PI).translate(0, -0.5, 0);
    mat = style === 'roots'
      ? new THREE.MeshStandardMaterial({ color: '#3f5a22', roughness: 0.9 })
      : new THREE.MeshPhysicalMaterial({ color: style === 'icicles' ? '#d8f4ff' : '#bfe8ff', roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85, emissive: '#5ab8ff', emissiveIntensity: 0.15 });
  } else if (style === 'neon') {
    geo = new THREE.BoxGeometry(1, 0.03, 0.03);
    mat = new THREE.MeshBasicMaterial({ color: col(th.edge || '#ff4fd8').multiplyScalar(2.6) });
  } else if (style === 'puffs') {
    geo = new THREE.SphereGeometry(1, 10, 8);
    mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffe0ef', emissiveIntensity: 0.25 });
  } else {
    geo = new THREE.BoxGeometry(1, 1, 1);
    mat = new THREE.MeshStandardMaterial({ color: style === 'girders' ? '#5a5048' : '#6a4a30', roughness: 0.6, metalness: style === 'girders' ? 0.8 : 0 });
  }
  const per = style === 'roots' || style === 'icicles' ? 3 : 1;
  const im = new THREE.InstancedMesh(geo, mat, picks.length * per);
  let k = 0;
  const rnd = s => { const x = Math.sin(s * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (const [xa, ya, za, xb, yb, zb, ox, oz] of picks) {
    const mx = (xa + xb) / 2, mz = (za + zb) / 2, y = Math.min(ya, yb) - 0.6;
    for (let j = 0; j < per; j++) {
      const s = rnd(mx * 13 + mz * 7 + j);
      if (style === 'roots' || style === 'icicles' || style === 'crystal') {
        const f = (j + 0.5) / per - 0.5;
        pp.set(mx + (ox ? 0 : f * 0.8) - ox * 0.08, y + 0.02, mz + (oz ? 0 : f * 0.8) - oz * 0.08);
        const len = (style === 'roots' ? 0.25 : 0.18) + s * (style === 'roots' ? 0.55 : 0.5);
        e.set((s - 0.5) * 0.3, 0, (s - 0.5) * 0.3); qq.setFromEuler(e);
        im.setMatrixAt(k++, m4.compose(pp, qq, sc.set(0.035 + s * 0.03, len, 0.035 + s * 0.03)));
      } else if (style === 'neon') {
        pp.set(mx, y + 0.08, mz); qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ox ? Math.PI / 2 : 0);
        im.setMatrixAt(k++, m4.compose(pp.set(mx + ox * 0.005, Math.min(ya, yb) - 0.12, mz + oz * 0.005), qq, sc.set(1, 1, 1)));
      } else if (style === 'puffs') {
        pp.set(mx - ox * 0.1, y - 0.05, mz - oz * 0.1);
        im.setMatrixAt(k++, m4.compose(pp, qq.identity(), sc.set(0.32 + s * 0.2, 0.18 + s * 0.08, 0.32 + s * 0.2)));
      } else {
        // poševni nosilec pod robom
        pp.set(mx - ox * 0.28, y - 0.15, mz - oz * 0.28);
        e.set(oz * 0.7, 0, -ox * 0.7); qq.setFromEuler(e);
        im.setMatrixAt(k++, m4.compose(pp, qq, sc.set(ox ? 0.08 : 0.08, 0.6, oz ? 0.08 : 0.08)));
      }
    }
  }
  im.count = k;
  im.castShadow = false;
  add(im);
}

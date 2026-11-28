/* 羽球 3D 回放對照 — player only. It draws a finished 3D file (.badm3d) and plays it in sync with the player's own video.
   There is NO analysis, reconstruction or shot detection here: every position, shuttle point and table in the file was computed
   elsewhere. Files are read in this page only; nothing is uploaded. */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const CW = 6.1, CL = 13.4, NETY = CL / 2;                       // doubles court, metres; scene is Z-up: x width, y length, z height
const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32],[27,31],[28,32]];
const BONE_R = [0.06, 0.055,0.045, 0.055,0.045, 0.06,0.06, 0.07, 0.08,0.06, 0.08,0.06, 0.04,0.04,0.04,0.04,0.04,0.04];
const JOINT_S = {11: 1.75, 12: 1.75, 13: 1.5, 14: 1.5, 15: 1.3, 16: 1.3, 23: 2.1, 24: 2.1, 25: 2.2, 26: 2.2, 27: 1.7, 28: 1.7};
const $ = id => document.getElementById(id);
const mbs = n => (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + ' MB';

/* ---------- state ---------- */
let S = null, videoFile = null, blobUrl = null, started = false, vidCheck = null;
let view = 'orbit', showTrail = true, showBall = true, showRacket = false, hasVideo = false, showRoutes = (() => { try { return localStorage.getItem('floorRoutes') === '1'; } catch (e) { return false; } })();   // racket: an estimate from the forearm, off unless asked for
const vid = $('vid');

/* ---------- three.js scene ---------- */
const renderer = new THREE.WebGLRenderer({canvas: $('scene'), antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 3; controls.maxDistance = 70;
controls.screenSpacePanning = true; controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI / 2;
controls.target.set(CW / 2, NETY, 0.8);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(3, -4, 12); scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 44), new THREE.MeshStandardMaterial({color: 0x5c6066, roughness: 0.9})); floor.position.set(CW / 2, NETY, -0.006); scene.add(floor);
const courtMesh = new THREE.Mesh(new THREE.PlaneGeometry(CW + 4, CL + 4.6), new THREE.MeshStandardMaterial({color: 0x1f9a5e, roughness: 0.8})); courtMesh.position.set(CW / 2, NETY, -0.003); scene.add(courtMesh);
const lineMat = new THREE.MeshBasicMaterial({color: 0xf4f6f2});
function paintLine(pts, w = 0.04) {
  const g = new THREE.Group();
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(new THREE.PlaneGeometry(L + w, w), lineMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.002); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); g.add(m);
  }
  return g;
}
const sx = (CW - 5.18) / 2;
[[[0,0],[CW,0],[CW,CL],[0,CL],[0,0]], [[sx,0],[sx,CL]], [[CW-sx,0],[CW-sx,CL]], [[0,NETY-1.98],[CW,NETY-1.98]], [[0,NETY+1.98],[CW,NETY+1.98]],
 [[CW/2,0],[CW/2,NETY-1.98]], [[CW/2,NETY+1.98],[CW/2,CL]], [[0,0.76],[CW,0.76]], [[0,CL-0.76],[CW,CL-0.76]]].forEach(p => scene.add(paintLine(p)));
const net = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.8, 0.76), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide}));
net.rotation.x = Math.PI / 2; net.position.set(CW / 2, NETY, 1.55 - 0.38); scene.add(net);
for (const x of [-0.4, CW + 0.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.55, 8), new THREE.MeshStandardMaterial({color: 0xdddddd})); p.rotation.x = Math.PI / 2; p.position.set(x, NETY, 0.775); scene.add(p); }
scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.4, NETY, 1.55), new THREE.Vector3(CW + 0.4, NETY, 1.55)]), new THREE.LineBasicMaterial({color: 0xffffff})));
function floorText(text, size = 0.32, opacity = 0.32) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), px = 64;
  g.font = `500 ${px}px sans-serif`; const w = Math.ceil(g.measureText(text).width) + 16; c.width = w; c.height = px + 16;
  g.font = `500 ${px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(text, w / 2, c.height / 2 + 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * c.width / c.height, size), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, opacity, depthWrite: false})); m.renderOrder = 1; return m;
}
const ends = [floorText('近場'), floorText('遠場')]; ends[0].position.set(CW / 2, -0.5, 0.02); ends[1].position.set(CW / 2, CL + 0.75, 0.02); ends.forEach(e => scene.add(e));
// where the video camera stood and which way it looked: two white chevrons on the floor just behind the near baseline + 「攝影機」
// (same marker as the analysis tool; from the camera saved in the 3D file)
const camGizmo = new THREE.Group(); scene.add(camGizmo);
function buildCamGizmo(c) {
  camGizmo.clear(); if (!c || !c.pos || !c.quat) return;
  const pos = new THREE.Vector3().fromArray(c.pos), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(c.quat));
  dir.z = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0); dir.normalize();
  const bx = Math.min(Math.max(pos.x, -1), CW + 1), by = Math.max(pos.y, -1.6);
  const g = new THREE.Group(); g.position.set(bx, by, 0.02); g.rotation.z = Math.atan2(dir.y, dir.x);
  const mat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false});
  const chev = x => { const sh = new THREE.Shape(); sh.moveTo(x - 0.28, -0.5); sh.lineTo(x + 0.22, 0); sh.lineTo(x - 0.28, 0.5);
    sh.lineTo(x - 0.46, 0.5); sh.lineTo(x + 0.04, 0); sh.lineTo(x - 0.46, -0.5); sh.closePath(); return sh; };
  [0.3, -0.25].forEach(x => g.add(new THREE.Mesh(new THREE.ShapeGeometry(chev(x)), mat)));
  camGizmo.add(g);
  const tag = floorText('攝影機', 0.3, 0.6); tag.position.set(bx - dir.x * 0.85, by - dir.y * 0.85, 0.02); camGizmo.add(tag);
}

/* ---------- player figures (drawn from the file's joint positions) ---------- */
const UP = new THREE.Vector3(0, 1, 0);
function setBone(m, a, b, r) { const d = new THREE.Vector3().subVectors(b, a), len = d.length(); m.position.copy(a).addScaledVector(d, .5); m.scale.set(r, len, r); m.quaternion.setFromUnitVectors(UP, d.normalize()); }
/* ---------- figure styles: how a player's body is drawn from the file's joint positions (look only) ---------- */
// 2026-11-28 later: the user went back to the original figure (default) and kept only 細骨架 as the other choice. The other
// looks stay in buildFigure but are not offered.
const FIG_STYLES = [['classic', '原始樣式'], ['thin', '細骨架']];   // 點雲 was tried and removed (2026-11-28)
let figStyle = (() => { let v = null; try { v = localStorage.getItem('figStyle'); } catch (e) {} return FIG_STYLES.some(f => f[0] === v) ? v : 'classic'; })();
const FIG_ARMS = [[11, 13, 15], [12, 14, 16]], FIG_LEGS = [[23, 25, 27, 29, 31], [24, 26, 28, 30, 32]];
function figFrame(tmp) {                     // torso frame: x = right (left→right shoulder/hip), y = front, z = up the spine
  const sh = tmp[11].clone().add(tmp[12]).multiplyScalar(.5), hp = tmp[23].clone().add(tmp[24]).multiplyScalar(.5);
  const z = sh.clone().sub(hp); const len = z.length() || 1e-3; z.divideScalar(len);
  const x = tmp[12].clone().sub(tmp[11]).add(tmp[24].clone().sub(tmp[23])); x.addScaledVector(z, -x.dot(z));
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0); x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const head = tmp[7].clone().add(tmp[8]).multiplyScalar(.5).add(new THREE.Vector3(0, 0, 0.02));
  // widths never below body proportions: side-on to the camera both shoulders (and hips) land on one point and the body
  // was drawn paper-thin (shoulders ≥ 0.7 × torso length, hips ≥ 0.36 ×)
  return {sh, hp, x, y, z, q, len, sw: Math.max(tmp[11].distanceTo(tmp[12]), 0.7 * len), hw: Math.max(tmp[23].distanceTo(tmp[24]), 0.36 * len), head};
}
function buildFigure(rig, col) {
  if (rig.fig) { rig.fig.group.traverse(o => { if (o.isMesh || o.isPoints) { o.geometry.dispose(); o.material.dispose(); } }); rig.g.remove(rig.fig.group); }
  const group = new THREE.Group(), parts = [], base = new THREE.Color(col);
  const M = (o = {}) => new THREE.MeshStandardMaterial(Object.assign({color: base, roughness: .5}, o));
  const at = (k, tmp, F) => typeof k === 'number' ? tmp[k] : F[k];
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); group.add(m); return m; };
  const seg = (a, b, r1, r2, mat, n = 14) => { const m = add(new THREE.CylinderGeometry(r2, r1, 1, n), mat);
    parts.push((tmp, F) => { const A = at(a, tmp, F), B = at(b, tmp, F), d = B.clone().sub(A), L = d.length();
      m.position.copy(A).addScaledVector(d, .5); m.scale.set(1, Math.max(L, 1e-4), 1); if (L > 1e-6) m.quaternion.setFromUnitVectors(UP, d.divideScalar(L)); }); };
  const ball = (a, r, mat, n = 16) => { const m = add(new THREE.SphereGeometry(r, n, Math.max(6, n * .7 | 0)), mat); parts.push((tmp, F) => m.position.copy(at(a, tmp, F))); };
  const caps = (a, b, r1, r2, mat, n) => { seg(a, b, r1, r2, mat, n); ball(a, r1, mat, n); ball(b, r2, mat, n); };
  // ellipsoid on the spine at t (0 = shoulders, 1 = hips): rx = sx × shoulder (or hip) width, ry = front/back radius, rz = sz × torso length
  const ell = (t, sx, ry, sz, mat, n = 22) => { const m = add(new THREE.SphereGeometry(1, n, n * .7 | 0), mat);
    parts.push((tmp, F) => { m.position.copy(F.sh).lerp(F.hp, t[0]); m.quaternion.copy(F.q); m.scale.set(sx * (t[1] === 'hw' ? F.hw : F.sw), ry, sz * F.len); }); };
  // box spanned by shoulders + hips (shoulders × sw, hips × hw from their middles), ±ht front/back
  const hull = (ht, sw, hw, mat) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    geo.setIndex([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 3,7,6, 3,6,2, 0,4,7, 0,7,3, 1,2,6, 1,6,5]); mat.side = THREE.DoubleSide; add(geo, mat);
    parts.push((tmp, F) => { const pa = geo.attributes.position, c = [[F.sh, -F.sw * sw], [F.sh, F.sw * sw], [F.hp, F.hw * hw], [F.hp, -F.hw * hw]].map(([o, w]) => o.clone().addScaledVector(F.x, w / 2));
      c.forEach((v, n) => { pa.setXYZ(n, v.x + F.y.x * ht, v.y + F.y.y * ht, v.z + F.y.z * ht); pa.setXYZ(n + 4, v.x - F.y.x * ht, v.y - F.y.y * ht, v.z - F.y.z * ht); });
      pa.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere(); }); };
  const limbs = o => { const mk = o.caps ? caps : seg, n = o.n || 14;
    for (const [a, b, c] of FIG_ARMS) { mk(a, b, o.ua[0], o.ua[1], o.m, n); mk(b, c, o.fa[0], o.fa[1], o.m, n); if (o.j) [a, b, c].forEach((j, k) => ball(j, o.j[k], o.mj || o.m, n)); }
    for (const [a, b, c, h, t] of FIG_LEGS) { mk(a, b, o.th[0], o.th[1], o.m, n); mk(b, c, o.sh[0], o.sh[1], o.m, n); if (o.j) [b, c].forEach((j, k) => ball(j, o.j[k + 3], o.mj || o.m, n));
      if (o.foot) o.foot(h, t); } };
  // front / back at a glance: a light face (eyes + nose) on the head and a light chest plate, both on the front side; the back
  // keeps the plain colour (side-on and from behind the two were impossible to tell apart, so left / right looked swapped)
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.6), dark = new THREE.Color(0x222222);
  const marks = (hr, cd, cw, ch) => {            // head radius, chest depth (front surface from the spine), chest plate width / height × shoulder width / torso
    const lm = M({color: light, roughness: .45}), em = M({color: dark, roughness: .4});
    const nose = add(new THREE.ConeGeometry(hr * 0.22, hr * 0.5, 12), lm);
    const eyes = [-1, 1].map(() => add(new THREE.SphereGeometry(hr * 0.13, 10, 8), em));
    const plate = add(new THREE.SphereGeometry(1, 20, 12), lm);
    parts.push((tmp, F) => {
      nose.position.copy(F.head).addScaledVector(F.y, hr * 1.05); nose.quaternion.setFromUnitVectors(UP, F.y);
      eyes.forEach((e, n) => e.position.copy(F.head).addScaledVector(F.y, hr * 0.82).addScaledVector(F.x, (n ? 1 : -1) * hr * 0.38).add(new THREE.Vector3(0, 0, hr * 0.25)));
      plate.position.copy(F.sh).lerp(F.hp, 0.32).addScaledVector(F.y, cd); plate.quaternion.copy(F.q); plate.scale.set(cw * F.sw, 0.012, ch * F.len);
    }); };
  if (figStyle === 'classic') {
    // the original figure: the rig's own cylinders, joint balls, box torso (light chest / dark back) and nose — shown below
  } else if (figStyle === 'capsule') {
    const m = M({roughness: .35});
    limbs({m, caps: 1, ua: [.055, .055], fa: [.045, .045], th: [.075, .075], sh: [.058, .058], n: 16, foot: (h, t) => caps(h, t, .035, .03, m, 16)});
    ell([.5], .55, .12, .62, m); ball('head', .12, m, 20); marks(.12, .115, .3, .28);
  } else if (figStyle === 'glass') {
    const bone = M({color: base.clone().multiplyScalar(.35)}), m = M({transparent: true, opacity: .58, depthWrite: false, roughness: .3});   // .32 was too see-through to read the body
    limbs({m: bone, ua: [.014, .014], fa: [.014, .014], th: [.016, .016], sh: [.016, .016], j: [.03, .026, .022, .03, .026], n: 8, foot: (h, t) => seg(h, t, .014, .014, bone, 8)});
    seg('sh', 'hp', .016, .016, bone, 8); seg(11, 12, .014, .014, bone, 8); seg(23, 24, .014, .014, bone, 8);
    limbs({m, caps: 1, ua: [.06, .05], fa: [.05, .04], th: [.085, .065], sh: [.065, .05], n: 16, foot: (h, t) => caps(h, t, .035, .03, m, 16)});
    ell([.5], .58, .12, .62, m); ball('head', .12, m, 20); marks(.12, .115, .3, .28);
  } else if (figStyle === 'thin') {
    const m = M();
    limbs({m, ua: [.018, .018], fa: [.018, .018], th: [.022, .022], sh: [.022, .022], j: [.04, .035, .03, .04, .035], n: 10, foot: (h, t) => seg(h, t, .018, .018, m, 10)});
    seg(11, 12, .02, .02, m, 10); seg(23, 24, .02, .02, m, 10); seg('sh', 'hp', .022, .022, m, 10); seg('sh', 'head', .018, .016, m, 10); ball('head', .1, m, 18); marks(.1, .03, .25, .22);
  } else if (figStyle === 'points') {
    // 點雲人形: ~2300 points fixed relative to the limbs / torso / head, moved with them every frame; white points mark the
    // front (nose and chest)
    const L = [], rnd = r => { let x, y, z; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1); return [x * r, y * r, z * r]; };
    const sg = (a, b, r, n) => { for (let k = 0; k < n; k++) L.push([0, a, b, Math.random(), ...rnd(r)]); };
    for (const [a, b, c] of FIG_ARMS) { sg(a, b, .05, 160); sg(b, c, .04, 130); }
    for (const [a, b, c, h, t] of FIG_LEGS) { sg(a, b, .075, 220); sg(b, c, .055, 180); sg(h, t, .035, 60); }
    for (let k = 0; k < 700; k++) L.push([1, 0, 0, 0, ...rnd(1)]);
    sg('head', 'head', .12, 300);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(L.length * 3), 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({color: base, size: .02})));
    const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    group.add(new THREE.Points(fgeo, new THREE.PointsMaterial({color: 0xffffff, size: .06})));
    parts.push((tmp, F) => {
      const pa = geo.attributes.position, cx = (F.sh.x + F.hp.x) / 2, cy = (F.sh.y + F.hp.y) / 2, cz = (F.sh.z + F.hp.z) / 2;
      L.forEach((p, n) => {
        if (p[0]) { const u = p[4] * F.sw * .55, v = p[5] * .12, w = p[6] * F.len * .6;
          pa.setXYZ(n, cx + F.x.x * u + F.y.x * v + F.z.x * w, cy + F.x.y * u + F.y.y * v + F.z.y * w, cz + F.x.z * u + F.y.z * v + F.z.z * w); return; }
        const A = at(p[1], tmp, F), B = at(p[2], tmp, F), t = p[3];
        pa.setXYZ(n, A.x + (B.x - A.x) * t + p[4], A.y + (B.y - A.y) * t + p[5], A.z + (B.z - A.z) * t + p[6]);
      });
      pa.needsUpdate = true; geo.computeBoundingSphere();
      const fa = fgeo.attributes.position;
      fa.setXYZ(0, F.head.x + F.y.x * .13, F.head.y + F.y.y * .13, F.head.z + F.y.z * .13);
      fa.setXYZ(1, cx + F.y.x * .14 + F.z.x * F.len * .2, cy + F.y.y * .14 + F.z.y * F.len * .2, cz + F.y.z * .14 + F.z.z * F.len * .2);
      fa.needsUpdate = true; fgeo.computeBoundingSphere();
    });
  } else if (figStyle === 'athlete') {
    const m = M();
    limbs({m, ua: [.07, .048], fa: [.048, .032], th: [.09, .06], sh: [.062, .04], j: [.075, .045, .032, .09, .06], n: 14, foot: (h, t) => caps(h, t, .035, .03, m, 14)});
    hull(.12, 1.3, .8, M()); seg('sh', 'head', .05, .05, m, 14); ball('head', .115, m, 18); marks(.115, .125, .32, .3);
  } else {                                             // smooth
    const m = M({roughness: .4});
    limbs({m, caps: 1, ua: [.07, .05], fa: [.05, .035], th: [.1, .065], sh: [.068, .045], n: 24, foot: (h, t) => caps(h, t, .045, .04, m, 20)});
    ell([.42], .62, .14, .66, m, 28); ell([.88, 'hw'], .85, .13, .3, m, 24); seg('sh', 'head', .05, .045, m, 20); ball('head', .12, m, 28); marks(.12, .135, .32, .3);
  }
  rig.g.add(group); rig.fig = {group, parts, style: figStyle};
  const cl = figStyle === 'classic';
  for (const o of [...rig.bones, rig.head, rig.torso, rig.nose]) o.visible = cl;   // the original figure (else only position holders)
  rig.joints.forEach((o, j) => o.visible = cl && j >= 11);
}
function updateFigure(rig, tmp) {
  if (!rig.fig || rig.fig.style !== figStyle) buildFigure(rig, rig.col);
  const F = figFrame(tmp); for (const p of rig.fig.parts) p(tmp, F);
}

// ground trails as flat ribbons on the floor (WebGL lines are always 1 px thin): each segment of point pairs (2k, 2k+1)
// becomes a quad TRAIL_W × 2 wide, colour and fade per end
const TRAIL_W = 0.035, TRAIL_P = new Float32Array(16000 * 2), TRAIL_A = new Float32Array(16000);
function writeRibbon(geo, m, c) {
  const pos = geo.attributes.position, col = geo.attributes.color, P = TRAIL_P, A = TRAIL_A; let v = 0;
  for (let s = 0; s + 1 < m; s += 2) {
    const x0 = P[2 * s], y0 = P[2 * s + 1], x1 = P[2 * s + 2], y1 = P[2 * s + 3], L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-6) continue;
    const nx = -(y1 - y0) / L * TRAIL_W, ny = (x1 - x0) / L * TRAIL_W, q = [[x0 + nx, y0 + ny, A[s]], [x0 - nx, y0 - ny, A[s]], [x1 + nx, y1 + ny, A[s + 1]], [x1 - nx, y1 - ny, A[s + 1]]];
    for (const k of [0, 1, 2, 2, 1, 3]) { pos.setXYZ(v, q[k][0], q[k][1], 0.02); col.setXYZW(v, c.r, c.g, c.b, q[k][2]); v++; }
  }
  geo.setDrawRange(0, v); pos.needsUpdate = col.needsUpdate = true;
}
const TRAIL_MAX = 8000, TRAIL_RECENT = 5;
let rigs = [];
function makeRig(col) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color: col, roughness: .5});
  const bones = BONES.map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), mat); g.add(m); return m; });
  const joints = Array.from({length: 33}, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat); m.visible = false; g.add(m); return m; });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), mat); g.add(head);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  tg.setIndex([0,2,1, 0,3,2,  4,5,6, 4,6,7,  0,1,5, 0,5,4,  3,7,6, 3,6,2,  0,4,7, 0,7,3,  1,2,6, 1,6,5]);
  const base = new THREE.Color(col), light = base.clone().lerp(new THREE.Color(0xffffff), 0.25), dark = base.clone().multiplyScalar(0.6), tc = new Float32Array(24);
  for (let n = 0; n < 8; n++) (n < 4 ? light : dark).toArray(tc, n * 3); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const torso = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({vertexColors: true, roughness: .6, side: THREE.DoubleSide})); g.add(torso);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 12), new THREE.MeshStandardMaterial({color: light, roughness: .5})); g.add(nose);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32), new THREE.MeshBasicMaterial({color: col, side: THREE.DoubleSide})); ring.position.z = 0.01; g.add(ring);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({color: 0, transparent: true, opacity: .25})); shadow.position.z = 0.005; g.add(shadow);
  const tri = new THREE.Shape(); tri.moveTo(0.62, 0); tri.lineTo(0.38, 0.16); tri.lineTo(0.38, -0.16); tri.lineTo(0.62, 0);
  const facing = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({color: col, side: THREE.DoubleSide})); facing.position.z = 0.012; g.add(facing);
  const trg = new THREE.BufferGeometry();
  trg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24000 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  trg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24000 * 4), 4).setUsage(THREE.DynamicDrawUsage)); trg.setDrawRange(0, 0);
  const trail = new THREE.Mesh(trg, new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide})); trail.frustumCulled = false; scene.add(trail);
  const rk = new THREE.Group(), rmat = new THREE.MeshStandardMaterial({color: 0xe8e8e8, roughness: .4});
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.32, 6), rmat); shaft.position.y = 0.24; rk.add(shaft);
  const rhead = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 28), rmat); rhead.scale.set(0.1, 0.125, 0.1); rhead.position.y = 0.525; rk.add(rhead);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false}));
  strings.scale.set(0.1, 0.125, 1); strings.position.y = 0.525; rk.add(strings); g.add(rk); rk.visible = false;
  scene.add(g); g.visible = false;
  return {g, bones, joints, head, ring, shadow, facing, torso, nose, trail, racket: rk, col};
}

const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({color: 0xe8ff4a})); ball.visible = false; scene.add(ball);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), new THREE.MeshBasicMaterial({color: 0, transparent: true, opacity: 0.45, depthWrite: false})); ballShadow.position.z = 0.006; ballShadow.visible = false; scene.add(ballShadow);
const BALL_TRAIL = 60, btg = new THREE.BufferGeometry();
btg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BALL_TRAIL * 3), 3)); btg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BALL_TRAIL * 3), 3));
const ballTrail = new THREE.Line(btg, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, opacity: 0.9})); ballTrail.frustumCulled = false; scene.add(ballTrail);
const landMark = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.24, 32), new THREE.MeshBasicMaterial({color: 0xe8ff4a, transparent: true, side: THREE.DoubleSide, depthWrite: false})); landMark.position.z = 0.012; landMark.visible = false; scene.add(landMark);

/* ---------- drawing one moment of the file ---------- */
const tmp = Array.from({length: 33}, () => new THREE.Vector3());
const bsearch = (arr, t) => { let lo = 0, hi = arr.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t + 1e-6) { k = m; lo = m + 1; } else hi = m - 1; } return k; };   // last index with arr[i] <= t
let lastHit = -2;

function slotAt(sl, k0, T) {                      // blend two neighbouring samples by time (like the video: continuous motion)
  const f = sl.f, a = f[k0], b = f[k0 + 1], t = S.frames.t;
  if (a && b && t[k0 + 1] - t[k0] < 0.2) {
    const u = Math.min(1, Math.max(0, (T - t[k0]) / (t[k0 + 1] - t[k0]))), row = a.map((v, i) => v + (b[i] - v) * u);
    const ra = sl.r[k0], rb = sl.r[k0 + 1]; let r = ra;
    if (ra && rb) { r = ra.map((v, i) => v + (rb[i] - v) * u); const q = new THREE.Quaternion(ra[3], ra[4], ra[5], ra[6]).slerp(new THREE.Quaternion(rb[3], rb[4], rb[5], rb[6]), u); r[3] = q.x * 1e4; r[4] = q.y * 1e4; r[5] = q.z * 1e4; r[6] = q.w * 1e4; }
    return [row, showRacket ? r : null];
  }
  return [a, showRacket ? sl.r[k0] : null];
}
function poseRig(rig, row, rk) {
  rig.g.visible = !!row; if (!row) return;
  const gx = row[0] / 1000, gy = row[1] / 1000;
  S.jidx.forEach((j, n) => tmp[j].set(row[2 + 3 * n] / 1000, row[3 + 3 * n] / 1000, row[4 + 3 * n] / 1000));
  BONES.forEach(([a, b], n) => setBone(rig.bones[n], tmp[a], tmp[b], BONE_R[n]));
  for (let j = 11; j < 33; j++) { rig.joints[j].visible = figStyle === 'classic'; rig.joints[j].position.copy(tmp[j]); rig.joints[j].scale.setScalar(JOINT_S[j] || 1); }
  rig.head.position.copy(tmp[7]).add(tmp[8]).multiplyScalar(.5); rig.head.position.z += 0.02;
  rig.ring.position.set(gx, gy, 0.01); rig.shadow.position.set(gx, gy, 0.005);
  const rx = tmp[12].x - tmp[11].x + tmp[24].x - tmp[23].x, ry = tmp[12].y - tmp[11].y + tmp[24].y - tmp[23].y;
  rig.facing.position.set(gx, gy, 0.012); rig.facing.rotation.z = Math.atan2(rx, -ry);
  const fl = Math.hypot(rx, ry) || 1, fx = -ry / fl, fy = rx / fl, HT = 0.11, tp = rig.torso.geometry.attributes.position;
  [tmp[11], tmp[12], tmp[24], tmp[23]].forEach((c, n) => { tp.setXYZ(n, c.x + fx * HT, c.y + fy * HT, c.z); tp.setXYZ(n + 4, c.x - fx * HT, c.y - fy * HT, c.z); });
  tp.needsUpdate = true; rig.torso.geometry.computeVertexNormals(); rig.torso.geometry.computeBoundingSphere();
  rig.nose.position.set(rig.head.position.x + fx * 0.13, rig.head.position.y + fy * 0.13, rig.head.position.z);
  rig.nose.quaternion.setFromUnitVectors(UP, new THREE.Vector3(fx, fy, 0));
  updateFigure(rig, tmp);
  rig.racket.visible = !!rk;
  if (rk) { rig.racket.position.set(rk[0] / 1000, rk[1] / 1000, rk[2] / 1000); rig.racket.quaternion.set(rk[3] / 1e4, rk[4] / 1e4, rk[5] / 1e4, rk[6] / 1e4).normalize(); }
}
function updateTrails(k0, T) {
  S.slots.forEach((s, i) => {
    const rig = rigs[i], tr = rig.trail; tr.visible = showTrail && s.on; if (!tr.visible) return;
    const pos = tr.geometry.attributes.position, col = tr.geometry.attributes.color, c = new THREE.Color(s.col), f = S.frames.slots[i].f, t = S.frames.t;
    let m = 0, prev = null;
    for (let n = Math.max(0, bsearch(t, T - TRAIL_RECENT)); n <= k0 && m < TRAIL_MAX; n++) {
      const row = f[n]; if (!row) { prev = null; continue; }
      const x = row[0] / 1000, y = row[1] / 1000;
      if (prev && t[n] - prev.t < 0.6 && t[n] >= T - TRAIL_RECENT) for (const [X, Y, tt] of [[prev.x, prev.y, prev.t], [x, y, t[n]]]) {
        TRAIL_P[2 * m] = X; TRAIL_P[2 * m + 1] = Y; TRAIL_A[m] = Math.max(0, 1 - (T - tt) / TRAIL_RECENT) ** 0.7; m++;
      }
      prev = {x, y, t: t[n]};
    }
    writeRibbon(tr.geometry, m, c);
  });
}
// 場上球路 (optional): the shots of the last 5 s drawn on the court floor — a strip from the hitter's spot to where the shot went
// with an arrow head (hitter's colour, fading with age), yellow ✕ = landing. From the file's routes (older files have none).
const frGeo = new THREE.BufferGeometry();
frGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6000 * 3), 3).setUsage(THREE.DynamicDrawUsage));
frGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6000 * 4), 4).setUsage(THREE.DynamicDrawUsage)); frGeo.setDrawRange(0, 0);
const floorRoutes = new THREE.Mesh(frGeo, new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide}));
floorRoutes.frustumCulled = false; floorRoutes.visible = false; scene.add(floorRoutes);
function updateFloorRoutes(T) {
  const R = S.routes || []; floorRoutes.visible = showRoutes && R.length > 0; if (!floorRoutes.visible) return;
  const pos = frGeo.attributes.position, col = frGeo.attributes.color, Z = 0.025; let v = 0;
  const tri = (a, b, c, cl, al) => { if (v + 3 > 6000) return; for (const p of [a, b, c]) { pos.setXYZ(v, p[0], p[1], Z); col.setXYZW(v, cl.r, cl.g, cl.b, al); v++; } };
  const strip = (x0, y0, x1, y1, w, cl, al) => { const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-6) return; const nx = -(y1 - y0) / L * w, ny = (x1 - x0) / L * w;
    tri([x0 + nx, y0 + ny], [x0 - nx, y0 - ny], [x1 + nx, y1 + ny], cl, al); tri([x1 + nx, y1 + ny], [x0 - nx, y0 - ny], [x1 - nx, y1 - ny], cl, al); };
  const yel = new THREE.Color(0xe8ff4a);
  for (const r of R) {
    const age = T - r.t; if (age < 0 || age > 5) continue;
    const sl = S.slots[r.slot]; if (!sl) continue;
    const al = Math.max(0.2, 1 - age / 5), c = new THREE.Color(sl.col), [x0, y0] = r.s, [x1, y1] = r.e, L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.2) continue;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, AH = 0.25, AW = 0.1;
    strip(x0, y0, x1 - ux * AH * 0.8, y1 - uy * AH * 0.8, TRAIL_W / 2, c, al);   // half the footwork trail's width, so the two stay apart
    tri([x1, y1], [x1 - ux * AH - uy * AW, y1 - uy * AH + ux * AW], [x1 - ux * AH + uy * AW, y1 - uy * AH - ux * AW], c, al);
    if (r.land) { strip(x1 - 0.15, y1 - 0.15, x1 + 0.15, y1 + 0.15, TRAIL_W / 2, yel, al); strip(x1 - 0.15, y1 + 0.15, x1 + 0.15, y1 - 0.15, TRAIL_W / 2, yel, al); }
  }
  frGeo.setDrawRange(0, v); pos.needsUpdate = col.needsUpdate = true;
}
function updateBall(T) {
  ball.visible = ballShadow.visible = ballTrail.visible = landMark.visible = false;
  const fl = S.flight; if (!showBall || !fl.length) return;
  let lo = 0, hi = fl.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (fl[m].t <= T + 1e-3) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k >= 0 && T - fl[k].t < 0.12) {
    const p = fl[k].p; ball.position.set(p[0], p[1], p[2]); ballShadow.position.set(p[0], p[1], 0.006); ball.visible = ballShadow.visible = true; ball.material.color.setHex(fl[k].est ? 0xa8b860 : 0xe8ff4a);
    const pos = btg.attributes.position, col = btg.attributes.color; let n = 0;
    for (let j = k; j >= 0 && n < BALL_TRAIL && T - fl[j].t < 0.5; j--) {
      if (j < k && fl[j + 1].t - fl[j].t > 0.15) break;
      const q = fl[j].p, a = (1 - (T - fl[j].t) / 0.5) * (fl[j].est ? 0.45 : 1); pos.setXYZ(n, q[0], q[1], q[2]); col.setXYZ(n, 0.9 * a, a, 0.3 * a); n++;
    }
    pos.needsUpdate = col.needsUpdate = true; btg.setDrawRange(0, n); ballTrail.visible = n > 1;
  }
  for (const r of S.lands) if (T >= r.t && T - r.t < 2.5) { landMark.position.set(r.p[0], r.p[1], 0.012); landMark.material.opacity = 1 - (T - r.t) / 2.5; landMark.visible = true; }
}
function drawAt(T) {
  const t = S.frames.t, k0 = Math.max(0, bsearch(t, T));
  S.slots.forEach((s, i) => { if (!s.on) { rigs[i].g.visible = false; return; } const [row, rk] = slotAt(S.frames.slots[i], k0, T); poseRig(rigs[i], row, rk); });
  updateTrails(k0, T); updateBall(T); updateFloorRoutes(T);
  const h = S.hits.findIndex((x, i) => x.t <= T + 0.02 && (i === S.hits.length - 1 || S.hits[i + 1].t > T + 0.02));
  if (h !== lastHit) { lastHit = h; document.querySelectorAll('#hittbl tr.cur').forEach(r => r.classList.remove('cur')); const r = document.querySelector(`#hittbl tr[data-i="${h}"]`); if (r) { r.classList.add('cur'); if ($('hitpanel').style.display !== 'none') r.scrollIntoView({block: 'nearest'}); } }
}

/* ---------- views ---------- */
const VIEWS = {orbit: '環繞視角・拖曳旋轉、雙指縮放', top: '俯視', back: '近場底線後方', side: '側面', cam: '原機位疊合（3D 疊回影片）', campos: '攝影機位・從拍攝位置看，可拖曳旋轉'};
function videoRect() {
  const r = vid.getBoundingClientRect(), vw = vid.videoWidth || S.cam.width, vh = vid.videoHeight || S.cam.height, s = Math.min(r.width / vw, r.height / vh), w = vw * s, h = vh * s;
  return {left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h};
}
function layout() {
  if (!S) return;
  const overlay = view === 'cam' && hasVideo, cv = renderer.domElement, p3 = $('p3d');
  if (overlay) {
    const r = videoRect(); document.body.appendChild(cv);
    Object.assign(cv.style, {position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none', zIndex: 3});
    renderer.setSize(r.width, r.height, false);
    const c = S.cam; camera.fov = c.fovY; camera.aspect = c.aspect; camera.position.fromArray(c.pos); camera.quaternion.fromArray(c.quat); camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = 1 - 2 * c.cx / c.width; camera.projectionMatrix.elements[9] = 2 * c.cy / c.height - 1;    // off-centre principal point
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  } else {
    p3.insertBefore(cv, p3.firstChild); cv.removeAttribute('style');
    const w = p3.clientWidth, h = p3.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
function setView(v) {
  view = v; $('viewname').textContent = VIEWS[v]; if ($('viewsel').value !== v) $('viewsel').value = v;
  const overlay = v === 'cam' && hasVideo; floor.visible = courtMesh.visible = net.visible = !overlay; ends.forEach(e => e.visible = !overlay); camGizmo.visible = !overlay; controls.enabled = !overlay; document.body.classList.toggle('camview', overlay);
  if (!overlay) {
    camera.up.set(0, 0, 1); camera.fov = 40;
    const tgt = new THREE.Vector3(CW / 2, NETY, 0.8), pos = {orbit: [CW / 2 + 6, -5, 8], top: [CW / 2, NETY - 0.5, 22], back: [CW / 2, -6.5, 3.2], side: [-10, NETY, 3.5]}[v];
    if (v === 'campos') {
      const c = S.cam, to = new THREE.Vector3().fromArray(c.pos), f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(c.quat)), k = f.z < -0.02 ? (0.8 - to.z) / f.z : 12;
      camera.position.copy(to); controls.target.copy(to.clone().addScaledVector(f, Math.min(25, Math.max(4, k)))); camera.fov = Math.min(75, c.fovY);
    } else { camera.position.set(...pos); controls.target.copy(tgt); }
  }
  layout(); if (!overlay) controls.update();          // (update() re-aims the camera at the orbit target: it would undo the overlay camera)
}

/* ---------- clock: the video when there is one, else an internal timer ---------- */
const clk = {cur: 0, playing: false, t0: 0, base: 0, rate: 1};
const clock = {
  get t() { if (hasVideo) return vid.currentTime; if (!clk.playing) return clk.cur; const t = clk.base + (performance.now() - clk.t0) / 1000 * clk.rate; if (t >= S.duration) { clk.cur = S.duration; clk.playing = false; $('play').textContent = '▶ 播放'; return clk.cur; } return t; },
  set t(v) { v = Math.max(0, Math.min(S.duration, v)); if (hasVideo) vid.currentTime = v; clk.cur = v; if (clk.playing) { clk.base = v; clk.t0 = performance.now(); } },
  get playing() { return hasVideo ? !vid.paused : clk.playing; },
  play() { if (this.t >= S.duration - 0.05) this.t = 0; if (hasVideo) vid.play(); else { clk.base = clk.cur; clk.t0 = performance.now(); clk.playing = true; } },
  pause() { if (hasVideo) vid.pause(); else if (clk.playing) { clk.cur = this.t; clk.playing = false; } },
  set rate(r) { clk.rate = r; if (hasVideo) vid.playbackRate = r; else if (clk.playing) { clk.base = clk.cur = this.t; clk.t0 = performance.now(); } },
};

/* ---------- loading the file, picking the video, checking it is the same one ---------- */
// which analysis mode the 3D file was made with (older files: not recorded)
const modeName = b => b.analysis === 'fast' ? '快速分析' : b.analysis === 'precise' ? '精確分析' : '分析模式未標示';
async function readFile3d(file) {
  const buf = new Uint8Array(await file.arrayBuffer()); let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('這個瀏覽器太舊，請用較新的 Chrome / Safari / Edge');
    text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else text = new TextDecoder().decode(buf);
  const b = JSON.parse(text);
  if (b.format !== 'badm3d-1' || !b.frames || !b.cam) throw new Error('這不是 3D 檔（.badm3d），或版本不符');
  return b;
}
function refreshButtons() {
  const go = $('gobtn'); go.disabled = !S;
  go.textContent = !S ? '先選 3D 檔' : videoFile ? (vidCheck && vidCheck.ok === false ? '仍要對照' : '開始對照') : '只看 3D（不載入影片）';
  $('c1').className = 'card' + (S ? ' done' : ''); $('c2').className = 'card' + (videoFile ? ' done' : '');
}
async function checkVideo() {
  const el = $('vstatus'); vidCheck = null; if (!videoFile) { el.textContent = ''; return; }
  if (!S) { el.className = 'mute'; el.textContent = '選好 3D 檔後會自動檢查是不是同一支影片'; return; }
  const fp = S.videoFingerprint;
  if (!fp) { vidCheck = {ok: null}; el.className = 'mute'; el.textContent = '3D 檔沒有影片指紋，無法自動確認；請確定是同一支影片'; return; }
  if (videoFile.size !== fp.size) vidCheck = {ok: false, msg: `檔案大小不同（分析用的是 ${mbs(fp.size)}，你選的是 ${mbs(videoFile.size)}）。可能不是同一支，或影片被 LINE／相簿壓縮、剪輯過；時間軸可能對不上。`};
  else if (window.crypto && crypto.subtle) {
    el.className = 'mute'; el.textContent = '比對中…';
    const h = await crypto.subtle.digest('SHA-256', await videoFile.slice(0, fp.headBytes).arrayBuffer());
    const hex = [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
    vidCheck = hex === fp.headSha256 ? {ok: true} : {ok: false, msg: '檔案大小相同，但內容和分析用的影片不一樣。'};
  } else vidCheck = {ok: null};
  if (vidCheck.ok === true) { el.className = 'ok'; el.textContent = '✓ 確認是分析用的同一支影片'; }
  else if (vidCheck.ok === false) { el.className = 'warn'; el.textContent = '⚠ ' + vidCheck.msg; }
  else { el.className = 'mute'; el.textContent = '大小相同（這個連線無法做進一步比對）'; }
  refreshButtons();
  // added from the player (after start): tell the result on the player screen too
  if (started && hasVideo) banner(vidCheck.ok === false ? '提醒：' + vidCheck.msg : vidCheck.ok === true ? '✓ 確認是製作這個 3D 檔用的同一支影片' : '');
}
async function setData(file) {
  const el = $('dstatus'); el.className = 'mute'; el.textContent = '讀取中…';
  try { S = await readFile3d(file); el.className = 'ok'; el.textContent = `✓ ${S.title}（${modeName(S)}・${S.duration.toFixed(1)} 秒，${mbs(file.size)}）`; }
  catch (e) { S = null; el.className = 'warn'; el.textContent = '⚠ ' + (e.message || e); }
  refreshButtons(); checkVideo();
}
function setVideo(file) {
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  videoFile = file; blobUrl = URL.createObjectURL(file); $('vname').textContent = `${file.name}（${mbs(file.size)}）`; refreshButtons(); checkVideo();
  if (started) { vid.src = blobUrl; }
}
function banner(msg) { const b = $('sitebanner'); if (!msg) { b.style.display = 'none'; return; } b.firstChild.textContent = msg; b.style.display = 'flex'; }

/* ---------- panels, controls ---------- */
function buildPanels() {
  $('hpstate').textContent = S.ui.hitState; $('hitsum').innerHTML = S.ui.hitSum; $('hittbl').innerHTML = S.ui.hitTable; $('tacinfo').textContent = S.ui.tacInfo; $('zonegrid').innerHTML = S.ui.tacGrid;
  document.querySelectorAll('#hittbl tr.cur, #hittbl tr.sel').forEach(r => r.classList.remove('cur', 'sel'));
  $('hittbl').querySelectorAll('tr[data-i]').forEach(r => r.onclick = () => { const h = S.hits[+r.dataset.i]; if (h) { clock.pause(); $('play').textContent = '▶ 播放'; clock.t = Math.max(0, h.t - 0.3); } });
  $('legend').innerHTML = S.slots.filter(s => s.on).map(s => `<span><i style="background:#${s.col.toString(16).padStart(6, '0')}"></i>${s.name}</span>`).join('');
  const bar = $('hitbar'); bar._ticks = S.hits;
}
function drawTicks() {
  const bar = $('hitbar'), w = bar.clientWidth, c = bar.getContext('2d'); bar.width = w; bar.height = 8; c.clearRect(0, 0, w, 8);
  S.hits.forEach(h => { c.fillStyle = '#' + (S.slots[h.slot] ? S.slots[h.slot].col : 0xffffff).toString(16).padStart(6, '0'); c.fillRect(8 + h.t / S.duration * (w - 16) - 1, 0, 2.5, 8); });
}
function fitBar() { document.documentElement.style.setProperty('--barh', $('bar').offsetHeight + 'px'); }

function start() {
  if (!S || started) return; started = true; hasVideo = !!videoFile;
  document.body.classList.toggle('novideo', !hasVideo);
  if (!hasVideo) document.querySelector('#viewsel option[value="cam"]').remove();
  $('ttl').textContent = S.title; $('modetag').textContent = modeName(S); $('modetag').className = 'modetag ' + (S.analysis || 'none'); document.title = S.title + '｜羽球 3D 回放對照';
  rigs.forEach(r => { scene.remove(r.g); scene.remove(r.trail); }); rigs = S.slots.map(s => makeRig(s.col));
  buildPanels(); buildCamGizmo(S.cam); $('landing').style.display = 'none';
  if (hasVideo) attachVideo();
  fitBar(); layout(); drawTicks(); setView('orbit'); lastHit = -2;
  refreshAddVid();
}
// the original video beside the 3D: at the start, or added later from the player (＋ 加入影片) without reloading
function attachVideo() {
  {
    vid.addEventListener('loadedmetadata', () => {
      let msg = ''; if (Math.abs(vid.duration - S.duration) > 0.5) msg = `影片長度（${vid.duration.toFixed(1)} 秒）和 3D 檔（${S.duration.toFixed(1)} 秒）不同，3D 和畫面可能對不上。`;
      else if (S.videoFingerprint && S.videoFingerprint.width && (vid.videoWidth !== S.videoFingerprint.width || vid.videoHeight !== S.videoFingerprint.height)) msg = '影片解析度和分析用的影片不同，疊合位置可能不準。';
      if (!msg && vidCheck && vidCheck.ok === false) msg = '提醒：' + vidCheck.msg; banner(msg); layout();
    }, {once: true});
    vid.addEventListener('error', () => banner('這個瀏覽器無法播放這支影片的格式（iPhone 錄的 HEVC .mov 請改用 Safari，或用 Mac／iPhone 開啟）。3D 仍可使用。'));
    vid.src = blobUrl;
  }
}
function refreshAddVid() { const b = $('addvidbtn'); b.textContent = hasVideo ? '換影片' : '＋ 加入原始影片'; b.classList.toggle('hot', !hasVideo); }
function addVideoLater(file) {
  const t = clock.t; clock.pause(); $('play').textContent = '▶ 播放';
  setVideo(file);
  if (!hasVideo) {
    hasVideo = true; document.body.classList.remove('novideo');
    const sel = $('viewsel'); if (!sel.querySelector('option[value="cam"]')) { const o = document.createElement('option'); o.value = 'cam'; o.textContent = '原機位疊合'; sel.insertBefore(o, sel.options[2] || null); }
    attachVideo();
  }
  vid.addEventListener('loadedmetadata', () => { vid.currentTime = Math.min(t, vid.duration || t); vid.playbackRate = clk.rate || 1; layout(); }, {once: true});
  refreshAddVid(); fitBar(); layout();
}

$('pickdata').onclick = () => $('filedata').click(); $('pickvideo').onclick = () => $('filevideo').click();
$('filedata').onchange = e => { if (e.target.files[0]) setData(e.target.files[0]); }; $('filevideo').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (started) addVideoLater(f); else setVideo(f); };
$('addvidbtn').onclick = () => $('filevideo').click();
$('gobtn').onclick = start; $('resetbtn').onclick = () => location.reload(); $('bannerx').onclick = () => banner('');
['dragover', 'drop'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); if (ev !== 'drop') return;
  for (const f of e.dataTransfer.files) { if (/\.(badm3d|gz)$/i.test(f.name)) setData(f); else if (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name)) (started ? addVideoLater : setVideo)(f); } }));
$('play').onclick = () => { if (clock.playing) { clock.pause(); $('play').textContent = '▶ 播放'; } else { clock.play(); $('play').textContent = '❚❚ 暫停'; } };
const step = () => 1 / (S.fps || 30);
$('prev').onclick = () => { clock.pause(); $('play').textContent = '▶ 播放'; clock.t = clock.t - step(); }; $('next').onclick = () => { clock.pause(); $('play').textContent = '▶ 播放'; clock.t = clock.t + step(); };
let scrubbing = false; $('seek').oninput = e => { clock.t = e.target.value / 1000 * S.duration; };
$('seek').addEventListener('pointerdown', () => { scrubbing = true; }); addEventListener('pointerup', () => { scrubbing = false; });
document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { clock.rate = +b.dataset.r; document.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); });
$('viewsel').onchange = e => { setView(e.target.value); e.target.blur(); };
const toggle = (id, get, set) => { $(id).onclick = () => { set(!get()); $(id).classList.toggle('on', get()); lastT = -1; }; };
toggle('trailbtn', () => showTrail, v => showTrail = v); toggle('ballbtn', () => showBall, v => showBall = v); toggle('racketbtn', () => showRacket, v => showRacket = v);
toggle('routebtn', () => showRoutes, v => { showRoutes = v; try { localStorage.setItem('floorRoutes', v ? '1' : '0'); } catch (e) {} }); $('routebtn').classList.toggle('on', showRoutes);
{ const setFig = () => { $('figbtn').textContent = '人物：' + FIG_STYLES.find(f => f[0] === figStyle)[1]; };
  setFig(); $('figbtn').onclick = () => { const k = FIG_STYLES.findIndex(f => f[0] === figStyle); figStyle = FIG_STYLES[(k + 1) % FIG_STYLES.length][0];
    try { localStorage.setItem('figStyle', figStyle); } catch (e) {} setFig(); lastT = -1; }; }
$('hitsbtn').onclick = () => { const p = $('hitpanel'), on = p.style.display === 'none'; p.style.display = on ? '' : 'none'; $('hitsbtn').classList.toggle('on', on); lastHit = -2; };
$('tacbtn').onclick = () => { const p = $('tacpanel'), on = p.style.display === 'none'; p.style.display = on ? '' : 'none'; $('tacbtn').classList.toggle('on', on); };
$('hpclose').onclick = () => { $('hitpanel').style.display = 'none'; $('hitsbtn').classList.remove('on'); }; $('tacclose').onclick = () => { $('tacpanel').style.display = 'none'; $('tacbtn').classList.remove('on'); };
addEventListener('resize', () => { fitBar(); layout(); if (S) drawTicks(); });
if (window.ResizeObserver) new ResizeObserver(fitBar).observe($('bar'));
addEventListener('keydown', e => { if (!started || e.target.tagName === 'INPUT' && e.target.type !== 'range') return; if (e.code === 'Space') { e.preventDefault(); $('play').click(); } if (e.code === 'ArrowLeft') $('prev').click(); if (e.code === 'ArrowRight') $('next').click(); });

let lastT = -1, lastView = '';
function loop() {
  requestAnimationFrame(loop); if (!started) return;
  const T = clock.t;
  if (!scrubbing) $('seek').value = T / S.duration * 1000; $('time').textContent = `${T.toFixed(2)} s`;
  if (view === 'cam' && hasVideo && (vid.getBoundingClientRect().width + ',' + vid.getBoundingClientRect().height) !== lastView) { lastView = vid.getBoundingClientRect().width + ',' + vid.getBoundingClientRect().height; layout(); }
  if (T !== lastT) { lastT = T; drawAt(T); }
  if (!(view === 'cam' && hasVideo)) controls.update();
  renderer.render(scene, camera);
}
loop();
refreshButtons();
window.__player = {setData, setVideo, start, get state() { return {data: !!S, video: !!videoFile, started, check: vidCheck, view}; }, get S() { return S; }, clock, setView};

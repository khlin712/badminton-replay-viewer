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
let view = 'orbit', showTrail = true, showBall = true, showRacket = true, hasVideo = false;
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

/* ---------- player figures (drawn from the file's joint positions) ---------- */
const UP = new THREE.Vector3(0, 1, 0);
function setBone(m, a, b, r) { const d = new THREE.Vector3().subVectors(b, a), len = d.length(); m.position.copy(a).addScaledVector(d, .5); m.scale.set(r, len, r); m.quaternion.setFromUnitVectors(UP, d.normalize()); }
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
  trg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16000 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  trg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(16000 * 4), 4).setUsage(THREE.DynamicDrawUsage)); trg.setDrawRange(0, 0);
  const trail = new THREE.LineSegments(trg, new THREE.LineBasicMaterial({vertexColors: true, transparent: true, depthWrite: false})); trail.frustumCulled = false; scene.add(trail);
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
  for (let j = 11; j < 33; j++) { rig.joints[j].visible = true; rig.joints[j].position.copy(tmp[j]); rig.joints[j].scale.setScalar(JOINT_S[j] || 1); }
  rig.head.position.copy(tmp[7]).add(tmp[8]).multiplyScalar(.5); rig.head.position.z += 0.02;
  rig.ring.position.set(gx, gy, 0.01); rig.shadow.position.set(gx, gy, 0.005);
  const rx = tmp[12].x - tmp[11].x + tmp[24].x - tmp[23].x, ry = tmp[12].y - tmp[11].y + tmp[24].y - tmp[23].y;
  rig.facing.position.set(gx, gy, 0.012); rig.facing.rotation.z = Math.atan2(rx, -ry);
  const fl = Math.hypot(rx, ry) || 1, fx = -ry / fl, fy = rx / fl, HT = 0.11, tp = rig.torso.geometry.attributes.position;
  [tmp[11], tmp[12], tmp[24], tmp[23]].forEach((c, n) => { tp.setXYZ(n, c.x + fx * HT, c.y + fy * HT, c.z); tp.setXYZ(n + 4, c.x - fx * HT, c.y - fy * HT, c.z); });
  tp.needsUpdate = true; rig.torso.geometry.computeVertexNormals(); rig.torso.geometry.computeBoundingSphere();
  rig.nose.position.set(rig.head.position.x + fx * 0.13, rig.head.position.y + fy * 0.13, rig.head.position.z);
  rig.nose.quaternion.setFromUnitVectors(UP, new THREE.Vector3(fx, fy, 0));
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
        pos.setXYZ(m, X, Y, 0.02); col.setXYZW(m, c.r, c.g, c.b, Math.max(0, 1 - (T - tt) / TRAIL_RECENT) ** 0.7); m++;
      }
      prev = {x, y, t: t[n]};
    }
    tr.geometry.setDrawRange(0, m); pos.needsUpdate = col.needsUpdate = true;
  });
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
  updateTrails(k0, T); updateBall(T);
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
  const overlay = v === 'cam' && hasVideo; floor.visible = courtMesh.visible = net.visible = !overlay; ends.forEach(e => e.visible = !overlay); controls.enabled = !overlay; document.body.classList.toggle('camview', overlay);
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
}
async function setData(file) {
  const el = $('dstatus'); el.className = 'mute'; el.textContent = '讀取中…';
  try { S = await readFile3d(file); el.className = 'ok'; el.textContent = `✓ ${S.title}（${S.duration.toFixed(1)} 秒，${mbs(file.size)}）`; }
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
  $('ttl').textContent = S.title; document.title = S.title + '｜羽球 3D 回放對照';
  rigs.forEach(r => { scene.remove(r.g); scene.remove(r.trail); }); rigs = S.slots.map(s => makeRig(s.col));
  buildPanels(); $('landing').style.display = 'none';
  if (hasVideo) {
    vid.addEventListener('loadedmetadata', () => {
      let msg = ''; if (Math.abs(vid.duration - S.duration) > 0.5) msg = `影片長度（${vid.duration.toFixed(1)} 秒）和 3D 檔（${S.duration.toFixed(1)} 秒）不同，3D 和畫面可能對不上。`;
      else if (S.videoFingerprint && S.videoFingerprint.width && (vid.videoWidth !== S.videoFingerprint.width || vid.videoHeight !== S.videoFingerprint.height)) msg = '影片解析度和分析用的影片不同，疊合位置可能不準。';
      if (!msg && vidCheck && vidCheck.ok === false) msg = '提醒：' + vidCheck.msg; banner(msg); layout();
    }, {once: true});
    vid.addEventListener('error', () => banner('這個瀏覽器無法播放這支影片的格式（iPhone 錄的 HEVC .mov 請改用 Safari，或用 Mac／iPhone 開啟）。3D 仍可使用。'));
    vid.src = blobUrl;
  }
  fitBar(); layout(); drawTicks(); setView('orbit'); lastHit = -2;
}

$('pickdata').onclick = () => $('filedata').click(); $('pickvideo').onclick = () => $('filevideo').click();
$('filedata').onchange = e => { if (e.target.files[0]) setData(e.target.files[0]); }; $('filevideo').onchange = e => { if (e.target.files[0]) setVideo(e.target.files[0]); };
$('gobtn').onclick = start; $('resetbtn').onclick = () => location.reload(); $('bannerx').onclick = () => banner('');
['dragover', 'drop'].forEach(ev => addEventListener(ev, e => { e.preventDefault(); if (ev !== 'drop') return;
  for (const f of e.dataTransfer.files) { if (/\.(badm3d|gz)$/i.test(f.name)) setData(f); else if (/^video\//.test(f.type) || /\.(mov|mp4|m4v|webm)$/i.test(f.name)) setVideo(f); } }));
$('play').onclick = () => { if (clock.playing) { clock.pause(); $('play').textContent = '▶ 播放'; } else { clock.play(); $('play').textContent = '❚❚ 暫停'; } };
const step = () => 1 / (S.fps || 30);
$('prev').onclick = () => { clock.pause(); $('play').textContent = '▶ 播放'; clock.t = clock.t - step(); }; $('next').onclick = () => { clock.pause(); $('play').textContent = '▶ 播放'; clock.t = clock.t + step(); };
let scrubbing = false; $('seek').oninput = e => { clock.t = e.target.value / 1000 * S.duration; };
$('seek').addEventListener('pointerdown', () => { scrubbing = true; }); addEventListener('pointerup', () => { scrubbing = false; });
document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { clock.rate = +b.dataset.r; document.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); });
$('viewsel').onchange = e => { setView(e.target.value); e.target.blur(); };
const toggle = (id, get, set) => { $(id).onclick = () => { set(!get()); $(id).classList.toggle('on', get()); lastT = -1; }; };
toggle('trailbtn', () => showTrail, v => showTrail = v); toggle('ballbtn', () => showBall, v => showBall = v); toggle('racketbtn', () => showRacket, v => showRacket = v);
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

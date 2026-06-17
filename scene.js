// ================================================================
// BIFILAR PENDULUM - SCENE.JS
//
// Static Three.js hero: neutral stage, RoomEnvironment lighting,
// OrbitControls, live physics, and drag-to-twist from the rod.
// ================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { lift, step } from './sim.js';

const canvas = document.getElementById('rig');
const phiCanvas = document.getElementById('phi-graph');
const omegaCanvas = document.getElementById('omega-graph');
const phiValue = document.getElementById('phi-value');
const omegaValue = document.getElementById('omega-value');
const hero = document.getElementById('hero');

const params = { L: 1.2, ell: 1.6, f: 1, gamma: 0.075 };
const state = { ...params, theta: 0.75, thetaDot: 0 };

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0xffffff, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 20);
const belowView = new THREE.Vector3(0, -2.7, 2.25);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 1.5;
controls.maxDistance = 5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.target.set(0, 0.05, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmrem.fromScene(roomEnv).texture;
roomEnv.dispose();
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd8ce, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 4, 2);
scene.add(key);

const stage = new THREE.Mesh(
  new THREE.CylinderGeometry(1.65, 1.9, 0.08, 96),
  new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.86, metalness: 0.01 })
);
stage.position.y = -3.05;
scene.add(stage);

const rig = new THREE.Group();
rig.position.set(-0.35, -0.45, 0);
scene.add(rig);

const topY = 1;
const rodY0 = topY - params.ell;
const anchorLeft = new THREE.Vector3(-params.L / 2, topY, 0);
const anchorRight = new THREE.Vector3(params.L / 2, topY, 0);

const anchorMat = new THREE.MeshStandardMaterial({ color: 0x1f77b4, roughness: 0.42, metalness: 0.12 });
const rodMat = new THREE.MeshPhysicalMaterial({
  color: 0x303030,
  roughness: 0.38,
  metalness: 0.14,
  clearcoat: 0.45,
  clearcoatRoughness: 0.22
});
const stringMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.62 });
const roseMat = new THREE.MeshStandardMaterial({ color: 0xd55e00, roughness: 0.46, metalness: 0.06 });

const topBar = new THREE.Mesh(new THREE.BoxGeometry(params.L + 0.35, 0.045, 0.08), anchorMat);
topBar.position.y = topY;
rig.add(topBar);

for (const x of [-params.L / 2, params.L / 2]) {
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), anchorMat);
  pin.position.set(x, topY, 0);
  rig.add(pin);
}

const rodGroup = new THREE.Group();
rig.add(rodGroup);

const rod = new THREE.Mesh(new THREE.BoxGeometry(params.L, 0.08, 0.11), rodMat);
rodGroup.add(rod);

for (const x of [-params.L / 2, params.L / 2]) {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 16), roseMat);
  cap.position.x = x;
  rodGroup.add(cap);
}

const strings = [
  new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 16), stringMat),
  new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 16), stringMat)
];
strings.forEach(s => rig.add(s));

const sparkLayer = document.createElement('div');
sparkLayer.className = 'spark-layer';
document.body.append(sparkLayer);
let lastSpark = 0;
let cursor = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Scroll reveal — cross-browser (Chromium-only view() timelines left other
// browsers with motionless, pre-visible text). Reveal each slide as it enters.
const storySteps = document.querySelectorAll('.story-step');
if (reduceMotion.matches) {
  storySteps.forEach(s => s.classList.add('in'));
} else {
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    }
  }, { threshold: 0.15 });
  storySteps.forEach(s => revealIO.observe(s));
}

const lightbox = document.createElement('div');
lightbox.className = 'lightbox';
lightbox.innerHTML = '<button type="button" aria-label="Close image">×</button><figure><img alt="" /><figcaption></figcaption></figure>';
document.body.append(lightbox);
const lightboxImg = lightbox.querySelector('img');
const lightboxCaption = lightbox.querySelector('figcaption');

const traces = { phi: [], omega: [] };
let traceClock = 0;

function drawTrace(canvasEl, values, color, limit) {
  const dpr = Math.min(devicePixelRatio, 2);
  const rect = canvasEl.getBoundingClientRect();
  if (canvasEl.width !== Math.round(rect.width * dpr) || canvasEl.height !== Math.round(rect.height * dpr)) {
    canvasEl.width = Math.round(rect.width * dpr);
    canvasEl.height = Math.round(rect.height * dpr);
  }

  const ctx = canvasEl.getContext('2d');
  const w = canvasEl.width;
  const h = canvasEl.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(24,32,50,0.14)';
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * w;
    const y = h / 2 - THREE.MathUtils.clamp(v / limit, -1, 1) * h * 0.42;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function setView() {
  camera.position.copy(belowView);
  controls.target.set(-0.12, -0.2, 0);
  controls.update();
}

function setString(mesh, a, b) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  mesh.position.copy(mid);
  mesh.scale.set(1, dir.length(), 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

function renderRig() {
  const h = lift(state.theta, params.L, params.ell, params.f);
  rodGroup.position.y = rodY0 + h;
  rodGroup.rotation.y = state.theta;

  const d = (params.f * params.L) / 2;
  const left = new THREE.Vector3(-d, rodGroup.position.y, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.theta);
  const right = new THREE.Vector3(d, rodGroup.position.y, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.theta);
  setString(strings[0], anchorLeft, left);
  setString(strings[1], anchorRight, right);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function updateTrackers(dt) {
  traceClock += dt;
  if (traceClock < 0.05) return;
  traceClock = 0;

  traces.phi.push(state.theta);
  traces.omega.push(state.thetaDot);
  if (traces.phi.length > 800) traces.phi.shift();
  if (traces.omega.length > 800) traces.omega.shift();

  phiValue.textContent = `${state.theta.toFixed(2)} rad`;
  omegaValue.textContent = `${state.thetaDot.toFixed(2)} rad/s`;
  drawTrace(phiCanvas, traces.phi, '#7b3294', 1.4);
  drawTrace(omegaCanvas, traces.omega, '#1f77b4', 8);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging = false;
let dragStartX = 0;
let dragStartTheta = 0;

function sparkle(x = cursor.x, y = cursor.y, force = false) {
  if (reduceMotion.matches) return;
  const now = performance.now();
  if (!force && now - lastSpark < 28) return;
  lastSpark = now;

  const spark = document.createElement('span');
  spark.className = 'spark';
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 34}px`);
  spark.style.setProperty('--dy', `${-10 - Math.random() * 22}px`);
  sparkLayer.append(spark);
  spark.addEventListener('animationend', () => spark.remove(), { once: true });
}

function closeLightbox() {
  lightbox.classList.remove('open');
}

document.addEventListener('pointermove', event => {
  cursor = { x: event.clientX, y: event.clientY, seen: true };
  sparkle(cursor.x, cursor.y);
});

setInterval(() => {
  if (cursor.seen) sparkle(cursor.x, cursor.y, true);
}, 260);

document.addEventListener('click', event => {
  const img = event.target.closest('.media-stack img');
  if (!img) return;
  lightboxImg.src = img.currentSrc || img.src;
  lightboxImg.alt = img.alt;
  lightboxCaption.textContent = img.dataset.note || img.alt || '';
  lightboxCaption.hidden = !lightboxCaption.textContent;
  lightbox.classList.add('open');
});

lightbox.addEventListener('click', event => {
  if (event.target === lightbox || event.target.tagName === 'BUTTON') closeLightbox();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeLightbox();
});

canvas.addEventListener('pointerdown', event => {
  pointer.x = (event.offsetX / canvas.clientWidth) * 2 - 1;
  pointer.y = -(event.offsetY / canvas.clientHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.intersectObject(rod, true).length) return;
  dragging = true;
  dragStartX = event.clientX;
  dragStartTheta = state.theta;
  state.thetaDot = 0;
  controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (!dragging) return;
  state.theta = THREE.MathUtils.clamp(dragStartTheta + (event.clientX - dragStartX) * 0.012, -1.35, 1.35);
  state.thetaDot = 0;
  renderRig();
});

canvas.addEventListener('pointerup', event => {
  dragging = false;
  controls.enabled = true;
  canvas.releasePointerCapture(event.pointerId);
});

addEventListener('resize', resize);

let last = performance.now();
function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.03);
  last = now;
  if (!dragging) step(state, dt);
  renderRig();
  updateTrackers(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

setView();
resize();
renderRig();
requestAnimationFrame(animate);

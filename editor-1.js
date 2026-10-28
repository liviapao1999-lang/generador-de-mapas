const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const propsEl = document.getElementById('properties');
const container = document.getElementById('canvas-container');
const toastEl = document.getElementById('toast');
const LS_KEY = 'castillo-v20';

const GRID = 0.1;
let scale = 50;
let offsetX = 0, offsetY = 0;
let tool = 'sala';
let activeLevel = 0;
let data = { rooms: [], walls: [], doors: [], holes: [], blocks: [], doorTypes: [], activeDoorType: null };
let selected = null;
let multiSel = [];
let isDraggingNew = false;
let isMovingExisting = false;
let isBoxSelecting = false;
let boxSel = null;
let dragTemp = null;
let moveStart = { x: 0, z: 0 };
let moveOrig = null;
let mouseWorld = { x: 0, z: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let spacePressed = false;
let currentPoly = [];
let isDrawingPoly = false;
let currentWall = [];
let paintingBlocks = false, blockErase = false, blockChanged = false;
let isDrawingWall = false;
let currentEditId = null;

const W2S = (x, z) => [x * scale + offsetX, -z * scale + offsetY];
const S2W = (px, py) => [(px - offsetX) / scale, -(py - offsetY) / scale];
const snap = (v) => +(Math.round(v / GRID) * GRID).toFixed(1);
const cellOf = (v) => +(Math.floor(v / GRID + 1e-9) * GRID).toFixed(1);
const almost = (a, b, eps = GRID * 1.5) => Math.abs(a - b) <= eps;
const isLevel = (y) => Math.abs((y || 0) - activeLevel) < 0.5;
const levelAlpha = (y) => {
  const d = Math.abs((y || 0) - activeLevel);
  if (d < 0.5) return 1;
  if (d < 2) return 0.55;
  if (d < 4) return 0.35;
  return 0.18;
};
function mouseToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width ? (canvas.width / rect.width) : 1;
  const sy = rect.height ? (canvas.height / rect.height) : 1;
  return S2W((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
}
const el = (id) => document.getElementById(id);
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
const deep = (o) => JSON.parse(JSON.stringify(o));

function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

const defaultDoorTypes = () => [
  { id: 'dt-estandar', nombre: 'Puerta estándar', w: 1.5, h: 3.6, sill: 0, fw: 0.1, depth: 0.5, panel: 'single', hinge: 'left', swing: 'in', angle: 72 },
  { id: 'dt-doble', nombre: 'Portón doble', w: 3, h: 4, sill: 0, fw: 0.15, depth: 0.5, panel: 'double', hinge: 'left', swing: 'in', angle: 72 },
  { id: 'dt-arco', nombre: 'Arco abierto', w: 2, h: 3.6, sill: 0, fw: 0.1, depth: 0.5, panel: 'none', hinge: 'left', swing: 'in', angle: 72 },
  { id: 'dt-postigo', nombre: 'Postigo alto', w: 1, h: 1.2, sill: 1.5, fw: 0.08, depth: 0.5, panel: 'single', hinge: 'left', swing: 'in', angle: 72 },
];

function normalizeData() {
  if (!data || typeof data !== 'object') data = {};
  ['rooms', 'walls', 'doors', 'holes', 'blocks'].forEach(k => { if (!Array.isArray(data[k])) data[k] = []; });
  data.blocks.forEach(b => { if (!b.id) b.id = uid('b'); });
  if (!Array.isArray(data.doorTypes) || !data.doorTypes.length) data.doorTypes = defaultDoorTypes();
  if (!data.doorTypes.some(t => t.id === data.activeDoorType)) data.activeDoorType = data.doorTypes[0].id;
}
const activeDoorType = () => data.doorTypes.find(t => t.id === data.activeDoorType) || data.doorTypes[0];
function doorParams(t) {
  return { w: t.w, h: t.h, sill: t.sill, fw: t.fw, depth: t.depth, panel: t.panel, hinge: t.hinge, swing: t.swing, angle: t.angle, double: t.panel === 'double', tipo: t.id };
}
const doorPanelMode = (d) => d.panel || (d.double ? 'double' : 'single');

let hist = [], histIdx = -1, lastKey = '', lastTime = 0;
const snapshot = () => JSON.stringify(data);
function persist() { try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) {} }
function updateHistButtons() {
  el('btn-undo').disabled = histIdx <= 0 && !(isDrawingPoly || isDrawingWall);
  el('btn-redo').disabled = histIdx >= hist.length - 1;
}
function commit(key) {
  const s = snapshot(); persist();
  if (histIdx >= 0 && hist[histIdx] === s) { updateHistButtons(); return; }
  const now = Date.now();
  if (key && key === lastKey && now - lastTime < 700 && histIdx >= 0) hist[histIdx] = s;
  else {
    hist = hist.slice(0, histIdx + 1); hist.push(s);
    if (hist.length > 80) hist.shift();
    histIdx = hist.length - 1;
  }
  lastKey = key || ''; lastTime = now; updateHistButtons();
}
function undo() {
  if (isDrawingPoly || isDrawingWall) { cancelDraw(); return; }
  if (histIdx <= 0) return;
  histIdx--; data = JSON.parse(hist[histIdx]); normalizeData();
  clearSelection(); draw(); updateHistButtons(); persist();
}
function redo() {
  if (histIdx >= hist.length - 1) return;
  histIdx++; data = JSON.parse(hist[histIdx]); normalizeData();
  clearSelection(); draw(); updateHistButtons(); persist();
}

function resize() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  if (!offsetX && !offsetY) { offsetX = canvas.width / 2; offsetY = canvas.height / 2; }
  draw();
}
window.addEventListener('resize', resize);

function boundsOf() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  data.rooms.forEach(r => r.points ? r.points.forEach(p => add(p.x, p.z)) : (add(r.x0, r.z0), add(r.x1, r.z1)));
  data.walls.forEach(w => (w.points || []).forEach(p => add(p.x, p.z)));
  data.holes.forEach(h => { add(h.x0, h.z0); add(h.x1, h.z1); });
  data.blocks.forEach(b => add(b.x, b.z));
  data.doors.forEach(d => add(d.x, d.z));
  return isFinite(x0) ? { x0, x1, z0, z1 } : null;
}
function resetView() {
  const b = boundsOf();
  if (!b) { offsetX = canvas.width / 2; offsetY = canvas.height / 2; scale = 50; draw(); return; }
  const pad = 50, w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.z1 - b.z0, 1);
  scale = Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h);
  scale = Math.max(10, Math.min(200, scale));
  offsetX = canvas.width / 2 - ((b.x0 + b.x1) / 2) * scale;
  offsetY = canvas.height / 2 + ((b.z0 + b.z1) / 2) * scale;
  draw();
}
function changeLevel(v) {
  activeLevel = parseFloat(v);
  if (!isFinite(activeLevel)) activeLevel = 0;
  el('level-input').value = activeLevel;
  updateStatus(); draw();
}
function nudgeLevel(d) { changeLevel(activeLevel + d); }

// end of editor-1 core (continued in editor-2..4)

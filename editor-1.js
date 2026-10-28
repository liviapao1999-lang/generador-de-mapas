const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const propsEl = document.getElementById('properties');
const container = document.getElementById('canvas-container');
const toastEl = document.getElementById('toast');
const LS_KEY = 'castillo-v20'; // misma clave: el visor 3D (main.js) la lee tal cual

// Cuadrícula: cada celda = 10 cm (0.1 m). Salas, muros y bloques se alinean a celdas completas.
const GRID = 0.1;
let scale = 50; // px por metro → cada celda de 10 cm ≈ 5 px
let offsetX = 0, offsetY = 0;
let tool = 'sala';
let activeLevel = 0;
let data = { rooms: [], walls: [], doors: [], holes: [], blocks: [], doorTypes: [], activeDoorType: null };
let selected = null;       // foco actual (panel de propiedades)
let multiSel = [];         // selección múltiple: [{type,id}, ...]
let isDraggingNew = false;
let isMovingExisting = false;
let isBoxSelecting = false;
let boxSel = null;         // {x0,z0,x1,z1} en coords mundo
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
// Alinea a la cuadrícula de 10 cm (evita ruido de coma flotante)
const snap = (v) => +(Math.round(v / GRID) * GRID).toFixed(1);
// Celda ocupada por el punto (esquina inferior-izquierda de la celda)
const cellOf = (v) => +(Math.floor(v / GRID + 1e-9) * GRID).toFixed(1);
const almost = (a, b, eps = GRID * 1.5) => Math.abs(a - b) <= eps;
const isLevel = (y) => Math.abs((y || 0) - activeLevel) < 0.5;
// Opacidad según distancia al nivel activo: 1 en el nivel, se atenúa con la distancia
const levelAlpha = (y) => {
  const d = Math.abs((y || 0) - activeLevel);
  if (d < 0.5) return 1;
  if (d < 2) return 0.55;
  if (d < 4) return 0.35;
  return 0.18;
};
// Ratón → mundo (corrige desfase si el tamaño CSS del canvas no coincide 1:1 con su resolución)
function mouseToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width ? (canvas.width / rect.width) : 1;
  const sy = rect.height ? (canvas.height / rect.height) : 1;
  return S2W((e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy);
}
const el = (id) => document.getElementById(id);
const uid = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deep = (o) => JSON.parse(JSON.stringify(o));

function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// =====================================================================
//  DATOS, TIPOS DE PUERTA Y NORMALIZACIÓN
// =====================================================================
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

// Parámetros que se copian del tipo a cada puerta colocada
function doorParams(t) {
  return { w: t.w, h: t.h, sill: t.sill, fw: t.fw, depth: t.depth, panel: t.panel, hinge: t.hinge, swing: t.swing, angle: t.angle, double: t.panel === 'double', tipo: t.id };
}
const doorPanelMode = (d) => d.panel || (d.double ? 'double' : 'single');

// =====================================================================
//  HISTORIAL (deshacer / rehacer)
// =====================================================================
let hist = [], histIdx = -1, lastKey = '', lastTime = 0;
const snapshot = () => JSON.stringify(data);

function persist() {
  try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) { /* sin espacio: se ignora */ }
}
function updateHistButtons() {
  el('btn-undo').disabled = histIdx <= 0 && !(isDrawingPoly || isDrawingWall);
  el('btn-redo').disabled = histIdx >= hist.length - 1;
}
// Registra el estado actual. Con la misma `key` en menos de 700 ms se fusiona en un solo paso (teclear un número).
function commit(key) {
  const s = snapshot();
  persist();
  if (histIdx >= 0 && hist[histIdx] === s) { updateHistButtons(); return; }
  const now = Date.now();
  if (key && key === lastKey && now - lastTime < 700 && histIdx > 0) {
    hist[histIdx] = s;
  } else {
    hist.splice(histIdx + 1);
    hist.push(s);
    if (hist.length > 300) hist.shift();
    histIdx = hist.length - 1;
  }
  lastKey = key || ''; lastTime = now;
  updateHistButtons();
}
function restore(s) {
  data = JSON.parse(s); normalizeData();
  clearSelection();
  persist(); draw(); updateStatus(); updateHistButtons();
  if (el('door-modal').classList.contains('open')) ddRefresh();
}
function undo() {
  if (isDrawingPoly && currentPoly.length) { currentPoly.pop(); if (!currentPoly.length) cancelDraw(); draw(); return; }
  if (isDrawingWall && currentWall.length) { currentWall.pop(); if (!currentWall.length) cancelDraw(); draw(); return; }
  if (histIdx > 0) { histIdx--; lastKey = ''; restore(hist[histIdx]); toast('↩️ Deshacer'); }
}
function redo() {
  if (histIdx < hist.length - 1) { histIdx++; lastKey = ''; restore(hist[histIdx]); toast('↪️ Rehacer'); }
}

// =====================================================================
//  VISTA
// =====================================================================
function resize() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  if (offsetX === 0 && offsetY === 0) resetView();
  draw();
}
window.addEventListener('resize', resize);

function bounds() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
  data.rooms.forEach(r => r.points ? r.points.forEach(p => add(p.x, p.z)) : (add(r.x0, r.z0), add(r.x1, r.z1)));
  data.walls.forEach(w => (w.points || []).forEach(p => add(p.x, p.z)));
  data.holes.forEach(h => { add(h.x0, h.z0); add(h.x1, h.z1); });
  data.blocks.forEach(b => { add(b.x, b.z); add(b.x + GRID, b.z + GRID); });
  data.doors.forEach(d => add(d.x, d.z));
  return isFinite(x0) ? { x0, x1, z0, z1 } : null;
}

function resetView() {
  const b = bounds();
  if (!b) { offsetX = canvas.width / 2; offsetY = canvas.height / 2; scale = 50; }
  else {
    const pad = 50, w = Math.max(b.x1 - b.x0, 1), h = Math.max(b.z1 - b.z0, 1);
    scale = Math.max(10, Math.min(200, Math.min((canvas.width - 2 * pad) / w, (canvas.height - 2 * pad) / h)));
    offsetX = canvas.width / 2 - ((b.x0 + b.x1) / 2) * scale;
    offsetY = canvas.height / 2 + ((b.z0 + b.z1) / 2) * scale;
  }
  draw();
}

function changeLevel(val) {
  const n = parseFloat(val);
  if (!isFinite(n)) return;
  activeLevel = n;
  const inp = el('level-input');
  if (inp && document.activeElement !== inp) inp.value = activeLevel;
  clearSelection();
  draw();
  updateStatus();
}
function nudgeLevel(delta) {
  changeLevel(activeLevel + delta);
  el('level-input').value = activeLevel;
}

container.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width ? (canvas.width / rect.width) : 1;
  const sy = rect.height ? (canvas.height / rect.height) : 1;
  const mouseX = (e.clientX - rect.left) * sx;
  const mouseY = (e.clientY - rect.top) * sy;
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.max(10, Math.min(200, scale * zoomFactor));
  offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
  offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);
  scale = newScale;
  hudEl.textContent = `X: ${(+snap(mouseWorld.x)).toFixed(1)}, Z: ${(+snap(mouseWorld.z)).toFixed(1)} | Zoom: ${Math.round(scale * 10)}%`;
  draw();
}, { passive: false });
container.addEventListener('contextmenu', e => e.preventDefault());

// =====================================================================
//  TECLADO
// =====================================================================
const modalOpen = () => el('door-modal').classList.contains('open');

window.addEventListener('keydown', e => {
  if (modalOpen()) { if (e.key === 'Escape') closeDoorDesigner(); return; }
  const a = document.activeElement;
  const typing = a && ((a.tagName === 'INPUT' && (a.type === 'text' || a.type === 'number')) || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.code === 'KeyZ') { e.preventDefault(); if (typing) a.blur(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.code === 'KeyY') { e.preventDefault(); if (typing) a.blur(); redo(); return; }
  if (mod && e.code === 'KeyD') { e.preventDefault(); duplicateSelected(); return; }
  if (typing) return;

  if (e.code === 'Space') { e.preventDefault(); spacePressed = true; container.classList.remove('painting'); }
  if (e.key === 'Enter' && (isDrawingPoly || isDrawingWall)) finishDraw();
  if (e.key === 'Escape') {
    if (isDrawingPoly || isDrawingWall) cancelDraw();
    else if (selected || multiSel.length) { clearSelection(); draw(); }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && (selected || multiSel.length)) { e.preventDefault(); deleteSelected(); }

  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (arrows[e.key] && (selected || multiSel.length)) {
    e.preventDefault();
    const k = e.shiftKey ? 1 : GRID; // celda (10 cm) o 1 m con Shift
    const list = multiSel.length ? multiSel : [selected];
    list.forEach(s => {
      const obj = getObj(s);
      if (obj) applyMove(s, obj, deep(obj), arrows[e.key][0] * k, arrows[e.key][1] * k);
    });
    if (selected) { const o = getObj(selected); if (o) syncInputs(o); }
    draw(); commit('nudge');
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space') { spacePressed = false; if (tool !== 'sel') container.classList.add('painting'); }
});

// =====================================================================
//  HELPERS DE OBJETOS Y GEOMETRÍA
// =====================================================================
function getObj(sel) {
  if (!sel) return null;
  const arr = sel.type === 'room' ? data.rooms
    : sel.type === 'wall' ? data.walls
    : sel.type === 'hole' ? data.holes
    : sel.type === 'block' ? data.blocks
    : data.doors;
  return arr.find(x => x.id === sel.id) || null;
}

function selKey(s) { return s ? s.type + ':' + s.id : ''; }
function isInMulti(s) { return !!s && multiSel.some(m => m.type === s.type && m.id === s.id); }
function isSelectedAny(type, id) {
  if (selected && selected.type === type && selected.id === id) return true;
  return multiSel.some(m => m.type === type && m.id === id);
}
function clearSelection() {
  selected = null; multiSel = []; currentEditId = null;
  updateSelButton(); renderProperties();
}
function setSingleSelection(hit) {
  selected = hit; multiSel = hit ? [hit] : []; currentEditId = null;
  updateSelButton(); renderProperties();
}
function toggleInSelection(hit) {
  if (!hit) return;
  const i = multiSel.findIndex(m => m.type === hit.type && m.id === hit.id);
  if (i >= 0) {
    multiSel.splice(i, 1);
    if (selected && selected.type === hit.type && selected.id === hit.id)
      selected = multiSel.length ? multiSel[multiSel.length - 1] : null;
  } else {
    multiSel.push(hit);
    selected = hit;
  }
  currentEditId = null;
  updateSelButton(); renderProperties();
}
function updateSelButton() {
  const btn = el('btn-del-sel');
  if (!btn) return;
  const n = multiSel.length || (selected ? 1 : 0);
  btn.style.display = n ? 'inline-block' : 'none';
  btn.textContent = n > 1 ? `🗑️ Eliminar (${n})` : '🗑️ Eliminar selección';
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
function inRect(o, wx, wz) {
  return wx >= Math.min(o.x0, o.x1) && wx <= Math.max(o.x0, o.x1) && wz >= Math.min(o.z0, o.z1) && wz <= Math.max(o.z0, o.z1);
}
function inPoly(pts, wx, wz) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
    if (((zi > wz) !== (zj > wz)) && (wx < (xj - xi) * (wz - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
// Eje de la abertura de la puerta: ax='z' => recta a lo largo de Z; ax='x' => a lo largo de X
function doorSpan(d) {
  const w = d.w || 1.5;
  return d.ax === 'z' ? [d.x, d.z - w / 2, d.x, d.z + w / 2] : [d.x - w / 2, d.z, d.x + w / 2, d.z];
}

// Prioridad: puertas > huecos > muros > escaleras/rampas > salas.
// Muros/puertas/huecos: nivel activo primero, si no hay hit se prueban todos.
// Salas (áreas grandes): solo nivel activo, para no “robar” clics a los muros.
function pickAt(wx, wz) {
  const tol = 12 / scale;


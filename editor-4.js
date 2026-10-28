function updateStatus() {
  const nombres = { sala: 'Suelo', poly: 'Polilínea', hueco: 'Hueco', rampa: 'Rampa', escalera: 'Escalera', pared: 'Muro', bloque: 'Bloques', puerta: 'Puerta', borrar: 'Borrar', sel: 'Seleccionar' };
  let txt = `Y: ${activeLevel} | Herramienta: ${nombres[tool]}`;
  if (tool === 'puerta' && data.doorTypes.length) { const t = activeDoorType(); txt += ` (${t.nombre} ${t.w}×${t.h})`; }
  statusEl.textContent = txt;
}

// =====================================================================
//  PROPIEDADES
// =====================================================================
function syncInputs(obj) {
  propsEl.querySelectorAll('input[data-k]').forEach(i => {
    if (i === document.activeElement) return;
    const v = obj[i.dataset.k];
    if (v !== undefined && v !== null) i.value = v;
  });
}

function renderProperties() {
  if (!selected) {
    propsEl.innerHTML = '<div style="color: #64748b; display: flex; align-items: center; justify-content: center; width: 100%; margin-top: 30px;">Selecciona un elemento (herramienta Seleccionar o Ctrl+clic) para editarlo.<br><span style="font-size:11px;margin-top:6px;">Shift+clic o arrastra una caja para selección múltiple.</span></div>';
    currentEditId = null; return;
  }
  if (multiSel.length > 1) {
    propsEl.innerHTML = `
      <div class="field-group" style="justify-content:center;">
        <label style="text-transform:none;font-size:13px;color:#e2e8f0;">${multiSel.length} elementos seleccionados</label>
        <div style="color:#94a3b8;font-size:11px;margin-top:4px;">Shift+clic para añadir/quitar · Supr para eliminar todos</div>
      </div>
      <div class="field-group" style="justify-content:flex-end;">
        <button class="danger" onclick="deleteSelected()">🗑️ Eliminar los ${multiSel.length}</button>
      </div>`;
    currentEditId = '__multi__';
    return;
  }
  if (selected.id === currentEditId) return;
  const obj = getObj(selected);
  if (!obj) { clearSelection(); return; }
  currentEditId = selected.id;
  const T = selected.type, id = obj.id;
  const fmt = (v) => (v == null || v === '') ? '' : (typeof v === 'number' ? +(+v).toFixed(2) : v);
  const num = (label, key, val, step) => `<div class="field-group"><label>${label}</label><input type="number" data-k="${key}" value="${fmt(val)}" step="${step != null ? step : GRID}" oninput="updateProp('${T}','${id}','${key}',this.value)"></div>`;
  const del = '<div class="field-group" style="justify-content: flex-end;"><button class="danger" onclick="deleteSelected()">Eliminar</button></div>';

  if (T === 'room') {
    const r = obj;
    const isPoly = r.points != null;
    const isElev = r.type === 'rampa' || r.type === 'escalera';
    propsEl.innerHTML = `
      <div class="field-group"><label>Nombre</label><input type="text" value="${esc(r.nombre)}" oninput="updateProp('room','${id}','nombre',this.value)"></div>
      <div class="field-group"><label>Tipo</label><select onchange="updateProp('room','${id}','type',this.value)" ${isPoly ? 'disabled' : ''}>
        <option value="sala" ${r.type === 'sala' ? 'selected' : ''}>Sala</option><option value="patio" ${r.type === 'patio' ? 'selected' : ''}>Patio</option><option value="rampa" ${r.type === 'rampa' ? 'selected' : ''}>Rampa</option><option value="escalera" ${r.type === 'escalera' ? 'selected' : ''}>Escalera</option>
      </select></div>
      ${num('Altura Y', 'y', r.y || 0, 0.5)}
      ${num('Altura Final Y2', 'y2', r.y2 != null ? r.y2 : '', 0.5)}
      ${isElev && !isPoly ? `<div class="field-group"><label>Dirección</label><select onchange="updateProp('room','${id}','dir',this.value)">
        <option value="+x" ${r.dir === '+x' ? 'selected' : ''}>+X</option><option value="-x" ${r.dir === '-x' ? 'selected' : ''}>-X</option><option value="+z" ${r.dir === '+z' ? 'selected' : ''}>+Z</option><option value="-z" ${r.dir === '-z' ? 'selected' : ''}>-Z</option>
      </select></div>` : ''}
      ${!isPoly ? `<div class="field-group"><label>X0 / Z0</label><div class="row-inputs"><input type="number" data-k="x0" step="${GRID}" value="${fmt(r.x0)}" oninput="updateProp('room','${id}','x0',this.value)"><input type="number" data-k="z0" step="${GRID}" value="${fmt(r.z0)}" oninput="updateProp('room','${id}','z0',this.value)"></div></div>
      <div class="field-group"><label>X1 / Z1</label><div class="row-inputs"><input type="number" data-k="x1" step="${GRID}" value="${fmt(r.x1)}" oninput="updateProp('room','${id}','x1',this.value)"><input type="number" data-k="z1" step="${GRID}" value="${fmt(r.z1)}" oninput="updateProp('room','${id}','z1',this.value)"></div></div>` : '<div class="field-group" style="justify-content:center; color:#64748b; margin-top:12px;">Polígono Libre</div>'}
      ${del}`;
  } else if (T === 'hole') {
    const h = obj;
    propsEl.innerHTML = `
      <div class="field-group"><label>Hueco X0 / Z0</label><div class="row-inputs"><input type="number" data-k="x0" value="${h.x0}" oninput="updateProp('hole','${id}','x0',this.value)"><input type="number" data-k="z0" value="${h.z0}" oninput="updateProp('hole','${id}','z0',this.value)"></div></div>
      <div class="field-group"><label>Hueco X1 / Z1</label><div class="row-inputs"><input type="number" data-k="x1" value="${h.x1}" oninput="updateProp('hole','${id}','x1',this.value)"><input type="number" data-k="z1" value="${h.z1}" oninput="updateProp('hole','${id}','z1',this.value)"></div></div>
      ${num('Altura Y', 'y', h.y || 0, 0.5)}
      ${del}`;
  } else if (T === 'wall') {
    const w = obj;
    propsEl.innerHTML = `${num('Altura H', 'h', w.h, 0.5)}${num('Altura Base Y', 'y', w.y || 0, 0.5)}${del}`;
  } else if (T === 'block') {
    const b = obj;
    propsEl.innerHTML = `
      <div class="field-group"><label>Celda X / Z</label><div class="row-inputs"><input type="number" data-k="x" value="${fmt(b.x)}" step="${GRID}" oninput="updateProp('block','${id}','x',this.value)"><input type="number" data-k="z" value="${fmt(b.z)}" step="${GRID}" oninput="updateProp('block','${id}','z',this.value)"></div></div>
      ${num('Altura Y', 'y', b.y || 0, 0.5)}
      ${num('Alto H (m)', 'h', b.h || 4, 0.5)}
      ${del}`;
  } else if (T === 'door') {
    const d = obj, mode = doorPanelMode(d);
    const tipos = data.doorTypes.map(t => `<option value="${t.id}" ${t.id === d.tipo ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');
    propsEl.innerHTML = `
      <div class="field-group"><label>Tipo</label><select style="width:150px" onchange="setDoorType('${id}',this.value)"><option value="">(a medida)</option>${tipos}</select></div>
      <div class="field-group"><label>Pos X / Z</label><div class="row-inputs"><input type="number" data-k="x" value="${d.x}" oninput="updateProp('door','${id}','x',this.value)"><input type="number" data-k="z" value="${d.z}" oninput="updateProp('door','${id}','z',this.value)"></div></div>
      ${num('Altura Y', 'y', d.y || 0, 0.5)}
      <div class="field-group"><label>Ancho / Alto</label><div class="row-inputs"><input type="number" data-k="w" value="${d.w || 1.5}" step="0.05" oninput="updateProp('door','${id}','w',this.value)"><input type="number" data-k="h" value="${d.h || 3.6}" step="0.05" oninput="updateProp('door','${id}','h',this.value)"></div></div>
      ${num('Alféizar', 'sill', d.sill || 0, 0.05)}
      ${num('Marco', 'fw', d.fw != null ? d.fw : 0.1, 0.01)}
      ${num('Profundidad', 'depth', d.depth || 0.5, 0.05)}
      ${num('Ángulo °', 'angle', d.angle != null ? d.angle : 72, 5)}
      <div class="field-group"><label>Hoja</label><select onchange="updateProp('door','${id}','panel',this.value)"><option value="single" ${mode === 'single' ? 'selected' : ''}>Simple</option><option value="double" ${mode === 'double' ? 'selected' : ''}>Doble</option><option value="none" ${mode === 'none' ? 'selected' : ''}>Sin hoja</option></select></div>
      <div class="field-group"><label>Bisagra</label><select onchange="updateProp('door','${id}','hinge',this.value)"><option value="left" ${d.hinge === 'left' ? 'selected' : ''}>Izquierda</option><option value="right" ${d.hinge === 'right' ? 'selected' : ''}>Derecha</option></select></div>
      <div class="field-group"><label>Apertura</label><select onchange="updateProp('door','${id}','swing',this.value)"><option value="in" ${d.swing === 'in' ? 'selected' : ''}>Hacia adentro</option><option value="out" ${d.swing === 'out' ? 'selected' : ''}>Hacia afuera</option></select></div>
      <div class="field-group" style="justify-content:flex-end;"><button onclick="openDoorDesigner()">📐 Editar tipo…</button></div>
      ${del}`;
  }
}

function setDoorType(id, typeId) {
  const d = data.doors.find(x => x.id === id); if (!d) return;
  const t = data.doorTypes.find(x => x.id === typeId);
  if (t) Object.assign(d, doorParams(t)); else delete d.tipo;
  currentEditId = null; renderProperties(); draw(); commit();
}

const STR_KEYS = ['nombre', 'type', 'dir', 'hinge', 'swing', 'double', 'panel'];
function updateProp(type, id, key, val) {
  const obj = arrFor(type).find(x => x.id === id);
  if (!obj) return;
  if (STR_KEYS.includes(key)) {
    obj[key] = val;
    if (type === 'door' && key === 'panel') obj.double = val === 'double';
    draw(); commit(type + id + key); return;
  }
  if (key === 'y2' && val === '') { obj.y2 = null; draw(); commit(type + id + key); return; }
  if (val === '' || val === '-') return;
  const n = parseFloat(val);
  if (!isFinite(n)) return;
  // Coordenadas de planta siempre en múltiplos de 10 cm
  if (['x', 'z', 'x0', 'x1', 'z0', 'z1'].includes(key)) obj[key] = snap(n);
  else if (key === 'y' || key === 'y2' || key === 'h' || key === 'w' || key === 'sill') obj[key] = +(+n).toFixed(2);
  else obj[key] = n;
  draw(); commit(type + id + key);
}

function deleteSelected() {
  const list = multiSel.length ? multiSel.slice() : (selected ? [selected] : []);
  if (!list.length) return;
  list.forEach(s => {
    if (s.type === 'room') data.rooms = data.rooms.filter(x => x.id !== s.id);
    if (s.type === 'wall') data.walls = data.walls.filter(x => x.id !== s.id);
    if (s.type === 'door') data.doors = data.doors.filter(x => x.id !== s.id);
    if (s.type === 'hole') data.holes = data.holes.filter(x => x.id !== s.id);
    if (s.type === 'block') data.blocks = data.blocks.filter(x => x.id !== s.id);
  });
  clearSelection();
  draw(); commit();
  toast('Eliminado: ' + list.length);
}

function newMap() {
  if (!confirm('¿Borrar todo el mapa y empezar de cero?')) return;
  data = { rooms: [], walls: [], doors: [], holes: [], blocks: [], doorTypes: defaultDoorTypes(), activeDoorType: null };
  normalizeData();
  clearSelection();
  resetView();
  updateStatus();
  commit();
  toast('📄 Mapa nuevo');
}

// =====================================================================
//  IMPORTAR / EXPORTAR
// =====================================================================
function exportJSON() {
  const out = JSON.stringify(data, null, 1);
  const done = () => { toast('✅ JSON copiado al portapapeles'); console.log(out); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out).then(done, () => { console.log(out); toast('No se pudo copiar: está en la consola'); });
  else { console.log(out); toast('No se pudo copiar: está en la consola'); }
}
function downloadJSON() {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'mapa.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importJSON(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result);
      if (!j || !Array.isArray(j.rooms)) throw new Error('el archivo no tiene "rooms"');
      data = j; normalizeData();
      clearSelection(); resetView(); updateStatus(); commit(); toast('📂 Mapa importado');
    } catch (err) { alert('No se pudo importar: ' + err.message); }
    input.value = '';
  };
  rd.readAsText(f);
}

function loadLocal() {
  try { const s = localStorage.getItem(LS_KEY); if (s) data = JSON.parse(s); } catch (e) { /* datos corruptos: se parte de cero */ }
  normalizeData();
}

// =====================================================================
//  VENTANA: DISEÑADOR DE PUERTAS
// =====================================================================
let ddTypeId = null;
const ddType = () => data.doorTypes.find(t => t.id === ddTypeId);

function openDoorDesigner(typeId) {
  let pick = typeId;
  if (!pick && selected && selected.type === 'door') { const d = getObj(selected); if (d && d.tipo) pick = d.tipo; }
  if (!pick || !data.doorTypes.some(t => t.id === pick)) pick = data.activeDoorType;
  ddTypeId = pick;
  el('door-modal').classList.add('open');
  el('dd-msg').textContent = '';
  ddRefresh();
}
function closeDoorDesigner() { el('door-modal').classList.remove('open'); updateStatus(); if (selected) { currentEditId = null; renderProperties(); } }

function ddFillSelect() {
  el('dd-type').innerHTML = data.doorTypes.map(t => `<option value="${t.id}" ${t.id === ddTypeId ? 'selected' : ''}>${esc(t.nombre)}${t.id === data.activeDoorType ? ' ★' : ''}</option>`).join('');
}
function ddRefresh() {
  ddFillSelect();
  const t = ddType(); if (!t) return;
  document.querySelectorAll('#door-modal [data-dd]').forEach(i => { i.value = t[i.dataset.dd] != null ? t[i.dataset.dd] : ''; });
  ddDraw();
}
function ddSelectType(id) { ddTypeId = id; el('dd-msg').textContent = ''; ddRefresh(); }
function ddField(i) {
  const t = ddType(); if (!t) return;
  const k = i.dataset.dd; let v = i.value;
  if (i.type === 'number') {
    v = parseFloat(v); if (!isFinite(v)) return;
    if ((k === 'w' || k === 'h') && v <= 0) return;
    if (v < 0) return;
  }
  t[k] = v;
  if (k === 'nombre') ddFillSelect();
  ddDraw(); commit('dd' + t.id + k);
}
function ddNew() {
  const t = { id: uid('dt'), nombre: 'Puerta nueva', w: 1.5, h: 3.6, sill: 0, fw: 0.1, depth: 0.5, panel: 'single', hinge: 'left', swing: 'in', angle: 72 };
  data.doorTypes.push(t); ddTypeId = t.id; ddRefresh(); commit();
}
function ddDuplicate() {
  const t = ddType(); if (!t) return;
  const c = Object.assign(deep(t), { id: uid('dt'), nombre: t.nombre + ' (copia)' });
  data.doorTypes.push(c); ddTypeId = c.id; ddRefresh(); commit();
}
function ddDelete() {
  if (data.doorTypes.length <= 1) { el('dd-msg').textContent = 'Debe quedar al menos un tipo.'; return; }
  const t = ddType(); if (!t) return;
  data.doorTypes = data.doorTypes.filter(x => x.id !== t.id);
  data.doors.forEach(d => { if (d.tipo === t.id) delete d.tipo; });
  if (data.activeDoorType === t.id) data.activeDoorType = data.doorTypes[0].id;
  ddTypeId = data.doorTypes[0].id; ddRefresh(); commit();
}
function ddUse() {
  const t = ddType(); if (!t) return;
  data.activeDoorType = t.id; commit();
  closeDoorDesigner(); setTool('puerta'); toast(`Puerta activa: ${t.nombre}`);
}
function ddApplySelected() {
  const t = ddType(); const d = selected && selected.type === 'door' ? getObj(selected) : null;
  if (!d) { el('dd-msg').textContent = 'Selecciona primero una puerta en el mapa (Ctrl+clic).'; return; }
  Object.assign(d, doorParams(t)); draw(); commit();
  el('dd-msg').textContent = 'Aplicado a la puerta seleccionada.';
}
function ddApplyAll() {
  const t = ddType(); if (!t) return;
  const list = data.doors.filter(d => d.tipo === t.id);
  list.forEach(d => Object.assign(d, doorParams(t)));
  draw(); commit();
  el('dd-msg').textContent = list.length ? `Actualizadas ${list.length} puerta(s).` : 'Aún no hay puertas de este tipo.';
}

// ---- Vista previa: alzado (izquierda) y planta (derecha) ----
function ddDraw() {
  const c = el('dd-canvas'), g = c.getContext('2d'), t = ddType(); if (!t) return;
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H); g.fillStyle = '#0b0d11'; g.fillRect(0, 0, W, H);
  const w = t.w, h = t.h, sill = t.sill || 0, fw = t.fw != null ? t.fw : 0.1, depth = t.depth || 0.5;
  const ang = ((t.angle != null ? t.angle : 72) * Math.PI) / 180;
  const mode = t.panel || 'single';
  g.font = '12px monospace'; g.textAlign = 'center';

  // ---------- ALZADO ----------
  const ew = W * 0.6;
  const margin = 0.8, wallW = w + margin * 2, wallH = sill + h + 0.6;
  const s = Math.min((ew - 70) / wallW, (H - 80) / wallH);
  const ox = ew / 2, gy = H - 40;
  const X = (x) => ox + x * s, Y = (y) => gy - y * s;
  g.fillStyle = '#64748b'; g.fillText('ALZADO', ew / 2, 16);
  g.fillStyle = '#3b4252'; g.fillRect(X(-wallW / 2), Y(wallH), wallW * s, wallH * s);          // muro
  g.fillStyle = '#4a2e15';                                                                         // marco
  g.fillRect(X(-w / 2 - fw / 2), Y(sill + h + fw / 2), (w + fw) * s, (h + fw / 2) * s);
  const ix0 = -w / 2 + fw / 2, ix1 = w / 2 - fw / 2, iy1 = sill + h - fw / 2;                     // espacio libre
  if (ix1 > ix0 && iy1 > sill) {
    if (mode === 'none') { g.fillStyle = '#1b2a3a'; g.fillRect(X(ix0), Y(iy1), (ix1 - ix0) * s, (iy1 - sill) * s); }
    else {
      g.fillStyle = '#a67c52'; g.fillRect(X(ix0), Y(iy1), (ix1 - ix0) * s, (iy1 - sill) * s);
      g.strokeStyle = '#7a5a38'; g.lineWidth = 1; g.strokeRect(X(ix0) + 6, Y(iy1) + 6, (ix1 - ix0) * s - 12, (iy1 - sill) * s - 12);
      if (mode === 'double') { g.strokeStyle = '#3a2a18'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(iy1)); g.lineTo(X(0), Y(sill)); g.stroke(); }
    }
  }
  g.strokeStyle = '#94a3b8'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(-wallW / 2) - 10, gy); g.lineTo(X(wallW / 2) + 10, gy); g.stroke(); // suelo
  // cotas
  g.strokeStyle = '#22d3ee'; g.fillStyle = '#22d3ee';
  g.beginPath(); g.moveTo(X(-w / 2), gy + 16); g.lineTo(X(w / 2), gy + 16); g.stroke();
  g.fillText(`${+w.toFixed(2)} m`, X(0), gy + 30);
  const dxr = X(w / 2) + Math.max(18, fw * s + 12);
  g.beginPath(); g.moveTo(dxr, Y(sill)); g.lineTo(dxr, Y(sill + h)); g.stroke();
  g.save(); g.translate(dxr + 14, Y(sill + h / 2)); g.rotate(-Math.PI / 2); g.fillText(`${+h.toFixed(2)} m`, 0, 0); g.restore();
  if (sill > 0) {
    const dxl = X(-w / 2) - 18;
    g.beginPath(); g.moveTo(dxl, gy); g.lineTo(dxl, Y(sill)); g.stroke();
    g.save(); g.translate(dxl - 8, Y(sill / 2)); g.rotate(-Math.PI / 2); g.fillText(`alféizar ${+sill.toFixed(2)}`, 0, 0); g.restore();
  }

  // ---------- PLANTA ----------
  const pw = W - ew, pcx = ew + pw / 2, pcy = H * 0.42;
  const sp = Math.min((pw - 30) / (w + 1.4), (H - 90) / (w + depth + 0.8));
  g.fillStyle = '#64748b'; g.fillText('PLANTA (esquema)', pcx, 16);
  const PX = (x) => pcx + x * sp, PY = (z) => pcy + z * sp;
  g.fillStyle = '#3b4252';
  g.fillRect(PX(-w / 2 - 0.7), PY(-depth / 2), (0.7 + 0) * sp, depth * sp);
  g.fillRect(PX(w / 2), PY(-depth / 2), 0.7 * sp, depth * sp);
  g.fillStyle = '#4a2e15';
  g.fillRect(PX(-w / 2 - fw / 2), PY(-depth / 2), fw * sp, depth * sp);
  g.fillRect(PX(w / 2 - fw / 2), PY(-depth / 2), fw * sp, depth * sp);
  if (mode !== 'none') {
    const dirY = t.swing === 'out' ? -1 : 1;
    const leaf = (hx, side, L) => {
      const ex = hx + side * L * Math.cos(ang), ey = dirY * L * Math.sin(ang);
      g.strokeStyle = '#a67c52'; g.lineWidth = Math.max(3, 0.08 * sp);
      g.beginPath(); g.moveTo(PX(hx), PY(0)); g.lineTo(PX(ex), PY(ey)); g.stroke();
      g.strokeStyle = '#ef4444'; g.lineWidth = 1; g.setLineDash([4, 4]);
      g.beginPath(); g.arc(PX(hx), PY(0), L * sp, side > 0 ? 0 : Math.PI, side > 0 ? dirY * ang : Math.PI - dirY * ang, (side > 0) === (dirY < 0)); g.stroke();
      g.setLineDash([]);
    };
    if (mode === 'double') { leaf(-w / 2, 1, w / 2); leaf(w / 2, -1, w / 2); }
    else if (t.hinge === 'right') leaf(w / 2, -1, w); else leaf(-w / 2, 1, w);
  }
  g.fillStyle = '#94a3b8'; g.fillText(t.swing === 'out' ? '↑ afuera' : '↓ adentro', pcx, H - 12);
}

// =====================================================================
//  ARRANQUE
// =====================================================================
loadLocal();
hist = [snapshot()]; histIdx = 0;
el('level-input').value = activeLevel;
resize(); setTool('sala'); updateHistButtons();

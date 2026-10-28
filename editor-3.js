function drawGrid() {
  const step = scale * GRID; // px por celda de 10 cm
  // Celdas de 10 cm
  if (step >= 4) {
    ctx.strokeStyle = '#1a1f2a'; ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = offsetX % step;
    const y0 = offsetY % step;
    for (let x = x0; x < canvas.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = y0; y < canvas.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
  }
  // Líneas mayores cada 1 m
  const major = scale; // 1 m en px
  ctx.strokeStyle = '#2a3344'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offsetX % major; x < canvas.width; x += major) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
  for (let y = offsetY % major; y < canvas.height; y += major) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
  ctx.stroke();
  // Ejes
  ctx.strokeStyle = '#475569'; ctx.beginPath();
  ctx.moveTo(offsetX, 0); ctx.lineTo(offsetX, canvas.height);
  ctx.moveTo(0, offsetY); ctx.lineTo(canvas.width, offsetY);
  ctx.stroke();
}

// =====================================================================
//  INTERACCIÓN PRINCIPAL
// =====================================================================
container.addEventListener('mousedown', e => {
  const [wx, wz] = mouseToWorld(e);
  const sx = snap(wx), sz = snap(wz);

  if (e.button === 1 || e.button === 2 || spacePressed) { isPanning = true; panStart = { x: e.clientX, y: e.clientY }; return; }
  if (e.button !== 0) return;

  // Seleccionar: herramienta Seleccionar, o Ctrl/Cmd+clic desde cualquier herramienta
  if (tool === 'sel' || e.ctrlKey || e.metaKey) {
    const hit = pickAt(wx, wz);
    if (e.shiftKey && hit) {
      // Shift+clic: añadir / quitar de la selección
      toggleInSelection(hit);
      draw(); return;
    }
    if (hit) {
      // Clic sobre un objeto: selección simple (o mantener grupo si ya estaba)
      if (!isInMulti(hit)) setSingleSelection(hit);
      else { selected = hit; currentEditId = null; renderProperties(); updateSelButton(); }
      // Preparar movimiento del grupo
      isMovingExisting = true; moveStart = { x: wx, z: wz };
      moveOrig = {};
      (multiSel.length ? multiSel : [hit]).forEach(s => {
        const o = getObj(s);
        if (o) moveOrig[selKey(s)] = deep(o);
      });
      draw(); return;
    }
    // Clic en vacío con herramienta Seleccionar → iniciar caja de selección
    if (tool === 'sel') {
      if (!e.shiftKey) clearSelection();
      isBoxSelecting = true;
      boxSel = { x0: wx, z0: wz, x1: wx, z1: wz };
      draw(); return;
    }
    clearSelection(); draw(); return;
  }

  if (tool === 'poly') {
    if (!isDrawingPoly) { isDrawingPoly = true; currentPoly = []; el('btn-finish').style.display = 'inline-block'; }
    currentPoly.push({ x: sx, z: sz }); updateHistButtons(); draw(); return;
  }
  if (tool === 'bloque') { paintingBlocks = true; blockErase = e.shiftKey; blockChanged = false; paintBlockAt(wx, wz); return; }
  if (tool === 'pared') {
    if (!isDrawingWall) { isDrawingWall = true; currentWall = []; el('btn-finish').style.display = 'inline-block'; }
    // Clic cerca del primer punto (con 3+ puntos) = cerrar la figura y terminar
    if (currentWall.length >= 3 && Math.hypot(sx - currentWall[0].x, sz - currentWall[0].z) <= GRID * 1.5) {
      finishDraw(true); return;
    }
    currentWall.push({ x: sx, z: sz }); updateHistButtons(); draw(); return;
  }

  if (tool === 'sala' || tool === 'rampa' || tool === 'escalera' || tool === 'hueco') {
    isDraggingNew = true;
    dragTemp = { x0: sx, z0: sz, x1: sx, z1: sz };
  }
  else if (tool === 'borrar') {
    const hit = pickAt(wx, wz);
    if (hit) { selected = hit; deleteSelected(); }
    else {
      const cx0 = cellOf(wx), cz0 = cellOf(wz);
      const bi = data.blocks.findIndex(b => almost(b.x, cx0) && almost(b.z, cz0) && isLevel(b.y || 0));
      if (bi >= 0) { data.blocks.splice(bi, 1); draw(); commit(); }
    }
  }
  else if (tool === 'puerta') {
    // Se pega al muro de trazo o al borde de sala más cercano
    let minDist = 20 / scale, bestPoint = null, bestAxis = 'z';
    const bk = data.blocks.find(b => almost(b.x, cellOf(wx)) && almost(b.z, cellOf(wz)) && isLevel(b.y || 0));
    if (bk) {
      const has = (x, z) => data.blocks.some(o => almost(o.x, x) && almost(o.z, z) && isLevel(o.y || 0));
      const nx = (has(bk.x - GRID, bk.z) ? 1 : 0) + (has(bk.x + GRID, bk.z) ? 1 : 0);
      const nz = (has(bk.x, bk.z - GRID) ? 1 : 0) + (has(bk.x, bk.z + GRID) ? 1 : 0);
      bestAxis = nx >= nz ? 'x' : 'z';
      bestPoint = { x: bk.x + GRID / 2, z: bk.z + GRID / 2 };
      minDist = -1;
    }
    for (const w of (bestPoint ? [] : data.walls)) {
      if (!isLevel(w.y || 0) || !w.points) continue;
      for (let j = 0; j < w.points.length - 1; j++) {
        const A = w.points[j], B = w.points[j + 1];
        const dx = B.x - A.x, dz = B.z - A.z, len2 = dx * dx + dz * dz;
        if (len2 === 0) continue;
        let t = ((wx - A.x) * dx + (wz - A.z) * dz) / len2; t = Math.max(0, Math.min(1, t));
        const cx = A.x + t * dx, cz = A.z + t * dz;
        const dist = Math.hypot(wx - cx, wz - cz);
        if (dist < minDist) { minDist = dist; bestPoint = { x: cx, z: cz }; bestAxis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z'; }
      }
    }
    if (!bestPoint) {
      for (const r of data.rooms) {
        if (!isLevel(r.y) || r.points || r.type === 'patio') continue;
        const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
        const dx0 = Math.abs(wx - x0); if (dx0 < minDist && wz >= z0 && wz <= z1) { minDist = dx0; bestPoint = { x: x0, z: wz }; bestAxis = 'z'; }
        const dx1 = Math.abs(wx - x1); if (dx1 < minDist && wz >= z0 && wz <= z1) { minDist = dx1; bestPoint = { x: x1, z: wz }; bestAxis = 'z'; }
        const dz0 = Math.abs(wz - z0); if (dz0 < minDist && wx >= x0 && wx <= x1) { minDist = dz0; bestPoint = { x: wx, z: z0 }; bestAxis = 'x'; }
        const dz1 = Math.abs(wz - z1); if (dz1 < minDist && wx >= x0 && wx <= x1) { minDist = dz1; bestPoint = { x: wx, z: z1 }; bestAxis = 'x'; }
      }
    }
    if (bestPoint) {
      const door = Object.assign({ id: uid('d'), x: bk ? bestPoint.x : snap(bestPoint.x), z: bk ? bestPoint.z : snap(bestPoint.z), ax: bestAxis, y: activeLevel }, doorParams(activeDoorType()));
      data.doors.push(door);
      selected = { type: 'door', id: door.id }; currentEditId = null; renderProperties();
      draw(); commit();
    }
  }
});

container.addEventListener('mousemove', e => {
  if (isPanning) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? (canvas.width / rect.width) : 1;
    const sy = rect.height ? (canvas.height / rect.height) : 1;
    offsetX += (e.clientX - panStart.x) * sx;
    offsetY += (e.clientY - panStart.y) * sy;
    panStart = { x: e.clientX, y: e.clientY };
    draw();
    return;
  }
  const [wx, wz] = mouseToWorld(e);
  mouseWorld = { x: wx, z: wz };
  hudEl.textContent = `X: ${(+snap(wx)).toFixed(1)}, Z: ${(+snap(wz)).toFixed(1)} | Zoom: ${Math.round(scale * 10)}%`;

  if (isDrawingPoly || isDrawingWall) draw();
  if (paintingBlocks) paintBlockAt(wx, wz);

  if (isBoxSelecting && boxSel) {
    boxSel.x1 = wx; boxSel.z1 = wz; draw(); return;
  }

  if (isMovingExisting && moveOrig) {
    const dx = snap(wx) - snap(moveStart.x);
    const dz = snap(wz) - snap(moveStart.z);
    const list = multiSel.length ? multiSel : (selected ? [selected] : []);
    list.forEach(s => {
      const orig = moveOrig[selKey(s)];
      const obj = getObj(s);
      if (orig && obj) applyMove(s, obj, orig, dx, dz);
    });
    if (selected) { const o = getObj(selected); if (o) syncInputs(o); }
    draw();
  }

  if (isDraggingNew && dragTemp) { dragTemp.x1 = snap(wx); dragTemp.z1 = snap(wz); draw(); }
});

container.addEventListener('mouseup', e => {
  if (isPanning) { isPanning = false; return; }
  if (paintingBlocks) { paintingBlocks = false; if (blockChanged) commit(); return; }
  if (isBoxSelecting) {
    isBoxSelecting = false;
    if (boxSel) {
      const hits = pickAllInBox(boxSel.x0, boxSel.z0, boxSel.x1, boxSel.z1);
      if (hits.length) {
        // Fusionar con selección previa si Shift
        if (!e.shiftKey) multiSel = [];
        hits.forEach(h => {
          if (!multiSel.some(m => m.type === h.type && m.id === h.id)) multiSel.push(h);
        });
        selected = multiSel[multiSel.length - 1] || null;
        currentEditId = null;
        updateSelButton(); renderProperties();
        toast(multiSel.length + ' seleccionado(s)');
      }
    }
    boxSel = null; draw(); return;
  }
  if (isMovingExisting) {
    const list = multiSel.length ? multiSel : (selected ? [selected] : []);
    list.forEach(s => {
      if (s.type === 'block') {
        const b = getObj(s);
        if (b) { b.x = cellOf(b.x + GRID / 2); b.z = cellOf(b.z + GRID / 2); }
      }
    });
    if (selected) { const o = getObj(selected); if (o) syncInputs(o); }
    isMovingExisting = false; moveOrig = null; commit(); return;
  }
  if (!isDraggingNew) return;
  isDraggingNew = false;

  // Coordenadas siempre alineadas a la rejilla de 10 cm (sin 1.6999999)
  const x0 = snap(Math.min(dragTemp.x0, dragTemp.x1));
  const x1 = snap(Math.max(dragTemp.x0, dragTemp.x1));
  const z0 = snap(Math.min(dragTemp.z0, dragTemp.z1));
  const z1 = snap(Math.max(dragTemp.z0, dragTemp.z1));
  if (x1 - x0 > 0 && z1 - z0 > 0) {
    if (tool === 'sala' || tool === 'rampa' || tool === 'escalera') {
      // Un solo objeto sala (se mueve entero). Visualmente se dibuja como marco de celdas.
      const isEsc = tool === 'escalera', isRmp = tool === 'rampa';
      data.rooms.push({ id: uid('r'), nombre: isEsc ? 'Escalera' : (isRmp ? 'Rampa' : 'Sala'), x0, x1, z0, z1, type: tool, y: activeLevel, y2: (isEsc || isRmp ? snap(activeLevel + 3) : null), dir: '+x', open: false });
    } else if (tool === 'hueco') {
      data.holes.push({ id: uid('h'), x0, x1, z0, z1, y: activeLevel });
    }
  }
  dragTemp = null; draw(); commit();
});

canvas.addEventListener('dblclick', () => { if (isDrawingPoly || isDrawingWall) finishDraw(); });

function paintBlockAt(wx, wz) {
  const cx = cellOf(wx), cz = cellOf(wz);
  const i = data.blocks.findIndex(b => almost(b.x, cx) && almost(b.z, cz) && isLevel(b.y || 0));
  const h = Math.max(0.5, parseFloat(el('block-h').value) || 4);
  if (blockErase) { if (i >= 0) { data.blocks.splice(i, 1); blockChanged = true; draw(); } return; }
  if (i >= 0) { if (data.blocks[i].h !== h) { data.blocks[i].h = h; blockChanged = true; draw(); } return; }
  data.blocks.push({ id: uid('b'), x: cx, z: cz, y: activeLevel, h }); blockChanged = true; draw();
}

// --- Construcción por celdas (10 cm) ---
function blockH() { return Math.max(0.5, parseFloat(el('block-h').value) || 4); }

function ensureBlock(cx, cz, h) {
  cx = cellOf(cx); cz = cellOf(cz);
  const i = data.blocks.findIndex(b => almost(b.x, cx) && almost(b.z, cz) && isLevel(b.y || 0));
  if (i >= 0) { data.blocks[i].h = h; return data.blocks[i]; }
  const b = { id: uid('b'), x: cx, z: cz, y: activeLevel, h };
  data.blocks.push(b);
  return b;
}

// Coloca bloques en el perímetro de un rectángulo [x0,x1) × [z0,z1) alineado a la rejilla
function placeRectBorder(x0, z0, x1, z1, h) {
  x0 = cellOf(Math.min(x0, x1)); z0 = cellOf(Math.min(z0, z1));
  x1 = snap(Math.max(x0 + GRID, Math.max(x0, x1))); // exclusivo en la esquina max
  z1 = snap(Math.max(z0 + GRID, Math.max(z0, z1)));
  const xs = [], zs = [];
  for (let x = x0; x < x1 - 1e-9; x = snap(x + GRID)) xs.push(x);
  for (let z = z0; z < z1 - 1e-9; z = snap(z + GRID)) zs.push(z);
  if (!xs.length || !zs.length) return;
  // bordes superior e inferior
  xs.forEach(x => { ensureBlock(x, zs[0], h); ensureBlock(x, zs[zs.length - 1], h); });
  // bordes izquierdo y derecho (sin repetir esquinas)
  zs.forEach(z => { ensureBlock(xs[0], z, h); ensureBlock(xs[xs.length - 1], z, h); });
}

// Rasteriza un segmento en celdas (supercover / Bresenham en rejilla)
function placeLineCells(ax, az, bx, bz, h) {
  ax = snap(ax); az = snap(az); bx = snap(bx); bz = snap(bz);
  const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
  const steps = Math.max(1, Math.round(Math.max(dx, dz) / GRID));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ensureBlock(ax + (bx - ax) * t, az + (bz - az) * t, h);
  }
}

// Rellena todas las celdas del rectángulo
function placeRectFill(x0, z0, x1, z1, h) {
  x0 = cellOf(Math.min(x0, x1)); z0 = cellOf(Math.min(z0, z1));
  x1 = snap(Math.max(x0 + GRID, Math.max(x0, x1)));
  z1 = snap(Math.max(z0 + GRID, Math.max(z0, z1)));
  for (let x = x0; x < x1 - 1e-9; x = snap(x + GRID))
    for (let z = z0; z < z1 - 1e-9; z = snap(z + GRID))
      ensureBlock(x, z, h);
}

// Borra bloques dentro del rectángulo
function clearRectBlocks(x0, z0, x1, z1) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const za = Math.min(z0, z1), zb = Math.max(z0, z1);
  data.blocks = data.blocks.filter(b => {
    if (!isLevel(b.y || 0)) return true;
    return !(b.x >= xa - 1e-9 && b.x < xb - 1e-9 && b.z >= za - 1e-9 && b.z < zb - 1e-9);
  });
}

function cancelDraw() {
  isDrawingPoly = false; currentPoly = []; isDrawingWall = false; currentWall = [];
  el('btn-finish').style.display = 'none'; updateHistButtons(); draw();
}

function finishDraw(close) {
  let changed = false;
  if (isDrawingPoly) {
    if (currentPoly.length >= 3) {
      const pts = currentPoly.map(p => ({ x: snap(p.x), z: snap(p.z) }));
      data.rooms.push({ id: uid('poly'), nombre: 'Patio Libre', type: 'patio', open: true, points: pts, y: activeLevel, y2: null });
      changed = true;
    }
    isDrawingPoly = false; currentPoly = [];
  }
  if (isDrawingWall) {
    // quita puntos repetidos (el doble clic duplica el último) y detecta cierre
    let pts = currentWall.filter((p, i) => i === 0 || p.x !== currentWall[i - 1].x || p.z !== currentWall[i - 1].z)
      .map(p => ({ x: snap(p.x), z: snap(p.z) }));
    let closed = close === true;
    // Si el último punto coincide o está muy cerca del primero → cerrado
    if (pts.length > 2) {
      const dClose = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
      if (dClose <= GRID * 1.5) { pts.pop(); closed = true; }
    }
    if (pts.length >= 2) {
      const w = { id: uid('w'), points: pts, h: blockH(), y: activeLevel };
      if (closed && pts.length >= 3) w.closed = true;
      data.walls.push(w);
      changed = true;
    }
    isDrawingWall = false; currentWall = [];
  }
  el('btn-finish').style.display = 'none';
  draw(); if (changed) commit(); else updateHistButtons();
}

function setTool(t) {
  tool = t;
  container.classList.add('painting');
  if (spacePressed) container.classList.remove('painting');
  document.querySelectorAll('#topbar button').forEach(b => b.classList.remove('active'));
  const btn = el('btn-' + t);
  if (btn) btn.classList.add('active');
  if (t !== 'poly' && isDrawingPoly) finishDraw();
  if (t !== 'pared' && isDrawingWall) finishDraw();
  el('block-h-wrap').style.display = (t === 'bloque' || t === 'sala' || t === 'pared' || t === 'poly' || t === 'rampa' || t === 'escalera') ? 'inline-block' : 'none';
  if (t !== 'sel') clearSelection();
  el('btn-finish').style.display = (isDrawingPoly || isDrawingWall) ? 'inline-block' : 'none';
  updateStatus();
}


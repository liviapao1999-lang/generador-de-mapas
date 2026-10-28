  const hitDoor = (onlyActive) => {
    for (let i = data.doors.length - 1; i >= 0; i--) {
      const d = data.doors[i]; if (onlyActive && !isLevel(d.y)) continue;
      const s = doorSpan(d);
      if (segDist(wx, wz, s[0], s[1], s[2], s[3]) < tol || Math.hypot(d.x - wx, d.z - wz) < 15 / scale) return { type: 'door', id: d.id };
    }
    return null;
  };
  const hitHole = (onlyActive) => {
    for (let i = data.holes.length - 1; i >= 0; i--) {
      const h = data.holes[i]; if (onlyActive && !isLevel(h.y)) continue;
      if (inRect(h, wx, wz)) return { type: 'hole', id: h.id };
    }
    return null;
  };
  const hitWall = (onlyActive) => {
    for (let i = data.walls.length - 1; i >= 0; i--) {
      const w = data.walls[i]; if (onlyActive && !isLevel(w.y || 0)) continue;
      const pts = w.points; if (!pts || pts.length < 2) continue;
      for (let j = 0; j < pts.length - 1; j++) {
        if (segDist(wx, wz, pts[j].x, pts[j].z, pts[j + 1].x, pts[j + 1].z) < tol) return { type: 'wall', id: w.id };
      }
      // Segmento de cierre en muros cerrados
      if (w.closed && pts.length >= 3) {
        if (segDist(wx, wz, pts[pts.length - 1].x, pts[pts.length - 1].z, pts[0].x, pts[0].z) < tol) return { type: 'wall', id: w.id };
      }
    }
    return null;
  };
  const hitBlock = (onlyActive) => {
    const cx = cellOf(wx), cz = cellOf(wz);
    for (let i = data.blocks.length - 1; i >= 0; i--) {
      const b = data.blocks[i];
      if (onlyActive && !isLevel(b.y || 0)) continue;
      if (almost(b.x, cx) && almost(b.z, cz)) return { type: 'block', id: b.id };
    }
    return null;
  };
  const hitElev = () => {
    for (let i = data.rooms.length - 1; i >= 0; i--) {
      const r = data.rooms[i];
      if (!isLevel(r.y) || (r.type !== 'escalera' && r.type !== 'rampa') || r.points) continue;
      if (inRect(r, wx, wz)) return { type: 'room', id: r.id };
    }
    return null;
  };
  const hitRoom = () => {
    for (let i = data.rooms.length - 1; i >= 0; i--) {
      const r = data.rooms[i]; if (!isLevel(r.y)) continue;
      const inside = r.points ? inPoly(r.points, wx, wz) : inRect(r, wx, wz);
      if (inside) return { type: 'room', id: r.id };
    }
    return null;
  };

  return hitDoor(true) || hitHole(true) || hitWall(true) || hitBlock(true)
    || hitDoor(false) || hitHole(false) || hitWall(false) || hitBlock(false)
    || hitElev() || hitRoom();
}

// Todos los objetos que intersectan la caja de selección (nivel activo prioritario en bloques)
function pickAllInBox(x0, z0, x1, z1) {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  const za = Math.min(z0, z1), zb = Math.max(z0, z1);
  const hits = [];
  const inBox = (x, z) => x >= xa && x <= xb && z >= za && z <= zb;
  const segInBox = (ax, az, bx, bz) => {
    // cualquier extremo dentro o el segmento cruza la caja (aprox: punto medio)
    if (inBox(ax, az) || inBox(bx, bz)) return true;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    return inBox(mx, mz);
  };
  data.doors.forEach(d => { if (isLevel(d.y) && inBox(d.x, d.z)) hits.push({ type: 'door', id: d.id }); });
  data.holes.forEach(h => {
    if (!isLevel(h.y)) return;
    const hx0 = Math.min(h.x0, h.x1), hx1 = Math.max(h.x0, h.x1);
    const hz0 = Math.min(h.z0, h.z1), hz1 = Math.max(h.z0, h.z1);
    if (hx1 >= xa && hx0 <= xb && hz1 >= za && hz0 <= zb) hits.push({ type: 'hole', id: h.id });
  });
  data.walls.forEach(w => {
    if (!isLevel(w.y || 0) || !w.points) return;
    for (let j = 0; j < w.points.length - 1; j++) {
      if (segInBox(w.points[j].x, w.points[j].z, w.points[j + 1].x, w.points[j + 1].z)) {
        hits.push({ type: 'wall', id: w.id }); return;
      }
    }
    if (w.closed && w.points.length >= 3) {
      const a = w.points[w.points.length - 1], b = w.points[0];
      if (segInBox(a.x, a.z, b.x, b.z)) hits.push({ type: 'wall', id: w.id });
    }
  });
  data.blocks.forEach(b => {
    if (isLevel(b.y || 0) && b.x + GRID > xa && b.x < xb && b.z + GRID > za && b.z < zb)
      hits.push({ type: 'block', id: b.id });
  });
  data.rooms.forEach(r => {
    if (!isLevel(r.y)) return;
    if (r.points) {
      if (r.points.some(p => inBox(p.x, p.z))) hits.push({ type: 'room', id: r.id });
    } else {
      const rx0 = Math.min(r.x0, r.x1), rx1 = Math.max(r.x0, r.x1);
      const rz0 = Math.min(r.z0, r.z1), rz1 = Math.max(r.z0, r.z1);
      if (rx1 >= xa && rx0 <= xb && rz1 >= za && rz0 <= zb) hits.push({ type: 'room', id: r.id });
    }
  });
  return hits;
}

// Mueve `obj` a partir de su copia original `orig` (dx, dz en unidades de mundo)
// Todas las coordenadas quedan re-alineadas a la rejilla (evita 1.6999999)
function applyMove(sel, obj, orig, dx, dz) {
  if (obj.points) obj.points = orig.points.map(p => ({ x: snap(p.x + dx), z: snap(p.z + dz) }));
  else if (sel.type === 'door' || sel.type === 'block') { obj.x = snap(orig.x + dx); obj.z = snap(orig.z + dz); }
  else {
    obj.x0 = snap(orig.x0 + dx); obj.x1 = snap(orig.x1 + dx);
    obj.z0 = snap(orig.z0 + dz); obj.z1 = snap(orig.z1 + dz);
  }
}

function arrFor(type) {
  return type === 'room' ? data.rooms
    : type === 'wall' ? data.walls
    : type === 'hole' ? data.holes
    : type === 'block' ? data.blocks
    : data.doors;
}

function duplicateSelected() {
  if (!selected) return;
  const obj = getObj(selected); if (!obj) return;
  const c = deep(obj); c.id = uid(selected.type[0]);
  applyMove(selected, c, deep(obj), 2, -2);
  if (selected.type === 'block') { c.x = snap(c.x); c.z = snap(c.z); }
  arrFor(selected.type).push(c);
  selected = { type: selected.type, id: c.id }; currentEditId = null;
  renderProperties(); draw(); commit(); toast('Duplicado');
}

// =====================================================================
//  DIBUJO
// =====================================================================
function draw() {
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // 1. Salas — se dibujan como marco de celdas (10 cm); el objeto sigue siendo uno solo y se mueve junto
  const cellPx = Math.max(1, scale * GRID);
  data.rooms.forEach(r => {
    const active = isLevel(r.y);
    ctx.globalAlpha = levelAlpha(r.y);
    const sel = isSelectedAny('room', r.id);
    const isElev = r.type === 'rampa' || r.type === 'escalera';
    const fillCol = r.type === 'rampa' ? 'rgba(245, 158, 11, 0.35)' : r.type === 'escalera' ? 'rgba(168, 85, 247, 0.35)' : (sel ? 'rgba(59, 130, 246, 0.55)' : 'rgba(200, 210, 225, 0.55)');
    const strokeCol = r.type === 'rampa' ? '#f59e0b' : r.type === 'escalera' ? '#a855f7' : (sel ? '#3b82f6' : '#94a3b8');

    if (r.points && r.points.length > 2) {
      // Patio poligonal: contorno + celdas a lo largo de cada arista
      ctx.beginPath();
      const [p0x, p0y] = W2S(r.points[0].x, r.points[0].z);
      ctx.moveTo(p0x, p0y);
      for (let i = 1; i < r.points.length; i++) { const [x, y] = W2S(r.points[i].x, r.points[i].z); ctx.lineTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
      ctx.strokeStyle = strokeCol; ctx.lineWidth = sel ? 2 : 1;
      ctx.fill(); ctx.stroke();
      // celdas sobre el perímetro
      for (let i = 0; i < r.points.length; i++) {
        const a = r.points[i], b = r.points[(i + 1) % r.points.length];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / GRID));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const cx = cellOf(a.x + (b.x - a.x) * t), cz = cellOf(a.z + (b.z - a.z) * t);
          const [bx, by] = W2S(cx, cz + GRID);
          ctx.fillStyle = fillCol;
          ctx.fillRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
          ctx.strokeStyle = strokeCol; ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
        }
      }
    } else {
      // Rectángulo: marco de celdas en el perímetro (no relleno continuo)
      let x0 = cellOf(Math.min(r.x0, r.x1)), z0 = cellOf(Math.min(r.z0, r.z1));
      let x1 = snap(Math.max(r.x0, r.x1)), z1 = snap(Math.max(r.z0, r.z1));
      if (x1 <= x0) x1 = snap(x0 + GRID);
      if (z1 <= z0) z1 = snap(z0 + GRID);
      // relleno muy suave del interior (solo referencia)
      if (!isElev) {
        const [ix0, iy0] = W2S(x0, z0);
        const [ix1, iy1] = W2S(x1, z1);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.04)';
        ctx.fillRect(ix0, Math.min(iy0, iy1), Math.abs(ix1 - ix0), Math.abs(iy1 - iy0));
      }
      const xs = [], zs = [];
      for (let x = x0; x < x1 - 1e-9; x = snap(x + GRID)) xs.push(x);
      for (let z = z0; z < z1 - 1e-9; z = snap(z + GRID)) zs.push(z);
      const cells = [];
      xs.forEach(x => { cells.push([x, zs[0]]); if (zs.length > 1) cells.push([x, zs[zs.length - 1]]); });
      zs.forEach(z => { cells.push([xs[0], z]); if (xs.length > 1) cells.push([xs[xs.length - 1], z]); });
      // dedupe
      const seen = new Set();
      cells.forEach(([cx, cz]) => {
        const k = cx + ',' + cz;
        if (seen.has(k)) return; seen.add(k);
        const [bx, by] = W2S(cx, cz + GRID);
        ctx.fillStyle = fillCol;
        ctx.fillRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
        ctx.strokeStyle = strokeCol; ctx.lineWidth = sel ? 1.5 : 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
      });
      // borde de selección
      if (sel) {
        const [sx0, sy0] = W2S(x0, z1);
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.strokeRect(sx0, sy0, (x1 - x0) * scale, (z1 - z0) * scale);
        ctx.setLineDash([]);
      }
    }

    // Etiqueta
    const cx = r.points ? (r.points.reduce((s, p) => s + p.x, 0) / r.points.length) : (r.x0 + r.x1) / 2;
    const cz = r.points ? (r.points.reduce((s, p) => s + p.z, 0) / r.points.length) : (r.z0 + r.z1) / 2;
    const [tx, ty] = W2S(cx, cz);
    ctx.fillStyle = active ? '#94a3b8' : '#475569';
    ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${r.nombre || r.id} (Y:${r.y}${r.y2 != null ? '→' + r.y2 : ''})`, tx, ty);
    ctx.textAlign = 'left';
  });

  // 2. Huecos
  data.holes.forEach(h => {
    ctx.globalAlpha = levelAlpha(h.y);
    const [x0, y0] = W2S(Math.min(h.x0, h.x1), Math.min(h.z0, h.z1));
    const [x1, y1] = W2S(Math.max(h.x0, h.x1), Math.max(h.z0, h.z1));
    ctx.fillStyle = 'rgba(15, 17, 21, 0.8)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = isSelectedAny('hole', h.id) ? '#3b82f6' : '#ef4444';
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  });

  // 2b. Bloques sueltos (herramienta Bloques; independientes de las salas)
  data.blocks.forEach(b => {
    ctx.globalAlpha = levelAlpha(b.y || 0);
    const [bx, by] = W2S(b.x, b.z + GRID);
    const k = Math.max(0, Math.min(1, ((b.h || 4) - 0.5) / 7));
    const selB = isSelectedAny('block', b.id);
    ctx.fillStyle = `hsl(210, 20%, ${88 - k * 38}%)`;
    ctx.fillRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
    if (selB) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 0.5, by + 0.5, cellPx - 1, cellPx - 1);
    }
    if (cellPx >= 14) { ctx.fillStyle = '#0f172a'; ctx.font = '9px sans-serif'; ctx.fillText(String(b.h || 4), bx + 2, by + 10); }
  });
  ctx.globalAlpha = 1;

  // 3. Muros
  data.walls.forEach(w => {
    ctx.globalAlpha = levelAlpha(w.y || 0);
    const sel = isSelectedAny('wall', w.id);
    ctx.strokeStyle = sel ? '#3b82f6' : '#cbd5e1';
    ctx.lineWidth = sel ? 6 : 4;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    if (w.points && w.points.length > 0) {
      const [sx, sy] = W2S(w.points[0].x, w.points[0].z);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < w.points.length; i++) { const [px, py] = W2S(w.points[i].x, w.points[i].z); ctx.lineTo(px, py); }
      // Cierra el trazo si el muro está marcado como cerrado
      if (w.closed && w.points.length >= 3) ctx.closePath();
    }
    ctx.stroke();
  });

  // 4. Puertas: abertura exacta (cian) + arco de giro
  data.doors.forEach(d => {
    ctx.globalAlpha = levelAlpha(d.y);
    const sel = isSelectedAny('door', d.id);
    const [x, y] = W2S(d.x, d.z);
    const w = d.w || 1.5, mode = doorPanelMode(d);
    const s = doorSpan(d);
    const [ax, ay] = W2S(s[0], s[1]), [bx, by] = W2S(s[2], s[3]);
    ctx.strokeStyle = sel ? '#3b82f6' : '#22d3ee'; ctx.lineWidth = sel ? 5 : 3; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    if (mode !== 'none') {
      const ang = ((d.angle != null ? d.angle : 72) * Math.PI) / 180;
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
      let startAngle = 0; let swingAngle = d.swing === 'in' ? ang : -ang;
      if (d.ax === 'z') { startAngle = d.hinge === 'left' ? 0 : Math.PI; if (d.hinge === 'right') swingAngle = -swingAngle; }
      else { startAngle = d.hinge === 'left' ? Math.PI / 2 : -Math.PI / 2; if (d.hinge === 'right') swingAngle = -swingAngle; }
      const rad = w * scale;
      ctx.beginPath(); ctx.arc(x, y, rad, startAngle, startAngle + swingAngle, swingAngle < 0); ctx.stroke();
      const endX = x + Math.cos(startAngle + swingAngle) * rad;
      const endY = y + Math.sin(startAngle + swingAngle) * rad;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;

  // --- PREVIEWS ---
  if (isDrawingPoly && currentPoly.length > 0) {
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const [sx, sy] = W2S(currentPoly[0].x, currentPoly[0].z);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < currentPoly.length; i++) { const [px, py] = W2S(currentPoly[i].x, currentPoly[i].z); ctx.lineTo(px, py); }
    const [mx, my] = W2S(mouseWorld.x, mouseWorld.z); ctx.lineTo(mx, my);
    ctx.stroke(); ctx.setLineDash([]);
    currentPoly.forEach(p => { const [px, py] = W2S(p.x, p.z); ctx.fillStyle = '#3b82f6'; ctx.fillRect(px - 4, py - 4, 8, 8); });
  }

  if (isDrawingWall && currentWall.length > 0) {
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath();
    const [sx, sy] = W2S(currentWall[0].x, currentWall[0].z);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < currentWall.length; i++) { const [px, py] = W2S(currentWall[i].x, currentWall[i].z); ctx.lineTo(px, py); }
    // Si el cursor está cerca del inicio (y hay ≥3 pts), previsualiza el cierre
    const nearStart = currentWall.length >= 3 && Math.hypot(snap(mouseWorld.x) - currentWall[0].x, snap(mouseWorld.z) - currentWall[0].z) <= GRID * 1.5;
    if (nearStart) {
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
    } else {
      const [mx, my] = W2S(mouseWorld.x, mouseWorld.z); ctx.lineTo(mx, my);
      ctx.stroke();
    }
    currentWall.forEach(p => { const [px, py] = W2S(p.x, p.z); ctx.fillStyle = '#ef4444'; ctx.fillRect(px - 3, py - 3, 6, 6); });
  }

  if (isDraggingNew && dragTemp) {
    ctx.strokeStyle = tool === 'hueco' ? '#ef4444' : '#3b82f6';
    ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    const [x, y] = W2S(Math.min(dragTemp.x0, dragTemp.x1), Math.max(dragTemp.z0, dragTemp.z1));
    ctx.strokeRect(x, y, Math.abs(dragTemp.x1 - dragTemp.x0) * scale, Math.abs(dragTemp.z1 - dragTemp.z0) * scale);
    ctx.setLineDash([]);
  }

  // Caja de selección múltiple
  if (isBoxSelecting && boxSel) {
    const xa = Math.min(boxSel.x0, boxSel.x1), xb = Math.max(boxSel.x0, boxSel.x1);
    const za = Math.min(boxSel.z0, boxSel.z1), zb = Math.max(boxSel.z0, boxSel.z1);
    const [px, py] = W2S(xa, zb);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.fillRect(px, py, (xb - xa) * scale, (zb - za) * scale);
    ctx.strokeRect(px, py, (xb - xa) * scale, (zb - za) * scale);
    ctx.setLineDash([]);
  }
}


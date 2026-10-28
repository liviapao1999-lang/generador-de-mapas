import * as THREE from 'three';

const T_SLAB = 0.3;   // grosor de pisos y techos (centrados en su Y)
const T_WALL = 0.4;   // grosor de muros de sala
const EPS = 1e-6;
const GRID = 0.1;     // tamaño de celda de bloque (10 cm), igual que el editor
const cellOf = (v) => Math.floor(v / GRID + 1e-9) * GRID;
const cellKey = (x, z) => (+x.toFixed(1)) + ',' + (+z.toFixed(1));

// ---------- utilidades geométricas ----------
const norm = (o) => ({
  ...o,
  x0: Math.min(o.x0, o.x1), x1: Math.max(o.x0, o.x1),
  z0: Math.min(o.z0, o.z1), z1: Math.max(o.z0, o.z1),
});

// Resta una lista de rectángulos a un rectángulo y devuelve los trozos restantes.
function rectSubtract(rect, cutters) {
  let pieces = [rect];
  for (const c of cutters) {
    const next = [];
    for (const p of pieces) {
      const ix0 = Math.max(p.x0, c.x0), ix1 = Math.min(p.x1, c.x1);
      const iz0 = Math.max(p.z0, c.z0), iz1 = Math.min(p.z1, c.z1);
      if (ix1 - ix0 <= EPS || iz1 - iz0 <= EPS) { next.push(p); continue; }
      if (iz0 - p.z0 > EPS) next.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: iz0 });
      if (p.z1 - iz1 > EPS) next.push({ x0: p.x0, x1: p.x1, z0: iz1, z1: p.z1 });
      if (ix0 - p.x0 > EPS) next.push({ x0: p.x0, x1: ix0, z0: iz0, z1: iz1 });
      if (p.x1 - ix1 > EPS) next.push({ x0: ix1, x1: p.x1, z0: iz0, z1: iz1 });
    }
    pieces = next;
  }
  return pieces;
}

// Resta el intervalo [lo,hi] a una lista de intervalos [a,b].
function subtractInterval(list, lo, hi) {
  const out = [];
  for (const [a, b] of list) {
    if (hi <= a + EPS || lo >= b - EPS) { out.push([a, b]); continue; }
    if (lo - a > EPS) out.push([a, lo]);
    if (b - hi > EPS) out.push([hi, b]);
  }
  return out;
}

const overlapLen = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

export function construirMapa(scene, json) {
  const matWall = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9 });
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8 });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
  const matRampa = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
  const matEscalera = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.7 });
  const matHighFloor = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.8 });

  const matDoorFrame = new THREE.MeshStandardMaterial({ color: 0x4a2e15, roughness: 0.9 });
  const matDoorPanel = new THREE.MeshStandardMaterial({ color: 0xa67c52, roughness: 0.6, metalness: 0.1 });
  const matDoorHole = new THREE.MeshBasicMaterial({ color: 0x000000 });

  const root = new THREE.Group();
  scene.add(root);

  function createBox(w, h, d, x, y, z, mat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }

  // Caja a partir de un rectángulo en planta {x0,x1,z0,z1}
  function slabBox(rc, y, mat) {
    const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    if (w <= EPS || d <= EPS) return;
    createBox(w, T_SLAB, d, rc.x0 + w / 2, y, rc.z0 + d / 2, mat);
  }

  // --- MUROS DE TRAZO (POLILÍNEAS CON GROSOR) ---
  // · Esquinas en inglete reales (el ancho se mantiene en el vértice).
  // · Si el último punto coincide con el primero (o w.closed) se cierra el anillo: la unión inicio-fin también se mitra.
  // · Las puertas colocadas sobre un tramo recto abren un hueco real (con dintel y antepecho).
  function crearMuroDesdeLinea(w, thickness) {
    const height = w.h || 3, y = w.y || 0, half = thickness / 2;
    const EQ = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
    let pts = [];
    (w.points || []).forEach(p => { if (!pts.length || !EQ(p, pts[pts.length - 1])) pts.push({ x: p.x, z: p.z }); });
    let closed = !!w.closed;
    if (pts.length > 2 && EQ(pts[0], pts[pts.length - 1])) { pts.pop(); closed = true; }
    if (pts.length < 2) return;
    if (pts.length < 3) closed = false;
    const n = pts.length;
    const segCount = closed ? n : n - 1;

    // Normal de cada tramo (a la izquierda del avance)
    const segs = [];
    for (let i = 0; i < segCount; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      segs.push({ a, b, len, ux: dx / len, uz: dz / len, nx: -dz / len, nz: dx / len });
    }
    // Vértices desplazados con inglete: L = izquierda, R = derecha
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const prev = closed ? segs[(i - 1 + segCount) % segCount] : segs[i - 1];
      const next = closed ? segs[i % segCount] : segs[i];
      let mx, mz, k = 1;
      if (!prev) { mx = next.nx; mz = next.nz; }
      else if (!next) { mx = prev.nx; mz = prev.nz; }
      else {
        mx = prev.nx + next.nx; mz = prev.nz + next.nz;
        const ml = Math.hypot(mx, mz);
        if (ml < 1e-6) { mx = prev.nx; mz = prev.nz; } else { mx /= ml; mz /= ml; }
        k = 1 / Math.max(0.25, mx * prev.nx + mz * prev.nz); // largo del inglete
      }
      const o = half * k;
      L.push({ x: pts[i].x + mx * o, z: pts[i].z + mz * o });
      R.push({ x: pts[i].x - mx * o, z: pts[i].z - mz * o });
    }

    const piece = (seg, i, sa, sb, y0, y1) => {
      if (sb - sa < 0.02 || y1 - y0 < 0.02) return;
      const j = (i + 1) % n;
      // Cortes interiores perpendiculares al muro; solo los extremos del tramo siguen el inglete
      const at = (s, side, P, V) => (s <= 1e-9 ? P : s >= seg.len - 1e-9 ? V
        : { x: seg.a.x + seg.ux * s + side * seg.nx * half, z: seg.a.z + seg.uz * s + side * seg.nz * half });
      const l0 = at(sa, 1, L[i], L[j]), l1 = at(sb, 1, L[i], L[j]);
      const r0 = at(sa, -1, R[i], R[j]), r1 = at(sb, -1, R[i], R[j]);
      const shape = new THREE.Shape();
      shape.moveTo(l0.x, -l0.z); shape.lineTo(l1.x, -l1.z); shape.lineTo(r1.x, -r1.z); shape.lineTo(r0.x, -r0.z); shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false }), matWall);
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0;
      mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    };

    segs.forEach((seg, i) => {
      // ¿Qué puertas caen sobre este tramo? (solo tramos alineados con X o con Z, igual que la puerta)
      const alongX = Math.abs(seg.uz) < 1e-3, alongZ = Math.abs(seg.ux) < 1e-3;
      const found = [];
      if (alongX || alongZ) (json.doors || []).forEach(dr => {
        if (Math.abs((dr.y || 0) - y) > 0.5) return;
        if (alongX && dr.ax === 'z') return;
        if (alongZ && dr.ax !== 'z') return;
        const s = (dr.x - seg.a.x) * seg.ux + (dr.z - seg.a.z) * seg.uz;
        const off = Math.abs((dr.x - seg.a.x) * seg.nx + (dr.z - seg.a.z) * seg.nz);
        if (off > half + 0.3 || s < -0.01 || s > seg.len + 0.01) return;
        found.push({ dr, s });
      });
      found.sort((p, q) => p.s - q.s);
      let cur = 0;
      found.forEach(({ dr, s }) => {
        cutDoors.add(dr);
        const ow = dr.w || 1.5, oh = dr.h || 3.6, sill = dr.sill || 0;
        const lo = Math.max(0, s - ow / 2), hi = Math.min(seg.len, s + ow / 2);
        if (lo > cur) piece(seg, i, cur, lo, y, y + height);
        if (sill > 0.02) piece(seg, i, lo, hi, y, y + sill);
        if (height - sill - oh > 0.02) piece(seg, i, lo, hi, y + sill + oh, y + height);
        cur = Math.max(cur, hi);
      });
      if (cur < seg.len) piece(seg, i, cur, seg.len, y, y + height);
    });
  }

  // --- GENERADOR DE PUERTAS ---
  // Medidas propias de cada puerta (las define el diseñador del editor):
  //   w/h = abertura, sill = alféizar, fw = grosor del marco, depth = profundidad del marco,
  //   panel = 'single' | 'double' | 'none' (arco sin hoja), angle = apertura de la hoja en grados.
  // fill = true tapa la abertura en negro (solo cuando la puerta NO está en un muro de sala,
  // porque en los muros de sala el motor abre un hueco real).
  function createDoor(d, fill = true) {
    const w = d.w || 1.5; const h = d.h || 3.6; const y = (d.y || 0) + (d.sill || 0);
    const mode = d.panel || (d.double ? 'double' : 'single');
    const isDouble = mode === 'double'; const panelW = isDouble ? w / 2 : w;
    const frameThick = d.fw != null ? d.fw : 0.1; const frameDepth = d.depth || 0.5;
    const openAngle = ((d.angle != null ? d.angle : 72) * Math.PI) / 180;

    if (d.ax === 'z') {
      createBox(frameDepth, h, frameThick, d.x, y + h / 2, d.z - w / 2, matDoorFrame);
      createBox(frameDepth, h, frameThick, d.x, y + h / 2, d.z + w / 2, matDoorFrame);
      createBox(frameDepth, frameThick, w, d.x, y + h, d.z, matDoorFrame);
      if (fill && mode !== 'none') createBox(0.1, h, w, d.x, y + h / 2, d.z, matDoorHole);
      if (mode === 'none') return;

      const hingeZ = d.hinge === 'left' ? d.z - w / 2 + frameThick / 2 : d.z + w / 2 - frameThick / 2;
      const dir = d.hinge === 'left' ? 1 : -1;
      const angle = d.swing === 'in' ? openAngle : -openAngle;

      const pivot = new THREE.Group();
      pivot.position.set(d.x, y, hingeZ); pivot.rotation.y = dir * angle; root.add(pivot);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, h - 0.1, panelW), matDoorPanel);
      panel.position.set(0, h / 2, dir * panelW / 2); panel.castShadow = true; pivot.add(panel);

      if (isDouble) {
        const pivot2 = new THREE.Group(); pivot2.position.set(d.x, y, d.z + w / 2 - frameThick / 2);
        pivot2.rotation.y = -dir * angle; root.add(pivot2);
        const panel2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, h - 0.1, panelW), matDoorPanel);
        panel2.position.set(0, h / 2, -dir * panelW / 2); panel2.castShadow = true; pivot2.add(panel2);
      }
    } else {
      createBox(frameThick, h, frameDepth, d.x - w / 2, y + h / 2, d.z, matDoorFrame);
      createBox(frameThick, h, frameDepth, d.x + w / 2, y + h / 2, d.z, matDoorFrame);
      createBox(w, frameThick, frameDepth, d.x, y + h, d.z, matDoorFrame);
      if (fill && mode !== 'none') createBox(w, h, 0.1, d.x, y + h / 2, d.z, matDoorHole);
      if (mode === 'none') return;

      const hingeX = d.hinge === 'left' ? d.x - w / 2 + frameThick / 2 : d.x + w / 2 - frameThick / 2;
      const dir = d.hinge === 'left' ? 1 : -1;
      const angle = d.swing === 'in' ? -openAngle : openAngle;

      const pivot = new THREE.Group();
      pivot.position.set(hingeX, y, d.z); pivot.rotation.y = dir * angle; root.add(pivot);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, h - 0.1, 0.08), matDoorPanel);
      panel.position.set(dir * panelW / 2, h / 2, 0); panel.castShadow = true; pivot.add(panel);

      if (isDouble) {
        const pivot2 = new THREE.Group(); pivot2.position.set(d.x + w / 2 - frameThick / 2, y, d.z);
        pivot2.rotation.y = -dir * angle; root.add(pivot2);
        const panel2 = new THREE.Mesh(new THREE.BoxGeometry(panelW, h - 0.1, 0.08), matDoorPanel);
        panel2.position.set(-dir * panelW / 2, h / 2, 0); panel2.castShadow = true; pivot2.add(panel2);
      }
    }
  }

  // ---------- PREPARACIÓN: salas rectangulares, huecos y losas ----------
  const allHoles = (json.holes || []).map(norm);
  const isPoly = (r) => r.points && r.points.length > 2;
  const isElev = (r) => r.type === 'rampa' || r.type === 'escalera';

  const rects = (json.rooms || []).filter(r => !isPoly(r)).map(norm);
  const holesAt = (y) => allHoles.filter(h => Math.abs(h.y - y) < 0.1);

  // Trozos de piso de cada sala (rectángulo menos sus huecos)
  const floorPieces = new Map();
  rects.forEach(r => {
    if (isElev(r)) return;
    floorPieces.set(r, rectSubtract(r, holesAt(r.y)));
  });

  const topOf = (r) => (r.y2 != null ? r.y2 : r.y + 4);
  const overlapY = (a, b) => overlapLen(a.y, topOf(a), b.y, topOf(b)) > 0.1;

  // Puertas que caen sobre un muro de sala: ahí se abre un hueco real (sin tapa negra)
  const cutDoors = new Set();

  // ---------- SALAS POLIGONALES (patios libres) ----------
  (json.rooms || []).filter(isPoly).forEach(r => {
    const cleanPoints = [];
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      const last = cleanPoints[cleanPoints.length - 1];
      if (!last || last.x !== p.x || last.z !== p.z) cleanPoints.push(p);
    }
    if (cleanPoints.length > 2 &&
        cleanPoints[0].x === cleanPoints[cleanPoints.length - 1].x &&
        cleanPoints[0].z === cleanPoints[cleanPoints.length - 1].z) cleanPoints.pop();

    const shape = new THREE.Shape();
    shape.moveTo(cleanPoints[0].x, -cleanPoints[0].z);
    for (let i = 1; i < cleanPoints.length; i++) shape.lineTo(cleanPoints[i].x, -cleanPoints[i].z);

    holesAt(r.y).forEach(h => {
      const path = new THREE.Path();
      path.moveTo(h.x0, -h.z0); path.lineTo(h.x1, -h.z0); path.lineTo(h.x1, -h.z1); path.lineTo(h.x0, -h.z1); path.lineTo(h.x0, -h.z0);
      shape.holes.push(path);
    });

    const geo = new THREE.ExtrudeGeometry(shape, { depth: T_SLAB, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, matFloor);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = r.y;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  });

  // ---------- SALAS RECTANGULARES, RAMPAS Y ESCALERAS ----------
  rects.forEach(r => {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = r.x0 + w / 2, cz = r.z0 + d / 2;
    const dir = r.dir || '+x';

    // Superficie caminable de un piso = y + T_SLAB/2
    const half = T_SLAB / 2;

    if (r.type === 'rampa') {
      const rise = (r.y2 != null ? r.y2 : r.y + 3) - r.y;
      const length = dir.includes('z') ? d : w;
      const theta = Math.atan2(rise, length);
      const hypot = Math.sqrt(length * length + rise * rise);
      const geo = new THREE.BoxGeometry(dir.includes('z') ? w : hypot, T_SLAB, dir.includes('z') ? hypot : d);
      const ramp = new THREE.Mesh(geo, matRampa);
      // La cara superior va de (y + half) a (y2 + half): enrasada con los pisos
      ramp.position.set(cx, r.y + rise / 2 + half - half / Math.cos(theta), cz);
      if (dir === '+z') ramp.rotation.x = -theta;
      if (dir === '-z') ramp.rotation.x = theta;
      if (dir === '+x') ramp.rotation.z = theta;
      if (dir === '-x') ramp.rotation.z = -theta;
      ramp.castShadow = true; ramp.receiveShadow = true; root.add(ramp);
      return;
    }

    if (r.type === 'escalera') {
      const y2 = r.y2 != null ? r.y2 : r.y + 3;
      const surf0 = r.y + half, surf1 = y2 + half;
      const rise = surf1 - surf0;
      const steps = r.steps || Math.max(4, Math.min(40, Math.round(Math.abs(y2 - r.y) / 0.25)));
      const length = dir.includes('z') ? d : w;
      const stepD = length / steps;
      const baseY = r.y - half; // los escalones son sólidos hasta la base
      for (let i = 0; i < steps; i++) {
        // El último escalón queda exactamente a la altura del piso superior
        const topY = surf0 + ((i + 1) / steps) * rise;
        const offset = i * stepD + stepD / 2;
        let sx = cx, sz = cz;
        if (dir === '+z') sz = r.z0 + offset;
        if (dir === '-z') sz = r.z1 - offset;
        if (dir === '+x') sx = r.x0 + offset;
        if (dir === '-x') sx = r.x1 - offset;
        const sw = dir.includes('z') ? w : stepD;
        const sd = dir.includes('z') ? stepD : d;
        const h = topY - baseY;
        createBox(sw, h, sd, sx, baseY + h / 2, sz, matEscalera);
      }
      return;
    }

    // --- Piso (ya sin huecos) ---
    const floorMat = r.y > 3 ? matHighFloor : matFloor;
    floorPieces.get(r).forEach(p => slabBox(p, r.y, floorMat));

    // --- Techo: se le resta lo que ya cubre el piso de otra sala en esa misma altura ---
    if (r.y2 != null) {
      const cutters = holesAt(r.y).slice();
      rects.forEach(o => {
        if (o === r || isElev(o)) return;
        if (Math.abs(o.y - r.y2) < 0.1) cutters.push(...floorPieces.get(o));
      });
      rectSubtract(r, cutters).forEach(p => slabBox(p, r.y2, matRoof));
    }

    // --- Paredes: sin muros entre salas cerradas que comparten borde ---
    if (r.type === 'sala' && !r.open) {
      const wh = topOf(r) - r.y;
      const ht = T_WALL / 2;
      const others = rects.filter(o => o !== r && o.type === 'sala' && !o.open && overlapY(r, o));

      const touchesX = (xEdge, side) => others.filter(o =>
        Math.abs((side === 'left' ? o.x1 : o.x0) - xEdge) < EPS && overlapLen(r.z0, r.z1, o.z0, o.z1) > EPS);
      const touchesZ = (zEdge, side) => others.filter(o =>
        Math.abs((side === 'top' ? o.z1 : o.z0) - zEdge) < EPS && overlapLen(r.x0, r.x1, o.x0, o.x1) > EPS);

      const nL = touchesX(r.x0, 'left'), nR = touchesX(r.x1, 'right');
      const nT = touchesZ(r.z0, 'top'), nB = touchesZ(r.z1, 'bottom');

      // Puertas colocadas sobre un borde de esta sala (ax 'x' = muro a lo largo de X, 'z' = a lo largo de Z)
      const doorsOnEdge = (ax, coord, a0, a1) => (json.doors || []).filter(dr => {
        if (Math.abs((dr.y || 0) - r.y) > 0.5) return false;
        return ax === 'x'
          ? dr.ax !== 'z' && Math.abs(dr.z - coord) < 0.3 && dr.x >= a0 - EPS && dr.x <= a1 + EPS
          : dr.ax === 'z' && Math.abs(dr.x - coord) < 0.3 && dr.z >= a0 - EPS && dr.z <= a1 + EPS;
      });
      // Emite los tramos de muro recortando la abertura de cada puerta; deja dintel (arriba) y antepecho (abajo)
      const emitWall = (segs, ds, ax, make) => {
        let rest = segs;
        ds.forEach(dr => {
          cutDoors.add(dr);
          const ow = dr.w || 1.5, oh = dr.h || 3.6, sill = dr.sill || 0;
          const c = ax === 'x' ? dr.x : dr.z;
          const dlo = c - ow / 2, dhi = c + ow / 2;
          const before = rest;
          rest = subtractInterval(rest, dlo, dhi);
          before.forEach(([a, b]) => {
            const lo2 = Math.max(a, dlo), hi2 = Math.min(b, dhi);
            if (hi2 - lo2 <= 0.05) return;
            const yb = r.y + sill, yt = r.y + sill + oh;
            if (sill > 0.02) make(lo2, hi2, r.y, yb);
            if (r.y + wh - yt > 0.02) make(lo2, hi2, yt, r.y + wh);
          });
        });
        rest.forEach(([a, b]) => make(a, b, r.y, r.y + wh));
      };

      // Muros horizontales (a lo largo de X): se alargan en las esquinas libres
      const lo = r.x0 - (nL.length ? 0 : ht);
      const hi = r.x1 + (nR.length ? 0 : ht);
      [[r.z0, nT], [r.z1, nB]].forEach(([z, neigh]) => {
        let segs = [[lo, hi]];
        neigh.forEach(o => { segs = subtractInterval(segs, Math.max(r.x0, o.x0), Math.min(r.x1, o.x1)); });
        emitWall(segs, doorsOnEdge('x', z, r.x0, r.x1), 'x', (a, b, y0, y1) => {
          if (b - a > 0.05 && y1 - y0 > 0.02) createBox(b - a, y1 - y0, T_WALL, (a + b) / 2, (y0 + y1) / 2, z, matWall);
        });
      });

      // Muros verticales (a lo largo de Z): entre las esquinas, para no duplicar volumen
      [[r.x0, nL], [r.x1, nR]].forEach(([x, neigh]) => {
        let segs = [[r.z0 + ht, r.z1 - ht]];
        neigh.forEach(o => { segs = subtractInterval(segs, Math.max(r.z0, o.z0), Math.min(r.z1, o.z1)); });
        emitWall(segs, doorsOnEdge('z', x, r.z0, r.z1), 'z', (a, b, y0, y1) => {
          if (b - a > 0.05 && y1 - y0 > 0.02) createBox(T_WALL, y1 - y0, b - a, x, (y0 + y1) / 2, (a + b) / 2, matWall);
        });
      });
    }
  });

  // --- MUROS POR BLOQUES (celdas de 10×10 cm) ---
  // Cada bloque {x, z, y, h} ocupa [x,x+GRID]×[z,z+GRID] desde y hasta y+h.
  // Se genera UNA malla fusionada sin caras internas (solo lo visible), con UV en metros de mundo.
  const doorFix = new Map(); // puerta -> versión centrada en el muro de bloques
  function crearBloques(list) {
    const G = GRID;
    const cells = (list || []).filter(b => b && isFinite(b.x) && isFinite(b.z))
      .map(b => ({ x: +cellOf(b.x).toFixed(1), z: +cellOf(b.z).toFixed(1), y: b.y || 0, h: b.h > 0 ? b.h : 4 }));
    if (!cells.length) return;
    const doors = json.doors || [];
    const key = cellKey;

    // 1) Aberturas de puerta: las celdas tocadas se descomponen en cajas con hueco
    const solid = new Map();   // celdas enteras (se les ocultan caras internas)
    const pieces = [];         // cajas sueltas (celdas con puerta)
    const cellDoors = (c) => doors.filter(dr => {
      if (dr.y == null ? c.y > 0.5 : (dr.y < c.y - 0.5 || dr.y >= c.y + c.h)) return false;
      const ow = dr.w || 1.5;
      if (dr.ax === 'z') {
        return dr.x >= c.x - 0.05 && dr.x <= c.x + G + 0.05 && Math.min(c.z + G, dr.z + ow / 2) - Math.max(c.z, dr.z - ow / 2) > 0.02;
      }
      return dr.z >= c.z - 0.05 && dr.z <= c.z + G + 0.05 && Math.min(c.x + G, dr.x + ow / 2) - Math.max(c.x, dr.x - ow / 2) > 0.02;
    });
    const hitCells = new Map(); // puerta -> celdas
    cells.forEach(c => {
      const ds = cellDoors(c);
      if (!ds.length) { const k = key(c.x, c.z); if (!solid.has(k)) solid.set(k, []); solid.get(k).push(c); return; }
      let boxes = [{ x0: c.x, x1: c.x + G, z0: c.z, z1: c.z + G, y0: c.y, y1: c.y + c.h }];
      ds.forEach(dr => {
        cutDoors.add(dr);
        if (!hitCells.has(dr)) hitCells.set(dr, []);
        hitCells.get(dr).push(c);
        const ow = dr.w || 1.5, oh = dr.h || 3.6, sill = dr.sill || 0;
        const ys = (dr.y || 0) + sill, yt = ys + oh, ax = dr.ax === 'z' ? 'z' : 'x';
        const a = (ax === 'x' ? dr.x : dr.z) - ow / 2, b = a + ow;
        const next = [];
        boxes.forEach(bx => {
          const lo = ax === 'x' ? 'x0' : 'z0', hi = ax === 'x' ? 'x1' : 'z1';
          const ca = Math.max(a, bx[lo]), cb = Math.min(b, bx[hi]);
          if (cb - ca <= 0.02 || Math.min(yt, bx.y1) - Math.max(ys, bx.y0) <= 0.02) { next.push(bx); return; }
          if (ca - bx[lo] > 0.02) next.push({ ...bx, [hi]: ca });
          if (bx[hi] - cb > 0.02) next.push({ ...bx, [lo]: cb });
          if (ys - bx.y0 > 0.02) next.push({ ...bx, [lo]: ca, [hi]: cb, y1: Math.max(bx.y0, ys) });
          if (bx.y1 - yt > 0.02) next.push({ ...bx, [lo]: ca, [hi]: cb, y0: Math.min(bx.y1, yt) });
        });
        boxes = next;
      });
      pieces.push(...boxes);
    });
    // La puerta se centra en el grosor del muro de bloques
    hitCells.forEach((cs, dr) => {
      const ax = dr.ax === 'z' ? 'z' : 'x';
      const lo = Math.min(...cs.map(c => ax === 'x' ? c.z : c.x));
      const hi = Math.max(...cs.map(c => (ax === 'x' ? c.z : c.x) + G));
      const fix = Object.assign({}, dr, { depth: hi - lo });
      if (ax === 'x') fix.z = (lo + hi) / 2; else fix.x = (lo + hi) / 2;
      doorFix.set(dr, fix);
    });

    // 2) Malla fusionada
    const P = [], N = [], UV = [], IDX = [];
    // eje: 0=x 1=y 2=z; c = coordenada del plano; a0..a1 / b0..b1 = rango en los dos ejes tangentes
    const face = (axis, sign, c, a0, a1, b0, b1) => {
      if (a1 - a0 < 1e-4 || b1 - b0 < 1e-4) return;
      const t = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
      const base = axis === 2 ? 1 : -1;
      const corners = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
      if (sign * base < 0) corners.reverse();
      const i0 = P.length / 3;
      corners.forEach(([u, v]) => {
        const p = [0, 0, 0]; p[axis] = c; p[t[0]] = u; p[t[1]] = v;
        P.push(p[0], p[1], p[2]);
        const n = [0, 0, 0]; n[axis] = sign; N.push(n[0], n[1], n[2]);
        UV.push(axis === 1 ? p[0] : p[t[0]], axis === 1 ? p[2] : p[1]);
      });
      IDX.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    const box = (x0, x1, y0, y1, z0, z1, cull) => {
      const side = (axis, sign, c, a0, a1, nx, nz) => {
        let free = [[y0, y1]];
        if (cull) (solid.get(key(nx, nz)) || []).forEach(o => { free = subtractInterval(free, o.y, o.y + o.h); });
        free.forEach(([f0, f1]) => face(axis, sign, c, a0, a1, f0, f1));
      };
      const cx = +cellOf(x0).toFixed(1), cz = +cellOf(z0).toFixed(1);
      side(0, -1, x0, z0, z1, +(cx - G).toFixed(1), cz); side(0, 1, x1, z0, z1, +(cx + G).toFixed(1), cz);
      side(2, -1, z0, x0, x1, cx, +(cz - G).toFixed(1)); side(2, 1, z1, x0, x1, cx, +(cz + G).toFixed(1));
      const same = cull ? (solid.get(key(cx, cz)) || []) : [];
      const covered = (yy, up) => same.some(o => up ? (o.y <= yy + 1e-4 && o.y + o.h > yy + 1e-4) : (o.y < yy - 1e-4 && o.y + o.h >= yy - 1e-4));
      if (!covered(y1, true)) face(1, 1, y1, x0, x1, z0, z1);
      if (!covered(y0, false)) face(1, -1, y0, x0, x1, z0, z1);
    };
    solid.forEach(arr => arr.forEach(c => box(c.x, c.x + G, c.y, c.y + c.h, c.z, c.z + G, true)));
    pieces.forEach(p => {
      face(0, -1, p.x0, p.z0, p.z1, p.y0, p.y1); face(0, 1, p.x1, p.z0, p.z1, p.y0, p.y1);
      face(2, -1, p.z0, p.x0, p.x1, p.y0, p.y1); face(2, 1, p.z1, p.x0, p.x1, p.y0, p.y1);
      face(1, 1, p.y1, p.x0, p.x1, p.z0, p.z1); face(1, -1, p.y0, p.x0, p.x1, p.z0, p.z1);
    });
    if (!IDX.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(IDX);
    const mesh = new THREE.Mesh(geo, matWall);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }
  crearBloques(json.blocks);

  // --- PROCESAR MUROS CONTINUOS (WALLS) ---
  if (json.walls) {
    json.walls.forEach(w => {
      if (w.points && w.points.length >= 2) {
        crearMuroDesdeLinea(w, T_WALL);
      }
    });
  }

  // --- PROCESAR PUERTAS (DOORS) ---
  if (json.doors) {
    json.doors.forEach(d => createDoor(doorFix.get(d) || d, !cutDoors.has(d)));
  }

  return root;
}

// Quita un mapa de la escena liberando memoria (para recargas en vivo)
export function destruirMapa(scene, root) {
  if (!root) return;
  scene.remove(root);
  const mats = new Set();
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) mats.add(o.material);
  });
  mats.forEach(m => m.dispose());
}

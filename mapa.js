import * as THREE from 'three';

const T_SLAB = 0.3;
const T_WALL = 0.4;
const EPS = 1e-6;
const GRID = 0.1;
const cellOf = (v) => Math.floor(v / GRID + 1e-9) * GRID;
const cellKey = (x, z) => (+x.toFixed(1)) + ',' + (+z.toFixed(1));

// Placeholder - full file upload in progress
export function construirMapa(scene, json) {
  console.warn('mapa.js incomplete upload');
  return new THREE.Group();
}
export function destruirMapa(scene, root) {
  if (root) scene.remove(root);
}

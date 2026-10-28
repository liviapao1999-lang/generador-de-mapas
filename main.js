import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { construirMapa, destruirMapa } from './mapa.js';

const zoneEl = document.getElementById('zone');
const overlay = document.getElementById('overlay');
const overlayHTML = overlay.innerHTML;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8c3d9);
scene.fog = new THREE.FogExp2(0xa8c3d9, 0.015);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(15, 20, 35);

const controls = new PointerLockControls(camera, document.body);

overlay.addEventListener('click', () => {
    controls.lock();
    overlay.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    overlay.style.display = 'flex';
});

// LUCES
const sunLight = new THREE.DirectionalLight(0xfff4e6, 2.5);
sunLight.position.set(30, 60, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// --- CARGA DEL MAPA ---
// Prioridad: 1) lo que el editor guardó en localStorage (misma URL base/puerto)
//            2) mapa.json. Con ?src=file se fuerza mapa.json.
const LS_KEY = 'castillo-v20';
let mapaData = null;

function leerLocal() {
    try {
        const s = localStorage.getItem(LS_KEY);
        const j = s ? JSON.parse(s) : null;
        return j && Array.isArray(j.rooms) ? j : null;
    } catch (e) { return null; }
}

function reconstruir(json, origen) {
    try {
        if (mapaData) destruirMapa(scene, mapaData);
        mapaData = construirMapa(scene, json);
        console.log(`✅ Mapa construido desde ${origen}`);
    } catch (error) {
        console.error('❌ Error construyendo el mapa:', error);
    }
}

async function cargarMapa() {
    const forzarArchivo = new URLSearchParams(location.search).get('src') === 'file';
    const local = forzarArchivo ? null : leerLocal();
    if (local) { reconstruir(local, 'el editor (localStorage)'); return; }

    try {
        const response = await fetch('./mapa.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('No se encontró mapa.json');
        reconstruir(await response.json(), 'mapa.json');
    } catch (error) {
        console.error('❌ Error cargando el mapa:', error);
        overlay.innerHTML = `<h1 style="color:red;">Error cargando el mapa</h1><p>${error.message}</p>`;
    }
}

cargarMapa();

// Recarga en vivo: cuando el editor (otra pestaña, mismo origen) guarda, el mapa se reconstruye solo
window.addEventListener('storage', (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    if (new URLSearchParams(location.search).get('src') === 'file') return;
    const j = leerLocal();
    if (j) reconstruir(j, 'el editor (actualización en vivo)');
});

// CONTROLES Y MOVIMIENTO
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyR') cargarMapa(); // recarga manual
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const speed = (keys['ShiftLeft'] ? 50 : 20) * dt;

    if (controls.isLocked) {
        let moverZ = 0, moverX = 0, moverY = 0;
        if (keys['KeyW']) moverZ += 1;
        if (keys['KeyS']) moverZ -= 1;
        if (keys['KeyD']) moverX += 1;
        if (keys['KeyA']) moverX -= 1;
        if (keys['Space']) moverY += 1;
        if (keys['ControlLeft']) moverY -= 1;

        controls.moveForward(moverZ * speed);
        controls.moveRight(moverX * speed);
        controls.getObject().position.y += moverY * speed;

        zoneEl.textContent = `X:${camera.position.x.toFixed(1)} Y:${camera.position.y.toFixed(1)} Z:${camera.position.z.toFixed(1)}`;
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

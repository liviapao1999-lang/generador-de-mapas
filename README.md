# Generador de mapas

Editor 2D + visor 3D de planos con cuadrícula de **10 cm**.

**Repo:** https://github.com/liviapao1999-lang/generador-de-mapas

## Archivos

| Archivo | Descripción |
|---------|-------------|
| [`editor.html`](editor.html) | **Editor 2D** — diseña el mapa |
| [`index.html`](index.html) | **Visor 3D** — recorre el mapa |
| `main.js` | Lógica del visor 3D |
| `mapa.js` | Construcción 3D desde el JSON |

## Cómo usarlo

1. Abre **editor.html** en el navegador y dibuja el mapa.
2. El editor guarda automáticamente en `localStorage` (clave `castillo-v20`).
3. Sirve la carpeta y abre **index.html** para verlo en 3D (mismo origen):

```bash
npx serve .
```

4. En el visor: clic para entrar · WASD mover · Espacio/Ctrl volar · R recargar mapa.

## Nota

Si faltan `editor.html` o el `mapa.js` completo, súbalos desde el proyecto local (Add file → Upload files).

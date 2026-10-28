# Generador de mapas

Editor 2D + visor 3D de planos con cuadrícula de **10 cm**.

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `editor.html` / `index.html` | Editor 2D |
| `main.js` | Visor 3D (Three.js) |
| `mapa.js` | Construcción 3D del mapa |

## Editor

Abre `editor.html` en el navegador.

- Cuadrícula 10×10 cm
- Salas/muros/bloques por celdas
- Altura libre (Y)
- Selección múltiple y borrado en grupo
- Diseño de puertas
- Importar / exportar JSON

## Visor 3D

Sirve la carpeta localmente (módulos ES):

```bash
npx serve .
```

El visor lee el mapa desde `localStorage` (`castillo-v20`) o `mapa.json`.

## Repo

https://github.com/liviapao1999-lang/generador-de-mapas

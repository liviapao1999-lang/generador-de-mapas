# Generador de mapas

Editor 2D de planos (castillos / mapas) con cuadrícula de **10 cm**.

## Abrir el editor

Abre [editor.html](editor.html) en el navegador (doble clic o arrastra el archivo).

También puedes servirlo localmente:

```bash
npx serve .
```

## Funciones principales

- Cuadrícula de 10×10 cm
- Salas, muros y bloques construidos por celdas
- Altura libre (input Y)
- Selección múltiple (Shift+clic o caja) y borrado en grupo
- Diseño de puertas
- Importar / exportar JSON
- Deshacer / rehacer

## Uso rápido

1. Elige altura **Y** en la barra superior
2. **Suelo**: arrastra un rectángulo → marco de bloques
3. **Bloques**: pinta celdas; Shift+clic borra
4. **Seleccionar**: clic, Shift+clic o arrastra caja; Supr elimina
5. **Nuevo**: limpia el mapa

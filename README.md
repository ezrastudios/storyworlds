# Story Worlds Composer

Editor web para construir escenarios por capas y usarlos como referencia visual para ilustraciones Flow, escenas narrativas y generación de imágenes.

## Qué hace

- Crea composiciones en formato 4:5.
- Permite cargar imágenes PNG, JPG, WebP o SVG.
- Organiza elementos como capas: background, arquitectura, muebles, decoración y foreground.
- Permite mover, escalar, rotar, ajustar opacidad, blur y profundidad.
- Simula parallax según la profundidad de cada capa.
- Exporta el escenario como PNG.
- Exporta el proyecto como JSON reutilizable.

## Modelo de librería

La app no necesita guardar imágenes dentro del archivo de escena. Cada escena puede guardar referencias a assets oficiales del repositorio o a imágenes cargadas localmente.

```txt
assets/
  official/
    backgrounds/
    architecture/
    furniture/
    decor/
    foreground/
  manifest.json
```

## Desarrollo

```bash
npm install
npm run dev
```

## Publicación

El proyecto está preparado para GitHub Pages usando Vite con base `/storyworlds/`.

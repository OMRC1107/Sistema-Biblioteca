# Sistema-Biblioteca

Visor web de los 3 pisos de la biblioteca con búsqueda de salas.

## Uso

Abre `index.html` en el navegador (no requiere instalación ni servidor).

- Pestañas para cambiar de piso.
- Buscador por nombre, número, piso o categoría (atajo: `/`, navegación con flechas y Enter).
- Planos vectoriales (SVG) dibujados en `js/data.js`; clic en una sala para ver su detalle.
- Enlace directo a una sala, por ejemplo `index.html#sala-8`.

## Estructura

- `index.html`: página principal
- `css/styles.css`: estilos (tema claro/oscuro automático)
- `js/data.js`: pisos, salas y trazado de cada sala (geometría de cada sala: editar aquí para agregar o mover salas)
- `js/app.js`: lógica de búsqueda y visualización


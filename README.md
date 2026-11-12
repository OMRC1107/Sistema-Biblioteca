# Sistema-Biblioteca

Visor web de los 3 pisos de la biblioteca con búsqueda de salas.

## Uso

Abre `index.html` en el navegador (no requiere instalación ni servidor).

- Pestañas para cambiar de piso.
- Buscador por nombre, número, piso o categoría (atajo: `/`, navegación con flechas y Enter).
- Marcadores sobre el plano; clic para ver el detalle de la sala.
- Enlace directo a una sala, por ejemplo `index.html#sala-8`.

## Estructura

- `index.html`: página principal
- `css/styles.css`: estilos (tema claro/oscuro automático)
- `js/data.js`: pisos, salas y posición de cada marcador (editar aquí para agregar o mover salas)
- `js/app.js`: lógica de búsqueda y visualización
- `img/`: planos de los pisos 1, 2 y 3

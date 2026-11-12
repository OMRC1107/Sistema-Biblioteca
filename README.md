# Sistema-Biblioteca

Visor web de los 3 pisos de la biblioteca con búsqueda de salas.

## Uso

Abre `index.html` en el navegador (no requiere instalación ni servidor).

- Pestañas para cambiar de piso.
- Buscador por nombre, número, piso o categoría (atajo: `/`, navegación con flechas y Enter).
- Planos vectoriales calcados de las imágenes de referencia, con sus proporciones reales.
  Los tres pisos comparten escala y posición; en los pisos 2 y 3 se muestra el contorno punteado del piso inferior.
- Clic en una sala: se abre debajo una pestaña con el plano de esa sala sola, ampliado, y su detalle. Enlace directo a una sala: `index.html#sala-8`.

## Estructura

- `index.html`, `css/styles.css`: página y estilos (tema claro/oscuro automático)
- `js/app.js`: lógica de búsqueda y visualización
- `js/data.js`: pisos, salas, categorías y la zona clicable de cada sala (editar aquí para agregar o ajustar salas)
- `js/planos.js`: muros, pisos y exteriores vectorizados (**generado**, no editar a mano)
- `referencia/`: imágenes originales de cada piso
- `tools/generar_planos.py`: regenera `js/planos.js` desde `referencia/`

## Regenerar los planos

Si cambias una imagen de `referencia/`:

```
python3 tools/generar_planos.py
```

Requiere `numpy`, `opencv-python` y `pillow`.

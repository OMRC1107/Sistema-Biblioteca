# Sistema-Biblioteca

Visor web de los 3 pisos de la biblioteca con búsqueda de salas.

## Uso

Requiere Node.js 18 o superior. No tiene dependencias que instalar.

```
npm start            # o: node server.js
```

Abre http://127.0.0.1:3000. Variables opcionales: `PORT`, `HOST` (por defecto solo accesible desde tu computador; usa `HOST=0.0.0.0` para la red local) y `DATOS_DIR`.

Si abres `index.html` directamente como archivo, el mapa funciona pero las reservas quedan desactivadas (necesitan el servidor).

- Pestañas para cambiar de piso.
- Buscador por nombre, número, piso o categoría (atajo: `/`, navegación con flechas y Enter).
- Cuenta y reservas: código único de 7 cifras, nombre y contraseña (mínimo 8 caracteres).
  Con la sesión iniciada se puede apartar una mesa y quitar la reserva. Mesa verde = disponible, roja = reservada
  (también con ✓ / ✕ / ★ para no depender solo del color; ★ = tu reserva). Cada persona puede tener una mesa a la vez.
- Planos vectoriales calcados de las imágenes de referencia, con sus proporciones reales.
  Los tres pisos comparten escala y posición; en los pisos 2 y 3 se muestra el contorno punteado del piso inferior.
- Clic en una sala: se abre debajo una pestaña con el plano de esa sala sola, ampliado, y su detalle.
  En las Salas 1 a 14 el plano incluye mesas hexagonales de 6 puestos (mínimo 4, se acomodan solas según el espacio). Las demás áreas (investigación, cafetería, TIC, auditorio, cómputo, tribal, ludoteca, procesos técnicos, jefatura, secretaría, semilleros, ingreso y devoluciones) no llevan mesas; para activarlas en una sala basta añadir `mesas: true` en `js/data.js`. Enlace directo a una sala: `index.html#sala-8`.

## Estructura

- `server.js`: servidor (sin dependencias): cuentas, sesiones y reservas. Guarda todo en `datos/biblioteca.json` (no se sube a git)
- `js/cuenta.js`: cliente de cuenta/reservas y diálogo de acceso
- `js/mesas.js`: posición fija de las mesas de cada sala (**generado**; mesa N de la sala X = `sala-x#N`)
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

Si cambias salas o activas `mesas: true` en otra sala de `js/data.js`:

```
python3 tools/generar_mesas.py
```

(requiere `playwright` con Chromium). Las reservas de mesas que dejen de existir se descartan al iniciar el servidor.

## Seguridad

Las contraseñas se guardan con scrypt y sal propia; la sesión va en una cookie `HttpOnly` + `SameSite=Strict`; las peticiones que modifican datos exigen una cabecera propia (anti-CSRF); hay bloqueo temporal tras 5 contraseñas erróneas y límite de intentos por IP; solo se sirven `index.html`, `css/` y `js/`. Si lo publicas en internet, ponlo detrás de HTTPS.

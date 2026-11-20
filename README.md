# Sistema-Biblioteca

Visor web de los 3 pisos de la biblioteca con búsqueda de salas.

## Puesta en marcha

Requiere **Node.js 18+** y **MySQL 5.7+ / 8 (o MariaDB 10.3+)**. Usuarios y reservas se guardan en MySQL.

1. **Crea la base de datos y un usuario** (en el cliente `mysql`, o desde phpMyAdmin/Workbench):

   ```sql
   CREATE DATABASE biblioteca CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'biblioteca'@'localhost' IDENTIFIED BY 'cambia-esta-clave';
   GRANT ALL PRIVILEGES ON biblioteca.* TO 'biblioteca'@'localhost';
   ```

   (Si solo usas `root` en un entorno local, basta con poner sus datos en el paso 2: el servidor crea la base si no existe.)

2. **Configura la conexión**: copia `.env.example` como `.env` y escribe tus datos (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). El archivo `.env` no se sube a git.
3. **Instala y arranca**:

   ```
   npm install
   npm start
   ```

   Las tablas (`usuarios` y `reservas`, ver `schema.sql`) se crean solas al iniciar. Abre http://127.0.0.1:3000.
   `HOST` y `PORT` también se pueden cambiar en `.env` (con `HOST=0.0.0.0` se accede desde la red local).

Si abres `index.html` directamente como archivo, el mapa funciona pero las reservas quedan desactivadas (necesitan el servidor y la base de datos).

### Si ya tenías cuentas de la versión anterior (archivo JSON)

Con el servidor ya configurado, copia las cuentas y reservas de `datos/biblioteca.json` a MySQL (conservan su contraseña):

```
npm run migrar                       # lee datos/biblioteca.json
node tools/migrar_json_a_mysql.js ruta/al/biblioteca.json
```

### Pruebas

`npm test` (requiere Node 22.5+) ejecuta las pruebas del servidor con una base SQLite en memoria que imita a MySQL.

## Qué incluye

- Pestañas para cambiar de piso.
- Buscador por nombre, número, piso o categoría (atajo: `/`, navegación con flechas y Enter).
- Cuenta y reservas: código único de 7 cifras, nombre y contraseña (mínimo 8 caracteres).
  Con la sesión iniciada se puede apartar una mesa y quitar la reserva. Mesa verde = disponible, roja = reservada
  (también con ✓ / ✕ / ★ para no depender solo del color; ★ = tu reserva). Cada persona puede tener una mesa a la vez.
- Planos vectoriales calcados de las imágenes de referencia, con sus proporciones reales.
  Los tres pisos comparten escala y posición; en los pisos 2 y 3 se muestra el contorno punteado del piso inferior.
- Clic en una sala: se abre debajo una pestaña con el plano de esa sala sola, ampliado, y su detalle.
  En las Salas 1 a 14 el plano incluye mesas hexagonales de 6 puestos (todas del mismo tamaño; entre 4 y 12 por sala, repartidas según el espacio). Las demás áreas (investigación, cafetería, TIC, auditorio, cómputo, tribal, ludoteca, procesos técnicos, jefatura, secretaría, semilleros, ingreso y devoluciones) no llevan mesas; para activarlas en una sala basta añadir `mesas: true` en `js/data.js`. Enlace directo a una sala: `index.html#sala-8`.

## Estructura

- `server.js`: servidor web con la API de cuentas, sesiones y reservas
- `db.js` y `schema.sql`: conexión y consultas a MySQL, y el esquema de las tablas
- `.env.example`: plantilla de configuración (copiar como `.env`)
- `test/`: pruebas automáticas del servidor
- `js/cuenta.js`: cliente de cuenta/reservas y diálogo de acceso
- `js/mesas.js`: posición fija de las mesas de cada sala (**generado**; mesa N de la sala X = `sala-x#N`)
- `index.html`, `css/styles.css`: página y estilos (tema claro/oscuro automático)
- `js/app.js`: lógica de búsqueda y visualización
- `js/data.js`: pisos, salas, categorías y la zona clicable de cada sala (editar aquí para agregar o ajustar salas)
- `js/planos.js`: muros, pisos y exteriores vectorizados (**generado**, no editar a mano)
- `referencia/`: imágenes originales de cada piso
- `tools/migrar_json_a_mysql.js`: migra las cuentas de la versión anterior a MySQL
- `tools/generar_planos.py`: regenera `js/planos.js` desde `referencia/`

## Regenerar los planos

Si cambias una imagen de `referencia/`:

```
python3 tools/generar_planos.py
```

Requiere `numpy`, `opencv-python` y `pillow`.

Las mesas están en las posiciones de los cuadrados rojos marcados sobre las imágenes de referencia (`tools/marcas_mesas.json`; solo cuentan los que caen dentro de las Salas 1–14, y solo se ven en el plano de cada sala). Para cambiarlas, edita ese archivo o las salas de `js/data.js` y ejecuta:

```
python3 tools/generar_mesas.py
```

(requiere `playwright` con Chromium). Las reservas de mesas que dejen de existir se descartan al iniciar el servidor.

## Seguridad

Las contraseñas se guardan con scrypt y sal propia; la sesión va en una cookie `HttpOnly` + `SameSite=Strict`; las peticiones que modifican datos exigen una cabecera propia (anti-CSRF); la unicidad de cuentas y reservas la garantiza la propia base de datos (claves primarias/únicas); hay bloqueo temporal tras 5 contraseñas erróneas y límite de intentos por IP; solo se sirven `index.html`, `css/` y `js/`. Si lo publicas en internet, ponlo detrás de HTTPS.


## Asistente de mesas

El botón «Asistente» (abajo a la derecha) abre un contestador por reglas, sin inteligencia artificial. Entiende preguntas como «¿hay mesas libres en la Sala 8?», «reserva la mesa 3 de la Sala 9 por 3 horas», «¿cuál es mi mesa?», «quita mi reserva», «¿dónde está la Sala 14?» o «¿cómo reservo?». Antes de reservar o quitar una reserva siempre pide confirmación. La lógica está en `js/asistente.js` (con pruebas en `test/asistente.test.js`) y la pantalla en `js/asistente_ui.js`.

## Duración y registro de reservas

- Al reservar se elige la duración (1 a 4 horas, 2 por defecto). La reserva empieza al momento de reservar y termina sola (máximo las 23:59 del mismo día); después la mesa vuelve a estar libre.
- La tabla `historial_reservas` guarda cada reserva: `sala`, `mesa`, `fecha`, `hora_inicio`, `hora_fin` (y el `codigo` de quien reservó). Si la reserva se quita antes de tiempo, `hora_fin` pasa a ser la hora en que se quitó. Para verla: `SELECT * FROM historial_reservas ORDER BY id DESC;`
- Si ya tenías la base creada con la versión anterior, al iniciar el servidor se agrega solo la columna `hasta` y se descartan las reservas antiguas (no tenían hora de fin).

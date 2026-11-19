/*
 * Pruebas del servidor con una base SQLite en memoria que imita a MySQL.
 * Ejecutar:  npm test   (requiere Node >= 22.5 por node:sqlite)
 */

"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { crearAlmacen } = require("../db");
const { crearServidor } = require("../server");
const { crearPoolSqlite } = require("./pool_sqlite");
const { migrar } = require("../tools/migrar_json_a_mysql");

let pool, almacen, servidor, base;

before(async () => {
  pool = crearPoolSqlite();
  almacen = crearAlmacen(pool);
  await almacen.inicializar();
  servidor = crearServidor({ almacen, mesasValidas: new Set(["sala-8#1", "sala-8#2", "sala-8#3", "sala-9#1"]) });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
});

// Cliente mínimo con cookie de sesión.
const cliente = () => {
  let cookie = "";
  const pedir = async (metodo, ruta, cuerpo, extra = {}) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: {
        "X-Requested-With": "biblioteca",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.startsWith("sid=;") || /Max-Age=0/.test(set) ? "" : set.split(";")[0];
    return { estado: res.status, datos: await res.json().catch(() => ({})), cabeceras: res.headers };
  };
  return { pedir, tieneSesion: () => cookie !== "" };
};

const registrar = (c, codigo, nombre = "Persona", password = "clavesegura1") =>
  c.pedir("POST", "/api/registro", { codigo, nombre, password });

test("registro: valida código, nombre y contraseña", async () => {
  const c = cliente();
  assert.equal((await registrar(c, "123456")).estado, 400);
  assert.equal((await registrar(c, "12345678")).estado, 400);
  assert.equal((await registrar(c, "abc1234")).estado, 400);
  assert.equal((await registrar(c, "1234567", "A")).estado, 400);
  assert.equal((await registrar(c, "1234567", "Ana", "corta")).estado, 400);
  assert.equal((await registrar(c, "1234567", "Ana", "x".repeat(129))).estado, 400);
  assert.deepEqual(pool.sql("SELECT * FROM usuarios"), []);
});

test("registro correcto: guarda en la base, con contraseña cifrada, y abre sesión", async () => {
  const c = cliente();
  const r = await registrar(c, "1000001", "  Ana   Pérez ", "clavesegura1");
  assert.equal(r.estado, 201);
  assert.deepEqual(r.datos.usuario, { codigo: "1000001", nombre: "Ana Pérez" });
  assert.match(r.cabeceras.get("set-cookie"), /HttpOnly/);
  assert.match(r.cabeceras.get("set-cookie"), /SameSite=Strict/);

  const [fila] = pool.sql("SELECT * FROM usuarios WHERE codigo = ?", "1000001");
  assert.equal(fila.nombre, "Ana Pérez");
  assert.match(fila.clave, /^[0-9a-f]{32}:[0-9a-f]{128}$/); // sal:hash scrypt
  assert.ok(!fila.clave.includes("clavesegura1"));

  assert.deepEqual((await c.pedir("GET", "/api/yo")).datos.usuario, { codigo: "1000001", nombre: "Ana Pérez" });
});

test("el código es único (también ante registros simultáneos)", async () => {
  const resultados = await Promise.all([
    registrar(cliente(), "1000002", "Uno"),
    registrar(cliente(), "1000002", "Dos"),
    registrar(cliente(), "1000002", "Tres"),
  ]);
  const estados = resultados.map((r) => r.estado).sort();
  assert.deepEqual(estados, [201, 409, 409]);
  assert.equal(pool.sql("SELECT * FROM usuarios WHERE codigo = '1000002'").length, 1);
});

test("login: correcto, contraseña errónea y código inexistente", async () => {
  await registrar(cliente(), "1000003", "Luis", "otraclave123");
  const c = cliente();
  const mala = await c.pedir("POST", "/api/login", { codigo: "1000003", password: "incorrecta1" });
  const inexistente = await c.pedir("POST", "/api/login", { codigo: "9999999", password: "incorrecta1" });
  assert.equal(mala.estado, 401);
  assert.equal(inexistente.estado, 401);
  assert.equal(mala.datos.error, inexistente.datos.error); // no revela si el código existe
  assert.equal((await c.pedir("POST", "/api/login", { codigo: "1000003", password: "otraclave123" })).estado, 200);
  assert.equal(c.tieneSesion(), true);
});

test("reservas: reservar, ver desde otra persona, no robar y liberar", async () => {
  const ana = cliente();
  const beto = cliente();
  await registrar(ana, "2000001", "Ana");
  await registrar(beto, "2000002", "Beto");

  assert.equal((await cliente().pedir("POST", "/api/reservas", { mesa: "sala-8#1" })).estado, 401); // sin sesión
  assert.equal((await ana.pedir("POST", "/api/reservas", { mesa: "sala-99#1" })).estado, 404); // mesa inexistente

  const r = await ana.pedir("POST", "/api/reservas", { mesa: "sala-8#1" });
  assert.equal(r.estado, 201);
  assert.deepEqual(r.datos, { reservas: { "sala-8#1": { mia: true } }, mia: "sala-8#1" });
  assert.deepEqual(pool.sql("SELECT mesa, codigo FROM reservas"), [{ mesa: "sala-8#1", codigo: "2000001" }]);

  // Beto la ve ocupada (sin saber de quién) y no puede reservarla ni liberarla.
  assert.deepEqual((await beto.pedir("GET", "/api/reservas")).datos, {
    reservas: { "sala-8#1": { mia: false } },
    mia: null,
  });
  assert.equal((await beto.pedir("POST", "/api/reservas", { mesa: "sala-8#1" })).estado, 409);
  assert.equal((await beto.pedir("DELETE", "/api/reservas/sala-8%231")).estado, 403);
  assert.equal(pool.sql("SELECT * FROM reservas").length, 1);

  // Ana no puede repetir ni apartar una segunda mesa a la vez.
  assert.equal((await ana.pedir("POST", "/api/reservas", { mesa: "sala-8#1" })).datos.error, "Ya reservaste esta mesa.");
  const segunda = await ana.pedir("POST", "/api/reservas", { mesa: "sala-8#2" });
  assert.equal(segunda.estado, 409);
  assert.equal(segunda.datos.actual, "sala-8#1");

  // Ana libera y Beto ya puede tomarla.
  assert.equal((await ana.pedir("DELETE", "/api/reservas/sala-8%231")).estado, 200);
  assert.equal((await ana.pedir("DELETE", "/api/reservas/sala-8%231")).estado, 404);
  assert.equal((await beto.pedir("POST", "/api/reservas", { mesa: "sala-8#1" })).estado, 201);
  await beto.pedir("DELETE", "/api/reservas/sala-8%231");
});

test("dos personas reservando la misma mesa a la vez: solo una gana", async () => {
  const a = cliente();
  const b = cliente();
  await registrar(a, "2000003", "Ana Uno");
  await registrar(b, "2000004", "Beto Dos");
  const rs = await Promise.all([
    a.pedir("POST", "/api/reservas", { mesa: "sala-9#1" }),
    b.pedir("POST", "/api/reservas", { mesa: "sala-9#1" }),
  ]);
  assert.deepEqual(rs.map((r) => r.estado).sort(), [201, 409]);
  assert.equal(pool.sql("SELECT * FROM reservas WHERE mesa = 'sala-9#1'").length, 1);
});

test("las reservas se borran si se borra la cuenta (clave foránea)", async () => {
  const c = cliente();
  await registrar(c, "2000005", "Temp");
  await c.pedir("POST", "/api/reservas", { mesa: "sala-8#3" });
  pool.sql("DELETE FROM usuarios WHERE codigo = '2000005'");
  assert.deepEqual(pool.sql("SELECT * FROM reservas WHERE mesa = 'sala-8#3'"), []);
});

test("depurarReservas elimina mesas que ya no existen", async () => {
  const c = cliente();
  await registrar(c, "2000006", "Vieja");
  pool.sql("INSERT INTO reservas (mesa, codigo) VALUES ('sala-77#1', '2000006')");
  assert.equal(await almacen.depurarReservas(new Set(["sala-8#1", "sala-8#2", "sala-8#3", "sala-9#1"])), 1);
  assert.deepEqual(pool.sql("SELECT * FROM reservas WHERE codigo = '2000006'"), []);
});

test("cerrar sesión", async () => {
  const c = cliente();
  await registrar(c, "2000007", "Sale");
  assert.equal((await c.pedir("POST", "/api/logout")).estado, 200);
  assert.equal((await c.pedir("GET", "/api/yo")).datos.usuario, null);
});

test("CSRF: sin la cabecera propia se rechaza", async () => {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: "1000003", password: "otraclave123" }),
  });
  assert.equal(res.status, 403);
});

test("bloqueo tras 5 contraseñas erróneas", async () => {
  await registrar(cliente(), "3000001", "Bloq", "buenaclave123");
  const c = cliente();
  for (let i = 0; i < 5; i++) {
    assert.equal((await c.pedir("POST", "/api/login", { codigo: "3000001", password: "mala-clave-1" })).estado, 401);
  }
  assert.equal((await c.pedir("POST", "/api/login", { codigo: "3000001", password: "buenaclave123" })).estado, 429);
  assert.equal((await c.pedir("POST", "/api/login", { codigo: "1000003", password: "otraclave123" })).estado, 200);
});

test("solo se sirve la interfaz (nada de código del servidor, .env ni base de datos)", async () => {
  const codigo = async (ruta) => (await fetch(base + ruta)).status;
  for (const ok of ["/", "/index.html", "/js/app.js", "/js/cuenta.js", "/js/mesas.js", "/css/styles.css"]) {
    assert.equal(await codigo(ok), 200, ok);
  }
  for (const no of ["/server.js", "/db.js", "/schema.sql", "/.env", "/.env.example", "/package.json", "/test/api.test.js",
    "/tools/generar_planos.py", "/.git/config", "/datos/biblioteca.json", "/js/../server.js", "/%2e%2e/server.js"]) {
    assert.ok([400, 404].includes(await codigo(no)), `${no} no debe servirse`);
  }
  assert.equal((await fetch(`${base}/js/app.js%00.png`)).status, 404);
});

test("cuerpo demasiado grande o tipo de contenido erróneo", async () => {
  const grande = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "X-Requested-With": "biblioteca", "Content-Type": "application/json" },
    body: "a".repeat(6000),
  }).catch(() => ({ status: 413 }));
  assert.equal(grande.status, 413);
  const texto = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "X-Requested-With": "biblioteca", "Content-Type": "text/plain" },
    body: "x",
  });
  assert.equal(texto.status, 415);
});

test("si la base de datos se cae, el servidor responde 503 y sigue vivo", async () => {
  const c = cliente();
  await registrar(c, "4000001", "Caida");
  pool.simularCaida(true);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await cliente().pedir("GET", "/api/reservas")).estado, 503);
    assert.equal((await registrar(cliente(), "4000002")).estado, 503);
  } finally {
    console.error = originalError;
    pool.simularCaida(false);
  }
  assert.equal((await cliente().pedir("GET", "/api/reservas")).estado, 200); // se recupera
});

test("migración desde el archivo JSON anterior: conserva cuentas y reservas, y se puede repetir", async () => {
  const poolNuevo = crearPoolSqlite();
  const nuevo = crearAlmacen(poolNuevo);
  await nuevo.inicializar();
  const hash = "a".repeat(32) + ":" + "b".repeat(128);
  const datos = {
    usuarios: {
      5000001: { nombre: "Vieja Cuenta", clave: hash },
      5000002: { nombre: "Otra", clave: hash },
      123: { nombre: "Código malo", clave: hash },
    },
    reservas: { "sala-8#1": { codigo: "5000001" }, "sala-8#2": { codigo: "5000001" } }, // la 2.ª rompe «una por persona»
  };
  const silencio = () => {};
  assert.deepEqual(await migrar(nuevo, datos, silencio), {
    usuarios: 2, usuariosOmitidos: 1, reservas: 1, reservasOmitidas: 1,
  });
  assert.equal((await nuevo.usuario("5000001")).clave, hash);
  assert.equal(await nuevo.reservaDePersona("5000001"), "sala-8#1");
  const otraVez = await migrar(nuevo, datos, silencio);
  assert.equal(otraVez.usuarios, 0);
  assert.equal(otraVez.reservas, 0);
});

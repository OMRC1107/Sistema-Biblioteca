#!/usr/bin/env node
/*
 * Servidor de Sistema-Biblioteca.
 *
 *   - Sirve la interfaz (index.html, css/, js/).
 *   - Cuentas: código único de 7 cifras + nombre + contraseña (mín. 8).
 *   - Reservas de mesas, compartidas entre todas las personas.
 *   - Usuarios y reservas se guardan en MySQL (ver db.js, schema.sql y .env.example).
 *
 * Uso:  npm install  (una vez)  y luego  npm start
 * Variables (o archivo .env): PORT, HOST, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *
 * Las contraseñas se guardan con scrypt + sal por usuario. Las sesiones viven en
 * memoria: si reinicias el servidor, la gente debe iniciar sesión de nuevo.
 */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const RAIZ = __dirname;

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const MAX_CUERPO = 4096;
const VENTANA_MS = 10 * 60 * 1000;
const MAX_INTENTOS_POR_IP = 40; // peticiones de cuenta por IP en la ventana
const MAX_FALLOS_LOGIN = 5; // contraseñas erróneas por IP+código en la ventana

/* ---------- Mesas válidas (de js/mesas.js) ---------- */

const cargarMesasValidas = () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "js", "mesas.js"), "utf8");
  const mesas = vm.runInNewContext(`${fuente}\n;MESAS`, Object.create(null), { timeout: 1000 });
  const ids = new Set();
  for (const [sala, cfg] of Object.entries(mesas)) {
    cfg.centros.forEach((_, i) => ids.add(`${sala}#${i + 1}`));
  }
  return ids;
};

/* ---------- Contraseñas ---------- */

const hashClave = async (clave, sal = crypto.randomBytes(16)) => {
  const hash = await scrypt(clave, sal, 64, { N: 16384, r: 8, p: 1 });
  return `${sal.toString("hex")}:${hash.toString("hex")}`;
};

const HASH_FALSO = hashClave("clave-inexistente", Buffer.alloc(16)); // iguala tiempos si el código no existe

const verificarClave = async (clave, guardado) => {
  const [salHex, hashHex] = guardado.split(":");
  const esperado = Buffer.from(hashHex, "hex");
  const obtenido = await scrypt(clave, Buffer.from(salHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(esperado, obtenido);
};

/* ---------- Validaciones ---------- */

const validarCodigo = (c) => typeof c === "string" && /^\d{7}$/.test(c);
const limpiarNombre = (n) => (typeof n === "string" ? n.normalize("NFC").replace(/\s+/g, " ").trim() : "");
const validarNombre = (n) => n.length >= 2 && n.length <= 60 && !/[\u0000-\u001f\u007f]/.test(n);
const validarClave = (c) => typeof c === "string" && c.length >= 8 && c.length <= 128;

/* ---------- HTTP auxiliar ---------- */

const CABECERAS_BASE = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

const responder = (res, estado, cuerpo, extra = {}) => {
  const datos = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    ...CABECERAS_BASE,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(datos),
    ...extra,
  });
  res.end(datos);
};

const error = (res, estado, mensaje, extra = {}) => {
  const { _cerrar, ...cuerpo } = extra;
  return responder(res, estado, { error: mensaje, ...cuerpo }, _cerrar ? { Connection: "close" } : {});
};

const leerJson = (req) =>
  new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
      return reject(Object.assign(new Error("Tipo de contenido no válido"), { estado: 415 }));
    }
    let tamano = 0;
    const trozos = [];
    req.on("data", (t) => {
      tamano += t.length;
      if (tamano > MAX_CUERPO) {
        trozos.length = 0;
        reject(Object.assign(new Error("Solicitud demasiado grande"), { estado: 413 }));
        return;
      }
      trozos.push(t);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(trozos).toString("utf8") || "{}");
        if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch {
        reject(Object.assign(new Error("JSON no válido"), { estado: 400 }));
      }
    });
    req.on("error", reject);
  });

/* ---------- Archivos estáticos ---------- */

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Solo se sirve la interfaz: nunca server.js, db.js, schema.sql, .env, tools/, .git, etc.
const resolverEstatico = (pathname) => {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  if (rel === "/") rel = "/index.html";
  rel = path.posix.normalize(rel).replace(/^\/+/, "");
  const segmentos = rel.split("/");
  if (segmentos.some((s) => s === ".." || s.startsWith(".") || s === "")) return null;
  const permitido = rel === "index.html" || rel.startsWith("css/") || rel.startsWith("js/");
  if (!permitido || !TIPOS[path.extname(rel)]) return null;
  const archivo = path.join(RAIZ, rel);
  return archivo.startsWith(RAIZ + path.sep) ? archivo : null;
};

const servirEstatico = (req, res, url) => {
  if (req.method !== "GET" && req.method !== "HEAD") return error(res, 405, "Método no permitido");
  const archivo = resolverEstatico(url.pathname);
  if (!archivo) return error(res, 404, "No encontrado");
  fs.readFile(archivo, (err, contenido) => {
    if (err) return error(res, 404, "No encontrado");
    res.writeHead(200, {
      ...CABECERAS_BASE,
      "Content-Type": TIPOS[path.extname(archivo)],
      "Content-Length": contenido.length,
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : contenido);
  });
};

/* ---------- Servidor ---------- */

/**
 * @param {object} opciones
 * @param {object} opciones.almacen      consultas de db.js (crearAlmacen)
 * @param {Set<string>} [opciones.mesasValidas]
 */
const crearServidor = ({ almacen, mesasValidas = cargarMesasValidas() }) => {
  const sesiones = new Map(); // token -> { codigo, nombre, expira }
  const intentos = new Map(); // clave -> { n, hasta }

  /* Sesiones */

  const crearSesion = (codigo, nombre) => {
    const token = crypto.randomBytes(32).toString("base64url");
    sesiones.set(token, { codigo, nombre, expira: Date.now() + DURACION_SESION_MS });
    return token;
  };

  const leerCookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .map((c) => c.trim().split("="))
        .filter(([k, v]) => k && v)
    );

  const sesionDe = (req) => {
    const token = leerCookies(req).sid;
    const s = token && sesiones.get(token);
    if (!s) return null;
    if (s.expira < Date.now()) {
      sesiones.delete(token);
      return null;
    }
    return { token, codigo: s.codigo, nombre: s.nombre };
  };

  const cookieSesion = (req, token, maxAgeSeg) => {
    const partes = [`sid=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSeg}`];
    if (req.headers["x-forwarded-proto"] === "https") partes.push("Secure");
    return partes.join("; ");
  };

  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [t, s] of sesiones) if (s.expira < ahora) sesiones.delete(t);
    for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
  }, 60 * 1000);
  limpieza.unref();

  /* Límite de intentos */

  const contar = (clave) => {
    const ahora = Date.now();
    const actual = intentos.get(clave);
    if (!actual || actual.hasta < ahora) {
      intentos.set(clave, { n: 1, hasta: ahora + VENTANA_MS });
      return 1;
    }
    actual.n += 1;
    return actual.n;
  };
  const consultar = (clave) => {
    const actual = intentos.get(clave);
    return actual && actual.hasta >= Date.now() ? actual.n : 0;
  };

  /* API */

  const estadoReservas = async (codigo) => {
    const reservas = {};
    let mia = null;
    for (const r of await almacen.reservas()) {
      const esMia = codigo !== null && r.codigo === codigo;
      reservas[r.mesa] = { mia: esMia };
      if (esMia) mia = r.mesa;
    }
    return { reservas, mia };
  };

  const iniciarSesion = (req, res, usuario, estado = 200) => {
    const token = crearSesion(usuario.codigo, usuario.nombre);
    responder(
      res,
      estado,
      { usuario: { codigo: usuario.codigo, nombre: usuario.nombre } },
      { "Set-Cookie": cookieSesion(req, token, DURACION_SESION_MS / 1000) }
    );
  };

  const manejarApi = async (req, res, url) => {
    const metodo = req.method;
    const ruta = url.pathname;
    const ip = req.socket.remoteAddress || "?";

    // Protección CSRF: las peticiones que cambian datos exigen una cabecera
    // propia (el navegador no la permite entre sitios sin CORS) y, además, la
    // cookie es SameSite=Strict.
    if (metodo !== "GET" && req.headers["x-requested-with"] !== "biblioteca") {
      return error(res, 403, "Solicitud no permitida");
    }

    if (ruta === "/api/yo" && metodo === "GET") {
      const s = sesionDe(req);
      return responder(res, 200, { usuario: s ? { codigo: s.codigo, nombre: s.nombre } : null });
    }

    if (ruta === "/api/reservas" && metodo === "GET") {
      const s = sesionDe(req);
      return responder(res, 200, await estadoReservas(s ? s.codigo : null));
    }

    if (ruta === "/api/registro" && metodo === "POST") {
      if (contar(`ip:${ip}`) > MAX_INTENTOS_POR_IP) return error(res, 429, "Demasiados intentos. Espera unos minutos.");
      const cuerpo = await leerJson(req);
      const nombre = limpiarNombre(cuerpo.nombre);
      if (!validarCodigo(cuerpo.codigo)) return error(res, 400, "El código debe tener exactamente 7 cifras.");
      if (!validarNombre(nombre)) return error(res, 400, "El nombre debe tener entre 2 y 60 caracteres.");
      if (!validarClave(cuerpo.password)) return error(res, 400, "La contraseña debe tener al menos 8 caracteres.");
      if (await almacen.usuario(cuerpo.codigo)) return error(res, 409, "Ese código ya está registrado.");

      const hash = await hashClave(cuerpo.password);
      // La base de datos tiene la última palabra: si dos personas registran el mismo
      // código a la vez, solo una lo consigue.
      if (!(await almacen.crearUsuario(cuerpo.codigo, nombre, hash))) {
        return error(res, 409, "Ese código ya está registrado.");
      }
      return iniciarSesion(req, res, { codigo: cuerpo.codigo, nombre }, 201);
    }

    if (ruta === "/api/login" && metodo === "POST") {
      if (contar(`ip:${ip}`) > MAX_INTENTOS_POR_IP) return error(res, 429, "Demasiados intentos. Espera unos minutos.");
      const cuerpo = await leerJson(req);
      if (!validarCodigo(cuerpo.codigo) || typeof cuerpo.password !== "string" || cuerpo.password.length > 128) {
        return error(res, 400, "Escribe tu código de 7 cifras y tu contraseña.");
      }
      const claveFallos = `fallo:${ip}:${cuerpo.codigo}`;
      if (consultar(claveFallos) >= MAX_FALLOS_LOGIN) {
        return error(res, 429, "Demasiados intentos fallidos. Espera unos minutos.");
      }
      const usuario = await almacen.usuario(cuerpo.codigo);
      const guardado = usuario ? usuario.clave : await HASH_FALSO;
      const correcta = await verificarClave(cuerpo.password, guardado);
      if (!usuario || !correcta) {
        contar(claveFallos);
        return error(res, 401, "Código o contraseña incorrectos.");
      }
      intentos.delete(claveFallos);
      return iniciarSesion(req, res, { codigo: usuario.codigo, nombre: usuario.nombre });
    }

    if (ruta === "/api/logout" && metodo === "POST") {
      const s = sesionDe(req);
      if (s) sesiones.delete(s.token);
      return responder(res, 200, { ok: true }, { "Set-Cookie": cookieSesion(req, "", 0) });
    }

    if (ruta === "/api/reservas" && metodo === "POST") {
      const s = sesionDe(req);
      if (!s) return error(res, 401, "Inicia sesión para reservar una mesa.");
      const cuerpo = await leerJson(req);
      const mesa = cuerpo.mesa;
      if (typeof mesa !== "string" || !mesasValidas.has(mesa)) return error(res, 404, "Esa mesa no existe.");

      const r = await almacen.reservar(mesa, s.codigo);
      if (r.ok) return responder(res, 201, await estadoReservas(s.codigo));
      if (r.motivo === "propia") return error(res, 409, "Ya reservaste esta mesa.");
      if (r.motivo === "ocupada") return error(res, 409, "Esa mesa ya está reservada.");
      if (r.motivo === "limite") {
        return error(res, 409, "Ya tienes una mesa reservada. Quita esa reserva antes de apartar otra.", {
          actual: r.actual,
        });
      }
      sesiones.delete(s.token); // sin_cuenta: la cuenta ya no existe en la base de datos
      return error(res, 401, "Tu cuenta ya no existe. Vuelve a crearla.");
    }

    const coincide = /^\/api\/reservas\/([^/]+)$/.exec(ruta);
    if (coincide && metodo === "DELETE") {
      const s = sesionDe(req);
      if (!s) return error(res, 401, "Inicia sesión para quitar una reserva.");
      let mesa;
      try {
        mesa = decodeURIComponent(coincide[1]);
      } catch {
        return error(res, 400, "Mesa no válida.");
      }
      const r = await almacen.reservaDeMesa(mesa);
      if (!r) return error(res, 404, "Esa mesa no tiene reserva.");
      if (r.codigo !== s.codigo) return error(res, 403, "Solo puedes quitar tus propias reservas.");
      await almacen.liberar(mesa, s.codigo);
      return responder(res, 200, await estadoReservas(s.codigo));
    }

    return error(res, 404, "No encontrado");
  };

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) return await manejarApi(req, res, url);
      return servirEstatico(req, res, url);
    } catch (e) {
      if (e && e.estado) {
        if (e.estado === 413) {
          // No se sigue leyendo un cuerpo enorme: se responde y se cierra la conexión.
          res.once("finish", () => req.destroy());
          return error(res, 413, e.message, { _cerrar: true });
        }
        return error(res, e.estado, e.message);
      }
      console.error(e);
      return error(res, 500, "Error interno del servidor");
    }
  });
  servidor.on("close", () => clearInterval(limpieza));
  return servidor;
};

/* ---------- Arranque ---------- */

const main = async () => {
  const { cargarEnv, configDesdeEntorno, abrirPool, crearAlmacen } = require("./db");
  cargarEnv();
  const config = configDesdeEntorno();
  const puerto = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";

  let pool;
  try {
    pool = await abrirPool(config);
  } catch (e) {
    if (/^Falta el paquete/.test(e.message)) {
      console.error(e.message);
    } else {
      console.error(`No se pudo conectar a MySQL (${config.user}@${config.host}:${config.port}/${config.database}).`);
      console.error(`Motivo: ${e.code ? e.code + " – " : ""}${e.message}`);
      console.error("Revisa que MySQL esté encendido y los datos de tu archivo .env (ver .env.example).");
    }
    process.exit(1);
  }

  const almacen = crearAlmacen(pool);
  await almacen.inicializar();
  const mesasValidas = cargarMesasValidas();
  const descartadas = await almacen.depurarReservas(mesasValidas);
  if (descartadas) console.log(`Se descartaron ${descartadas} reservas de mesas que ya no existen.`);

  const servidor = crearServidor({ almacen, mesasValidas });
  servidor.listen(puerto, host, () => {
    console.log(`Sistema-Biblioteca en http://${host}:${puerto}`);
    console.log(`Base de datos: MySQL ${config.host}:${config.port}/${config.database}`);
  });

  const apagar = () => {
    servidor.close(() => almacen.cerrar().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", apagar);
  process.on("SIGTERM", apagar);
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { crearServidor, cargarMesasValidas };

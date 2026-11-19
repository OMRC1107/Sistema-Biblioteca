/*
 * Capa de datos (MySQL). Usuarios y reservas viven en la base de datos.
 *
 *   abrirPool(config)  -> pool de mysql2/promise (crea la base si no existe)
 *   crearAlmacen(pool) -> consultas que usa el servidor (ver abajo)
 *
 * crearAlmacen solo necesita un objeto con execute(sql, params) y query(sql)
 * compatibles con mysql2/promise, por lo que se puede probar con otro motor.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* ---------- Configuración (variables de entorno o archivo .env) ---------- */

// Lector mínimo de .env (CLAVE=valor). No pisa variables que ya existan.
const cargarEnv = (ruta = path.join(__dirname, ".env")) => {
  let texto;
  try {
    texto = fs.readFileSync(ruta, "utf8");
  } catch {
    return;
  }
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trim().startsWith("#")) continue;
    let valor = m[2];
    if (/^(".*"|'.*')$/.test(valor)) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
};

const configDesdeEntorno = (env = process.env) => ({
  host: env.DB_HOST || "127.0.0.1",
  port: Number(env.DB_PORT) || 3306,
  user: env.DB_USER || "root",
  password: env.DB_PASSWORD ?? "",
  database: env.DB_NAME || "biblioteca",
});

/* ---------- Conexión ---------- */

const cargarMysql = () => {
  try {
    return require("mysql2/promise");
  } catch {
    throw new Error("Falta el paquete «mysql2». Ejecuta «npm install» en la carpeta del proyecto.");
  }
};

const abrirPool = async (config = configDesdeEntorno()) => {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(config.database)) {
    throw new Error("DB_NAME solo puede tener letras, números y guion bajo (máx. 64).");
  }
  const mysql = cargarMysql();
  const opciones = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    charset: "utf8mb4",
    connectTimeout: 10000,
  };

  const conectar = async () => {
    const pool = mysql.createPool({
      ...opciones,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
    });
    try {
      await pool.query("SELECT 1");
      return pool;
    } catch (e) {
      await pool.end().catch(() => {});
      throw e;
    }
  };

  try {
    return await conectar();
  } catch (e) {
    if (e.code !== "ER_BAD_DB_ERROR") throw e;
    // La base no existe: se intenta crearla (requiere permiso CREATE).
    const conexion = await mysql.createConnection(opciones);
    try {
      await conexion.query(
        `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await conexion.end();
    }
    return conectar();
  }
};

/* ---------- Consultas ---------- */

const sentenciasDelEsquema = () =>
  fs
    .readFileSync(path.join(__dirname, "schema.sql"), "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

const ERRORES_ESPERADOS = new Set(["ER_DUP_ENTRY", "ER_NO_REFERENCED_ROW_2"]);

// Cualquier otro fallo (base caída, credenciales, etc.) se informa como 503.
const comoErrorServicio = (e) => {
  if (e && e.estado) return e;
  console.error("Error de base de datos:", e && (e.code || ""), e && e.message);
  return Object.assign(new Error("La base de datos no está disponible. Inténtalo de nuevo en un momento."), {
    estado: 503,
  });
};

const crearAlmacen = (pool) => {
  const consultar = async (sql, params = []) => {
    try {
      const [filas] = await pool.execute(sql, params);
      return filas;
    } catch (e) {
      if (e && ERRORES_ESPERADOS.has(e.code)) throw e;
      throw comoErrorServicio(e);
    }
  };

  return {
    async inicializar() {
      try {
        for (const sentencia of sentenciasDelEsquema()) await pool.query(sentencia);
      } catch (e) {
        throw comoErrorServicio(e);
      }
    },

    async usuario(codigo) {
      const filas = await consultar("SELECT codigo, nombre, clave FROM usuarios WHERE codigo = ?", [codigo]);
      return filas[0] || null;
    },

    // true si se creó; false si el código ya estaba registrado.
    async crearUsuario(codigo, nombre, clave) {
      try {
        await consultar("INSERT INTO usuarios (codigo, nombre, clave) VALUES (?, ?, ?)", [codigo, nombre, clave]);
        return true;
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") return false;
        throw e;
      }
    },

    // [{ mesa, codigo }, ...]
    async reservas() {
      return consultar("SELECT mesa, codigo FROM reservas");
    },

    async reservaDeMesa(mesa) {
      const filas = await consultar("SELECT mesa, codigo FROM reservas WHERE mesa = ?", [mesa]);
      return filas[0] || null;
    },

    async reservaDePersona(codigo) {
      const filas = await consultar("SELECT mesa FROM reservas WHERE codigo = ?", [codigo]);
      return filas[0] ? filas[0].mesa : null;
    },

    // { ok: true } o { ok: false, motivo: "propia" | "ocupada" | "limite" | "sin_cuenta", actual? }
    // La unicidad la garantiza la base de datos (PRIMARY KEY de mesa y UNIQUE de codigo),
    // así que dos peticiones simultáneas nunca pueden reservar la misma mesa.
    async reservar(mesa, codigo) {
      try {
        await consultar("INSERT INTO reservas (mesa, codigo) VALUES (?, ?)", [mesa, codigo]);
        return { ok: true };
      } catch (e) {
        if (e.code === "ER_NO_REFERENCED_ROW_2") return { ok: false, motivo: "sin_cuenta" };
        if (e.code !== "ER_DUP_ENTRY") throw e;
        const existente = await this.reservaDeMesa(mesa);
        if (existente) return { ok: false, motivo: existente.codigo === codigo ? "propia" : "ocupada" };
        return { ok: false, motivo: "limite", actual: await this.reservaDePersona(codigo) };
      }
    },

    // true si se quitó. Solo borra la reserva si es de esa persona.
    async liberar(mesa, codigo) {
      const [res] = await pool.execute("DELETE FROM reservas WHERE mesa = ? AND codigo = ?", [mesa, codigo]).catch((e) => {
        throw comoErrorServicio(e);
      });
      return res.affectedRows > 0;
    },

    // Elimina reservas de mesas que ya no existen (p. ej. tras regenerar js/mesas.js).
    async depurarReservas(mesasValidas) {
      let borradas = 0;
      for (const { mesa } of await this.reservas()) {
        if (!mesasValidas.has(mesa)) {
          await consultar("DELETE FROM reservas WHERE mesa = ?", [mesa]);
          borradas++;
        }
      }
      return borradas;
    },

    async cerrar() {
      await pool.end();
    },
  };
};

module.exports = { cargarEnv, configDesdeEntorno, abrirPool, crearAlmacen };

/*
 * Capa de datos (MySQL). Usuarios y reportes viven en la base de datos.
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

/* ---------- Fechas (hora local del servidor, sin zona: se guardan tal cual) ---------- */

const dos = (n) => String(n).padStart(2, "0");
const sqlFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const sqlHora = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
const sqlFechaHora = (d) => `${sqlFecha(d)} ${sqlHora(d)}`;
// mysql2 devuelve Date; el adaptador de pruebas (SQLite) devuelve texto «AAAA-MM-DD HH:MM:SS».
const aDate = (v) => (v instanceof Date ? v : new Date(String(v).replace(" ", "T")));

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
        // Bases creadas con nombres anteriores (tablas «reservas» e «historial_reservas»): se renombran.
        // Si ya existe la tabla nueva o no existe la vieja, el error se ignora.
        for (const [viejo, nuevo] of [
          ["reserv" + "as", "reportes"],
          ["historial_reserv" + "as", "historial_reportes"],
        ]) {
          await pool.query(`ALTER TABLE ${viejo} RENAME TO ${nuevo}`).catch(() => {});
        }
        for (const sentencia of sentenciasDelEsquema()) await pool.query(sentencia);
        // Bases creadas con la versión anterior: la tabla reportes no tenía «hasta».
        // Los reportes antiguos quedan con una fecha vencida y se limpian solas.
        try {
          await pool.query(
            "ALTER TABLE reportes ADD COLUMN hasta DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00'"
          );
        } catch (e) {
          if (e.code !== "ER_DUP_FIELDNAME" && !/duplicate column/i.test(String(e.message))) throw e;
        }
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

    // Borra los reportes cuya hora de fin ya pasó (el historial no se toca).
    async purgarVencidas(ahora = new Date()) {
      await consultar("DELETE FROM reportes WHERE hasta <= ?", [sqlFechaHora(ahora)]);
    },

    // [{ mesa, codigo, hasta: Date }, ...] solo reportes vigentes.
    async reportes(ahora = new Date()) {
      await this.purgarVencidas(ahora);
      const filas = await consultar("SELECT mesa, codigo, hasta FROM reportes");
      return filas.map((f) => ({ mesa: f.mesa, codigo: f.codigo, hasta: aDate(f.hasta) }));
    },

    async reporteDeMesa(mesa) {
      const filas = await consultar("SELECT mesa, codigo FROM reportes WHERE mesa = ?", [mesa]);
      return filas[0] || null;
    },

    async reporteDePersona(codigo) {
      const filas = await consultar("SELECT mesa FROM reportes WHERE codigo = ?", [codigo]);
      return filas[0] ? filas[0].mesa : null;
    },

    // { ok: true } o { ok: false, motivo: "propia" | "ocupada" | "limite" | "sin_cuenta", actual? }
    // La unicidad la garantiza la base de datos (PRIMARY KEY de mesa y UNIQUE de codigo),
    // así que dos peticiones simultáneas nunca pueden reportar la misma mesa.
    // info: { sala: "Sala 8", numero: 3, hasta: Date, ahora: Date } (para el historial).
    async reportar(mesa, codigo, info = {}) {
      const ahora = info.ahora || new Date();
      const hasta = info.hasta || new Date(ahora.getTime() + 2 * 60 * 60 * 1000);
      const [salaId, num] = mesa.split("#");
      const sala = info.sala || salaId;
      const numero = info.numero || Number(num) || 0;

      await this.purgarVencidas(ahora);
      try {
        await consultar("INSERT INTO reportes (mesa, codigo, desde, hasta) VALUES (?, ?, ?, ?)", [
          mesa,
          codigo,
          sqlFechaHora(ahora),
          sqlFechaHora(hasta),
        ]);
      } catch (e) {
        if (e.code === "ER_NO_REFERENCED_ROW_2") return { ok: false, motivo: "sin_cuenta" };
        if (e.code !== "ER_DUP_ENTRY") throw e;
        const existente = await this.reporteDeMesa(mesa);
        if (existente) return { ok: false, motivo: existente.codigo === codigo ? "propia" : "ocupada" };
        return { ok: false, motivo: "limite", actual: await this.reporteDePersona(codigo) };
      }

      // Registro del reporte. Si no se pudiera guardar, se deshace para no dejar reportes sin registro.
      const mismoDia = sqlFecha(hasta) === sqlFecha(ahora);
      try {
        await consultar(
          "INSERT INTO historial_reportes (codigo, sala, mesa, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?, ?)",
          [codigo, sala, numero, sqlFecha(ahora), sqlHora(ahora), mismoDia ? sqlHora(hasta) : "23:59:59"]
        );
      } catch (e) {
        await consultar("DELETE FROM reportes WHERE mesa = ?", [mesa]).catch(() => {});
        throw e;
      }
      return { ok: true };
    },

    // true si se quitó. Solo borra el reporte si es de esa persona. Si se quita antes de
    // tiempo, la hora de fin del registro pasa a ser la hora actual.
    async liberar(mesa, codigo, info = {}) {
      const ahora = info.ahora || new Date();
      const [salaId, num] = mesa.split("#");
      const [res] = await pool.execute("DELETE FROM reportes WHERE mesa = ? AND codigo = ?", [mesa, codigo]).catch((e) => {
        throw comoErrorServicio(e);
      });
      if (res.affectedRows === 0) return false;

      const filas = await consultar(
        "SELECT id, hora_fin FROM historial_reportes WHERE codigo = ? AND sala = ? AND mesa = ? AND fecha = ? ORDER BY id DESC LIMIT 1",
        [codigo, info.sala || salaId, info.numero || Number(num) || 0, sqlFecha(ahora)]
      );
      if (filas[0] && sqlHora(ahora) < String(filas[0].hora_fin)) {
        await consultar("UPDATE historial_reportes SET hora_fin = ? WHERE id = ?", [sqlHora(ahora), filas[0].id]);
      }
      return true;
    },

    // Elimina reportes de mesas que ya no existen (p. ej. tras regenerar js/mesas.js).
    async depurarReportes(mesasValidas) {
      let borradas = 0;
      for (const { mesa } of await this.reportes()) {
        if (!mesasValidas.has(mesa)) {
          await consultar("DELETE FROM reportes WHERE mesa = ?", [mesa]);
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

module.exports = { cargarEnv, configDesdeEntorno, abrirPool, crearAlmacen, sqlFecha, sqlHora, sqlFechaHora };

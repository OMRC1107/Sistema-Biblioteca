/*
 * Pool de pruebas: imita la parte de mysql2/promise que usa db.js, pero sobre
 * SQLite en memoria (node:sqlite, Node >= 22.5). Permite ejecutar las consultas
 * SQL reales y las pruebas del servidor sin tener MySQL instalado.
 */

"use strict";

const { DatabaseSync } = require("node:sqlite");

// Adapta el DDL de MySQL a SQLite (solo cambia lo específico de MySQL).
const traducir = (sql) =>
  sql
    .replace(/\)\s*ENGINE=[^;]*$/i, ")")
    .replace(/UNIQUE KEY\s+\w+\s*\(/gi, "UNIQUE (")
    .replace(/(\w+)\s+INT UNSIGNED\s+NOT NULL AUTO_INCREMENT,/gi, "$1 INTEGER PRIMARY KEY AUTOINCREMENT,")
    .replace(/PRIMARY KEY \(id\),/gi, "")
    .replace(/^\s*KEY\s+\w+\s*\([^)]*\)\s*,?\s*$/gim, "")
    .replace(/,\s*\)\s*$/, ")");

// Traduce los errores de restricción a los códigos de MySQL que espera db.js.
const comoErrorMysql = (e) => {
  const m = String(e.message);
  if (/UNIQUE constraint failed/i.test(m)) Object.assign(e, { code: "ER_DUP_ENTRY", errno: 1062 });
  else if (/FOREIGN KEY constraint failed/i.test(m)) Object.assign(e, { code: "ER_NO_REFERENCED_ROW_2", errno: 1452 });
  return e;
};

const crearPoolSqlite = () => {
  const bd = new DatabaseSync(":memory:");
  bd.exec("PRAGMA foreign_keys = ON");
  let caida = false;

  const ejecutar = async (sql, params = []) => {
    if (caida) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const t = traducir(sql);
    try {
      const st = bd.prepare(t);
      if (/^\s*select/i.test(t)) return [st.all(...params).map((f) => ({ ...f })), []];
      const r = st.run(...params);
      return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, undefined];
    } catch (e) {
      throw comoErrorMysql(e);
    }
  };

  return {
    execute: ejecutar,
    query: ejecutar,
    end: async () => bd.close(),
    simularCaida: (valor = true) => {
      caida = valor;
    },
    // Acceso directo para comprobaciones de las pruebas.
    sql: (texto, ...params) => bd.prepare(texto).all(...params).map((f) => ({ ...f })),
  };
};

module.exports = { crearPoolSqlite };

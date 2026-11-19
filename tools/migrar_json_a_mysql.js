#!/usr/bin/env node
/*
 * Copia las cuentas y reservas de la versión anterior (datos/biblioteca.json) a MySQL.
 * Las contraseñas ya están cifradas (scrypt), así que las personas conservan la suya.
 * Se puede ejecutar más de una vez: lo que ya existe se omite.
 *
 * Uso:  node tools/migrar_json_a_mysql.js [ruta/al/biblioteca.json]
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cargarEnv, configDesdeEntorno, abrirPool, crearAlmacen } = require("../db");

const migrar = async (almacen, datos, log = console.log) => {
  const total = { usuarios: 0, usuariosOmitidos: 0, reservas: 0, reservasOmitidas: 0 };

  for (const [codigo, u] of Object.entries(datos.usuarios || {})) {
    const valido = /^\d{7}$/.test(codigo) && u && typeof u.nombre === "string" && /^[0-9a-f]+:[0-9a-f]+$/.test(u.clave || "");
    if (valido && (await almacen.crearUsuario(codigo, u.nombre, u.clave))) total.usuarios++;
    else {
      total.usuariosOmitidos++;
      log(`  usuario omitido: ${codigo}${valido ? " (ya existía)" : " (datos no válidos)"}`);
    }
  }

  for (const [mesa, r] of Object.entries(datos.reservas || {})) {
    const res = await almacen.reservar(mesa, r.codigo);
    if (res.ok) total.reservas++;
    else {
      total.reservasOmitidas++;
      log(`  reserva omitida: ${mesa} (${res.motivo})`);
    }
  }
  return total;
};

const main = async () => {
  cargarEnv();
  const ruta = path.resolve(process.argv[2] || path.join(__dirname, "..", "datos", "biblioteca.json"));
  if (!fs.existsSync(ruta)) {
    console.error(`No se encontró ${ruta}. Indica la ruta: node tools/migrar_json_a_mysql.js ruta/biblioteca.json`);
    process.exit(1);
  }
  const datos = JSON.parse(fs.readFileSync(ruta, "utf8"));
  const config = configDesdeEntorno();
  const pool = await abrirPool(config);
  const almacen = crearAlmacen(pool);
  try {
    await almacen.inicializar();
    const t = await migrar(almacen, datos);
    console.log(
      `Listo → ${config.database}: ${t.usuarios} usuarios y ${t.reservas} reservas copiados ` +
        `(${t.usuariosOmitidos} usuarios y ${t.reservasOmitidas} reservas omitidos).`
    );
  } finally {
    await almacen.cerrar();
  }
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { migrar };

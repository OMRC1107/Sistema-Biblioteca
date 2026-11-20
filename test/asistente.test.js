/*
 * Pruebas del asistente de mesas (js/asistente.js) con las salas y mesas reales.
 * Ejecutar:  npm test
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { crear, normalizar } = require("../js/asistente");

const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, "js", f), "utf8");
const PISOS = vm.runInNewContext(`${leer("data.js")}\n;PISOS`, Object.create(null));
const MESAS = vm.runInNewContext(`${leer("mesas.js")}\n;MESAS`, Object.create(null));

const salas = PISOS.flatMap((p) =>
  p.salas.map((s) => ({ ...s, id: normalizar(s.nombre).replace(/[^a-z0-9]+/g, "-"), piso: p.id, pisoNombre: p.nombre }))
);

// Entorno de prueba: estado de las mesas y de la cuenta controlables.
const entorno = ({ reservadas = {}, usuario = null, mia = null, disponible = true } = {}) => {
  const ahora = new Date(2026, 10, 19, 18, 50);
  return {
    salas,
    mesasDe: (s) => (MESAS[s.id] ? MESAS[s.id].centros.length : 0),
    estadoMesa: (id) => (!disponible ? "desconocido" : id === mia ? "mia" : reservadas[id] ? "reservada" : "libre"),
    hastaMesa: (id) => (reservadas[id] || id === mia ? new Date(2026, 10, 19, 20, 0) : null),
    cuenta: () => ({ disponible, usuario, mia }),
    ahora: () => ahora,
  };
};

const ana = { codigo: "1234567", nombre: "Ana" };
const preguntar = (texto, opciones) => crear(entorno(opciones)).responder(texto);

/* ---------- Disponibilidad ---------- */

test("disponibilidad general, por piso y por sala", () => {
  const g = preguntar("¿Hay mesas libres?");
  assert.match(g.texto, /110 mesas libres de 110/);
  assert.match(preguntar("mesas disponibles en el piso 2").texto, /Piso 2: 47 mesas libres de 47/);
  assert.match(preguntar("cuantas mesas quedan en el segundo piso").texto, /Piso 2/);

  const s8 = preguntar("¿Hay mesas libres en la Sala 8?");
  assert.match(s8.texto, /Sala 8 \(Piso 1\): 12 mesas libres y 0 reservadas, de 12/);
  assert.deepEqual(s8.botones[0].accion, { tipo: "abrir", salaId: "sala-8", mesaId: null });
});

test("cuenta las mesas reservadas y menciona las libres", () => {
  const r = preguntar("mesas libres sala 8", { reservadas: { "sala-8#1": true, "sala-8#2": true } });
  assert.match(r.texto, /10 mesas libres y 2 reservadas/);
  assert.match(r.texto, /Libres: mesa 3, mesa 4/);
  assert.doesNotMatch(r.texto, /mesa 1,/);
});

test("entiende variantes de escritura de la sala", () => {
  for (const t of ["sala8 libres", "SALA 8 disponibles?", "¿mesas disponibles en la sala numero 8?", "hay mesas en sala  8"]) {
    assert.match(preguntar(t).texto, /Sala 8/, t);
  }
  assert.match(preguntar("hay mesas en la galería de lectura").texto, /Galería de lectura/);
  assert.match(preguntar("mesas libres en el ingreso").texto, /Ingreso/);
  assert.match(preguntar("mesas libres en la sala 15").texto, /Sala 15/);
});

test("sin servidor no inventa disponibilidad", () => {
  const r = preguntar("¿hay mesas libres?", { disponible: false });
  assert.match(r.texto, /no tengo conexión/i);
});

test("salas sin mesas no se pueden abrir", () => {
  for (const t of ["muéstrame la cafetería", "mesas libres en el auditorio", "dónde está la sala 6"]) {
    const r = preguntar(t);
    assert.match(r.texto, /no tiene mesas/, t);
    assert.equal(r.ejecutar, undefined, t);
  }
  assert.match(preguntar("mesas en la sala 99").texto, /No existe la Sala 99/);
});

/* ---------- Ubicar y abrir ---------- */

test("abrir una sala o un piso", () => {
  const r = preguntar("¿Dónde está la sala 14?");
  assert.deepEqual(r.ejecutar, { tipo: "abrir", salaId: "sala-14", mesaId: null });
  assert.match(r.texto, /Piso 3/);
  assert.deepEqual(preguntar("llévame al piso 2").ejecutar, { tipo: "piso", id: 2 });
  assert.deepEqual(preguntar("muéstrame el primer piso").ejecutar, { tipo: "piso", id: 1 });
  assert.deepEqual(preguntar("ver mesa 4 de la sala 9").ejecutar, { tipo: "abrir", salaId: "sala-9", mesaId: "sala-9#4" });
  assert.deepEqual(preguntar("sala 3").ejecutar, { tipo: "abrir", salaId: "sala-3", mesaId: null }); // solo el nombre
});

test("listar salas con mesas", () => {
  const r = preguntar("¿Qué salas tienen mesas?");
  assert.match(r.texto, /Piso 1: .*Sala 8 \(12\/12\)/);
  assert.match(r.texto, /Galería de lectura/);
  assert.doesNotMatch(r.texto, /Cafetería/);
  assert.match(preguntar("salas del piso 3").texto, /Sala 14/);
});

/* ---------- Reservar ---------- */

test("reservar con sala y mesa pide confirmación y luego ejecuta", () => {
  const a = crear(entorno({ usuario: ana }));
  const pide = a.responder("Reserva la mesa 3 de la Sala 9 por 3 horas");
  assert.match(pide.texto, /¿Reservo la mesa 3 de la Sala 9 por 3 horas\?.*9:50 p\. m\./);
  assert.equal(pide.ejecutar, undefined);
  assert.deepEqual(a.responder("sí").ejecutar, { tipo: "reservar", mesaId: "sala-9#3", horas: 3 });
  assert.equal(a.responder("sí").ejecutar, undefined); // la confirmación se usa una sola vez
});

test("cancelar la confirmación no reserva", () => {
  const a = crear(entorno({ usuario: ana }));
  a.responder("quiero reservar la mesa 1 de la sala 8");
  const r = a.responder("no");
  assert.match(r.texto, /no hice ningún cambio/i);
  assert.equal(r.ejecutar, undefined);
  assert.equal(a.responder("sí").ejecutar, undefined);
});

test("reservar usa 2 horas por defecto y respeta el máximo de 4", () => {
  const a = crear(entorno({ usuario: ana }));
  assert.match(a.responder("reservar mesa 2 sala 1").texto, /por 2 horas/);
  assert.match(a.responder("reservar mesa 2 sala 1 por 9 horas").texto, /de 1 a 4 horas/);
  assert.match(a.responder("apartar la mesa 5 de la sala 9 por una hora").texto, /por 1 hora\?/);
});

test("reservar sin mesa ofrece las libres, y un número suelto la elige", () => {
  const a = crear(entorno({ usuario: ana, reservadas: { "sala-8#1": true } }));
  const r = a.responder("quiero reservar en la sala 8");
  assert.match(r.texto, /¿Qué mesa de la Sala 8\? Libres: 2, 3/);
  assert.ok(r.botones.some((b) => b.decir === "Reserva la mesa 2 de la Sala 8"));
  assert.match(a.responder("la 5").texto, /¿Reservo la mesa 5 de la Sala 8/);
});

test("reservar sin sala recomienda la que más mesas libres tiene", () => {
  const a = crear(entorno({ usuario: ana, reservadas: { "sala-14#1": true } }));
  assert.match(a.responder("quiero una mesa").texto, /La que más mesas libres tiene es la Sala 14|más mesas libres tiene es la/);
  assert.match(a.responder("quiero reservar una mesa en el piso 3").texto, /piso 3.*Sala 14/);
});

test("no reserva mesas ocupadas ni inexistentes", () => {
  const a = crear(entorno({ usuario: ana, reservadas: { "sala-8#3": true } }));
  const ocupada = a.responder("reserva la mesa 3 de la sala 8");
  assert.match(ocupada.texto, /ya está reservada hasta las 8:00 p\. m\./);
  assert.equal(ocupada.ejecutar, undefined);
  assert.match(a.responder("reserva la mesa 40 de la sala 8").texto, /mesas del 1 al 12/);
  assert.match(a.responder("reserva la mesa 1 de la cafetería").texto, /no tiene mesas/);
});

test("reservar exige sesión y respeta el límite de una reserva", () => {
  const sinSesion = preguntar("reserva la mesa 1 de la sala 8");
  assert.match(sinSesion.texto, /iniciar sesión/);
  assert.deepEqual(sinSesion.botones[0].accion, { tipo: "login", modo: "entrar" });

  const conReserva = preguntar("reserva la mesa 2 de la sala 8", { usuario: ana, mia: "sala-9#4", reservadas: {} });
  assert.match(conReserva.texto, /Ya tienes la mesa 4 de la Sala 9/);
  assert.equal(conReserva.ejecutar, undefined);
  assert.match(preguntar("reserva la mesa 2 de la sala 8", { disponible: false }).texto, /no tengo conexión/i);
});

/* ---------- Mi reserva y quitar ---------- */

test("mi reserva", () => {
  const r = preguntar("¿cuál es mi mesa?", { usuario: ana, mia: "sala-9#4" });
  assert.match(r.texto, /mesa es la 4 de la Sala 9 \(Piso 2\), reservada hasta las 8:00 p\. m\./);
  assert.deepEqual(r.botones[0].accion, { tipo: "abrir", salaId: "sala-9", mesaId: "sala-9#4" });
  assert.match(preguntar("¿tengo alguna reserva?", { usuario: ana }).texto, /No tienes ninguna mesa reservada/);
  assert.match(preguntar("mi reserva").texto, /inicia sesión/);
});

test("quitar la reserva pide confirmación", () => {
  const a = crear(entorno({ usuario: ana, mia: "sala-9#4" }));
  assert.match(a.responder("quita mi reserva").texto, /¿Quito tu reserva de la mesa 4 de la Sala 9\?/);
  assert.deepEqual(a.responder("sí, quítala").ejecutar, { tipo: "quitar", mesaId: "sala-9#4" });
  assert.match(preguntar("cancelar mi reserva", { usuario: ana }).texto, /No tienes ninguna reserva/);
  for (const t of ["ya no quiero la mesa", "libera mi mesa", "anular reserva"]) {
    assert.match(preguntar(t, { usuario: ana, mia: "sala-9#4" }).texto, /¿Quito tu reserva/, t);
  }
});

/* ---------- Recomendaciones ---------- */

test("recomienda la sala con más mesas libres y es honesto con lo que no sabe", () => {
  const r = preguntar("¿cuál sala me recomiendas?", { reservadas: { "sala-14#1": true } });
  assert.match(r.texto, /La sala con más mesas libres ahora es/);
  const calma = preguntar("busco un lugar tranquilo y silencioso");
  assert.match(calma.texto, /No tengo datos de ruido/);
  assert.match(preguntar("¿dónde hay menos gente en el piso 2?").texto, /piso 2/);
});

/* ---------- Preguntas de funcionamiento ---------- */

test("preguntas de uso, reglas y cuenta", () => {
  assert.match(preguntar("¿Cómo reservo una mesa?").texto, /1\. Inicia sesión/);
  assert.match(preguntar("como funciona esto").texto, /1\. Inicia sesión/);
  assert.match(preguntar("¿puedo reservar dos mesas?").texto, /una mesa reservada a la vez/);
  assert.match(preguntar("¿cuánto dura la reserva?").texto, /de 1 a 4 horas/);
  assert.match(preguntar("¿hasta qué hora puedo reservar?").texto, /11:59 p\. m\./);
  assert.match(preguntar("¿qué significa el color rojo?").texto, /rojo = reservada/);
  assert.match(preguntar("¿para cuántas personas es una mesa?").texto, /6 puestos/);
  assert.match(preguntar("¿se guarda un historial de las reservas?").texto, /hora de inicio y la hora de fin/);
  assert.match(preguntar("¿cómo creo una cuenta?").texto, /7 cifras/);
  assert.match(preguntar("olvidé mi contraseña").texto, /no tiene recuperación automática/);
  assert.match(preguntar("quiero iniciar sesión").botones[0].etiqueta, /Iniciar sesión/);
  assert.deepEqual(preguntar("cerrar sesión", { usuario: ana }).botones[0].accion, { tipo: "salir" });
});

test("cortesía, ayuda y temas fuera de alcance", () => {
  assert.match(preguntar("hola").texto, /asistente de mesas/);
  assert.match(preguntar("buenas tardes").texto, /asistente de mesas/);
  assert.match(preguntar("gracias").texto, /Con gusto/);
  assert.match(preguntar("chao").texto, /Hasta luego/);
  assert.match(preguntar("ayuda").texto, /Puedo ayudarte/);
  assert.match(preguntar("¿a qué hora abre la biblioteca?").texto, /no tengo información/);
  assert.match(preguntar("¿cuánto cuesta imprimir?").texto, /no tengo información/);
});

test("lo que no entiende se responde con ejemplos, nunca con una acción", () => {
  for (const t of ["asdfgh", "?", "el clima de hoy", ""]) {
    const r = preguntar(t, { usuario: ana });
    assert.equal(r.ejecutar, undefined, t);
    assert.ok(r.texto.length > 0);
    assert.ok(r.botones && r.botones.length, t);
  }
});

test("seguimiento: «¿y en el piso 2?» repite la última pregunta", () => {
  const a = crear(entorno());
  a.responder("¿hay mesas libres en la sala 8?");
  assert.match(a.responder("¿y en el piso 2?").texto, /Piso 2/);
  assert.match(a.responder("y en la sala 9").texto, /Sala 9/);
});

test("nunca ejecuta reservar o quitar sin confirmación previa", () => {
  const frases = [
    "reserva la mesa 3 de la sala 8", "quiero la mesa 2 de la sala 9", "quita mi reserva", "cancela",
    "apartar mesa", "sí", "dale", "ok", "reservar",
  ];
  const a = crear(entorno({ usuario: ana, mia: "sala-9#4" }));
  for (const t of frases) {
    const r = crear(entorno({ usuario: ana })).responder(t);
    assert.ok(!r.ejecutar || !["reservar", "quitar"].includes(r.ejecutar.tipo), t);
  }
  assert.equal(a.responder("sí").ejecutar, undefined);
});

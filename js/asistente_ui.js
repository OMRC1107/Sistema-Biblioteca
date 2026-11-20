/*
 * Pantalla del asistente de mesas: botón flotante, ventana de chat y ejecución de
 * las acciones que decide js/asistente.js (abrir una sala, reservar, quitar, etc.).
 * Las reservas y cancelaciones pasan por Cuenta, o sea por el mismo servidor y las
 * mismas reglas que los botones del plano; el asistente nunca reserva sin que la
 * persona confirme.
 */

(() => {
  "use strict";

  const App = window.BibliotecaApp;
  const cajaMensajes = document.getElementById("asistente-mensajes");
  const panel = document.getElementById("asistente");
  const abrirBoton = document.getElementById("asistente-abrir");
  const form = document.getElementById("asistente-form");
  const entrada = document.getElementById("asistente-texto");
  if (!App || !cajaMensajes) return;

  const asistente = Asistente.crear({
    salas: App.salas,
    mesasDe: (sala) => App.mesasDe(sala),
    estadoMesa: (id) => Cuenta.estadoMesa(id),
    hastaMesa: (id) => Cuenta.hastaMesa(id),
    cuenta: () => ({ disponible: Cuenta.estado.disponible, usuario: Cuenta.estado.usuario, mia: Cuenta.estado.mia }),
  });

  const nombreSala = (id) => (App.salas.find((s) => s.id === id) || { nombre: id }).nombre;

  /* ---------- Mensajes ---------- */

  const agregar = (rol, texto, botones = []) => {
    const burbuja = document.createElement("div");
    burbuja.className = `msg msg-${rol}`;
    const p = document.createElement("p");
    p.textContent = texto; // texto plano: nunca HTML
    burbuja.append(p);
    if (botones.length) {
      const fila = document.createElement("div");
      fila.className = "msg-botones";
      for (const b of botones) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "chip";
        boton.textContent = b.etiqueta;
        boton.addEventListener("click", () => {
          if (b.decir) preguntar(b.decir);
          else if (b.accion) ejecutar(b.accion, true);
        });
        fila.append(boton);
      }
      burbuja.append(fila);
    }
    cajaMensajes.append(burbuja);
    cajaMensajes.scrollTop = cajaMensajes.scrollHeight;
  };

  /* ---------- Acciones ---------- */

  const hora = (fecha) => Asistente.formatoHora(fecha);

  const ejecutar = async (accion, desdeBoton = false) => {
    switch (accion.tipo) {
      case "abrir":
        App.seleccionar(accion.salaId, accion.mesaId || null);
        break;
      case "piso":
        App.cambiarPiso(accion.id);
        break;
      case "login":
        Cuenta.abrirDialogo(accion.modo);
        break;
      case "salir":
        await Cuenta.salir();
        agregar("bot", "Cerré tu sesión.");
        break;
      case "reservar":
        try {
          await Cuenta.reservar(accion.mesaId, accion.horas);
          const [salaId, n] = accion.mesaId.split("#");
          const hasta = Cuenta.hastaMesa(accion.mesaId);
          agregar(
            "bot",
            `Listo: reservaste la mesa ${n} de ${nombreSala(salaId)}${hasta ? ` hasta las ${hora(hasta)}` : ""}${hasta ? "" : "."}`,
            [{ etiqueta: "Ver mi mesa", accion: { tipo: "abrir", salaId, mesaId: accion.mesaId } }]
          );
          App.seleccionar(salaId, accion.mesaId);
        } catch (e) {
          agregar("bot", `No se pudo reservar: ${e.message}`);
        }
        break;
      case "quitar":
        try {
          await Cuenta.liberar(accion.mesaId);
          agregar("bot", "Listo, quité tu reserva. La mesa quedó libre.");
        } catch (e) {
          agregar("bot", `No se pudo quitar la reserva: ${e.message}`);
        }
        break;
    }
  };

  const preguntar = async (texto) => {
    const limpio = texto.trim().slice(0, 200);
    if (!limpio) return;
    agregar("yo", limpio);
    // Antes de contestar se pone al día el estado de las mesas.
    if (Cuenta.estado.disponible !== false) await Cuenta.refrescar();
    const r = asistente.responder(limpio);
    agregar("bot", r.texto, r.botones || []);
    if (r.ejecutar) await ejecutar(r.ejecutar);
  };

  /* ---------- Abrir / cerrar ---------- */

  let saludado = false;
  const alternar = (abrir) => {
    panel.hidden = !abrir;
    abrirBoton.setAttribute("aria-expanded", String(abrir));
    abrirBoton.hidden = abrir;
    if (abrir) {
      if (!saludado) {
        saludado = true;
        const r = asistente.saludo();
        agregar("bot", r.texto, r.botones);
      }
      entrada.focus();
    } else {
      abrirBoton.focus();
    }
  };

  abrirBoton.addEventListener("click", () => alternar(true));
  document.getElementById("asistente-cerrar").addEventListener("click", () => alternar(false));
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") alternar(false);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = entrada.value;
    entrada.value = "";
    preguntar(texto);
  });
})();

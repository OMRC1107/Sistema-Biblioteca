/*
 * Cuenta y reportes (cliente).
 *
 * Habla con server.js: registro / inicio de sesión (código de 7 cifras, nombre y
 * contraseña de mínimo 8 caracteres) y reportes de mesas compartidas entre todas
 * las personas. La sesión vive en una cookie HttpOnly: aquí nunca se guarda la
 * contraseña ni ningún token.
 */

const Cuenta = (() => {
  "use strict";

  const estado = {
    disponible: null, // null = aún no se sabe, false = no hay servidor
    usuario: null, // { codigo, nombre } o null
    reportes: {}, // { idMesa: { mia: boolean } }
    mia: null, // idMesa del reporte propio
  };

  const oyentes = new Set();
  let firmaAnterior = "";

  const avisar = (forzar = false) => {
    const firma = JSON.stringify([estado.disponible, estado.usuario, estado.reportes, estado.mia]);
    if (!forzar && firma === firmaAnterior) return;
    firmaAnterior = firma;
    oyentes.forEach((f) => f());
  };

  const suscribir = (fn) => {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  };

  /* ---------- API ---------- */

  const api = async (metodo, ruta, cuerpo) => {
    const res = await fetch(ruta, {
      method: metodo,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "biblioteca",
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    let datos = {};
    try {
      datos = await res.json();
    } catch {
      /* respuesta sin JSON */
    }
    if (!res.ok) {
      const e = new Error(datos.error || "No se pudo completar la solicitud.");
      e.estado = res.status;
      e.datos = datos;
      throw e;
    }
    return datos;
  };

  const aplicarReportes = (datos) => {
    estado.reportes = datos.reportes || {};
    estado.mia = datos.mia || null;
  };

  const refrescar = async () => {
    try {
      const [yo, reportes] = await Promise.all([api("GET", "/api/yo"), api("GET", "/api/reportes")]);
      estado.disponible = true;
      estado.usuario = yo.usuario;
      aplicarReportes(reportes);
    } catch (e) {
      if (e.estado === undefined || e.estado === 503) {
        estado.disponible = false; // sin servidor (p. ej. abierto como archivo) o sin base de datos
        estado.usuario = null;
        estado.reportes = {};
        estado.mia = null;
      }
    }
    avisar();
  };

  // horas: de 1 a 4 (el servidor usa 2 si no se indica). El reporte empieza ahora.
  const reportar = async (mesa, horas) => {
    try {
      aplicarReportes(await api("POST", "/api/reportes", { mesa, horas }));
      avisar();
    } catch (e) {
      await refrescar(); // por si otra persona se adelantó
      throw e;
    }
  };

  const liberar = async (mesa) => {
    try {
      aplicarReportes(await api("DELETE", `/api/reportes/${encodeURIComponent(mesa)}`));
      avisar();
    } catch (e) {
      await refrescar();
      throw e;
    }
  };

  const salir = async () => {
    try {
      await api("POST", "/api/logout");
    } finally {
      await refrescar();
    }
  };

  // Hora de fin del reporte de una mesa (Date) o null.
  const hastaMesa = (id) => {
    const r = estado.reportes[id];
    return r && r.hasta ? new Date(r.hasta) : null;
  };

  // "libre" | "reportada" | "mia" | "desconocido" (sin servidor)
  const estadoMesa = (id) => {
    if (estado.disponible !== true) return "desconocido";
    const r = estado.reportes[id];
    if (!r) return "libre";
    return r.mia ? "mia" : "reportada";
  };

  /* ---------- Diálogo de acceso ---------- */

  const $ = (id) => document.getElementById(id);
  const dlg = $("dlg-cuenta");
  const form = $("form-cuenta");
  const campos = {
    codigo: $("f-codigo"),
    nombre: $("f-nombre"),
    clave: $("f-clave"),
    mostrar: $("f-mostrar"),
  };
  const filaNombre = $("f-nombre-fila");
  const textoError = $("f-error");
  const botonEnviar = $("f-enviar");
  const pestanas = [...document.querySelectorAll("#dlg-modos [data-modo]")];

  let modo = "entrar";

  const mostrarError = (mensaje) => {
    textoError.textContent = mensaje || "";
  };

  const ponerModo = (nuevo) => {
    modo = nuevo;
    const registro = modo === "registro";
    pestanas.forEach((p) => p.setAttribute("aria-selected", String(p.dataset.modo === modo)));
    filaNombre.hidden = !registro;
    campos.clave.autocomplete = registro ? "new-password" : "current-password";
    botonEnviar.textContent = registro ? "Crear cuenta" : "Iniciar sesión";
    $("dlg-titulo").textContent = registro ? "Crear cuenta" : "Iniciar sesión";
    mostrarError("");
  };

  const abrirDialogo = (m = "entrar") => {
    if (estado.disponible === false) return;
    form.reset();
    campos.clave.type = "password";
    ponerModo(m);
    if (!dlg.open) dlg.showModal();
    campos.codigo.focus();
  };

  pestanas.forEach((p) => p.addEventListener("click", () => ponerModo(p.dataset.modo)));
  $("dlg-cerrar").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close(); // clic en el fondo
  });

  campos.codigo.addEventListener("input", () => {
    campos.codigo.value = campos.codigo.value.replace(/\D/g, "").slice(0, 7);
  });
  campos.mostrar.addEventListener("change", () => {
    campos.clave.type = campos.mostrar.checked ? "text" : "password";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = campos.codigo.value.trim();
    const nombre = campos.nombre.value.replace(/\s+/g, " ").trim();
    const clave = campos.clave.value;

    if (!/^\d{7}$/.test(codigo)) return mostrarError("El código debe tener exactamente 7 cifras.");
    if (modo === "registro" && (nombre.length < 2 || nombre.length > 60)) {
      return mostrarError("El nombre debe tener entre 2 y 60 caracteres.");
    }
    if (modo === "registro" && clave.length < 8) {
      return mostrarError("La contraseña debe tener al menos 8 caracteres.");
    }
    if (!clave) return mostrarError("Escribe tu contraseña.");

    botonEnviar.disabled = true;
    mostrarError("");
    try {
      if (modo === "registro") await api("POST", "/api/registro", { codigo, nombre, password: clave });
      else await api("POST", "/api/login", { codigo, password: clave });
      form.reset();
      dlg.close();
      await refrescar();
    } catch (err) {
      mostrarError(err.estado === undefined ? "No se pudo conectar con el servidor." : err.message);
    } finally {
      botonEnviar.disabled = false;
    }
  });

  /* ---------- Actualización periódica (ver reportes de otras personas) ---------- */

  const iniciar = () => {
    refrescar();
    setInterval(() => {
      if (!document.hidden && estado.disponible) refrescar();
    }, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refrescar();
    });
  };

  return { estado, suscribir, refrescar, reportar, liberar, salir, estadoMesa, hastaMesa, abrirDialogo, iniciar };
})();

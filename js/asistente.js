/*
 * Asistente de mesas (contestador por reglas, sin inteligencia artificial).
 *
 * Entiende preguntas en español sobre las mesas y las salas: disponibilidad, dónde
 * está una sala, reportar, quitar el reporte, mi reporte, cómo funciona, etc.
 * Funciona buscando palabras clave y datos (sala, piso, número de mesa, horas).
 *
 * Este archivo solo decide qué responder: no toca la pantalla ni el servidor.
 * Devuelve datos que js/asistente_ui.js muestra y ejecuta:
 *
 *   responder(texto) -> { texto, botones?: [{ etiqueta, decir? | accion? }], ejecutar? }
 *     botones[].decir   texto que se envía como si la persona lo hubiera escrito
 *     botones[].accion  { tipo: "abrir" | "login" | "salir", ... } la ejecuta la interfaz
 *     ejecutar          { tipo: "reportar" | "quitar" | "abrir" | "piso", ... } se hace ya
 *
 * Se puede usar en el navegador (global Asistente) y en Node (require), para probarlo.
 */

(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.Asistente = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- Utilidades de texto ---------- */

  const normalizar = (texto) =>
    String(texto)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/([a-z])(\d)/g, "$1 $2") // «sala8» -> «sala 8»
      .replace(/(\d)([a-z])/g, "$1 $2")
      .replace(/[^a-z0-9#]+/g, " ")
      .trim();

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  const formatoHora = (fecha) => {
    const h = fecha.getHours();
    const minutos = String(fecha.getMinutes()).padStart(2, "0");
    return `${h % 12 === 0 ? 12 : h % 12}:${minutos} ${h < 12 ? "a. m." : "p. m."}`;
  };

  // «la Sala 8», «el Ingreso», «de la Sala 8», «del Ingreso».
  const FEMENINAS = /^(sala|galeria|cafeteria|ludoteca|jefatura|secretaria|devoluciones)\b/;
  const art = (sala) => `${FEMENINAS.test(normalizar(sala.nombre)) ? "la" : "el"} ${sala.nombre}`;
  const de = (sala) => (art(sala).startsWith("la ") ? `de ${art(sala)}` : `del ${sala.nombre}`);

  const lista = (items) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

  const PALABRAS_NUMERO = { un: 1, uno: 1, una: 1, primer: 1, primero: 1, dos: 2, segundo: 2, tres: 3, tercer: 3, tercero: 3, cuatro: 4 };

  // Otras formas de nombrar las salas que no se llaman «Sala N».
  const ALIAS = {
    ingreso: ["ingreso", "entrada", "recepcion"],
    devoluciones: ["devolucion", "devoluciones"],
    cafeteria: ["cafeteria", "cafe"],
    auditorio: ["auditorio"],
    "sala-tic": ["sala tic", "tic"],
    "sala-tribal": ["tribal"],
    "sala-de-computo": ["computo", "computadores", "sala de computo"],
    ludoteca: ["ludoteca"],
    "procesos-tecnicos": ["procesos tecnicos"],
    jefatura: ["jefatura"],
    secretaria: ["secretaria"],
    "galeria-de-lectura": ["galeria de lectura", "galeria", "lectura"],
    "sala-de-semilleros-a": ["semilleros a", "semillero a"],
    "sala-de-semilleros-b": ["semilleros b", "semillero b"],
    "sala-de-investigacion-a": ["investigacion a"],
    "sala-de-investigacion-b": ["investigacion b"],
  };

  /* ---------- Asistente ---------- */

  /**
   * @param {object} entorno
   * @param {Array}  entorno.salas        [{ id, nombre, piso, pisoNombre, tipo }]
   * @param {Function} entorno.mesasDe    (sala) => cantidad de mesas
   * @param {Function} entorno.estadoMesa (idMesa) => "libre" | "reportada" | "mia" | "desconocido"
   * @param {Function} entorno.hastaMesa  (idMesa) => Date | null
   * @param {Function} entorno.cuenta     () => { disponible, usuario, mia }
   * @param {Function} [entorno.ahora]    () => Date
   */
  const crear = (entorno) => {
    const { salas, mesasDe, estadoMesa, hastaMesa, cuenta } = entorno;
    const ahora = entorno.ahora || (() => new Date());
    const pisos = [...new Set(salas.map((s) => s.piso))].sort();
    const conMesas = salas.filter((s) => mesasDe(s) > 0);

    const memoria = { sala: null, ultima: null, horas: 2, pendiente: null, esperandoMesa: null };

    /* ----- Datos de las mesas ----- */

    const idMesa = (sala, n) => `${sala.id}#${n}`;
    const numeros = (sala) => Array.from({ length: mesasDe(sala) }, (_, i) => i + 1);
    const libresDe = (sala) => numeros(sala).filter((n) => estadoMesa(idMesa(sala, n)) === "libre");

    const contar = (grupo) => {
      let total = 0;
      let libres = 0;
      for (const sala of grupo) {
        total += mesasDe(sala);
        libres += libresDe(sala).length;
      }
      return { total, libres, reportadas: total - libres };
    };

    const sinConexion = () => cuenta().disponible !== true;

    const respuestaSinConexion = () => ({
      texto:
        "Ahora mismo no tengo conexión con el servidor de reportes, así que no puedo saber qué mesas están libres ni reportar. " +
        "Cuando el servidor esté encendido («npm start» y MySQL) puedes volver a preguntarme.",
    });

    const finDeReporte = (horas) => {
      const t = ahora();
      const finDia = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59);
      return new Date(Math.min(t.getTime() + horas * 3600 * 1000, finDia.getTime()));
    };

    /* ----- Entidades ----- */

    const claves = salas.map((sala) => {
      const base = normalizar(sala.nombre);
      return { sala, claves: [base, ...(ALIAS[sala.id] || [])].sort((a, b) => b.length - a.length) };
    });

    const detectarSala = (t) => {
      const m = /\bsalas? (?:numero |n |no |#)?(\d{1,2})\b/.exec(t);
      if (m) {
        const encontrada = salas.find((s) => normalizar(s.nombre) === `sala ${Number(m[1])}`);
        if (encontrada) return encontrada;
        return { inexistente: `Sala ${Number(m[1])}` };
      }
      let mejor = null;
      for (const { sala, claves: ks } of claves) {
        for (const k of ks) {
          if (new RegExp(`\\b${k}\\b`).test(t) && (!mejor || k.length > mejor.largo)) mejor = { sala, largo: k.length };
        }
      }
      return mejor ? mejor.sala : null;
    };

    const detectarPiso = (t) => {
      let m = /\b(?:piso|planta) (?:numero |n |no |#)?(\d|uno|dos|tres|primero?|segundo|tercero?)\b/.exec(t);
      if (!m) m = /\b(primero?|segundo|tercero?|primer|tercer) piso\b/.exec(t);
      if (!m) return null;
      const v = m[1];
      const n = /^\d$/.test(v) ? Number(v) : PALABRAS_NUMERO[v];
      return n || null;
    };

    const detectarMesa = (t) => {
      const m =
        /\bmesa (?:numero |n |no |#)?(\d{1,2})\b/.exec(t) ||
        /#(\d{1,2})\b/.exec(t) ||
        /\b(?:la|el|numero) (\d{1,2}) (?:de|en)\b/.exec(t);
      return m ? Number(m[1]) : null;
    };

    const detectarHoras = (t) => {
      const m = /\b(\d{1,2}|un|una|dos|tres|cuatro|cinco|seis) (?:h|hr|hrs|hora|horas)\b/.exec(t);
      if (!m) return null;
      return /^\d+$/.test(m[1]) ? Number(m[1]) : PALABRAS_NUMERO[m[1]] || (m[1] === "cinco" ? 5 : m[1] === "seis" ? 6 : null);
    };

    /* ----- Botones comunes ----- */

    const botonesBase = () => [
      { etiqueta: "Mesas libres", decir: "¿Hay mesas libres?" },
      { etiqueta: "Mi reporte", decir: "¿Cuál es mi reporte?" },
      { etiqueta: "Cómo reporto", decir: "¿Cómo reporto una mesa?" },
      { etiqueta: "Salas con mesas", decir: "¿Qué salas tienen mesas?" },
    ];

    const botonVer = (sala, mesa = null) => ({
      etiqueta: mesa ? `Ver mesa ${mesa} de ${sala.nombre}` : `Ver ${sala.nombre}`,
      accion: { tipo: "abrir", salaId: sala.id, mesaId: mesa ? idMesa(sala, mesa) : null },
    });

    /* ----- Respuestas por tema ----- */

    const ayuda = () => ({
      texto:
        "Puedo ayudarte con las mesas de la biblioteca. Por ejemplo:\n" +
        "• «¿Hay mesas libres en la Sala 8?»\n" +
        "• «Quiero una mesa en el piso 2»\n" +
        "• «Reporta la mesa 3 de la Sala 9 por 3 horas»\n" +
        "• «¿Cuál es mi mesa?» o «quita mi reporte»\n" +
        "• «¿Dónde está la Sala 14?»",
      botones: botonesBase(),
    });

    const saludo = () => ({
      texto: "¡Hola! Soy el asistente de mesas. Pregúntame por las mesas libres, una sala, o dime si quieres reportar.",
      botones: botonesBase(),
    });

    const comoReportar = () => ({
      texto:
        "Reportar una mesa es sencillo:\n" +
        "1. Inicia sesión (o crea tu cuenta con tu código de 7 cifras).\n" +
        "2. Elige una sala con mesas en el plano y luego una mesa verde.\n" +
        "3. Escoge la duración (de 1 a 4 horas) y pulsa «Reportar esta mesa».\n" +
        "También puedes decírmelo aquí: «reporta la mesa 3 de la Sala 8».",
      botones: [
        { etiqueta: "Iniciar sesión", accion: { tipo: "login", modo: "entrar" } },
        { etiqueta: "Crear cuenta", accion: { tipo: "login", modo: "registro" } },
        { etiqueta: "Mesas libres", decir: "¿Hay mesas libres?" },
      ],
    });

    const reglas = (t) => {
      if (/\b(dura|duracion|cuanto tiempo|cuantas horas|hasta que hora|a que hora termina|termina|vence|expira)\b/.test(t)) {
        return {
          texto:
            "Cada reporte dura de 1 a 4 horas (tú eliges), empieza en el momento de reportar y termina sola: " +
            "después la mesa vuelve a quedar libre. Nunca pasa de las 11:59 p. m. del mismo día. " +
            "Puedes quitarla antes si ya no la necesitas.",
        };
      }
      return {
        texto:
          "Solo puedes tener una mesa reportada a la vez. Si quieres otra, primero quita la que tienes o espera a que termine. " +
          "Cada reporte dura de 1 a 4 horas.",
        botones: [{ etiqueta: "Mi reporte", decir: "¿Cuál es mi reporte?" }],
      };
    };

    const colores = () => ({
      texto:
        "En el plano de cada sala: verde = mesa disponible (✓), rojo = reportada por otra persona (✕), " +
        "y rojo con borde y estrella (★) = la mesa que reportaste tú. Las salas sin mesas aparecen atenuadas y no se pueden abrir.",
    });

    const capacidad = () => ({
      texto: "Todas las mesas son iguales: hexagonales, de 6 puestos (6 sillas).",
    });

    const registro = () => ({
      texto:
        "Sí: cada reporte queda guardado en la base de datos con la sala, el número de mesa, la fecha, la hora de inicio y la hora de fin. " +
        "Si quitas un reporte antes de tiempo, la hora de fin pasa a ser la hora en que la quitaste. " +
        "Por ahora no puedo mostrarte tu historial aquí: lo consulta quien administra la base de datos.",
    });

    const cuentaAyuda = (t) => {
      if (/\b(olvid\w*|recuper\w*|restablec\w*|cambiar)\b.*\b(contrasena|clave|password)\b|\b(contrasena|clave)\b.*\b(olvid\w*|perdi\w*)\b/.test(t)) {
        return {
          texto:
            "Por ahora el sistema no tiene recuperación automática de contraseñas (se guardan cifradas y nadie puede verlas). " +
            "Si la olvidaste, avisa a quien administra el sistema.",
        };
      }
      if (/\b(cerrar|salir|terminar) sesion\b|\bdesconect\w*/.test(t)) {
        return cuenta().usuario
          ? { texto: "¿Cierro tu sesión?", botones: [{ etiqueta: "Cerrar sesión", accion: { tipo: "salir" } }] }
          : { texto: "No tienes la sesión iniciada." };
      }
      if (/\b(crear|registr\w*|nueva|abrir) (una )?cuenta\b|\bregistrarme\b|\bregistro\b/.test(t)) {
        return {
          texto:
            "Para crear tu cuenta necesitas un código único de 7 cifras, tu nombre y una contraseña de mínimo 8 caracteres.",
          botones: [{ etiqueta: "Crear cuenta", accion: { tipo: "login", modo: "registro" } }],
        };
      }
      if (/\b(codigo)\b/.test(t)) {
        return { texto: "El código son 7 cifras y es único por persona: no puede haber dos cuentas con el mismo código." };
      }
      const u = cuenta().usuario;
      return u
        ? { texto: `Ya iniciaste sesión como ${u.nombre}.`, botones: [{ etiqueta: "Cerrar sesión", accion: { tipo: "salir" } }] }
        : {
            texto: "Inicia sesión con tu código de 7 cifras y tu contraseña, o crea una cuenta si eres nueva.",
            botones: [
              { etiqueta: "Iniciar sesión", accion: { tipo: "login", modo: "entrar" } },
              { etiqueta: "Crear cuenta", accion: { tipo: "login", modo: "registro" } },
            ],
          };
    };

    const fueraDeTema = () => ({
      texto:
        "De eso no tengo información. Solo puedo ayudarte con las mesas y las salas: ver cuáles están libres, " +
        "encontrar una sala, reportar o quitar tu reporte.",
      botones: botonesBase(),
    });

    const noEntendi = () => ({
      texto: "No te entendí bien. Puedes preguntarme, por ejemplo, «¿hay mesas libres en la Sala 8?» o «reporta la mesa 3 de la Sala 9».",
      botones: botonesBase(),
    });

    /* ----- Disponibilidad ----- */

    const resumenSala = (sala) => {
      const c = contar([sala]);
      return `${sala.nombre}: ${c.libres} de ${plural(c.total, "mesa", "mesas")} libres`;
    };

    const disponibilidad = ({ sala, piso, mesa }) => {
      if (sinConexion()) return respuestaSinConexion();

      if (sala) {
        if (!mesasDe(sala)) return salaSinMesas(sala);
        if (mesa && mesa >= 1 && mesa <= mesasDe(sala)) {
          const id = idMesa(sala, mesa);
          const estado = estadoMesa(id);
          const hasta = hastaMesa(id);
          return {
            texto:
              `La mesa ${mesa} ${de(sala)} está ` +
              (estado === "libre" ? "libre." : estado === "mia" ? "reportada por ti" + (hasta ? ` hasta las ${formatoHora(hasta)}.` : ".") : "reportada" + (hasta ? ` hasta las ${formatoHora(hasta)}.` : ".")),
            botones: [botonVer(sala, mesa), ...(estado === "libre" ? [{ etiqueta: "Reportarla", decir: `Reporta la mesa ${mesa} ${de(sala)}` }] : [])],
          };
        }
        const c = contar([sala]);
        const libres = libresDe(sala);
        const botones = [botonVer(sala), ...libres.slice(0, 4).map((n) => ({ etiqueta: `Reportar mesa ${n}`, decir: `Reporta la mesa ${n} ${de(sala)}` }))];
        return {
          texto:
            `${sala.nombre} (${sala.pisoNombre}): ${plural(c.libres, "mesa libre", "mesas libres")} y ` +
            `${plural(c.reportadas, "reportada", "reportadas")}, de ${c.total} en total.` +
            (libres.length ? `\nLibres: ${lista(libres.map((n) => `mesa ${n}`))}.` : "\nPor ahora no queda ninguna libre."),
          botones,
        };
      }

      if (piso) {
        const delPiso = conMesas.filter((s) => s.piso === piso);
        if (!delPiso.length) return { texto: `El piso ${piso} no tiene salas con mesas.` };
        const c = contar(delPiso);
        const ordenadas = [...delPiso].sort((a, b) => libresDe(b).length - libresDe(a).length);
        return {
          texto:
            `Piso ${piso}: ${plural(c.libres, "mesa libre", "mesas libres")} de ${c.total}.\n` +
            ordenadas.map((s) => `• ${resumenSala(s)}`).join("\n"),
          botones: ordenadas.slice(0, 4).map((s) => botonVer(s)),
        };
      }

      const c = contar(conMesas);
      const porPiso = pisos.map((p) => {
        const cp = contar(conMesas.filter((s) => s.piso === p));
        return `• Piso ${p}: ${cp.libres} libres de ${cp.total}`;
      });
      const mejor = mejorSala(conMesas);
      return {
        texto:
          `En toda la biblioteca hay ${plural(c.libres, "mesa libre", "mesas libres")} de ${c.total} (${c.reportadas} reportadas).\n` +
          porPiso.join("\n") +
          (mejor ? `\nLa sala con más mesas libres ahora es ${mejor.nombre} (${libresDe(mejor).length}).` : ""),
        botones: [...(mejor ? [botonVer(mejor)] : []), ...pisos.map((p) => ({ etiqueta: `Piso ${p}`, decir: `Mesas libres en el piso ${p}` }))],
      };
    };

    const mejorSala = (grupo) => {
      const ordenadas = [...grupo].sort((a, b) => libresDe(b).length - libresDe(a).length || a.piso - b.piso);
      return ordenadas[0] && libresDe(ordenadas[0]).length ? ordenadas[0] : null;
    };

    const salaSinMesas = (sala) => ({
      texto: `${sala.nombre} está en el ${sala.pisoNombre}, pero no tiene mesas para reportar, por eso no se puede abrir su plano.`,
      botones: [{ etiqueta: "Salas con mesas", decir: "¿Qué salas tienen mesas?" }],
    });

    const recomendar = ({ piso, calidad }) => {
      if (sinConexion()) return respuestaSinConexion();
      const grupo = piso ? conMesas.filter((s) => s.piso === piso) : conMesas;
      const mejor = mejorSala(grupo);
      const aviso = calidad
        ? "No tengo datos de ruido, luz ni cercanía a otros lugares: solo sé qué mesas están libres. "
        : "";
      if (!mejor) return { texto: `${aviso}No hay mesas libres${piso ? ` en el piso ${piso}` : ""} en este momento.` };
      const libres = libresDe(mejor);
      return {
        texto:
          `${aviso}La sala con más mesas libres${piso ? ` en el piso ${piso}` : ""} ahora es ${mejor.nombre} ` +
          `(${mejor.pisoNombre}): ${libres.length} de ${mesasDe(mejor)}.`,
        botones: [botonVer(mejor), { etiqueta: "Reportar ahí", decir: `Quiero reportar en ${art(mejor)}` }],
      };
    };

    const listarSalas = ({ piso }) => {
      const grupo = piso ? conMesas.filter((s) => s.piso === piso) : conMesas;
      if (!grupo.length) return { texto: `El piso ${piso} no tiene salas con mesas.` };
      const conectado = !sinConexion();
      const lineas = pisos
        .filter((p) => grupo.some((s) => s.piso === p))
        .map((p) => {
          const delPiso = grupo.filter((s) => s.piso === p);
          return `Piso ${p}: ${delPiso.map((s) => (conectado ? `${s.nombre} (${libresDe(s).length}/${mesasDe(s)})` : s.nombre)).join(", ")}`;
        });
      return {
        texto: `Salas con mesas${conectado ? " (libres/total)" : ""}:\n${lineas.join("\n")}`,
        botones: pisos.map((p) => ({ etiqueta: `Piso ${p}`, decir: `Mesas libres en el piso ${p}` })),
      };
    };

    /* ----- Ubicar / abrir ----- */

    const abrir = ({ sala, piso, mesa }) => {
      if (sala) {
        if (!mesasDe(sala)) return salaSinMesas(sala);
        const nota = mesa && mesa <= mesasDe(sala) ? ` y selecciono la mesa ${mesa}` : "";
        const c = sinConexion() ? null : contar([sala]);
        return {
          texto:
            `Te muestro ${art(sala)} (${sala.pisoNombre})${nota}.` +
            (c ? ` Tiene ${c.libres} de ${plural(c.total, "mesa libre", "mesas libres")}.` : ""),
          ejecutar: { tipo: "abrir", salaId: sala.id, mesaId: mesa && mesa <= mesasDe(sala) ? idMesa(sala, mesa) : null },
        };
      }
      if (piso) {
        if (!pisos.includes(piso)) return { texto: `No existe el piso ${piso}. La biblioteca tiene los pisos ${lista(pisos.map(String))}.` };
        return { texto: `Te muestro el piso ${piso}.`, ejecutar: { tipo: "piso", id: piso } };
      }
      return { texto: "¿Qué sala o piso quieres ver? Por ejemplo: «muéstrame la Sala 8» o «piso 2».", botones: botonesBase() };
    };

    /* ----- Mi reporte ----- */

    const miReporte = () => {
      const c = cuenta();
      if (c.disponible === false) return respuestaSinConexion();
      if (!c.usuario) {
        return {
          texto: "Para ver tu reporte primero inicia sesión.",
          botones: [{ etiqueta: "Iniciar sesión", accion: { tipo: "login", modo: "entrar" } }],
        };
      }
      if (!c.mia) {
        return {
          texto: "No tienes ninguna mesa reportada en este momento.",
          botones: [{ etiqueta: "Reportar una mesa", decir: "Quiero reportar una mesa" }],
        };
      }
      const [salaId, n] = c.mia.split("#");
      const sala = salas.find((s) => s.id === salaId);
      const hasta = hastaMesa(c.mia);
      return {
        texto:
          `Tu mesa es la ${n} de la ${sala ? sala.nombre : salaId}${sala ? ` (${sala.pisoNombre})` : ""}` +
          (hasta ? `, reportada hasta las ${formatoHora(hasta)}.` : "."),
        botones: [
          ...(sala ? [botonVer(sala, Number(n))] : []),
          { etiqueta: "Quitar mi reporte", decir: "Quita mi reporte" },
        ],
      };
    };

    /* ----- Reportar ----- */

    const pedirSesion = (texto) => ({
      texto,
      botones: [
        { etiqueta: "Iniciar sesión", accion: { tipo: "login", modo: "entrar" } },
        { etiqueta: "Crear cuenta", accion: { tipo: "login", modo: "registro" } },
      ],
    });

    const reportar = ({ sala, piso, mesa, horas }) => {
      const c = cuenta();
      if (c.disponible === false || c.disponible === null) return respuestaSinConexion();
      if (!c.usuario) return pedirSesion("Para reportar una mesa necesitas iniciar sesión.");

      if (c.mia) {
        const [salaId, n] = c.mia.split("#");
        const propia = salas.find((s) => s.id === salaId);
        return {
          texto:
            `Ya tienes la mesa ${n} de la ${propia ? propia.nombre : salaId}. Solo puedes tener un reporte a la vez; ` +
            "quítalo si quieres reportar otra.",
          botones: [{ etiqueta: "Quitar mi reporte", decir: "Quita mi reporte" }],
        };
      }

      const h = horas || memoria.horas;
      if (h < 1 || h > 4) {
        return { texto: "Los reportes duran de 1 a 4 horas. ¿Cuántas horas quieres?", botones: [1, 2, 3, 4].map((x) => ({ etiqueta: plural(x, "hora", "horas"), decir: `por ${x} horas` })) };
      }
      memoria.horas = h;

      if (!sala) {
        const grupo = piso ? conMesas.filter((s) => s.piso === piso) : conMesas;
        const mejor = mejorSala(grupo);
        if (!mejor) return { texto: `No hay mesas libres${piso ? ` en el piso ${piso}` : ""} en este momento.` };
        const otras = [...grupo].filter((s) => s !== mejor && libresDe(s).length).sort((a, b) => libresDe(b).length - libresDe(a).length).slice(0, 3);
        memoria.esperandoMesa = null;
        return {
          texto: `¿En qué sala? La que más mesas libres tiene${piso ? ` en el piso ${piso}` : ""} es ${art(mejor)} (${libresDe(mejor).length} libres).`,
          botones: [mejor, ...otras].map((s) => ({ etiqueta: s.nombre, decir: `Quiero reportar en ${art(s)}` })),
        };
      }

      if (!mesasDe(sala)) return salaSinMesas(sala);
      if (!mesa) {
        const libres = libresDe(sala);
        if (!libres.length) {
          const mejor = mejorSala(conMesas.filter((s) => s !== sala));
          return {
            texto: `En ${art(sala)} no queda ninguna mesa libre.` + (mejor ? ` ${art(mejor)} tiene ${libresDe(mejor).length}.` : ""),
            botones: mejor ? [{ etiqueta: mejor.nombre, decir: `Quiero reportar en ${art(mejor)}` }] : [],
          };
        }
        memoria.esperandoMesa = sala;
        return {
          texto: `¿Qué mesa ${de(sala)}? Libres: ${lista(libres.map(String))}.`,
          botones: [botonVer(sala), ...libres.slice(0, 8).map((n) => ({ etiqueta: `Mesa ${n}`, decir: `Reporta la mesa ${n} ${de(sala)}` }))],
        };
      }

      if (mesa > mesasDe(sala) || mesa < 1) {
        return { texto: `${art(sala)} tiene mesas del 1 al ${mesasDe(sala)}. ¿Cuál quieres?`, botones: [botonVer(sala)] };
      }
      const id = idMesa(sala, mesa);
      const estado = estadoMesa(id);
      if (estado !== "libre") {
        const hasta = hastaMesa(id);
        const libres = libresDe(sala);
        return {
          texto:
            `La mesa ${mesa} ${de(sala)} ya está reportada${hasta ? ` hasta las ${formatoHora(hasta)}` : ""}.` +
            (libres.length ? ` Libres: ${lista(libres.map(String))}.` : " No queda ninguna libre en esa sala."),
          botones: libres.slice(0, 6).map((n) => ({ etiqueta: `Mesa ${n}`, decir: `Reporta la mesa ${n} ${de(sala)}` })),
        };
      }

      memoria.pendiente = { tipo: "reportar", mesaId: id, horas: h };
      memoria.esperandoMesa = null;
      return {
        texto:
          `¿Reporto la mesa ${mesa} ${de(sala)} por ${plural(h, "hora", "horas")}? ` +
          `Empezaría ahora y terminaría a las ${formatoHora(finDeReporte(h))}.`,
        botones: [
          { etiqueta: "Sí, reportar", decir: "sí" },
          { etiqueta: "No", decir: "no" },
        ],
      };
    };

    const quitar = () => {
      const c = cuenta();
      if (c.disponible === false || c.disponible === null) return respuestaSinConexion();
      if (!c.usuario) return pedirSesion("Para quitar un reporte primero inicia sesión.");
      if (!c.mia) return { texto: "No tienes ningún reporte para quitar." };
      const [salaId, n] = c.mia.split("#");
      const sala = salas.find((s) => s.id === salaId);
      memoria.pendiente = { tipo: "quitar", mesaId: c.mia };
      return {
        texto: `¿Quito tu reporte de la mesa ${n} de la ${sala ? sala.nombre : salaId}?`,
        botones: [
          { etiqueta: "Sí, quitarla", decir: "sí" },
          { etiqueta: "No", decir: "no" },
        ],
      };
    };

    /* ----- Confirmaciones ----- */

    const confirmar = (pendiente) => {
      if (pendiente.tipo === "reportar") {
        // El estado pudo cambiar mientras tanto (otra persona se adelantó).
        if (estadoMesa(pendiente.mesaId) !== "libre") {
          const [salaId, n] = pendiente.mesaId.split("#");
          return { texto: `Alguien acaba de reportar la mesa ${n} de esa sala. ¿Quieres elegir otra?`, botones: [{ etiqueta: "Ver mesas libres", decir: `Mesas libres en la sala ${salaId.replace("sala-", "")}` }] };
        }
        return { texto: "Reportando…", ejecutar: { tipo: "reportar", mesaId: pendiente.mesaId, horas: pendiente.horas } };
      }
      return { texto: "Quitando tu reporte…", ejecutar: { tipo: "quitar", mesaId: pendiente.mesaId } };
    };

    /* ----- Interpretación ----- */

    // Se entiende «reservar» igual que «reportar» (las reglas de abajo usan una sola raíz).
    const equivalencias = (t) =>
      t.replace(/\breservas\b/g, "reportes").replace(/\breserva\b/g, "reporte").replace(/\breserv(?=\w)/g, "report");

    const interpretar = (entrada) => {
      const t = equivalencias(normalizar(entrada));
      const pendiente = memoria.pendiente;
      memoria.pendiente = null;

      if (!t) return { texto: "Escribe tu pregunta, por ejemplo «¿hay mesas libres?».", botones: botonesBase() };

      // 1. Respuesta a una confirmación pendiente.
      if (pendiente) {
        if (/^(si|sii+|sip|claro|confirmo|confirmar|dale|ok|okay|listo|por favor|de una|adelante|hazlo|hagale|correcto|exacto|vale|si reporte|si quitala|si quitar)( .*)?$/.test(t)) {
          return confirmar(pendiente);
        }
        if (/^(no|nop|nel|cancelar|cancela|mejor no|nada|olvidalo|dejalo)( .*)?$/.test(t)) {
          return { texto: "Listo, no hice ningún cambio.", botones: botonesBase() };
        }
      }

      const entidades = {
        sala: detectarSala(t),
        piso: detectarPiso(t),
        mesa: detectarMesa(t),
        horas: detectarHoras(t),
      };
      if (entidades.sala && entidades.sala.inexistente) {
        const nombre = entidades.sala.inexistente;
        return { texto: `No existe la ${nombre}. Las salas con mesas son: ${lista(conMesas.map((s) => s.nombre))}.`, botones: botonesBase() };
      }

      const salaPrevia = memoria.sala;
      if (entidades.sala && mesasDe(entidades.sala) > 0) memoria.sala = entidades.sala;

      // 2. Número suelto como respuesta a «¿qué mesa?».
      const suelto = /^(?:la |el |mesa |numero |n |no )?(?:mesa )?(\d{1,2})$/.exec(t);
      if (suelto && memoria.esperandoMesa) {
        return recordar("reportar", reportar({ sala: memoria.esperandoMesa, mesa: Number(suelto[1]), horas: null }));
      }

      const hay = (re) => re.test(t);

      // 3. Cortesía y ayuda.
      if (hay(/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|holi|saludos|que tal)\b/) && t.split(" ").length <= 4) return saludo();
      if (hay(/\b(gracias|muchas gracias|te agradezco|genial|perfecto|excelente)\b/) && t.split(" ").length <= 6) return { texto: "¡Con gusto! Si necesitas algo más sobre las mesas, aquí estoy." };
      if (hay(/^(adios|chao|chau|hasta luego|nos vemos|bye)\b/)) return { texto: "¡Hasta luego! Que tengas un buen día de estudio." };
      if (hay(/\b(ayuda|ayudame|que puedes hacer|que sabes|como te uso|opciones|menu|que haces|para que sirves|comandos)\b/) && !hay(/\b(cuenta|sesion|contrasena|clave)\b/)) return ayuda();

      // 4. Preguntas de funcionamiento.
      if (hay(/\bcomo\b.*\b(report\w*|apart\w*|separ\w*|uso|funciona|hago)\b/) || hay(/\b(pasos|instrucciones|tutorial)\b.*\b(report\w*|mesa)\b/)) return comoReportar();
      if (hay(/\bcomo\b.*\b(cancel\w*|quit\w*|liber\w*|anul\w*|elimin\w*|borr\w*)\b/)) {
        return {
          texto: "Para quitar tu reporte: abre tu mesa (roja con estrella) y pulsa «Quitar mi reporte», o dime «quita mi reporte».",
          botones: [{ etiqueta: "Mi reporte", decir: "¿Cuál es mi reporte?" }],
        };
      }
      if (hay(/\b(puedo|pueden|permite|permiten|se puede|limite|maximo|maxima|cuantas)\b.*\b(report\w*|apart\w*|mesas)\b.*\b(a la vez|al mismo tiempo|por persona|dos|varias|mas de una|otra|simultane\w*|puedo)\b/) || hay(/\b(una sola|solo una|mas de una|varias mesas|dos mesas|otra mesa)\b/) || hay(/\b(cuanto dura|duracion|cuanto tiempo|cuantas horas|hasta que hora|a que hora termina|cuando termina|cuando vence|cuando expira|tiempo maximo)\b/)) return reglas(t);
      if (hay(/\b(color|colores|verde|rojo|roja|estrella|significa|leyenda|atenuad\w*|gris)\b/)) return colores();
      if (hay(/\b(cuantas personas|cuantos puestos|puestos|sillas|capacidad|tamano|cuanta gente|caben)\b/)) return capacidad();
      if (hay(/\b(historial|registro|queda guardad\w*|se guarda\w*|base de datos|quedan registrad\w*|reportes (anteriores|pasadas|antiguas))\b/)) return registro();
      if (hay(/\b(horario|horarios|abren|abre|cierra|cierran|atencion|imprim\w*|fotocop\w*|wifi|internet|libros?|prestamos?|multas?|biblioteca abierta|telefono|correo|direccion|bano|banos)\b/) && !entidades.sala) return fueraDeTema();

      // 5. Cuenta.
      if (hay(/\b(contrasena|clave|password|sesion|cuenta|registr\w*|codigo|iniciar|login|loguear\w*|entrar)\b/) && !hay(/\b(report\w*|mesa)\b/) ) return cuentaAyuda(t);

      // 6. Quitar / mi reporte.
      if (
        hay(/\b(quit\w*|cancel\w*|liber\w*|anul\w*|elimin\w*|borr\w*|deshac\w*)\b.*\b(reporte|mesa|apartad\w*)\b/) ||
        hay(/\b(reporte|mesa)\b.*\b(quit\w*|cancel\w*|liber\w*|anul\w*|elimin\w*|borr\w*)\b/) ||
        hay(/\bya no (quiero|necesito)\b/)
      ) return recordar("quitar", quitar());

      if (hay(/\b(mi|mis)\b.*\b(mesa|reporte|reportes|apartad\w*)\b/) || hay(/\b(tengo|tengo alguna|hice)\b.*\b(reporte|mesa)\b/) || hay(/\bcual es mi\b/)) {
        if (!hay(/\b(quiero|necesito|dame|damela|deseo|quisiera|reportame|apartame|haz|hacer)\b/)) return recordar("mi", miReporte());
      }

      // 7. Reportar.
      if (hay(/\b(report\w*|apart\w*|agend\w*|separ\w*|consegu\w*)\b/) || hay(/\b(quiero|necesito|busco|dame|damela|deseo|quisiera|me gustaria|ocupar|usar)\b.*\bmesa\b/)) {
        return recordar("reportar", reportar({ sala: entidades.sala || (salaPrevia && hay(/\b(esa|esta|ahi|alli|misma)\b/) ? salaPrevia : null), piso: entidades.piso, mesa: entidades.mesa, horas: entidades.horas }));
      }

      // 8. Calidad de la mesa (no hay datos) y recomendaciones.
      if (hay(/\b(silenci\w*|tranquil\w*|ruido\w*|ilumin\w*|luz|ventanas?|enchufes?|cerca de|lejos de|comod\w*)\b/)) return recordar("recomendar", recomendar({ piso: entidades.piso, calidad: true }));
      if (hay(/\b(recomiend\w*|recomienda|sugier\w*|mejor sala|mejor mesa|mejor lugar|mejor sitio|cual sala|que sala|mas libres|mas espacio|menos gente|menos llena|vacia|desocupada)\b/)) return recordar("recomendar", recomendar({ piso: entidades.piso }));

      // 9. Disponibilidad.
      if (
        hay(/\b(libre|libres|disponible|disponibles|desocupad\w*|quedan|queda|ocupad\w*|reportadas|cupo|cupos|espacio)\b/) ||
        hay(/\bhay\b.*\b(mesa|mesas|sala|salas|sitio|lugar|puesto)\b/) ||
        hay(/\bmesas?\b.*\bhay\b/) ||
        hay(/\bcuantas\b.*\bmesas?\b/) ||
        hay(/\bocupacion\b/)
      ) return recordar("disponibilidad", disponibilidad(entidades));

      // 11. Ubicar / abrir.
      if (hay(/\b(ver|ve|mostr\w*|muestr\w*|abr\w*|llev\w*|ir|ubic\w*|donde|encuentr\w*|plano|ensen\w*|localiz\w*|queda|en que piso|que piso)\b/) && (entidades.sala || entidades.piso)) {
        return recordar("abrir", abrir(entidades));
      }

      // 10. Listar salas.
      if (hay(/\b(que|cuales|cuantas|todas las|lista de|listado de)\b.*\bsalas?\b/) || hay(/\bsalas?\b.*\b(tienen|hay|con mesas|existen)\b/) || hay(/^(salas|lista)$/)) return recordar("listar", listarSalas(entidades));

      // 12. Solo se nombró una sala o un piso: se repite lo último que se hacía.
      if (entidades.sala || entidades.piso || entidades.mesa) {
        const ult = memoria.ultima;
        if (ult === "reportar") return recordar("reportar", reportar({ ...entidades, sala: entidades.sala || salaPrevia }));
        if (ult === "disponibilidad") return recordar("disponibilidad", disponibilidad(entidades));
        if (ult === "recomendar") return recordar("recomendar", recomendar(entidades));
        if (ult === "listar") return recordar("listar", listarSalas(entidades));
        if (entidades.sala) return recordar("abrir", abrir(entidades));
        return recordar("disponibilidad", disponibilidad(entidades));
      }

      if (hay(/\b(mesa|mesas)\b/)) return recordar("disponibilidad", disponibilidad({}));
      return noEntendi();
    };

    // Guarda la última intención (para entender «¿y en el piso 2?») y la última sala.
    const recordar = (intencion, respuesta) => {
      memoria.ultima = intencion;
      return respuesta;
    };

    // «a. m.» / «p. m.» ya llevan punto: evita el doble punto al final de una frase.
    const responder = (entrada) => {
      const r = interpretar(entrada);
      return { ...r, texto: r.texto.replace(/([ap]\. m\.)\./g, "$1") };
    };

    return { responder, saludo, ayuda };
  };

  return { crear, normalizar, formatoHora };
});

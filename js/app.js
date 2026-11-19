(() => {
  "use strict";

  /* ---------- Utilidades ---------- */

  const normalizar = (texto) =>
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  const crear = (etiqueta, props = {}, ...hijos) => {
    const nodo = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(props)) {
      if (valor === undefined || valor === null || valor === false) continue;
      if (clave === "class") nodo.className = valor;
      else if (clave === "text") nodo.textContent = valor;
      else if (clave === "estilo") nodo.style.cssText = valor;
      else if (clave.startsWith("on")) nodo.addEventListener(clave.slice(2), valor);
      else nodo.setAttribute(clave, valor === true ? "" : valor);
    }
    for (const hijo of hijos) {
      if (hijo) nodo.append(hijo);
    }
    return nodo;
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const crearSvg = (etiqueta, props = {}, ...hijos) => {
    const nodo = document.createElementNS(SVG_NS, etiqueta);
    for (const [clave, valor] of Object.entries(props)) {
      if (valor === undefined || valor === null || valor === false) continue;
      if (clave === "text") nodo.textContent = valor;
      else if (clave.startsWith("on")) nodo.addEventListener(clave.slice(2), valor);
      else nodo.setAttribute(clave, valor);
    }
    for (const hijo of hijos) {
      if (hijo) nodo.append(hijo);
    }
    return nodo;
  };

  const colorDe = (tipo) => (CATEGORIAS[tipo] || CATEGORIAS.sala).color;
  const etiquetaDe = (tipo) => (CATEGORIAS[tipo] || CATEGORIAS.sala).etiqueta;

  /* ---------- Datos ---------- */

  const salas = PISOS.flatMap((piso) =>
    piso.salas.map((sala) => ({
      ...sala,
      id: normalizar(sala.nombre).replace(/[^a-z0-9]+/g, "-"),
      piso: piso.id,
      pisoNombre: piso.nombre,
      busqueda: normalizar(
        [sala.nombre, piso.nombre, etiquetaDe(sala.tipo), sala.descripcion || ""].join(" ")
      ),
    }))
  );

  const buscarSala = (id) => salas.find((s) => s.id === id) || null;

  // Solo se pueden seleccionar las salas que tienen mesas.
  const mesasDe = (sala) => (MESAS[sala.id] ? MESAS[sala.id].centros.length : 0);
  const seleccionable = (sala) => mesasDe(sala) > 0;

  // Mesas de una lista de salas: total, disponibles y reservadas (null sin servidor).
  const contarMesas = (lista) => {
    let total = 0;
    let libres = 0;
    let reservadas = 0;
    for (const sala of lista) {
      const n = mesasDe(sala);
      total += n;
      for (let i = 1; i <= n; i++) {
        const situacion = Cuenta.estadoMesa(`${sala.id}#${i}`);
        if (situacion === "libre") libres++;
        else if (situacion === "reservada" || situacion === "mia") reservadas++;
      }
    }
    const conectado = Cuenta.estado.disponible === true;
    return { total, libres: conectado ? libres : null, reservadas: conectado ? reservadas : null };
  };

  /* ---------- Estado ---------- */

  const estado = {
    piso: PISOS[0].id,
    seleccion: null,
    mesaSel: null,
    mesaMensaje: "",
    mesaOcupada: false,
    consulta: "",
    resultados: [],
    indiceActivo: 0,
  };

  /* ---------- Referencias al DOM ---------- */

  const $ = (id) => document.getElementById(id);
  const ui = {
    busqueda: $("busqueda"),
    resultados: $("resultados"),
    pestanas: $("pestanas"),
    estado: $("estado"),
    plano: $("plano"),
    lienzo: $("lienzo"),
    nota: $("nota"),
    salaPanel: $("sala-panel"),
    salaPunto: $("sala-punto"),
    salaTitulo: $("sala-titulo"),
    salaMeta: $("sala-meta"),
    salaPlano: $("sala-plano"),
    salaLienzo: document.querySelector(".sala-lienzo"),
    salaCerrar: $("sala-cerrar"),
    mesaBloque: $("mesa-bloque"),
    mesaAccion: $("mesa-accion"),
    cuenta: $("cuenta"),
    leyenda: $("leyenda"),
    detalle: $("detalle"),
  };

  const pisoActual = () => PISOS.find((p) => p.id === estado.piso);

  /* ---------- Búsqueda ---------- */

  const calcularResultados = () => {
    const q = normalizar(estado.consulta);
    if (!q) return [];
    const palabras = q.split(/\s+/);
    return salas
      .filter((s) => seleccionable(s) && palabras.every((p) => s.busqueda.includes(p)))
      .sort((a, b) => {
        const aInicio = normalizar(a.nombre).startsWith(q) ? 0 : 1;
        const bInicio = normalizar(b.nombre).startsWith(q) ? 0 : 1;
        return aInicio - bInicio || a.piso - b.piso;
      });
  };

  const coincideConConsulta = (sala) =>
    !estado.consulta || estado.resultados.some((r) => r.id === sala.id);

  /* ---------- Renderizado ---------- */

  const textoMesas = (lista) => {
    const n = contarMesas(lista).total;
    return `${n} ${n === 1 ? "mesa" : "mesas"}`;
  };

  const renderPestanas = () => {
    const botones = PISOS.map((piso) => {
      const activo = piso.id === estado.piso;
      return crear(
        "button",
        {
          class: "pestana",
          type: "button",
          role: "tab",
          "aria-selected": String(activo),
          tabindex: activo ? "0" : "-1",
          onclick: () => cambiarPiso(piso.id),
        },
        crear("span", { text: piso.nombre }),
        crear("small", { text: textoMesas(salas.filter((s) => s.piso === piso.id)) })
      );
    });
    ui.pestanas.replaceChildren(...botones);
  };

  const renderLeyenda = () => {
    const items = Object.values(CATEGORIAS).map((cat) =>
      crear(
        "li",
        {},
        crear("span", { class: "punto", estilo: `--color:${cat.color}` }),
        crear("span", { text: cat.etiqueta })
      )
    );
    items.push(
      crear(
        "li",
        {},
        crear("span", { class: "punto sin-mesas-punto" }),
        crear("span", { text: "Sin mesas (no se puede seleccionar)" })
      )
    );
    ui.leyenda.replaceChildren(...items);
  };

  const renderPlano = () => {
    const piso = pisoActual();
    const geo = PLANOS[piso.id];
    const svg = ui.plano;
    svg.setAttribute("viewBox", `${VISTA.x} ${VISTA.y} ${VISTA.ancho} ${VISTA.alto}`);
    svg.setAttribute("aria-label", `Plano del ${piso.nombre} de la biblioteca`);

    const capas = [];

    // Contorno del piso inferior (referencia de cómo se apilan los pisos).
    const inferior = PLANOS[piso.id - 1];
    if (inferior) {
      capas.push(crearSvg("path", { d: inferior.silueta, class: "fantasma" }));
    }

    capas.push(
      crearSvg("path", { d: geo.exterior, class: "exterior", "fill-rule": "evenodd" }),
      crearSvg("path", { d: geo.piso, class: "piso", "fill-rule": "evenodd" })
    );

    const etiquetas = [];
    for (const datos of piso.salas) {
      const sala = buscarSala(normalizar(datos.nombre).replace(/[^a-z0-9]+/g, "-"));
      const activo = estado.seleccion === sala.id;
      const coincide = Boolean(estado.consulta) && coincideConConsulta(sala);
      const atenuado = Boolean(estado.consulta) && !coincide;

      const habilitada = seleccionable(sala);
      const estados = [];
      if (activo) estados.push("activa");
      if (coincide) estados.push("coincide");
      if (atenuado) estados.push("atenuada");
      if (!habilitada) estados.push("sin-mesas");
      const estilo = `--color:${colorDe(sala.tipo)}`;

      const propsSala = habilitada
        ? {
            class: ["sala", ...estados].join(" "),
            style: estilo,
            role: "button",
            tabindex: "0",
            "aria-label": `${sala.nombre}, ${sala.pisoNombre}, ${textoMesas([sala])}`,
            "aria-pressed": String(activo),
            onclick: () => seleccionar(sala.id),
            onkeydown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                seleccionar(sala.id);
              }
            },
          }
        : {
            class: ["sala", ...estados].join(" "),
            style: estilo,
            "aria-label": `${sala.nombre}, ${sala.pisoNombre}, sin mesas`,
          };

      capas.push(
        crearSvg(
          "g",
          propsSala,
          crearSvg("title", {
            text: `${sala.nombre} · ${habilitada ? textoMesas([sala]) : "sin mesas, no se puede seleccionar"}`,
          }),
          crearSvg("path", { d: datos.d, class: "forma" })
        )
      );

      const fuente = datos.fuente || FUENTE_BASE;
      const lineas = datos.lineas || [datos.nombre];
      const alto = fuente * 1.2;
      const y0 = datos.c[1] - ((lineas.length - 1) * alto) / 2;
      etiquetas.push(
        crearSvg(
          "text",
          {
            x: datos.c[0],
            y: y0,
            class: ["etiqueta", ...estados].join(" "),
            style: estilo,
            "font-size": fuente,
          },
          ...lineas.map((linea, i) =>
            crearSvg("tspan", { x: datos.c[0], dy: i === 0 ? 0 : alto, text: linea })
          )
        )
      );
    }

    // Los muros van sobre las zonas; no capturan clics.
    capas.push(crearSvg("path", { d: geo.muros, class: "muros", "fill-rule": "evenodd" }), ...etiquetas);

    svg.replaceChildren(...capas);
    ui.nota.textContent = inferior
      ? `La línea punteada es el contorno del Piso ${piso.id - 1}, a la misma escala y posición.`
      : "";
  };

  /* ---------- Mesas hexagonales (plano de la sala) ---------- */

  const MESAS_MIN = 4;
  const MESAS_MAX = 12;
  // Todas las mesas de la biblioteca miden lo mismo (radio en unidades del plano).
  // Debe coincidir con RADIO de tools/generar_mesas.py, que además comprueba que
  // ninguna mesa se sobreponga con otra.
  const RADIO_MESA = 10;
  // Escala fija del plano de la sala (px por unidad): así las mesas se ven del
  // mismo tamaño en todas las salas, y las salas pequeñas se ven más pequeñas.
  const ESCALA_PLANO_SALA = 3.6;

  const ETIQUETA_ESTADO = {
    libre: "disponible",
    reservada: "reservada",
    mia: "reservada por ti",
    desconocido: "sin información de reservas",
  };
  const INSIGNIA = { libre: "✓", reservada: "✕", mia: "★" };

  // Mesa hexagonal con 6 sillas, vista desde arriba. Unidad = radio total (1).
  // Color: verde = disponible, rojo = reservada (además lleva un símbolo).
  const dibujarMesa = ({ cx, cy, radio, numero, id, situacion, seleccionada }) => {
    const g = crearSvg("g", {
      class: `mesa ${situacion}${seleccionada ? " sel" : ""}`,
      transform: `translate(${cx} ${cy}) scale(${radio})`,
      role: "button",
      tabindex: "0",
      "data-mesa": id,
      "aria-pressed": String(seleccionada),
      "aria-label": `Mesa ${numero}, ${ETIQUETA_ESTADO[situacion]}`,
      onclick: () => elegirMesa(id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          elegirMesa(id);
        }
      },
    });
    g.append(
      crearSvg("title", { text: `Mesa ${numero} · ${ETIQUETA_ESTADO[situacion]}` }),
      crearSvg("circle", { class: "mesa-zona", r: 1.02 }),
      crearSvg("circle", { class: "mesa-anillo", r: 1.06 })
    );
    for (let i = 0; i < 6; i++) {
      g.append(
        crearSvg(
          "g",
          { transform: `rotate(${i * 60}) translate(0.8 0)` },
          crearSvg("rect", { class: "silla", x: -0.17, y: -0.17, width: 0.34, height: 0.34, rx: 0.06 }),
          crearSvg("rect", { class: "silla-lomo", x: 0.11, y: -0.2, width: 0.08, height: 0.4, rx: 0.03 })
        )
      );
    }
    const puntos = Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return `${(0.52 * Math.cos(a)).toFixed(3)},${(0.52 * Math.sin(a)).toFixed(3)}`;
    }).join(" ");
    g.append(
      crearSvg("polygon", { class: "mesa-tablero", points: puntos }),
      crearSvg("text", { class: "mesa-num", x: 0, y: 0.02, "font-size": 0.5, text: String(numero) })
    );
    if (INSIGNIA[situacion]) {
      g.append(
        crearSvg(
          "g",
          { class: "mesa-insignia", transform: "translate(0.4 -0.4)" },
          crearSvg("circle", { r: 0.24 }),
          crearSvg("text", { x: 0, y: 0.01, "font-size": 0.3, text: INSIGNIA[situacion] })
        )
      );
    }
    return g;
  };

  // Calcula dónde caben las mesas: rasteriza la zona, el piso y los muros en
  // un canvas y busca la cuadrícula con más mesas que quepan sin tocar muros.
  const calcularMesas = (sala, geo, caja) => {
    const x0 = Math.floor(caja.x) - 2;
    const y0 = Math.floor(caja.y) - 2;
    const w = Math.ceil(caja.width) + 4;
    const h = Math.ceil(caja.height) + 4;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.translate(-x0, -y0);

    const rasterizar = (pintar) => {
      ctx.clearRect(x0, y0, w, h);
      ctx.fillStyle = "#000";
      ctx.strokeStyle = "#000";
      pintar();
      return ctx.getImageData(0, 0, w, h).data;
    };
    const zona = rasterizar(() => ctx.fill(new Path2D(sala.d)));
    const piso = rasterizar(() => ctx.fill(new Path2D(geo.piso), "evenodd"));
    const muros = rasterizar(() => {
      const trazo = new Path2D(geo.muros);
      ctx.lineWidth = 3;
      ctx.fill(trazo, "evenodd");
      ctx.stroke(trazo);
    });

    const dentro = (mapa, x, y) => {
      const ix = Math.round(x - x0);
      const iy = Math.round(y - y0);
      return ix >= 0 && iy >= 0 && ix < w && iy < h && mapa[(iy * w + ix) * 4 + 3] > 127;
    };
    const libreEstricto = (x, y) => dentro(zona, x, y) && dentro(piso, x, y) && !dentro(muros, x, y);
    const libreZona = (x, y) => dentro(zona, x, y);

    const cabe = (libre, cx, cy, r) => {
      if (!libre(cx, cy)) return false;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        if (!libre(cx + Math.cos(a) * r, cy + Math.sin(a) * r)) return false;
        if (i % 2 === 0 && !libre(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5)) return false;
      }
      return true;
    };

    const mejorCuadricula = (libre, r, paso) => {
      let mejor = [];
      const saltos = 6;
      for (let i = 0; i < saltos; i++) {
        for (let j = 0; j < saltos; j++) {
          const lista = [];
          for (let cy = caja.y + (paso * j) / saltos; cy <= caja.y + caja.height; cy += paso) {
            for (let cx = caja.x + (paso * i) / saltos; cx <= caja.x + caja.width; cx += paso) {
              if (cabe(libre, cx, cy, r)) lista.push([cx, cy]);
            }
          }
          if (lista.length > mejor.length) mejor = lista;
        }
      }
      return mejor;
    };

    // Primero evitando muros; si no caben 4, solo se exige estar dentro de la zona.
    // Con el tamaño fijo, se separa la cuadrícula lo necesario para no pasar de
    // MESAS_MAX: en salas grandes las mesas quedan repartidas, no amontonadas.
    const r = RADIO_MESA;
    const pasoMin = 2 * r + Math.max(3, r * 0.25);
    for (const libre of [libreEstricto, libreZona]) {
      let ultima = mejorCuadricula(libre, r, pasoMin);
      if (ultima.length < MESAS_MIN) continue;
      for (let paso = pasoMin; ultima.length > MESAS_MAX; paso += 1) {
        const lista = mejorCuadricula(libre, r, paso);
        if (lista.length < MESAS_MIN) break;
        ultima = lista;
      }
      return { radio: r, centros: ultima.slice(0, MESAS_MAX) };
    }
    return { radio: r, centros: [] };
  };

  // Utilidad para tools/generar_mesas.py (calcula la distribución de mesas de una sala).
  window.BibliotecaHerramientas = {
    salasConMesas: () => salas.filter((s) => s.mesas).map((s) => s.nombre),
    calcularMesasDeSala: (nombre) => {
      const sala = salas.find((s) => s.nombre === nombre);
      const svg = crearSvg("svg", { width: 10, height: 10 });
      const ruta = crearSvg("path", { d: sala.d });
      svg.append(ruta);
      document.body.append(svg);
      const caja = ruta.getBBox();
      svg.remove();
      return { id: sala.id, ...calcularMesas(sala, PLANOS[sala.piso], caja) };
    },
  };


  /* Plano individual de la sala seleccionada: solo se ve su interior. */
  const renderSala = () => {
    const sala = estado.seleccion ? buscarSala(estado.seleccion) : null;
    ui.salaPanel.hidden = !sala;
    if (!sala) {
      ui.salaPlano.replaceChildren();
      return;
    }

    const geo = PLANOS[sala.piso];
    const color = colorDe(sala.tipo);
    ui.salaPanel.style.setProperty("--color", color);
    ui.salaPunto.style.setProperty("--color", color);
    ui.salaTitulo.textContent = sala.nombre;
    ui.salaMeta.textContent = [sala.pisoNombre, etiquetaDe(sala.tipo), sala.descripcion]
      .filter(Boolean)
      .join(" · ");
    ui.salaPlano.setAttribute("aria-label", `Plano de ${sala.nombre}, ${sala.pisoNombre}`);

    // Se mide la zona de la sala para encuadrarla (el panel ya está visible).
    const medida = crearSvg("path", { d: sala.d });
    ui.salaPlano.replaceChildren(medida);
    const caja = medida.getBBox();
    const margen = Math.max(14, Math.max(caja.width, caja.height) * 0.08);
    const anchoVista = caja.width + margen * 2;
    ui.salaPlano.setAttribute(
      "viewBox",
      `${caja.x - margen} ${caja.y - margen} ${anchoVista} ${caja.height + margen * 2}`
    );
    // Escala común a todas las salas; solo se reduce si la sala es más ancha que el
    // espacio disponible (así nunca hay que desplazarse para ver toda la sala).
    const disponible = ui.salaLienzo.clientWidth - 34;
    const escala = Math.max(1.8, Math.min(ESCALA_PLANO_SALA, disponible / anchoVista));
    ui.salaPlano.style.width = `${Math.round(anchoVista * escala)}px`;

    // La máscara engrosa un poco la zona para no cortar los muros del borde.
    const mascara = crearSvg(
      "mask",
      { id: "mascara-sala", maskUnits: "userSpaceOnUse", x: -100, y: -100, width: 2000, height: 1000 },
      crearSvg("path", { d: sala.d, fill: "#fff", stroke: "#fff", "stroke-width": 7, "stroke-linejoin": "round" })
    );

    const mesas = MESAS[sala.id] || { radio: 0, centros: [] };
    const tablas = mesas.centros.map(([x, y], i) => {
      const id = `${sala.id}#${i + 1}`;
      return dibujarMesa({
        cx: x,
        cy: y,
        radio: mesas.radio,
        numero: i + 1,
        id,
        situacion: Cuenta.estadoMesa(id),
        seleccionada: estado.mesaSel === id,
      });
    });

    const contenido = crearSvg(
      "g",
      { mask: "url(#mascara-sala)" },
      crearSvg("path", { d: geo.piso, class: "piso", "fill-rule": "evenodd" }),
      crearSvg("path", { d: sala.d, class: "sala-tinte" }),
      crearSvg("path", { d: geo.muros, class: "muros", "fill-rule": "evenodd" }),
      ...tablas
    );

    if (mesas.centros.length) {
      const c = contarMesas([sala]);
      ui.salaMeta.textContent +=
        c.libres === null
          ? ` · ${c.total} mesas de 6 puestos`
          : ` · ${c.libres} disponibles · ${c.reservadas} reservadas · ${c.total} mesas de 6 puestos`;
    }

    ui.salaPlano.replaceChildren(crearSvg("defs", {}, mascara), contenido);
    renderMesaAccion(sala, mesas);
  };

  /* Panel de reserva de la mesa elegida. */
  const renderMesaAccion = (sala, mesas) => {
    ui.mesaBloque.hidden = !mesas.centros.length;
    if (!mesas.centros.length) {
      ui.mesaAccion.replaceChildren();
      return;
    }

    const c = Cuenta.estado;
    const partes = [];

    if (c.disponible === false) {
      partes.push(
        crear("p", {
          class: "mesa-estado",
          text: "Las reservas necesitan el servidor y la base de datos de la biblioteca. Inícialos con «npm start» (con MySQL encendido) y abre la dirección que muestra.",
        })
      );
    } else if (!estado.mesaSel) {
      partes.push(crear("p", { class: "mesa-estado", text: "Elige una mesa del plano para reservarla." }));
    } else {
      const id = estado.mesaSel;
      const numero = Number(id.split("#")[1]);
      const situacion = Cuenta.estadoMesa(id);
      const textoSituacion = { libre: "Disponible", reservada: "Reservada", mia: "Reservada por ti" }[situacion];
      partes.push(
        crear("p", { class: "mesa-estado" }, crear("strong", { text: `Mesa ${numero}` }), ` · ${textoSituacion}`)
      );

      const acciones = crear("div", { class: "acciones" });
      if (situacion === "libre" && !c.usuario) {
        acciones.append(
          crear("button", {
            class: "boton primario",
            type: "button",
            text: "Inicia sesión para reservar",
            onclick: () => Cuenta.abrirDialogo("entrar"),
          })
        );
      } else if (situacion === "libre") {
        acciones.append(
          crear("button", {
            class: "boton primario",
            type: "button",
            text: "Reservar esta mesa",
            onclick: (e) => accionMesa(e.currentTarget, () => Cuenta.reservar(id), `Mesa ${numero} reservada.`),
          })
        );
      } else if (situacion === "mia") {
        acciones.append(
          crear("button", {
            class: "boton peligro",
            type: "button",
            text: "Quitar reserva",
            onclick: (e) => accionMesa(e.currentTarget, () => Cuenta.liberar(id), `Reserva de la mesa ${numero} quitada.`),
          })
        );
      } else {
        partes.push(crear("p", { class: "mesa-nota", text: "Otra persona ya apartó esta mesa." }));
      }
      if (acciones.childNodes.length) partes.push(acciones);
    }

    if (estado.mesaMensaje) {
      partes.push(crear("p", { class: estado.mesaOcupada ? "mesa-nota" : "mesa-error", role: "status", text: estado.mesaMensaje }));
    }
    if (estado.mesaIrA) {
      partes.push(
        crear("button", {
          class: "boton",
          type: "button",
          text: "Ver mi mesa reservada",
          onclick: () => irAMiMesa(),
        })
      );
    }
    ui.mesaAccion.replaceChildren(...partes);
  };

  const elegirMesa = (id) => {
    estado.mesaSel = id;
    estado.mesaMensaje = "";
    estado.mesaIrA = null;
    estado.mesaOcupada = false;
    renderSala();
    enfocarMesa();
  };

  const enfocarMesa = () => {
    if (!estado.mesaSel) return;
    const el = ui.salaPlano.querySelector(`[data-mesa="${CSS.escape(estado.mesaSel)}"]`);
    if (el) el.focus({ preventScroll: true });
  };

  const accionMesa = async (boton, hacer, exito) => {
    boton.disabled = true;
    estado.mesaMensaje = "";
    estado.mesaIrA = null;
    try {
      await hacer();
      estado.mesaMensaje = exito;
      estado.mesaOcupada = true; // aviso informativo, no es un error
    } catch (e) {
      estado.mesaMensaje = e.estado === undefined ? "No se pudo conectar con el servidor." : e.message;
      estado.mesaOcupada = false;
      estado.mesaIrA = e.datos && e.datos.actual ? e.datos.actual : null;
    }
    renderSala();
    enfocarMesa();
  };

  const irAMiMesa = () => {
    const mia = Cuenta.estado.mia;
    if (!mia) return;
    const [salaId] = mia.split("#");
    seleccionar(salaId, mia);
  };

  /* Estado de la sesión en la cabecera. */
  const renderCuenta = () => {
    const c = Cuenta.estado;
    const nodos = [];
    if (c.disponible === false) {
      nodos.push(crear("span", { class: "cuenta-aviso", text: "Reservas no disponibles (servidor o base de datos sin conexión)" }));
    } else if (c.disponible === true && !c.usuario) {
      nodos.push(
        crear("button", {
          class: "boton-cuenta",
          type: "button",
          text: "Iniciar sesión",
          onclick: () => Cuenta.abrirDialogo("entrar"),
        })
      );
    } else if (c.usuario) {
      nodos.push(crear("span", { class: "cuenta-nombre", text: `Hola, ${c.usuario.nombre}` }));
      if (c.mia) {
        const [salaId, numero] = c.mia.split("#");
        const sala = buscarSala(salaId);
        nodos.push(
          crear("button", {
            class: "boton-cuenta destacado",
            type: "button",
            text: `Mi mesa: ${sala ? sala.nombre : salaId} · Mesa ${numero}`,
            onclick: irAMiMesa,
          })
        );
      }
      nodos.push(
        crear("button", { class: "boton-cuenta", type: "button", text: "Cerrar sesión", onclick: () => Cuenta.salir() })
      );
    }
    ui.cuenta.replaceChildren(...nodos);
  };

  // Tarjetas «Disponibles / Reservadas» de un conjunto de salas.
  const bloqueConteo = (c) => {
    if (c.libres === null) {
      return crear(
        "p",
        { class: "conteo-aviso" },
        `${c.total} ${c.total === 1 ? "mesa" : "mesas"}. Sin conexión con el servidor: no se sabe cuántas están disponibles.`
      );
    }
    return crear(
      "div",
      { class: "conteo" },
      crear("div", { class: "conteo-libre" }, crear("strong", { text: String(c.libres) }), crear("span", { text: c.libres === 1 ? "Disponible" : "Disponibles" })),
      crear("div", { class: "conteo-reservada" }, crear("strong", { text: String(c.reservadas) }), crear("span", { text: c.reservadas === 1 ? "Reservada" : "Reservadas" }))
    );
  };

  const renderDetalle = () => {
    const sala = estado.seleccion ? buscarSala(estado.seleccion) : null;

    if (!sala) {
      const filas = PISOS.map((piso) => {
        const c = contarMesas(salas.filter((s) => s.piso === piso.id));
        return crear(
          "li",
          {},
          crear("span", { text: piso.nombre }),
          crear("small", {
            text: c.libres === null ? `${c.total} mesas` : `${c.libres} disponibles · ${c.reservadas} reservadas`,
          })
        );
      });
      ui.detalle.replaceChildren(
        crear(
          "div",
          { class: "detalle-vacio" },
          crear("strong", { text: "Selecciona una sala en el plano" }),
          crear("span", {
            text: "Solo se pueden elegir las salas con mesas; las demás aparecen atenuadas. Mesas de toda la biblioteca:",
          })
        ),
        bloqueConteo(contarMesas(salas)),
        crear("ul", { class: "conteo-pisos" }, ...filas)
      );
      return;
    }

    ui.detalle.replaceChildren(
      crear(
        "div",
        { class: "insignias" },
        crear("span", { class: "insignia" }, crear("span", { class: "punto", estilo: `--color:${colorDe(sala.tipo)}` }), etiquetaDe(sala.tipo)),
        crear("span", { class: "insignia", text: sala.pisoNombre })
      ),
      crear("h2", { text: sala.nombre }),
      crear("p", { text: sala.descripcion || `${textoMesas([sala])} de 6 puestos.` }),
      bloqueConteo(contarMesas([sala])),
      crear(
        "div",
        { class: "acciones" },
        crear("button", {
          class: "boton",
          type: "button",
          text: "Ver plano de la sala",
          onclick: () => ui.salaPanel.scrollIntoView({ behavior: "smooth", block: "start" }),
        }),
        crear("button", {
          class: "boton",
          type: "button",
          text: "Quitar selección",
          onclick: () => seleccionar(null),
        })
      )
    );
  };

  const renderEstado = () => {
    if (!estado.consulta) {
      ui.estado.textContent = "";
      return;
    }
    const n = estado.resultados.length;
    ui.estado.textContent = `${n} ${n === 1 ? "resultado" : "resultados"} para “${estado.consulta}”`;
  };

  const renderResultados = (abierto) => {
    const mostrar = abierto && estado.consulta.trim() !== "";
    ui.resultados.hidden = !mostrar;
    ui.busqueda.setAttribute("aria-expanded", String(mostrar));
    if (!mostrar) {
      ui.busqueda.removeAttribute("aria-activedescendant");
      return;
    }

    if (!estado.resultados.length) {
      ui.resultados.replaceChildren(
        crear("li", { class: "resultado-vacio", role: "presentation", text: "No se encontraron salas con mesas." })
      );
      return;
    }

    ui.resultados.replaceChildren(
      ...estado.resultados.map((sala, i) =>
        crear(
          "li",
          {
            class: "resultado",
            id: `resultado-${i}`,
            role: "option",
            "aria-selected": String(i === estado.indiceActivo),
            onmousedown: (e) => {
              e.preventDefault();
              elegirResultado(sala);
            },
          },
          crear("span", { class: "punto", estilo: `--color:${colorDe(sala.tipo)}` }),
          crear("span", { class: "resultado-nombre", text: sala.nombre }),
          crear("span", { class: "resultado-meta", text: `${sala.pisoNombre} · ${etiquetaDe(sala.tipo)}` })
        )
      )
    );
    ui.busqueda.setAttribute("aria-activedescendant", `resultado-${estado.indiceActivo}`);
  };

  const renderTodo = () => {
    renderPestanas();
    renderPlano();
    renderDetalle();
    renderSala();
    renderEstado();
  };

  /* ---------- Acciones ---------- */

  const cambiarPiso = (id) => {
    estado.piso = id;
    renderTodo();
  };

  const seleccionar = (id, mesaId = null) => {
    if (id && !(buscarSala(id) && seleccionable(buscarSala(id)))) return;
    if (id !== estado.seleccion || mesaId) {
      estado.mesaSel = mesaId;
      estado.mesaMensaje = "";
      estado.mesaIrA = null;
    }
    estado.seleccion = id;
    if (id) {
      const sala = buscarSala(id);
      estado.piso = sala.piso;
      history.replaceState(null, "", `#${id}`);
    } else {
      history.replaceState(null, "", location.pathname + location.search);
    }
    renderTodo();
    if (id && !ui.salaPanel.hidden) {
      const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      ui.salaPanel.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
    }
  };

  const elegirResultado = (sala) => {
    renderResultados(false);
    seleccionar(sala.id);
  };

  /* ---------- Eventos ---------- */

  ui.busqueda.addEventListener("input", () => {
    estado.consulta = ui.busqueda.value;
    estado.resultados = calcularResultados();
    estado.indiceActivo = 0;

    // Si hay coincidencias solo en otros pisos, saltar al primero que coincida.
    const hayEnPisoActual = estado.resultados.some((s) => s.piso === estado.piso);
    if (estado.resultados.length && !hayEnPisoActual) {
      estado.piso = estado.resultados[0].piso;
    }

    renderTodo();
    renderResultados(true);
  });

  ui.salaCerrar.addEventListener("click", () => seleccionar(null));

  ui.busqueda.addEventListener("focus", () => renderResultados(true));
  ui.busqueda.addEventListener("blur", () => renderResultados(false));

  ui.busqueda.addEventListener("keydown", (e) => {
    const n = estado.resultados.length;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      estado.indiceActivo = (estado.indiceActivo + 1) % n;
      renderResultados(true);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      estado.indiceActivo = (estado.indiceActivo - 1 + n) % n;
      renderResultados(true);
    } else if (e.key === "Enter" && n) {
      e.preventDefault();
      elegirResultado(estado.resultados[estado.indiceActivo]);
    } else if (e.key === "Escape") {
      if (ui.busqueda.value) {
        ui.busqueda.value = "";
        estado.consulta = "";
        estado.resultados = [];
        renderTodo();
      }
      renderResultados(false);
      ui.busqueda.blur();
    }
  });

  document.addEventListener("keydown", (e) => {
    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !escribiendo) {
      e.preventDefault();
      ui.busqueda.focus();
    }
  });

  ui.pestanas.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = PISOS.findIndex((p) => p.id === estado.piso);
    const paso = e.key === "ArrowRight" ? 1 : -1;
    const siguiente = PISOS[(i + paso + PISOS.length) % PISOS.length];
    cambiarPiso(siguiente.id);
    ui.pestanas.querySelector('[aria-selected="true"]').focus();
  });

  let temporizador = 0;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (estado.seleccion) renderSala();
    }, 150);
  });

  /* ---------- Inicio ---------- */

  renderLeyenda();
  const inicial = buscarSala(decodeURIComponent(location.hash.slice(1)));
  if (inicial && seleccionable(inicial)) {
    estado.seleccion = inicial.id;
    estado.piso = inicial.piso;
  }
  renderTodo();
  renderCuenta();

  // Enlaces directos a una sala (#sala-8) también al cambiar el hash sin recargar.
  window.addEventListener("hashchange", () => {
    const sala = buscarSala(decodeURIComponent(location.hash.slice(1)));
    if (sala && seleccionable(sala) && sala.id !== estado.seleccion) seleccionar(sala.id);
  });

  // Cuando cambia la sesión o las reservas (propias o de otras personas) se redibuja.
  Cuenta.suscribir(() => {
    renderCuenta();
    renderDetalle();
    const tenia = ui.salaPlano.contains(document.activeElement);
    renderSala();
    if (tenia) enfocarMesa();
  });
  Cuenta.iniciar();
})();

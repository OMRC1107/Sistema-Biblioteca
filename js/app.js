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

  /* ---------- Estado ---------- */

  const estado = {
    piso: PISOS[0].id,
    seleccion: null,
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
    pines: $("pines"),
    leyenda: $("leyenda"),
    detalle: $("detalle"),
    listaTitulo: $("lista-titulo"),
    lista: $("lista"),
  };

  const pisoActual = () => PISOS.find((p) => p.id === estado.piso);

  /* ---------- Búsqueda ---------- */

  const calcularResultados = () => {
    const q = normalizar(estado.consulta);
    if (!q) return [];
    const palabras = q.split(/\s+/);
    return salas
      .filter((s) => palabras.every((p) => s.busqueda.includes(p)))
      .sort((a, b) => {
        const aInicio = normalizar(a.nombre).startsWith(q) ? 0 : 1;
        const bInicio = normalizar(b.nombre).startsWith(q) ? 0 : 1;
        return aInicio - bInicio || a.piso - b.piso;
      });
  };

  const coincideConConsulta = (sala) =>
    !estado.consulta || estado.resultados.some((r) => r.id === sala.id);

  /* ---------- Renderizado ---------- */

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
        crear("small", { text: `${piso.salas.length} ${piso.salas.length === 1 ? "sala" : "salas"}` })
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
    ui.leyenda.replaceChildren(...items);
  };

  const renderPlano = () => {
    const piso = pisoActual();
    if (ui.plano.getAttribute("src") !== piso.imagen) {
      ui.plano.src = piso.imagen;
    }
    ui.plano.alt = `Plano del ${piso.nombre} de la biblioteca`;
    ui.plano.width = piso.ancho;
    ui.plano.height = piso.alto;

    const pines = piso.salas.map((datos) => {
      const sala = buscarSala(normalizar(datos.nombre).replace(/[^a-z0-9]+/g, "-"));
      const activo = estado.seleccion === sala.id;
      const coincide = estado.consulta && coincideConConsulta(sala);
      const atenuado = estado.consulta && !coincide;

      const clases = ["pin"];
      if (activo) clases.push("activo");
      if (coincide) clases.push("coincide");
      if (atenuado) clases.push("atenuado");
      if (sala.y < 25) clases.push("abajo");
      if (sala.x < 12) clases.push("izq");
      if (sala.x > 88) clases.push("der");

      return crear(
        "button",
        {
          class: clases.join(" "),
          type: "button",
          estilo: `left:${sala.x}%;top:${sala.y}%;--color:${colorDe(sala.tipo)}`,
          "aria-label": `${sala.nombre}, ${sala.pisoNombre}`,
          "aria-pressed": String(activo),
          onclick: () => seleccionar(sala.id),
        },
        crear("span", { class: "pin-etiqueta", text: sala.nombre })
      );
    });
    ui.pines.replaceChildren(...pines);
  };

  const renderLista = () => {
    const piso = pisoActual();
    const delPiso = salas.filter((s) => s.piso === piso.id);
    const visibles = estado.consulta ? delPiso.filter(coincideConConsulta) : delPiso;

    ui.listaTitulo.textContent = estado.consulta
      ? `Coincidencias en el ${piso.nombre}`
      : `Salas del ${piso.nombre}`;

    if (!visibles.length) {
      ui.lista.replaceChildren(
        crear("li", {
          class: "lista-vacia",
          text: "Ninguna coincidencia en este piso. Revisa los otros pisos.",
        })
      );
      return;
    }

    ui.lista.replaceChildren(
      ...visibles.map((sala) =>
        crear(
          "li",
          {},
          crear(
            "button",
            {
              class: "lista-item",
              type: "button",
              estilo: `--color:${colorDe(sala.tipo)}`,
              "aria-current": String(estado.seleccion === sala.id),
              onclick: () => seleccionar(sala.id),
            },
            crear("span", { class: "punto", estilo: `--color:${colorDe(sala.tipo)}` }),
            crear("span", { text: sala.nombre }),
            crear("small", { text: etiquetaDe(sala.tipo) })
          )
        )
      )
    );
  };

  const renderDetalle = () => {
    const sala = estado.seleccion ? buscarSala(estado.seleccion) : null;

    if (!sala) {
      ui.detalle.replaceChildren(
        crear(
          "div",
          { class: "detalle-vacio" },
          crear("strong", { text: "Ninguna sala seleccionada" }),
          crear("span", {
            text: "Elige un marcador en el plano, una sala de la lista o usa el buscador.",
          })
        )
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
      crear("p", { text: sala.descripcion || "Sin descripción registrada." }),
      crear(
        "div",
        { class: "acciones" },
        crear("button", {
          class: "boton",
          type: "button",
          text: "Ver en el plano",
          onclick: () => $("lienzo").scrollIntoView({ behavior: "smooth", block: "center" }),
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
        crear("li", { class: "resultado-vacio", role: "presentation", text: "No se encontraron salas." })
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
    renderLista();
    renderDetalle();
    renderEstado();
  };

  /* ---------- Acciones ---------- */

  const cambiarPiso = (id) => {
    estado.piso = id;
    renderTodo();
  };

  const seleccionar = (id) => {
    estado.seleccion = id;
    if (id) {
      const sala = buscarSala(id);
      estado.piso = sala.piso;
      history.replaceState(null, "", `#${id}`);
    } else {
      history.replaceState(null, "", location.pathname + location.search);
    }
    renderTodo();
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

  /* ---------- Inicio ---------- */

  renderLeyenda();
  const inicial = buscarSala(decodeURIComponent(location.hash.slice(1)));
  if (inicial) {
    estado.seleccion = inicial.id;
    estado.piso = inicial.piso;
  }
  renderTodo();
})();

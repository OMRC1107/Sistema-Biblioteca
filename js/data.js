/*
 * Datos de los pisos y salas, con la geometría de los planos.
 *
 * Cada piso se dibuja como SVG dentro de un viewBox de `ancho` x `alto`.
 *   base:  silueta general del piso (zonas de circulación).
 *   decor: elementos decorativos (escaleras, columnas).
 *   salas: zonas clicables. `d` es el trazado SVG de la sala y `c` el
 *          centro donde se escribe su nombre. `lineas` parte el nombre en
 *          varias líneas y `fuente` ajusta el tamaño del texto.
 */

const CATEGORIAS = {
  sala: { etiqueta: "Sala", color: "#8c2f39" },
  servicio: { etiqueta: "Servicio", color: "#b7791f" },
  investigacion: { etiqueta: "Investigación", color: "#2f6f73" },
  tecnologia: { etiqueta: "Tecnología", color: "#3b5ba5" },
  administrativo: { etiqueta: "Administrativo", color: "#6b5b95" },
  eventos: { etiqueta: "Eventos", color: "#a14a7f" },
  lúdico: { etiqueta: "Lúdico y cultural", color: "#4c8a3c" },
};

// Rectángulo como trazado SVG.
const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
// Centro de un rectángulo.
const C = (x, y, w, h) => [x + w / 2, y + h / 2];

// Fila de columnas pequeñas (muro del ingreso).
const columnas = (xs, y) => xs.map((x) => ({ tipo: "columna", d: R(x - 4, y, 8, 16) }));

const PISOS = [
  /* ===================== PISO 1 ===================== */
  {
    id: 1,
    nombre: "Piso 1",
    ancho: 1209,
    alto: 323,
    anchoMax: 1180,
    fuente: 14,
    base: "M10 125 H670 V50 H985 V318 H10 Z",
    decor: [
      ...columnas([381, 412, 445, 510, 543, 575, 607, 640], 117),
      { tipo: "escalera", d: R(775, 185, 70, 100), etiqueta: "Escaleras", c: C(775, 185, 70, 100) },
    ],
    salas: [
      {
        nombre: "Sala 8",
        tipo: "sala",
        d: "M190 125 H70 Q10 135 10 195 V260 H190 Z",
        c: [100, 195],
      },
      { nombre: "Sala 7", tipo: "sala", d: R(190, 200, 85, 95), c: C(190, 200, 85, 95) },
      {
        nombre: "Sala de investigación A",
        tipo: "investigacion",
        d: R(275, 200, 90, 100),
        c: C(275, 200, 90, 100),
        lineas: ["Sala de", "investigación", "A"],
        fuente: 12,
        descripcion: "Espacio para trabajo de investigación.",
      },
      {
        nombre: "Sala de investigación B",
        tipo: "investigacion",
        d: R(365, 200, 90, 100),
        c: C(365, 200, 90, 100),
        lineas: ["Sala de", "investigación", "B"],
        fuente: 12,
        descripcion: "Espacio para trabajo de investigación.",
      },
      { nombre: "Sala 6", tipo: "sala", d: R(455, 240, 55, 75), c: C(455, 240, 55, 75) },
      { nombre: "Sala 5", tipo: "sala", d: R(510, 215, 55, 100), c: C(510, 215, 55, 100) },
      { nombre: "Sala 4", tipo: "sala", d: R(565, 215, 55, 100), c: C(565, 215, 55, 100) },
      { nombre: "Sala 3", tipo: "sala", d: R(620, 215, 55, 100), c: C(620, 215, 55, 100) },
      {
        nombre: "Ingreso",
        tipo: "servicio",
        d: R(190, 125, 480, 75),
        c: [430, 168],
        descripcion: "Acceso principal a la biblioteca.",
      },
      {
        nombre: "Devoluciones",
        tipo: "servicio",
        d: "M415 125 V75 Q415 50 440 50 H520 Q545 50 545 75 V125 Z",
        c: [480, 98],
        descripcion: "Punto de devolución de material bibliográfico.",
      },
      {
        nombre: "Cafetería",
        tipo: "servicio",
        d: R(680, 190, 90, 125),
        c: C(680, 190, 90, 125),
        descripcion: "Zona de cafetería.",
      },
      { nombre: "Sala 2", tipo: "sala", d: R(670, 55, 100, 125), c: C(670, 55, 100, 125) },
      {
        nombre: "Sala TIC",
        tipo: "tecnologia",
        d: R(775, 105, 70, 75),
        c: C(775, 105, 70, 75),
        descripcion: "Sala de tecnologías de la información y la comunicación.",
      },
      { nombre: "Sala 1", tipo: "sala", d: R(850, 55, 135, 225), c: C(850, 55, 135, 225) },
      {
        nombre: "Auditorio",
        tipo: "eventos",
        d: "M990 95 H1195 V285 Q1092 322 990 285 Z",
        c: [1092, 190],
        descripcion: "Espacio para eventos, charlas y conferencias.",
      },
    ],
  },

  /* ===================== PISO 2 ===================== */
  {
    id: 2,
    nombre: "Piso 2",
    ancho: 1279,
    alto: 381,
    anchoMax: 1180,
    fuente: 14,
    base: "M45 170 H210 V150 H695 V100 H1245 V335 H45 Z",
    decor: [
      ...columnas([420, 455, 490, 525, 560, 595, 630, 665], 142),
      { tipo: "escalera", d: R(790, 170, 55, 70), etiqueta: "Escaleras", c: C(790, 170, 55, 70) },
    ],
    salas: [
      {
        nombre: "Sala Tribal",
        tipo: "lúdico",
        d: "M210 170 H100 Q45 185 45 235 V300 H210 Z",
        c: [128, 237],
      },
      {
        nombre: "Sala de cómputo",
        tipo: "tecnologia",
        d: R(210, 180, 140, 145),
        c: C(210, 180, 140, 145),
        lineas: ["Sala de", "cómputo"],
        descripcion: "Sala con equipos de cómputo.",
      },
      {
        nombre: "Ludoteca",
        tipo: "lúdico",
        d: R(365, 225, 105, 95),
        c: C(365, 225, 105, 95),
        descripcion: "Espacio lúdico.",
      },
      {
        nombre: "Procesos técnicos",
        tipo: "administrativo",
        d: R(470, 240, 110, 80),
        c: C(470, 240, 110, 80),
        lineas: ["Procesos", "técnicos"],
        descripcion: "Área de procesamiento técnico del material bibliográfico.",
      },
      { nombre: "Sala 13", tipo: "sala", d: R(580, 265, 65, 60), c: C(580, 265, 65, 60) },
      {
        nombre: "Jefatura",
        tipo: "administrativo",
        d: R(645, 290, 60, 45),
        c: C(645, 290, 60, 45),
        fuente: 12,
        descripcion: "Oficina de jefatura.",
      },
      {
        nombre: "Secretaría",
        tipo: "administrativo",
        d: R(705, 245, 90, 90),
        c: C(705, 245, 90, 90),
        descripcion: "Oficina de secretaría.",
      },
      { nombre: "Sala 12", tipo: "sala", d: R(695, 100, 90, 125), c: C(695, 100, 90, 125) },
      { nombre: "Sala 11", tipo: "sala", d: R(850, 100, 90, 220), c: C(850, 100, 90, 220) },
      {
        nombre: "Sala de semilleros A",
        tipo: "investigacion",
        d: R(940, 225, 110, 50),
        c: C(940, 225, 110, 50),
        lineas: ["Sala de", "semilleros A"],
        fuente: 12,
        descripcion: "Espacio para semilleros de investigación.",
      },
      {
        nombre: "Sala de semilleros B",
        tipo: "investigacion",
        d: R(940, 275, 110, 45),
        c: C(940, 275, 110, 45),
        lineas: ["Sala de", "semilleros B"],
        fuente: 12,
        descripcion: "Espacio para semilleros de investigación.",
      },
      { nombre: "Sala 10", tipo: "sala", d: R(1050, 235, 95, 95), c: C(1050, 235, 95, 95) },
      {
        nombre: "Sala 9",
        tipo: "sala",
        d: "M940 120 H1240 V310 H1190 V235 H1050 V225 H940 Z",
        c: [1090, 172],
      },
    ],
  },

  /* ===================== PISO 3 ===================== */
  {
    id: 3,
    nombre: "Piso 3",
    ancho: 374,
    alto: 294,
    anchoMax: 560,
    fuente: 11,
    base: "M30 140 H130 V110 H275 V75 H370 V245 H345 V270 H30 Z",
    decor: [],
    salas: [
      {
        nombre: "Sala 14",
        tipo: "sala",
        d: "M50 150 H130 V122 H285 V90 H355 V225 H335 V255 H265 V230 H220 V255 H50 Z",
        c: [215, 175],
      },
    ],
  },
];

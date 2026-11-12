/*
 * Datos de pisos y salas.
 *
 * La geometría del edificio (muros, piso, exterior) está en js/planos.js,
 * generado desde las imágenes de referencia con tools/generar_planos.py.
 * Aquí se definen las zonas clicables de cada sala, medidas sobre ese mismo
 * sistema de coordenadas (píxeles de la imagen original), por eso los tres
 * pisos quedan alineados entre sí.
 *
 *   d:       trazado SVG de la zona de la sala.
 *   c:       punto donde se escribe el nombre en el plano.
 *   lineas:  (opcional) parte el nombre en varias líneas dentro del plano.
 *   fuente:  (opcional) tamaño del texto en el plano.
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

const FUENTE_BASE = 13;

// Rectángulo como trazado SVG.
const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;

const PISOS = [
  /* ===================== PISO 1 ===================== */
  {
    id: 1,
    nombre: "Piso 1",
    salas: [
      {
        nombre: "Sala 8",
        tipo: "sala",
        d: "M43 200C43 180 60 167 82 167H203V290H43Z",
        c: [125, 232],
      },
      { nombre: "Sala 7", tipo: "sala", d: R(225, 212, 107, 110), c: [279, 268] },
      {
        nombre: "Sala de investigación A",
        tipo: "investigacion",
        d: R(370, 248, 38, 75),
        c: [389, 285],
        lineas: ["Inv.", "A"],
        fuente: 11,
        descripcion: "Espacio para trabajo de investigación.",
      },
      {
        nombre: "Sala de investigación B",
        tipo: "investigacion",
        d: R(411, 248, 37, 75),
        c: [430, 285],
        lineas: ["Inv.", "B"],
        fuente: 11,
        descripcion: "Espacio para trabajo de investigación.",
      },
      { nombre: "Sala 6", tipo: "sala", d: R(457, 292, 58, 58), c: [486, 323] },
      { nombre: "Sala 5", tipo: "sala", d: R(524, 272, 54, 78), c: [551, 312] },
      { nombre: "Sala 4", tipo: "sala", d: R(580, 250, 60, 100), c: [610, 312] },
      { nombre: "Sala 3", tipo: "sala", d: R(642, 250, 58, 100), c: [671, 312] },
      {
        nombre: "Ingreso",
        tipo: "servicio",
        d: "M225 177H690V250H448V248H335V212H225Z",
        c: [509, 197],
        descripcion: "Acceso principal a la biblioteca.",
      },
      {
        nombre: "Devoluciones",
        tipo: "servicio",
        d: R(450, 92, 122, 55),
        c: [511, 122],
        descripcion: "Punto de devolución de material bibliográfico.",
      },
      {
        nombre: "Cafetería",
        tipo: "servicio",
        d: R(704, 245, 88, 110),
        c: [748, 278],
        descripcion: "Zona de cafetería.",
      },
      { nombre: "Sala 2", tipo: "sala", d: R(692, 96, 88, 119), c: [737, 150] },
      {
        nombre: "Sala TIC",
        tipo: "tecnologia",
        d: R(838, 93, 93, 83),
        c: [885, 135],
        descripcion: "Sala de tecnologías de la información y la comunicación.",
      },
      {
        nombre: "Sala 1",
        tipo: "sala",
        d: "M838 177H931V112H1018V232H963V316H838Z",
        c: [895, 240],
      },
      {
        nombre: "Auditorio",
        tipo: "eventos",
        d: "M1018 140H1216V300H1186Q1117 335 1048 300H1018Z",
        c: [1117, 215],
        descripcion: "Espacio para eventos, charlas y conferencias.",
      },
    ],
  },

  /* ===================== PISO 2 ===================== */
  {
    id: 2,
    nombre: "Piso 2",
    salas: [
      {
        nombre: "Sala Tribal",
        tipo: "lúdico",
        d: "M45 200C45 180 62 166 82 166H205V292H45Z",
        c: [125, 235],
      },
      {
        nombre: "Sala de cómputo",
        tipo: "tecnologia",
        d: R(228, 173, 110, 148),
        c: [283, 250],
        lineas: ["Sala de", "cómputo"],
        descripcion: "Sala con equipos de cómputo.",
      },
      {
        nombre: "Ludoteca",
        tipo: "lúdico",
        d: R(365, 249, 92, 63),
        c: [411, 282],
        descripcion: "Espacio lúdico.",
      },
      {
        nombre: "Procesos técnicos",
        tipo: "administrativo",
        d: R(473, 270, 102, 42),
        c: [524, 291],
        lineas: ["Procesos", "técnicos"],
        fuente: 11,
        descripcion: "Área de procesamiento técnico del material bibliográfico.",
      },
      { nombre: "Sala 13", tipo: "sala", d: R(578, 283, 62, 47), c: [609, 307] },
      {
        nombre: "Jefatura",
        tipo: "administrativo",
        d: R(642, 246, 62, 74),
        c: [673, 290],
        fuente: 11,
        descripcion: "Oficina de jefatura.",
      },
      {
        nombre: "Secretaría",
        tipo: "administrativo",
        d: R(706, 246, 88, 74),
        c: [750, 290],
        descripcion: "Oficina de secretaría.",
      },
      { nombre: "Sala 12", tipo: "sala", d: R(694, 96, 90, 119), c: [738, 155] },
      { nombre: "Sala 11", tipo: "sala", d: R(846, 96, 88, 222), c: [890, 200] },
      {
        nombre: "Sala de semilleros A",
        tipo: "investigacion",
        d: R(938, 236, 82, 42),
        c: [979, 257],
        lineas: ["Semilleros", "A"],
        fuente: 11,
        descripcion: "Espacio para semilleros de investigación.",
      },
      {
        nombre: "Sala de semilleros B",
        tipo: "investigacion",
        d: R(938, 280, 82, 38),
        c: [979, 299],
        lineas: ["Semilleros", "B"],
        fuente: 11,
        descripcion: "Espacio para semilleros de investigación.",
      },
      {
        nombre: "Sala 10",
        tipo: "sala",
        d: "M1026 222H1145V274H1111V300H1026Z",
        c: [1075, 258],
      },
      {
        nombre: "Sala 9",
        tipo: "sala",
        d: "M1022 135H1217V228H1240V303H1146V222H1022Z",
        c: [1128, 172],
      },
    ],
  },

  /* ===================== PISO 3 ===================== */
  {
    id: 3,
    nombre: "Piso 3",
    salas: [
      {
        nombre: "Sala 14",
        tipo: "sala",
        d: "M935 199H1020V172H1169V137H1243V235H1224V308H1146V276H1104V305H935Z",
        c: [1085, 240],
      },
    ],
  },
];

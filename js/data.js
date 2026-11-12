/*
 * Datos de los pisos y salas.
 *
 * x, y: posición del marcador sobre el plano, en porcentaje (0-100)
 *       respecto al ancho y alto de la imagen.
 * tipo: categoría (define el color del marcador). Debe existir en CATEGORIAS.
 * descripcion: texto opcional que se muestra en el panel de detalle.
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

const PISOS = [
  {
    id: 1,
    nombre: "Piso 1",
    imagen: "img/piso1.png",
    ancho: 1209,
    alto: 323,
    salas: [
      { nombre: "Sala 1", tipo: "sala", x: 70.6, y: 56.7 },
      { nombre: "Sala 2", tipo: "sala", x: 57.9, y: 32.8 },
      { nombre: "Sala 3", tipo: "sala", x: 52.8, y: 82.7 },
      { nombre: "Sala 4", tipo: "sala", x: 47.4, y: 82.0 },
      { nombre: "Sala 5", tipo: "sala", x: 42.7, y: 78.6 },
      { nombre: "Sala 6", tipo: "sala", x: 36.6, y: 84.8 },
      { nombre: "Sala 7", tipo: "sala", x: 21.2, y: 70.0 },
      { nombre: "Sala 8", tipo: "sala", x: 6.6, y: 57.9 },
      {
        nombre: "Sala TIC",
        tipo: "tecnologia",
        x: 67.4,
        y: 42.7,
        descripcion: "Sala de tecnologías de la información y la comunicación.",
      },
      {
        nombre: "Sala de investigación A",
        tipo: "investigacion",
        x: 31.4,
        y: 57.0,
        descripcion: "Espacio para trabajo de investigación.",
      },
      {
        nombre: "Sala de investigación B",
        tipo: "investigacion",
        x: 31.4,
        y: 62.5,
        descripcion: "Espacio para trabajo de investigación.",
      },
      {
        nombre: "Ingreso",
        tipo: "servicio",
        x: 39.2,
        y: 44.9,
        descripcion: "Acceso principal a la biblioteca.",
      },
      {
        nombre: "Devoluciones",
        tipo: "servicio",
        x: 37.3,
        y: 31.9,
        descripcion: "Punto de devolución de material bibliográfico.",
      },
      {
        nombre: "Cafetería",
        tipo: "servicio",
        x: 57.9,
        y: 58.8,
        descripcion: "Zona de cafetería.",
      },
      {
        nombre: "Auditorio",
        tipo: "eventos",
        x: 89.4,
        y: 71.2,
        descripcion: "Espacio para eventos, charlas y conferencias.",
      },
    ],
  },
  {
    id: 2,
    nombre: "Piso 2",
    imagen: "img/piso2.png",
    ancho: 1279,
    alto: 381,
    salas: [
      { nombre: "Sala 9", tipo: "sala", x: 88.3, y: 43.0 },
      { nombre: "Sala 10", tipo: "sala", x: 83.5, y: 69.8 },
      { nombre: "Sala 11", tipo: "sala", x: 70.1, y: 48.0 },
      { nombre: "Sala 12", tipo: "sala", x: 58.1, y: 41.5 },
      { nombre: "Sala 13", tipo: "sala", x: 48.0, y: 73.8 },
      {
        nombre: "Sala Tribal",
        tipo: "lúdico",
        x: 9.2,
        y: 60.4,
      },
      {
        nombre: "Sala de cómputo",
        tipo: "tecnologia",
        x: 21.8,
        y: 60.4,
        descripcion: "Sala con equipos de cómputo.",
      },
      {
        nombre: "Ludoteca",
        tipo: "lúdico",
        x: 33.2,
        y: 61.2,
        descripcion: "Espacio lúdico.",
      },
      {
        nombre: "Procesos técnicos",
        tipo: "administrativo",
        x: 46.0,
        y: 67.2,
        descripcion: "Área de procesamiento técnico del material bibliográfico.",
      },
      {
        nombre: "Jefatura",
        tipo: "administrativo",
        x: 52.5,
        y: 78.7,
        descripcion: "Oficina de jefatura.",
      },
      {
        nombre: "Secretaría",
        tipo: "administrativo",
        x: 57.7,
        y: 62.5,
        descripcion: "Oficina de secretaría.",
      },
      {
        nombre: "Sala de semilleros A",
        tipo: "investigacion",
        x: 73.7,
        y: 62.2,
        descripcion: "Espacio para semilleros de investigación.",
      },
      {
        nombre: "Sala de semilleros B",
        tipo: "investigacion",
        x: 73.7,
        y: 75.3,
        descripcion: "Espacio para semilleros de investigación.",
      },
    ],
  },
  {
    id: 3,
    nombre: "Piso 3",
    imagen: "img/piso3.png",
    ancho: 374,
    alto: 294,
    salas: [{ nombre: "Sala 14", tipo: "sala", x: 72.7, y: 63.6 }],
  },
];

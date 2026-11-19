#!/usr/bin/env python3
"""
Genera js/mesas.js a partir de las marcas de tools/marcas_mesas.json.

Cada marca es un cuadrado rojo dibujado sobre las imágenes de referencia: su
posición es la de una mesa y el número de marcas de una sala es su número de
mesas. Cada marca se asigna a la sala (con `mesas: true` en js/data.js) cuya
zona la contiene; las que caen fuera de esas salas (pasillos, ingreso,
semilleros, etc.) se descartan. Una marca a pocos píxeles del borde de una sala
se asigna a esa sala.

Identificador estable de cada mesa: "sala-8#2" = mesa 2 de la Sala 8, siendo la
N-ésima en orden de lectura (de arriba abajo y de izquierda a derecha).

Uso:  python3 tools/generar_mesas.py
Requiere: playwright (Chromium). Las reservas de mesas que ya no existan se
descartan al iniciar el servidor.
"""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
MARCAS = RAIZ / "tools" / "marcas_mesas.json"
SALIDA = RAIZ / "js" / "mesas.js"
RADIO = 10  # mismo tamaño para todas las mesas (unidades del plano); igual a RADIO_MESA en js/app.js
MARGEN = 3  # px mínimos libres entre dos mesas (con sillas, una mesa mide 2.12 × RADIO)
TOLERANCIA = 20  # px: distancia máxima de una marca al borde de una sala
TOLERANCIA_FILA = 8  # px: marcas con la misma y (±) cuentan como una fila

JS_ASIGNAR = """([marcas, tol]) => {
  const ctx = document.createElement('canvas').getContext('2d');
  const res = {};
  for (const piso of PISOS) {
    const salas = piso.salas.filter(s => s.mesas && s.d).map(s => ({ s, P: new Path2D(s.d) }));
    const id = s => normalizar(s.nombre).replace(/[^a-z0-9]+/g, '-');
    const en = (x, y) => (salas.find(({ P }) => ctx.isPointInPath(P, x, y)) || {}).s;
    for (const [x, y] of marcas[piso.id] || []) {
      let sala = en(x, y);
      for (let r = 2; !sala && r <= tol; r += 2)
        for (let a = 0; a < 16 && !sala; a++)
          sala = en(x + r * Math.cos(a * Math.PI / 8), y + r * Math.sin(a * Math.PI / 8));
      (res[sala ? id(sala) : '_fuera' + piso.id] ??= []).push([x, y]);
    }
  }
  return res;
}"""


def main():
    marcas = json.loads(MARCAS.read_text(encoding="utf-8"))
    marcas.pop("_nota", None)
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--no-sandbox"])
        pag = nav.new_page()
        pag.goto((RAIZ / "index.html").as_uri())
        # normalizar() vive dentro de app.js; se replica aquí para no exponerla.
        pag.evaluate(
            "() => { window.normalizar = t => t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(); }"
        )
        asignadas = pag.evaluate(JS_ASIGNAR, [marcas, TOLERANCIA])
        nav.close()

    resultado, descartadas = {}, 0
    for clave, lista in asignadas.items():
        if clave.startswith("_fuera"):
            descartadas += len(lista)
            print(f"piso {clave[-1]}: {len(lista)} marcas fuera de las salas 1-14 (descartadas)")
            continue
        # Orden de lectura: por filas (y con tolerancia) y luego de izquierda a derecha.
        lista.sort(key=lambda m: m[1])
        filas, actual = [], [lista[0]]
        for m in lista[1:]:
            if abs(m[1] - actual[0][1]) <= TOLERANCIA_FILA:
                actual.append(m)
            else:
                filas.append(actual)
                actual = [m]
        filas.append(actual)
        ordenadas = [m for f in filas for m in sorted(f)]
        resultado[clave] = {"radio": RADIO, "centros": [[round(x, 1), round(y, 1)] for x, y in ordenadas]}

    # Ninguna mesa puede sobreponerse a otra: se comprueba cada pareja de una sala.
    minimo = 2.12 * RADIO + MARGEN
    for sala, v in resultado.items():
        c = v["centros"]
        for i in range(len(c)):
            for j in range(i + 1, len(c)):
                d = ((c[i][0] - c[j][0]) ** 2 + (c[i][1] - c[j][1]) ** 2) ** 0.5
                if d < minimo:
                    raise SystemExit(f"{sala}: las mesas {i + 1} y {j + 1} se sobreponen (a {d:.1f} px, mínimo {minimo:.1f}). Reduce RADIO o separa las marcas.")

    resultado = dict(sorted(resultado.items(), key=lambda kv: [int(t) if t.isdigit() else t for t in kv[0].split("-")]))
    for k, v in resultado.items():
        print(f"{k:8s} -> {len(v['centros'])} mesas")
    print(f"Total: {sum(len(v['centros']) for v in resultado.values())} mesas; {descartadas} descartadas")

    cuerpo = json.dumps(resultado, indent=2)
    SALIDA.write_text(
        "/* Generado por tools/generar_mesas.py desde tools/marcas_mesas.json. Mesa N = N-ésimo centro en orden de lectura. */\n"
        f"const MESAS = {cuerpo};\n",
        encoding="utf-8",
    )
    print("Escrito", SALIDA.relative_to(RAIZ))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Genera js/mesas.js: posición fija de las mesas de cada sala marcada con
`mesas: true` en js/data.js.

Fijar las posiciones es necesario para las reservas: cada mesa tiene un
identificador estable ("sala-8#2" = mesa 2 de la Sala 8) que comparten el
navegador y el servidor. La mesa N es la N-ésima en orden de lectura
(de arriba abajo y de izquierda a derecha).

Uso:  python3 tools/generar_mesas.py
Requiere: playwright (Chromium). Si cambias salas o mesas, vuelve a ejecutarlo;
las reservas de mesas que ya no existan se descartan al iniciar el servidor.
"""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "js" / "mesas.js"


def main():
    resultado = {}
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--no-sandbox"])
        pag = nav.new_page()
        pag.goto((RAIZ / "index.html").as_uri())
        for nombre in pag.evaluate("BibliotecaHerramientas.salasConMesas()"):
            r = pag.evaluate("n => BibliotecaHerramientas.calcularMesasDeSala(n)", nombre)
            centros = [[round(x, 1), round(y, 1)] for x, y in r["centros"]]
            resultado[r["id"]] = {"radio": r["radio"], "centros": centros}
            print(f"{nombre:8s} -> {len(centros)} mesas (radio {r['radio']})")
        nav.close()

    cuerpo = json.dumps(resultado, indent=2)
    SALIDA.write_text(
        "/* Generado por tools/generar_mesas.py. Mesa N = N-ésimo centro en orden de lectura. */\n"
        f"const MESAS = {cuerpo};\n",
        encoding="utf-8",
    )
    print("Escrito", SALIDA.relative_to(RAIZ))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Genera js/planos.js a partir de las imágenes de referencia (referencia/pisoN.png).

Vectoriza (calca) los planos para conservar las proporciones exactas:
  - muros:     líneas oscuras de la imagen, convertidas en trazados SVG.
  - piso:      superficie interior (beige).
  - exterior:  zona gris (terrazas / contexto del lote).

Las zonas clicables de cada sala NO se generan aquí: están en js/data.js,
medidas sobre estas mismas coordenadas (píxeles de la imagen original). Los 3
pisos comparten el mismo sistema de coordenadas, así que quedan alineados.

Uso:  python3 tools/generar_planos.py
Requiere: numpy, opencv-python, pillow.
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "js" / "planos.js"

# Ventana visible común a los tres pisos: x, y, ancho, alto.
VISTA = {"x": 30, "y": 40, "ancho": 1220, "alto": 325}


def cargar(piso):
    a = np.array(Image.open(RAIZ / "referencia" / f"piso{piso}.png").convert("RGB")).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lum = (R * 299 + G * 587 + B * 114) // 1000
    alto, ancho = lum.shape

    # Botones del visor (+, −, reiniciar) y pestaña roja: se descartan.
    ui = np.zeros((alto, ancho), bool)
    ui[:171, 1222:] = True
    ui[:, 1255:] = True

    rojo = (R - G > 25) & (R > 70)  # texto de las etiquetas originales
    nucleo = (R - G > 40) & (R > 70) & (G < 100)
    texto = (
        cv2.dilate(nucleo.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
    )

    muro = (lum < 175) & ~rojo & ~ui
    beige = (abs(R - 239) <= 10) & (abs(G - 233) <= 10) & (abs(B - 225) <= 10)
    gris = (abs(R - 236) <= 8) & (abs(G - 239) <= 8) & (abs(B - 241) <= 8)

    suelo = (beige | texto) & ~muro & ~ui
    exterior = gris & ~ui

    # En el piso 3 los botones tapan la esquina superior derecha: se repone.
    if piso == 3:
        suelo[139:171, 1170:1240] = True
        muro[136:140, 1166:1243] = True
        muro[136:171, 1239:1243] = True
        suelo[136:171, 1239:1243] = False
    # En el piso 1 el gris del lote queda tapado por los botones.
    if piso == 1:
        exterior[45:171, 1222:1241] = True

    return muro, suelo, exterior


def trazar(mascara, eps, area_min=0, perim_min=0):
    """Convierte una máscara binaria en un trazado SVG relativo y compacto."""
    cont, _ = cv2.findContours(mascara.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    partes = []
    for c in cont:
        if cv2.contourArea(c) < area_min and cv2.arcLength(c, True) < perim_min:
            continue
        ap = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(ap) < 2:
            continue
        x0, y0 = int(ap[0][0]), int(ap[0][1])
        px, py = x0, y0
        pasos = []
        for x, y in ap[1:]:
            x, y = int(x), int(y)
            pasos.append(f"{x - px} {y - py}")
            px, py = x, y
        partes.append(f"M{x0} {y0}l" + " ".join(pasos) + "z")
    return "".join(partes).replace(" -", "-")


def silueta(muro, suelo):
    """Contorno exterior simplificado del piso (para mostrarlo como referencia)."""
    m = (muro | suelo).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    cont, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    partes = []
    for c in cont:
        if cv2.contourArea(c) < 800:
            continue
        ap = cv2.approxPolyDP(c, 3.0, True).reshape(-1, 2)
        partes.append("M" + "L".join(f"{int(x)} {int(y)}" for x, y in ap) + "Z")
    return "".join(partes)


def main():
    resultado = {}
    for piso in (1, 2, 3):
        muro, suelo, exterior = cargar(piso)
        cierre = cv2.morphologyEx(suelo.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        cierre = cv2.dilate(cierre, np.ones((3, 3), np.uint8))
        resultado[piso] = {
            "exterior": trazar(exterior, 2.0, area_min=40, perim_min=20),
            "piso": trazar(cierre, 1.2, area_min=30, perim_min=20),
            "muros": trazar(muro, 0.7, area_min=2, perim_min=5),
            "silueta": silueta(muro, suelo),
        }
        kb = sum(len(v) for v in resultado[piso].values()) / 1024
        print(f"Piso {piso}: {kb:.0f} KB de trazados")

    contenido = (
        "/* Archivo generado por tools/generar_planos.py a partir de referencia/. No editar a mano. */\n"
        f"const VISTA = {json.dumps(VISTA)};\n"
        f"const PLANOS = {json.dumps(resultado, separators=(',', ':'))};\n"
    )
    SALIDA.write_text(contenido, encoding="utf-8")
    print("Escrito", SALIDA.relative_to(RAIZ), f"({len(contenido) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()

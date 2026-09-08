"""Productos medios - script autónomo.

Pide x0, x1, D y n; imprime la secuencia generada.
"""
from typing import List


def middle_digits(value: int, d: int) -> int:
    """Extrae D dígitos del centro, igual que en cuadrados medios."""
    s = str(abs(value))
    # Rellenar con ceros si es necesario
    if len(s) < d:
        s = s.zfill(d)
    start = (len(s) - d) // 2
    return int(s[start:start + d])


def normalize(x: int, d: int) -> float:
    return x / (10 ** d)


def mid_product(x0: int, x1: int, d: int, n: int) -> List[float]:
    a, b = x0, x1
    out = []
    for _ in range(n):
        # Multiplicar las dos semillas actuales
        y = a * b
        # Extraer D dígitos del centro del producto
        x = middle_digits(y, d)
        out.append(normalize(x, d))
        # Rotar: el nuevo par es (b, x)
        a, b = b, x
    return out


def ask_int(prompt: str) -> int:
    while True:
        try:
            return int(input(prompt))
        except Exception:
            print("Ingrese un entero válido")


def show(vals: List[float]):
    try:
        from rich.console import Console
        from rich.table import Table
        console = Console()
        t = Table(title="Productos medios")
        t.add_column("i")
        t.add_column("r_i")
        for i, v in enumerate(vals, start=1):
            t.add_row(str(i), f"{v:.6f}")
        console.print(t)
    except Exception:
        for i, v in enumerate(vals, start=1):
            print(i, f"{v:.6f}")


def main():
    print("Productos medios")
    x0 = ask_int("x0 (entero): ")
    x1 = ask_int("x1 (entero): ")
    d = ask_int("D (dígitos): ")
    n = ask_int("Cantidad a generar: ")
    vals = mid_product(x0, x1, d, n)
    show(vals)


if __name__ == '__main__':
    main()

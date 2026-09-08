"""Generador congruencial multiplicativo - script autónomo.

Pide semilla, a, m y n; genera x_{i+1} = (a * x_i) mod m.
"""
from typing import List


def multiplicative(seed: int, a: int, m: int, n: int) -> List[float]:
    if m <= 1:
        raise ValueError("m debe ser > 1")
    x = seed
    out = []
    for _ in range(n):
        x = (a * x) % m
        out.append(x / (m - 1))
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
        t = Table(title="Congruencial multiplicativo")
        t.add_column("i")
        t.add_column("r_i")
        for i, v in enumerate(vals, start=1):
            t.add_row(str(i), f"{v:.6f}")
        console.print(t)
    except Exception:
        for i, v in enumerate(vals, start=1):
            print(i, f"{v:.6f}")


def main():
    print("Congruencial multiplicativo")
    seed = ask_int("Semilla (entero): ")
    a = ask_int("a (entero): ")
    m = ask_int("m (entero > 1): ")
    n = ask_int("Cantidad a generar: ")
    vals = multiplicative(seed, a, m, n)
    show(vals)


if __name__ == '__main__':
    main()

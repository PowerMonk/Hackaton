"""Generador congruencial aditivo - script autónomo.

Pide k seeds iniciales, m y n; genera x_i = (x_{i-1} + x_{i-k}) mod m.
"""
from typing import List


def additive(seeds: List[int], m: int, n: int) -> List[float]:
    if m <= 1:
        raise ValueError("m debe ser > 1")
    k = len(seeds)
    if k == 0:
        raise ValueError("proporcione al menos una semilla")
    x = seeds.copy()
    out = []
    for _ in range(n):
        next_x = (x[-1] + x[-k]) % m
        x.append(next_x)
        out.append(next_x / (m - 1))
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
        t = Table(title="Congruencial aditivo")
        t.add_column("i")
        t.add_column("r_i")
        for i, v in enumerate(vals, start=1):
            t.add_row(str(i), f"{v:.6f}")
        console.print(t)
    except Exception:
        for i, v in enumerate(vals, start=1):
            print(i, f"{v:.6f}")


def main():
    print("Congruencial aditivo")
    k = ask_int("Cuántas semillas iniciales (k): ")
    seeds = []
    for i in range(k):
        seeds.append(ask_int(f"semilla {i+1}: "))
    m = ask_int("m (entero > 1): ")
    n = ask_int("Cantidad a generar: ")
    vals = additive(seeds, m, n)
    show(vals)


if __name__ == '__main__':
    main()

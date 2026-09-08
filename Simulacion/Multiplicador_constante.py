"""Multiplicador constante - implementación autónoma.

Pide semilla, a, D, n y genera la secuencia x_{i+1} = middle_digits(a * x_i).
"""
from typing import List


def middle_digits(value: int, d: int) -> int:
    s = str(abs(value))
    if len(s) < d:
        s = s.zfill(d)
    start = (len(s) - d) // 2
    return int(s[start:start + d])


def normalize(x: int, d: int) -> float:
    return x / (10 ** d)


def constant_multiplier(seed: int, a: int, d: int, n: int) -> List[float]:
    x = seed
    out = []
    for _ in range(n):
        y = a * x
        x = middle_digits(y, d)
        out.append(normalize(x, d))
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
        t = Table(title="Multiplicador constante")
        t.add_column("i")
        t.add_column("r_i")
        for i, v in enumerate(vals, start=1):
            t.add_row(str(i), f"{v:.6f}")
        console.print(t)
    except Exception:
        for i, v in enumerate(vals, start=1):
            print(i, f"{v:.6f}")


def main():
    print("Multiplicador constante")
    seed = ask_int("Semilla (entero): ")
    a = ask_int("a (entero): ")
    d = ask_int("D (dígitos): ")
    n = ask_int("Cantidad a generar: ")
    vals = constant_multiplier(seed, a, d, n)
    show(vals)


if __name__ == '__main__':
    main()

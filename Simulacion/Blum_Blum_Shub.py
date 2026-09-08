"""Algoritmo de Blum, Blum y Shub - script autónomo.

Implementación del algoritmo de Blum, Blum y Shub usando la fórmula:
x_{i+1} = x_i^2 mod m

"""
from typing import List


def blum_blum_shub(seed: int, m: int, n: int) -> List[float]:
    """Genera números pseudoaleatorios usando el algoritmo de Blum, Blum y Shub.
    
    Formula: x_{i+1} = x_i^2 mod m
    """
    if m <= 1:
        raise ValueError("m debe ser > 1")
    if seed <= 0:
        raise ValueError("la semilla debe ser > 0")
    
    x = seed
    out = []
    for _ in range(n):
        # Calcular siguiente valor: x_i^2 mod m
        x = (x * x) % m
        out.append(x / (m - 1))
    return out


def ask_int(prompt: str) -> int:
    while True:
        try:
            return int(input(prompt))
        except Exception:
            print("Ingrese un entero válido")


def show(seed: int, m: int, vals: List[float]):
    try:
        from rich.console import Console
        from rich.table import Table
        console = Console()
        t = Table(title="Blum, Blum y Shub ")
        t.add_column("i")
        t.add_column("x_i^2")
        t.add_column("x_i")
        t.add_column("r_i")
        
        # Recalcular para mostrar valores intermedios
        x = seed
        for i, r in enumerate(vals, start=1):
            x_squared = x * x
            x = x_squared % m
            t.add_row(str(i), f"{x_squared:,}", str(x), f"{r:.6f}")
        console.print(t)
    except Exception:
        print("Resultados detallados:")
        x = seed
        for i, r in enumerate(vals, start=1):
            x_squared = x * x
            x = x_squared % m
            print(f"{i:2d}: x^2={x_squared:,}, x_i={x}, r_i={r:.6f}")


def main():
    print("Algoritmo de Blum, Blum y Shub")
    print("Formula: x_{i+1} = x_i^2 mod m")
    print()
    
    seed = ask_int("Semilla x_0 (entero): ")
    m = ask_int("m (módulo, entero > 1): ")
    
    
    n = ask_int("Cantidad de números a generar: ")
    
    print(f"\nParámetros:")
    print(f"Semilla x_0 = {seed}")
    print(f"Módulo m = {m}")
    print()
    
    # Guardar m globalmente para la función show
    globals()['_last_m'] = m
    
    vals = blum_blum_shub(seed, m, n)
    
    show(seed, m, vals)

if __name__ == '__main__':
    main()
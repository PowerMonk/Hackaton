"""Congruencial cuadrático - script autónomo.

Implementa el algoritmo congruencial cuadrático no lineal usando la fórmula:
x_{i+1} = (a*x_i^2 + b*x_i + c) mod m

Requisitos:
- m = 2^g (donde g es entero)
- a = número par
- c = número impar  
- (b-1) mod 4 = 1
"""
from typing import List


def quadratic_congruential(seed: int, a: int, b: int, c: int, m: int, n: int) -> List[float]:
    """Genera números usando el algoritmo congruencial cuadrático.
    
    Formula: x_{i+1} = (a*x_i^2 + b*x_i + c) mod m
    """
    if m <= 1:
        raise ValueError("m debe ser > 1")
    
    x = seed
    out = []
    for _ in range(n):
        # Calcular siguiente valor usando la fórmula cuadrática
        x = ((a * x * x) + (b * x) + c) % m
        out.append(x / (m - 1))
    return out


def ask_int(prompt: str) -> int:
    while True:
        try:
            return int(input(prompt))
        except Exception:
            print("Ingrese un entero válido")


def validate_parameters(a: int, b: int, c: int, g: int) -> bool:
    """Valida que los parámetros cumplan los requisitos del algoritmo."""
    # a debe ser par
    if a % 2 != 0:
        print("Error: 'a' debe ser un número par")
        return False
    
    # c debe ser impar
    if c % 2 == 0:
        print("Error: 'c' debe ser un número impar")
        return False
    
    # (b-1) mod 4 debe ser 1
    if (b - 1) % 4 != 1:
        print("Error: (b-1) mod 4 debe ser igual a 1")
        return False
    
    # g debe ser positivo
    if g <= 0:
        print("Error: 'g' debe ser un entero positivo")
        return False
    
    return True


def show(vals: List[float]):
    try:
        from rich.console import Console
        from rich.table import Table
        console = Console()
        t = Table(title="Congruencial cuadrático")
        t.add_column("i")
        t.add_column("r_i")
        for i, v in enumerate(vals, start=1):
            t.add_row(str(i), f"{v:.6f}")
        console.print(t)
    except Exception:
        print("Resultados:")
        for i, v in enumerate(vals, start=1):
            print(f"{i:2d}: {v:.6f}")


def main():
    print("Generador congruencial cuadrático")
    print("Formula: x_{i+1} = (a*x_i^2 + b*x_i + c) mod m")
    print()
    
    seed = ask_int("Semilla x_0 (entero): ")
    
    print("\nRequisitos:")
    print("- a debe ser par")
    print("- c debe ser impar")
    print("- (b-1) mod 4 = 1")
    print("- m = 2^g")
    print()
    
    while True:
        a = ask_int("a (número par): ")
        b = ask_int("b (donde (b-1) mod 4 = 1): ")
        c = ask_int("c (número impar): ")
        g = ask_int("g (entero para m = 2^g): ")
        
        if validate_parameters(a, b, c, g):
            break
        print("Por favor, corrija los parámetros.\n")
    
    m = 2 ** g
    n = ask_int("Cantidad de números a generar: ")
    
    print(f"\nParámetros:")
    print(f"a = {a}, b = {b}, c = {c}")
    print(f"m = 2^{g} = {m}")
    print(f"Semilla = {seed}")
    print()
    
    vals = quadratic_congruential(seed, a, b, c, m, n)
    show(vals)


if __name__ == '__main__':
    main()
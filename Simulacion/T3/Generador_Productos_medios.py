"""Generador de productos medios para usar en las pruebas estadísticas.

Fórmula: y = x_{i-1} * x_i, luego extraer D dígitos del centro
Normalización: r_i = x_i / (10^D)

Requiere 2 semillas iniciales (x0, x1).
"""
from typing import List


def middle_digits(value: int, d: int) -> int:
    """Extrae D dígitos del centro del número."""
    s = str(abs(value))
    # Rellenar con ceros si es necesario
    if len(s) < d:
        s = s.zfill(d)
    start = (len(s) - d) // 2
    return int(s[start:start + d])


def normalize(x: int, d: int) -> float:
    """Normaliza al rango [0, 1]."""
    return x / (10 ** d)


def generar_numeros_productos_medios(n: int, x0: int, x1: int, d: int) -> List[float]:
    """Genera n números pseudoaleatorios usando el método de productos medios.
    
    Args:
        n: Cantidad de números a generar (debe ser >= 10)
        x0: Primera semilla
        x1: Segunda semilla
        d: Cantidad de dígitos a extraer del centro
    
    Returns:
        Lista de n números pseudoaleatorios en el rango [0, 1]
    """
    if n < 10:
        raise ValueError("n debe ser >= 10")
    if d <= 0:
        raise ValueError("D debe ser > 0")
    
    a, b = x0, x1
    numeros = []
    
    # Generar n números
    for _ in range(n):
        # Multiplicar las dos semillas actuales
        y = a * b
        # Extraer D dígitos del centro del producto
        x = middle_digits(y, d)
        # Normalizar al rango [0, 1]
        numeros.append(normalize(x, d))
        # Rotar: el nuevo par es (b, x)
        a, b = b, x
    
    return numeros


def main():
    """Función principal para pruebas."""
    print("Generador de Productos Medios")
    print()
    
    # Pedir parámetros
    x0 = int(input("Primera semilla (x0): "))
    x1 = int(input("Segunda semilla (x1): "))
    d = int(input("Dígitos a extraer (D): "))
    n = int(input("Cantidad a generar (n >= 10): "))
    
    # Generar números
    numeros = generar_numeros_productos_medios(n, x0, x1, d)
    
    # Mostrar resultados
    print(f"\nGenerados {len(numeros)} números:")
    for i, num in enumerate(numeros[:20], 1):  # Mostrar primeros 20
        print(f"r_{i} = {num:.6f}")
    
    if len(numeros) > 20:
        print(f"... ({len(numeros) - 20} números más)")


if __name__ == '__main__':
    main()

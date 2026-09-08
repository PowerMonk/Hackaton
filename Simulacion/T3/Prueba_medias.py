"""Prueba de medias - verificación de números pseudoaleatorios.

Este script implementa la prueba de medias para verificar que el promedio
del conjunto de números pseudoaleatorios sea aproximadamente 0.5.

Hipótesis nula: Ho: M = 0.5
Hipótesis alternativa: Hi: M ≠ 0.5
"""
from typing import List
import math


def middle_digits(value: int, d: int) -> int:
    """Extrae D dígitos del centro del número."""
    s = str(abs(value))
    if len(s) < d:
        s = s.zfill(d)
    start = (len(s) - d) // 2
    return int(s[start:start + d])


def normalize(x: int, d: int) -> float:
    """Normaliza al rango [0, 1]."""
    return x / (10 ** d)


def generar_numeros_productos_medios(n: int, x0: int, x1: int, d: int) -> List[float]:
    """Genera n números pseudoaleatorios usando el método de productos medios.
    
    Fórmula: y = x_{i-1} * x_i, extraer D dígitos del centro
    Normalización: r_i = x_i / (10^D)
    """
    if n < 10:
        raise ValueError("n debe ser >= 10")
    if d <= 0:
        raise ValueError("D debe ser > 0")
    
    a, b = x0, x1
    numeros = []
    for _ in range(n):
        y = a * b
        x = middle_digits(y, d)
        numeros.append(normalize(x, d))
        a, b = b, x
    return numeros


def calcular_media(datos: List[float]) -> float:
    """Calcula la media aritmética del conjunto de datos."""
    if not datos:
        return 0.0
    return sum(datos) / len(datos)


def prueba_medias(datos: List[float], nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de medias según las notas de clase.
    
    Fórmulas:
    Li = 0.5 - Z_(α/2) * (1/√(12n))
    Ls = 0.5 + Z_(α/2) * (1/√(12n))
    """
    n = len(datos)
    if n == 0:
        return {"error": "No hay datos"}
    
    # Calcular la media de los datos
    media = calcular_media(datos)
    
    # Calcular alpha (nivel de significancia)
    alpha = 1 - nivel_confianza
    
    # Valores de Z para diferentes niveles de confianza (de la tabla normal)
    tabla_z = {
        0.90: 1.645,
        0.95: 1.96,
        0.98: 2.326,
        0.99: 2.576
    }
    
    z_valor = tabla_z.get(nivel_confianza, 1.96)
    
    # Calcular límites inferior y superior
    # Li = 0.5 - Z_(α/2) * (1/√(12n))
    # Ls = 0.5 + Z_(α/2) * (1/√(12n))
    factor = 1 / math.sqrt(12 * n)
    li = 0.5 - z_valor * factor
    ls = 0.5 + z_valor * factor
    
    # Verificar si la media está dentro del rango
    aceptada = li <= media <= ls
    
    return {
        "n": n,
        "media": media,
        "nivel_confianza": nivel_confianza,
        "alpha": alpha,
        "z_valor": z_valor,
        "limite_inferior": li,
        "limite_superior": ls,
        "aceptada": aceptada
    }


def mostrar_resultados(resultado: dict):
    """Muestra los resultados de la prueba en formato tabla."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
        
        console = Console()
        
        # Panel con información general
        console.print(Panel.fit(
            f"[bold cyan]Prueba de Medias[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%\n"
            f"α = {resultado['alpha']}"
        ))
        
        # Tabla de resultados
        table = Table(title="Resultados")
        table.add_column("Parámetro", style="cyan")
        table.add_column("Valor", style="magenta")
        
        table.add_row("Media calculada", f"{resultado['media']:.6f}")
        table.add_row("Z_(α/2)", f"{resultado['z_valor']}")
        table.add_row("Límite Inferior (Li)", f"{resultado['limite_inferior']:.6f}")
        table.add_row("Límite Superior (Ls)", f"{resultado['limite_superior']:.6f}")
        
        console.print(table)
        
        # Resultado de la prueba
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]La media ({resultado['media']:.6f}) está dentro del rango aceptable.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]La media ({resultado['media']:.6f}) está fuera del rango aceptable.[/red]")
            
    except ImportError:
        # Fallback sin rich
        print("\n" + "="*50)
        print("PRUEBA DE MEDIAS")
        print("="*50)
        print(f"n = {resultado['n']} datos")
        print(f"Nivel de confianza: {resultado['nivel_confianza']*100}%")
        print(f"α = {resultado['alpha']}")
        print(f"\nMedia calculada: {resultado['media']:.6f}")
        print(f"Z_(α/2) = {resultado['z_valor']}")
        print(f"Límite Inferior (Li): {resultado['limite_inferior']:.6f}")
        print(f"Límite Superior (Ls): {resultado['limite_superior']:.6f}")
        print("\n" + "-"*50)
        
        if resultado['aceptada']:
            print("✓ No se puede rechazar H₀")
            print(f"La media ({resultado['media']:.6f}) está dentro del rango.")
        else:
            print("✗ Se rechaza H₀")
            print(f"La media ({resultado['media']:.6f}) está fuera del rango.")
        print("="*50)


def main():
    print("Prueba de Medias para Números Pseudoaleatorios")
    print()
    
    # Pedir cantidad de números a generar
    while True:
        try:
            n = int(input("Cantidad de números a generar (mínimo 10): ").strip())
            if n >= 10:
                break
            print("Error: Debe generar al menos 10 números")
        except ValueError:
            print("Ingrese un número entero válido")
    
    # Pedir parámetros del generador de productos medios
    print("\nParámetros del generador de productos medios:")
    print("Sugerencia: x0=5735, x1=8921, D=4")
    
    while True:
        try:
            x0 = int(input("Primera semilla (x0): ").strip())
            x1 = int(input("Segunda semilla (x1): ").strip())
            d = int(input("Dígitos a extraer (D): ").strip())
            if d > 0:
                break
            print("Error: D debe ser > 0")
        except ValueError:
            print("Ingrese valores enteros válidos")
    
    # Generar números usando método de productos medios
    print(f"\nGenerando {n} números con productos medios...")
    try:
        datos = generar_numeros_productos_medios(n, x0, x1, d)
    except ValueError as e:
        print(f"Error: {e}")
        return
    
    print(f"Números generados: {n}")
    
    # Preguntar nivel de confianza
    print("\nNiveles de confianza disponibles:")
    print("1) 90%")
    print("2) 95% (recomendado)")
    print("3) 98%")
    print("4) 99%")
    
    opcion = input("Seleccione nivel de confianza (1-4, default=2): ").strip()
    
    niveles = {
        "1": 0.90,
        "2": 0.95,
        "3": 0.98,
        "4": 0.99
    }
    
    nivel_confianza = niveles.get(opcion, 0.95)
    
    # Ejecutar prueba
    resultado = prueba_medias(datos, nivel_confianza)
    
    # Mostrar resultados
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

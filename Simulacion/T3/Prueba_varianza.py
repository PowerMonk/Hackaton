"""Prueba de varianza - verificación de números pseudoaleatorios.

Verifica que la varianza del conjunto sea aproximadamente 1/12.

Hipótesis nula: Ho: σ² = 1/12
Hipótesis alternativa: Hi: σ² ≠ 1/12
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
    """Calcula la media aritmética."""
    if not datos:
        return 0.0
    return sum(datos) / len(datos)


def calcular_varianza(datos: List[float]) -> float:
    """Calcula la varianza muestral.
    
    Fórmula: σ² = Σ(xi - x̄)² / (n-1)
    """
    if len(datos) < 2:
        return 0.0
    
    media = calcular_media(datos)
    
    # Sumar (xi - media)²
    suma_cuadrados = sum((x - media) ** 2 for x in datos)
    
    # Dividir entre n-1 (varianza muestral)
    varianza = suma_cuadrados / (len(datos) - 1)
    
    return varianza


def obtener_chi2_valores(gl: int, alpha: float) -> tuple:
    """Retorna los valores de chi-cuadrada para los límites inferior y superior.
    
    Usa tabla aproximada de valores críticos de chi-cuadrada.
    """
    # Tabla de valores críticos de chi-cuadrada
    # Formato: (grados_libertad, alpha): (chi2_inferior, chi2_superior)
    tabla_chi2 = {
        # Para α = 0.05 (95% confianza)
        (4, 0.05): (0.484, 11.14),
        (39, 0.05): (24.4, 59.3),
        (99, 0.05): (73.36, 128.42),
        # Para α = 0.10 (90% confianza)
        (4, 0.10): (0.711, 9.488),
        (39, 0.10): (26.51, 53.20),
        (99, 0.10): (77.05, 123.23),
        # Para α = 0.02 (98% confianza)
        (4, 0.02): (0.297, 13.28),
        (39, 0.02): (21.43, 63.69),
        (99, 0.02): (68.05, 135.81),
        # Para α = 0.01 (99% confianza)
        (4, 0.01): (0.207, 14.86),
        (39, 0.01): (20.71, 66.77),
        (99, 0.01): (66.50, 140.17),
    }
    
    # Redondear alpha para evitar problemas de punto flotante
    alpha_redondeado = round(alpha, 2)
    
    # Buscar en la tabla
    # gl == grados de libertad
    if (gl, alpha_redondeado) in tabla_chi2:
        return tabla_chi2[(gl, alpha_redondeado)]
    
    # Si no está en la tabla, usar aproximación de Wilson-Hilferty
    # Mapear alpha a z-score
    z_scores = {
        0.10: 1.645,
        0.05: 1.96,
        0.02: 2.326,
        0.01: 2.576
    }
    
    # Encontrar el z-score más cercano
    z_alpha_2 = z_scores.get(alpha_redondeado, 1.96)
    
    # Aproximación de Wilson-Hilferty para chi-cuadrada
    chi2_inferior = gl * (1 - 2/(9*gl) - z_alpha_2 * math.sqrt(2/(9*gl)))**3
    chi2_superior = gl * (1 - 2/(9*gl) + z_alpha_2 * math.sqrt(2/(9*gl)))**3
    
    return (chi2_inferior, chi2_superior)


def prueba_varianza(datos: List[float], nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de varianza según las notas de clase.
    
    Fórmulas:
    Li = χ²(1-α/2, n-1) / [12(n-1)]
    Ls = χ²(α/2, n-1) / [12(n-1)]
    """
    n = len(datos)
    if n < 2:
        return {"error": "Se necesitan al menos 2 datos"}
    
    # Calcular media y varianza
    media = calcular_media(datos)
    varianza = calcular_varianza(datos)
    
    # Calcular alpha
    alpha = 1 - nivel_confianza
    
    # Grados de libertad
    gl = n - 1
    
    # Obtener valores de chi-cuadrada de la tabla o aproximación
    chi2_inferior, chi2_superior = obtener_chi2_valores(gl, alpha)
    
    # Calcular límites
    # Li = χ²(1-α/2, n-1) / [12(n-1)]
    # Ls = χ²(α/2, n-1) / [12(n-1)]
    li = chi2_inferior / (12 * gl)
    ls = chi2_superior / (12 * gl)
    
    # Verificar si la varianza está dentro del rango
    aceptada = li <= varianza <= ls
    
    return {
        "n": n,
        "grados_libertad": gl,
        "media": media,
        "varianza": varianza,
        "varianza_esperada": 1/12,
        "nivel_confianza": nivel_confianza,
        "alpha": alpha,
        "chi2_inferior": chi2_inferior,
        "chi2_superior": chi2_superior,
        "limite_inferior": li,
        "limite_superior": ls,
        "aceptada": aceptada
    }


def mostrar_resultados(resultado: dict):
    """Muestra los resultados de la prueba."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
        
        console = Console()
        
        console.print(Panel.fit(
            f"[bold cyan]Prueba de Varianza[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Grados de libertad = {resultado['grados_libertad']}\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%"
        ))
        
        table = Table(title="Resultados")
        table.add_column("Parámetro", style="cyan")
        table.add_column("Valor", style="magenta")
        
        table.add_row("Media", f"{resultado['media']:.6f}")
        table.add_row("Varianza calculada (σ²)", f"{resultado['varianza']:.6f}")
        table.add_row("Varianza esperada", f"{resultado['varianza_esperada']:.6f}")
        table.add_row("χ²(1-α/2, n-1)", f"{resultado['chi2_inferior']:.4f}")
        table.add_row("χ²(α/2, n-1)", f"{resultado['chi2_superior']:.4f}")
        table.add_row("Límite Inferior (Li)", f"{resultado['limite_inferior']:.6f}")
        table.add_row("Límite Superior (Ls)", f"{resultado['limite_superior']:.6f}")
        
        console.print(table)
        
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]La varianza está dentro del rango aceptable.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]La varianza está fuera del rango aceptable.[/red]")
            
    except ImportError:
        print("\n" + "="*50)
        print("PRUEBA DE VARIANZA")
        print("="*50)
        print(f"n = {resultado['n']}")
        print(f"Grados de libertad = {resultado['grados_libertad']}")
        print(f"Nivel de confianza: {resultado['nivel_confianza']*100}%")
        print(f"\nMedia: {resultado['media']:.6f}")
        print(f"Varianza calculada: {resultado['varianza']:.6f}")
        print(f"Varianza esperada: {resultado['varianza_esperada']:.6f}")
        print(f"\nχ²(1-α/2, n-1) = {resultado['chi2_inferior']:.4f}")
        print(f"χ²(α/2, n-1) = {resultado['chi2_superior']:.4f}")
        print(f"Límite Inferior (Li): {resultado['limite_inferior']:.6f}")
        print(f"Límite Superior (Ls): {resultado['limite_superior']:.6f}")
        
        if resultado['aceptada']:
            print("\n✓ No se puede rechazar H₀")
        else:
            print("\n✗ Se rechaza H₀")
        print("="*50)


def main():
    print("Prueba de Varianza para Números Pseudoaleatorios")
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
    
    # Nivel de confianza (generalmente 95%)
    print("\nNivel de confianza (default 95%): ")
    nivel = input("Ingrese nivel (90, 95, 98, 99) o Enter para 95: ").strip()
    
    niveles_map = {"90": 0.90, "95": 0.95, "98": 0.98, "99": 0.99}
    nivel_confianza = niveles_map.get(nivel, 0.95)
    
    # Ejecutar prueba
    resultado = prueba_varianza(datos, nivel_confianza)
    
    if "error" in resultado:
        print(f"Error: {resultado['error']}")
        return
    
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

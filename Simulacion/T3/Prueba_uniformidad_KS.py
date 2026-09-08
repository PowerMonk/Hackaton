"""Prueba de uniformidad - Kolmogorov-Smirnov.

Verifica que los números estén uniformemente distribuidos en [0,1].

Hipótesis nula: Ho: ri ~ U(0,1) (uniformemente distribuidos)
Hipótesis alternativa: Hi: ri no es uniforme
"""
from typing import List


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


def kolmogorov_smirnov(datos: List[float], nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de Kolmogorov-Smirnov.
    
    Pasos según las notas:
    1. Ordenar ascendentemente ri
    2. Calcular:
       D+ = max(i/n - ri)
       D- = max(ri - (i-1)/n)
       D = max(D+, D-)
    3. Determinar D(α, n) de la tabla
    4. Si D < D(α, n) no se puede rechazar Ho
    """
    n = len(datos)
    if n == 0:
        return {"error": "No hay datos"}
    
    # Paso 1: Ordenar los datos ascendentemente
    datos_ordenados = sorted(datos)
    
    # Paso 2: Calcular D+ y D-
    d_plus_values = []
    d_minus_values = []
    
    resultados_tabla = []
    
    for i in range(1, n + 1):
        ri = datos_ordenados[i - 1]
        
        # D+ = i/n - ri
        d_plus = (i / n) - ri
        d_plus_values.append(d_plus)
        
        # D- = ri - (i-1)/n
        d_minus = ri - ((i - 1) / n)
        d_minus_values.append(d_minus)
        
        # Guardar para mostrar en tabla
        resultados_tabla.append({
            "i": i,
            "i_n": i / n,
            "ri": ri,
            "i_menos_1_n": (i - 1) / n,
            "d_plus": d_plus,
            "d_minus": d_minus
        })
    
    # Encontrar los máximos
    d_plus_max = max(d_plus_values)
    d_minus_max = max(d_minus_values)
    d_value = max(d_plus_max, d_minus_max)
    
    # Paso 3: Determinar D(α, n) de la tabla
    # Tabla de valores críticos de Kolmogorov-Smirnov
    # Para α = 0.05 (95% confianza)
    tabla_ks = {
        10: 0.4093,
        20: 0.2941,
        30: 0.2417,
        40: 0.2101,
        50: 0.1884,
        100: 0.1340
    }
    
    # Encontrar el valor más cercano en la tabla
    alpha = 1 - nivel_confianza
    
    # Buscar valor crítico
    if n in tabla_ks:
        d_critico = tabla_ks[n]
    else:
        # Aproximación para otros valores de n
        # Fórmula aproximada: D_crítico ≈ 1.36 / √n para α=0.05
        if abs(alpha - 0.05) < 0.001:
            d_critico = 1.36 / (n ** 0.5)
        else:
            # Para otros alphas, usar aproximaciones
            d_critico = 1.63 / (n ** 0.5)  # α=0.01
    
    # Paso 4: Decidir
    aceptada = d_value < d_critico
    
    return {
        "n": n,
        "d_plus_max": d_plus_max,
        "d_minus_max": d_minus_max,
        "d_value": d_value,
        "d_critico": d_critico,
        "nivel_confianza": nivel_confianza,
        "alpha": alpha,
        "aceptada": aceptada,
        "tabla": resultados_tabla[:10]  # Solo primeros 10 para mostrar
    }


def mostrar_resultados(resultado: dict):
    """Muestra los resultados de la prueba."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
        
        console = Console()
        
        console.print(Panel.fit(
            f"[bold cyan]Prueba de Kolmogorov-Smirnov[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%"
        ))
        
        # Mostrar primeros valores de la tabla
        table = Table(title="Primeros 10 valores (ejemplo)")
        table.add_column("i", style="cyan")
        table.add_column("i/n", style="yellow")
        table.add_column("ri", style="green")
        table.add_column("(i-1)/n", style="yellow")
        table.add_column("D+", style="magenta")
        table.add_column("D-", style="magenta")
        
        for fila in resultado['tabla']:
            table.add_row(
                str(fila['i']),
                f"{fila['i_n']:.4f}",
                f"{fila['ri']:.4f}",
                f"{fila['i_menos_1_n']:.4f}",
                f"{fila['d_plus']:.4f}",
                f"{fila['d_minus']:.4f}"
            )
        
        console.print(table)
        
        # Resultados finales
        table2 = Table(title="Resultados")
        table2.add_column("Parámetro", style="cyan")
        table2.add_column("Valor", style="magenta")
        
        table2.add_row("D+ (máximo)", f"{resultado['d_plus_max']:.6f}")
        table2.add_row("D- (máximo)", f"{resultado['d_minus_max']:.6f}")
        table2.add_row("D (estadístico)", f"{resultado['d_value']:.6f}")
        table2.add_row("D crítico (D_α,n)", f"{resultado['d_critico']:.6f}")
        
        console.print(table2)
        
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]D ({resultado['d_value']:.6f}) < D_crítico ({resultado['d_critico']:.6f})[/green]")
            console.print("[green]Los datos son uniformes.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]D ({resultado['d_value']:.6f}) >= D_crítico ({resultado['d_critico']:.6f})[/red]")
            console.print("[red]Los datos NO son uniformes.[/red]")
            
    except ImportError:
        print("\n" + "="*50)
        print("PRUEBA DE KOLMOGOROV-SMIRNOV")
        print("="*50)
        print(f"n = {resultado['n']}")
        print(f"Nivel de confianza: {resultado['nivel_confianza']*100}%")
        print("\nPrimeros 10 valores:")
        print(f"{'i':>3} {'i/n':>8} {'ri':>8} {'(i-1)/n':>8} {'D+':>8} {'D-':>8}")
        print("-" * 50)
        for fila in resultado['tabla']:
            print(f"{fila['i']:3d} {fila['i_n']:8.4f} {fila['ri']:8.4f} "
                  f"{fila['i_menos_1_n']:8.4f} {fila['d_plus']:8.4f} {fila['d_minus']:8.4f}")
        
        print("\nResultados:")
        print(f"D+ (máximo) = {resultado['d_plus_max']:.6f}")
        print(f"D- (máximo) = {resultado['d_minus_max']:.6f}")
        print(f"D (estadístico) = {resultado['d_value']:.6f}")
        print(f"D crítico = {resultado['d_critico']:.6f}")
        
        if resultado['aceptada']:
            print("\n✓ No se puede rechazar H₀")
            print("Los datos son uniformes.")
        else:
            print("\n✗ Se rechaza H₀")
            print("Los datos NO son uniformes.")
        print("="*50)


def main():
    print("Prueba de Kolmogorov-Smirnov (Uniformidad)")
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
    
    # Nivel de confianza
    nivel = input("\nNivel de confianza (90, 95, 98, default=95): ").strip()
    niveles_map = {"90": 0.90, "95": 0.95, "98": 0.98}
    nivel_confianza = niveles_map.get(nivel, 0.95)
    
    # Ejecutar prueba
    resultado = kolmogorov_smirnov(datos, nivel_confianza)
    
    if "error" in resultado:
        print(f"Error: {resultado['error']}")
        return
    
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

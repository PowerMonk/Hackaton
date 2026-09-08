"""Prueba de independencia - Corridas arriba y abajo.

Verifica que los números sean independientes entre sí.

Hipótesis nula: Ho: Los números ri son independientes
Hipótesis alternativa: Hi: Los números ri NO son independientes
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


def generar_secuencia_corridas(datos: List[float]) -> tuple:
    """Genera la secuencia de 1s y 0s para corridas arriba y abajo.
    
    Regla: Se coloca 0 si ri <= r(i-1), caso contrario 1.
    """
    if len(datos) < 2:
        return [], 0
    
    secuencia = []
    
    # Comparar cada número con el anterior
    for i in range(1, len(datos)):
        if datos[i] > datos[i-1]:
            secuencia.append(1)  # Sube
        else:
            secuencia.append(0)  # Baja o igual
    
    # Contar corridas (secuencias consecutivas del mismo valor)
    co = 1  # Empezamos con 1 corrida
    for i in range(1, len(secuencia)):
        if secuencia[i] != secuencia[i-1]:
            co += 1
    
    return secuencia, co


def prueba_corridas(datos: List[float], nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de corridas arriba y abajo.
    
    Fórmulas según las notas:
    M_Co = (2n - 1) / 3
    σ²_Co = (16n - 29) / 90
    Zo = |Co - M_Co| / σ_Co
    """
    n = len(datos)
    if n < 2:
        return {"error": "Se necesitan al menos 2 datos"}
    
    # Generar secuencia y contar corridas
    secuencia, co = generar_secuencia_corridas(datos)
    
    # Calcular media esperada de corridas
    m_co = (2 * n - 1) / 3
    
    # Calcular varianza de corridas
    var_co = (16 * n - 29) / 90
    
    # Calcular desviación estándar
    sigma_co = math.sqrt(var_co)
    
    # Calcular estadístico Z
    z_o = abs((co - m_co) / sigma_co)
    
    # Valor crítico de Z para el nivel de confianza
    alpha = 1 - nivel_confianza
    # Tabla de valores Z
    tabla_z = {
        0.90: 1.645,
        0.95: 1.96,
        0.98: 2.326,
        0.99: 2.576
    }
    z_critico = tabla_z.get(nivel_confianza, 1.96)
    
    # Decisión: si Zo < Z(α/2) no se rechaza Ho
    aceptada = z_o < z_critico
    
    return {
        "n": n,
        "secuencia": ''.join(map(str, secuencia)),
        "co": co,
        "m_co": m_co,
        "var_co": var_co,
        "sigma_co": sigma_co,
        "z_o": z_o,
        "z_critico": z_critico,
        "nivel_confianza": nivel_confianza,
        "alpha": alpha,
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
            f"[bold cyan]Prueba de Corridas Arriba y Abajo[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%"
        ))
        
        # Mostrar secuencia (primeros 80 caracteres)
        seq_muestra = resultado['secuencia'][:80]
        if len(resultado['secuencia']) > 80:
            seq_muestra += "..."
        console.print(f"\n[yellow]Secuencia de 1s y 0s:[/yellow]\n{seq_muestra}\n")
        
        table = Table(title="Resultados")
        table.add_column("Parámetro", style="cyan")
        table.add_column("Valor", style="magenta")
        
        table.add_row("Corridas observadas (Co)", str(resultado['co']))
        table.add_row("Media esperada (M_Co)", f"{resultado['m_co']:.4f}")
        table.add_row("Varianza (σ²_Co)", f"{resultado['var_co']:.4f}")
        table.add_row("Desv. estándar (σ_Co)", f"{resultado['sigma_co']:.4f}")
        table.add_row("Estadístico Zo", f"{resultado['z_o']:.4f}")
        table.add_row("Z crítico (Z_α/2)", f"{resultado['z_critico']:.4f}")
        
        console.print(table)
        
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]Zo ({resultado['z_o']:.4f}) < Z_crítico ({resultado['z_critico']:.4f})[/green]")
            console.print("[green]Los datos son independientes.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]Zo ({resultado['z_o']:.4f}) >= Z_crítico ({resultado['z_critico']:.4f})[/red]")
            console.print("[red]Los datos NO son independientes.[/red]")
            
    except ImportError:
        print("\n" + "="*60)
        print("PRUEBA DE CORRIDAS ARRIBA Y ABAJO")
        print("="*60)
        print(f"n = {resultado['n']}")
        print(f"Nivel de confianza: {resultado['nivel_confianza']*100}%")
        
        seq_muestra = resultado['secuencia'][:80]
        if len(resultado['secuencia']) > 80:
            seq_muestra += "..."
        print(f"\nSecuencia de 1s y 0s:\n{seq_muestra}")
        
        print("\nResultados:")
        print(f"Corridas observadas (Co): {resultado['co']}")
        print(f"Media esperada (M_Co): {resultado['m_co']:.4f}")
        print(f"Varianza (σ²_Co): {resultado['var_co']:.4f}")
        print(f"Desviación estándar (σ_Co): {resultado['sigma_co']:.4f}")
        print(f"Estadístico Zo: {resultado['z_o']:.4f}")
        print(f"Z crítico: {resultado['z_critico']:.4f}")
        
        if resultado['aceptada']:
            print("\n✓ No se puede rechazar H₀")
            print("Los datos son independientes.")
        else:
            print("\n✗ Se rechaza H₀")
            print("Los datos NO son independientes.")
        print("="*60)


def main():
    print("Prueba de Corridas Arriba y Abajo (Independencia)")
    print()
    
    # Solicitar parámetros
    print("Ingrese la cantidad de números a generar (n >= 10):")
    try:
        n = int(input("n: "))
        if n < 10:
            print("Error: Se necesitan al menos 10 números")
            return
    except ValueError:
        print("Error: Valor inválido")
        return
    
    print("\nIngrese los parámetros del generador de productos medios:")
    print("Sugerencia: x0=5735, x1=8921, D=4")
    try:
        x0 = int(input("Primera semilla (x0): "))
        x1 = int(input("Segunda semilla (x1): "))
        d = int(input("Dígitos a extraer (D): "))
        if d <= 0:
            print("Error: D debe ser > 0")
            return
    except ValueError:
        print("Error: Valores inválidos")
        return
    
    # Generar números con método de productos medios
    datos = generar_numeros_productos_medios(n, x0, x1, d)
    
    if not datos:
        print("No se pudieron generar los datos.")
        return
    
    print(f"\nDatos generados: {len(datos)} números")
    
    # Nivel de confianza
    nivel = input("Nivel de confianza (90, 95, 98, default=95): ").strip()
    niveles_map = {"90": 0.90, "95": 0.95, "98": 0.98}
    nivel_confianza = niveles_map.get(nivel, 0.95)
    
    # Ejecutar prueba
    resultado = prueba_corridas(datos, nivel_confianza)
    
    if "error" in resultado:
        print(f"Error: {resultado['error']}")
        return
    
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

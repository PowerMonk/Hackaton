"""Prueba de series - verificación de independencia mediante gráfica.

Crea pares (ri, r(i+1)) y verifica su distribución en una cuadrícula.
Usa chi-cuadrada para verificar uniformidad de la distribución.

Hipótesis nula: Ho: Los pares están uniformemente distribuidos
Hipótesis alternativa: Hi: Los pares NO están uniformemente distribuidos
"""
from typing import List, Tuple
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


def generar_pares(datos: List[float]) -> List[Tuple[float, float]]:
    """Genera pares (ri, r(i+1)) incluyendo el par cíclico final.
    
    El último número se empareja con el primero para completar n-1 pares.
    """
    pares = []
    n = len(datos)
    
    for i in range(n - 1):
        pares.append((datos[i], datos[i + 1]))
    
    # Par cíclico: último con primero (según las notas)
    if n > 1:
        pares.append((datos[n - 1], datos[0]))
    
    return pares


def asignar_cuadrante(x: float, y: float, num_divisiones: int) -> int:
    """Asigna un par (x,y) a un cuadrante de la matriz.
    
    La matriz está dividida en num_divisiones x num_divisiones cuadrantes.
    Retorna el número de cuadrante (1 a num_divisiones²).
    """
    # Determinar fila y columna (0-indexed)
    col = int(x * num_divisiones)
    fila = int(y * num_divisiones)
    
    # Manejar el caso límite donde x o y = 1.0
    if col >= num_divisiones:
        col = num_divisiones - 1
    if fila >= num_divisiones:
        fila = num_divisiones - 1
    
    # Numerar cuadrantes de abajo hacia arriba, izquierda a derecha
    # Fila 0 (inferior) tiene cuadrantes 1,2,3,...
    # Fila 1 tiene cuadrantes (num_divisiones+1), ...
    cuadrante = fila * num_divisiones + col + 1
    
    return cuadrante


def prueba_series(datos: List[float], nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de series.
    
    Pasos según las notas:
    1. Crear matriz cuadrada m×m donde m ≈ √n
    2. Crear pares (ri, r(i+1))
    3. Contar frecuencia observada en cada cuadrante
    4. Aplicar chi-cuadrada
    """
    n = len(datos)
    if n < 4:
        return {"error": "Se necesitan al menos 4 datos"}
    
    # Paso 1: Determinar tamaño de la matriz
    # m debe ser el cuadrado perfecto más cercano a √n
    raiz_n = math.sqrt(n)
    m_lado = int(raiz_n)
    
    # Asegurar que sea cuadrado perfecto cercano pero no menor
    # Según las notas, si √30 = 5.48, se usa 3×3 = 9 cuadrantes
    # Esto significa que se redondea hacia arriba y se cuadra
    if m_lado * m_lado < raiz_n:
        m_lado += 1
    
    num_cuadrantes = m_lado * m_lado
    
    # Paso 2: Generar pares
    pares = generar_pares(datos)
    num_pares = len(pares)
    
    # Paso 3: Contar frecuencias observadas
    frecuencias = {}
    for i in range(1, num_cuadrantes + 1):
        frecuencias[i] = 0
    
    for x, y in pares:
        cuadrante = asignar_cuadrante(x, y, m_lado)
        frecuencias[cuadrante] += 1
    
    # Paso 4: Aplicar chi-cuadrada
    # Ei = (n-1) / m (valor esperado por cuadrante)
    e_i = num_pares / num_cuadrantes
    
    # Calcular χ² = Σ[(Ei - Oi)² / Ei]
    chi2_calculado = 0
    for i in range(1, num_cuadrantes + 1):
        o_i = frecuencias[i]
        chi2_calculado += ((e_i - o_i) ** 2) / e_i
    
    # Grados de libertad = m - 1
    gl = num_cuadrantes - 1
    
    # Valor crítico de chi-cuadrada (tabla aproximada)
    # Para diferentes grados de libertad y α=0.05
    alpha = 1 - nivel_confianza
    
    # Tabla chi-cuadrada aproximada (gl: valor_crítico para α=0.05)
    tabla_chi2 = {
        4: 9.488,
        8: 15.507,
        24: 36.415,
        39: 54.572,
        49: 66.339
    }
    
    # Buscar el valor más cercano
    if gl in tabla_chi2:
        chi2_critico = tabla_chi2[gl]
    else:
        # Aproximación: χ²_crítico ≈ gl + √(2*gl) * z_α
        z_alpha = 1.96 if abs(alpha - 0.05) < 0.001 else 1.645
        chi2_critico = gl + math.sqrt(2 * gl) * z_alpha
    
    # Decisión
    aceptada = chi2_calculado < chi2_critico
    
    return {
        "n": n,
        "num_pares": num_pares,
        "m_lado": m_lado,
        "num_cuadrantes": num_cuadrantes,
        "frecuencias": frecuencias,
        "e_i": e_i,
        "chi2_calculado": chi2_calculado,
        "grados_libertad": gl,
        "chi2_critico": chi2_critico,
        "nivel_confianza": nivel_confianza,
        "aceptada": aceptada,
        "pares_muestra": pares[:10]  # Primeros 10 pares para mostrar
    }


def mostrar_resultados(resultado: dict):
    """Muestra los resultados de la prueba."""
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
        
        console = Console()
        
        console.print(Panel.fit(
            f"[bold cyan]Prueba de Series[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Pares generados = {resultado['num_pares']}\n"
            f"Matriz: {resultado['m_lado']}×{resultado['m_lado']} = {resultado['num_cuadrantes']} cuadrantes\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%"
        ))
        
        # Mostrar algunos pares
        console.print("\n[yellow]Primeros 10 pares (ri, r(i+1)):[/yellow]")
        for i, (x, y) in enumerate(resultado['pares_muestra'], 1):
            console.print(f"  {i}. ({x:.3f}, {y:.3f})")
        
        # Tabla de frecuencias por cuadrante
        table = Table(title="Frecuencias por Cuadrante")
        table.add_column("Cuadrante", style="cyan")
        table.add_column("Ei (esperado)", style="yellow")
        table.add_column("Oi (observado)", style="magenta")
        table.add_column("(Ei-Oi)²/Ei", style="green")
        
        # Mostrar solo cuadrantes con datos o primeros 10
        cuadrantes_mostrar = [k for k, v in resultado['frecuencias'].items() if v > 0][:10]
        
        suma_parcial = 0
        for cuad in cuadrantes_mostrar:
            o_i = resultado['frecuencias'][cuad]
            e_i = resultado['e_i']
            contribucion = ((e_i - o_i) ** 2) / e_i
            suma_parcial += contribucion
            table.add_row(
                str(cuad),
                f"{e_i:.2f}",
                str(o_i),
                f"{contribucion:.4f}"
            )
        
        console.print(table)
        console.print(f"[dim]... (mostrando solo primeros cuadrantes con datos)[/dim]\n")
        
        # Resultados finales
        table2 = Table(title="Resultados Chi-Cuadrada")
        table2.add_column("Parámetro", style="cyan")
        table2.add_column("Valor", style="magenta")
        
        table2.add_row("χ² calculado", f"{resultado['chi2_calculado']:.4f}")
        table2.add_row("Grados de libertad", str(resultado['grados_libertad']))
        table2.add_row("χ² crítico (tabla)", f"{resultado['chi2_critico']:.4f}")
        
        console.print(table2)
        
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]χ² ({resultado['chi2_calculado']:.4f}) < χ²_crítico ({resultado['chi2_critico']:.4f})[/green]")
            console.print("[green]Los pares están uniformemente distribuidos.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]χ² ({resultado['chi2_calculado']:.4f}) >= χ²_crítico ({resultado['chi2_critico']:.4f})[/red]")
            console.print("[red]Los pares NO están uniformemente distribuidos.[/red]")
            
    except ImportError:
        print("\n" + "="*60)
        print("PRUEBA DE SERIES")
        print("="*60)
        print(f"n = {resultado['n']}")
        print(f"Pares = {resultado['num_pares']}")
        print(f"Matriz: {resultado['m_lado']}×{resultado['m_lado']} = {resultado['num_cuadrantes']} cuadrantes")
        
        print("\nPrimeros 10 pares:")
        for i, (x, y) in enumerate(resultado['pares_muestra'], 1):
            print(f"  {i}. ({x:.3f}, {y:.3f})")
        
        print("\nResultados:")
        print(f"Ei (esperado por cuadrante): {resultado['e_i']:.2f}")
        print(f"χ² calculado: {resultado['chi2_calculado']:.4f}")
        print(f"Grados de libertad: {resultado['grados_libertad']}")
        print(f"χ² crítico: {resultado['chi2_critico']:.4f}")
        
        if resultado['aceptada']:
            print("\n✓ No se puede rechazar H₀")
        else:
            print("\n✗ Se rechaza H₀")
        print("="*60)


def main():
    print("Prueba de Series")
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
    resultado = prueba_series(datos, nivel_confianza)
    
    if "error" in resultado:
        print(f"Error: {resultado['error']}")
        return
    
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

"""Prueba de huecos - verificación de independencia.

Define un intervalo (α, β) y verifica que los huecos entre números
dentro del intervalo estén distribuidos correctamente.

Hipótesis nula: Ho: Los huecos siguen la distribución esperada
Hipótesis alternativa: Hi: Los huecos NO siguen la distribución esperada
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


def generar_secuencia_huecos(datos: List[float], alpha: float, beta: float) -> Tuple[str, List[int]]:
    """Genera la secuencia de 1s y 0s y encuentra los huecos.
    
    Reglas según las notas:
    - 1 si ri ∈ (α, β)
    - 0 si ri ∉ (α, β)
    
    Un hueco es la cantidad de 0s entre dos 1s consecutivos.
    """
    # Generar secuencia de 1s y 0s
    secuencia = []
    for r in datos:
        if alpha < r < beta:
            secuencia.append(1)
        else:
            secuencia.append(0)
    
    # Encontrar huecos
    huecos = []
    en_hueco = False
    tamaño_hueco = 0
    
    for bit in secuencia:
        if bit == 1:
            if en_hueco:
                # Termina el hueco
                huecos.append(tamaño_hueco)
                tamaño_hueco = 0
            else:
                # Primer 1 encontrado o dos 1s consecutivos
                en_hueco = True
                # Si hay dos 1s seguidos, es un hueco de tamaño 0
                if len(huecos) > 0 or secuencia[0] == 1:
                    # Ya habíamos empezado a contar huecos
                    pass
                huecos.append(0)  # Hueco de 0 entre dos 1s seguidos
                en_hueco = True
        else:  # bit == 0
            if en_hueco:
                tamaño_hueco += 1
    
    # Corregir el conteo: los huecos son entre 1s
    # Rehacer el conteo correctamente
    huecos = []
    indices_unos = [i for i, bit in enumerate(secuencia) if bit == 1]
    
    for i in range(len(indices_unos) - 1):
        # Contar cuántos 0s hay entre este 1 y el siguiente
        tamano = indices_unos[i + 1] - indices_unos[i] - 1
        huecos.append(tamano)
    
    secuencia_str = ''.join(map(str, secuencia))
    
    return secuencia_str, huecos


def prueba_huecos(datos: List[float], alpha: float, beta: float, nivel_confianza: float = 0.95) -> dict:
    """Ejecuta la prueba de huecos.
    
    Fórmula según las notas:
    Ei = h * (β - α) * (1 - (β - α))^i
    
    donde h es el número total de huecos.
    """
    n = len(datos)
    if n < 2:
        return {"error": "Se necesitan al menos 2 datos"}
    
    # Generar secuencia y encontrar huecos
    secuencia, huecos = generar_secuencia_huecos(datos, alpha, beta)
    
    if len(huecos) == 0:
        return {"error": "No se encontraron huecos en el intervalo especificado"}
    
    h = len(huecos)  # Número total de huecos
    p = beta - alpha  # Probabilidad de estar en el intervalo
    
    # Contar frecuencias observadas por tamaño de hueco
    max_hueco = max(huecos)
    frecuencias = {}
    
    # Agrupar huecos grandes en una categoría "≥5" según las notas
    limite_superior = 5
    
    for tamano in huecos:
        if tamano >= limite_superior:
            key = f">={limite_superior}"
        else:
            key = str(tamano)
        
        if key not in frecuencias:
            frecuencias[key] = 0
        frecuencias[key] += 1
    
    # Calcular valores esperados y chi-cuadrada
    # Ei = h * (β - α) * (1 - (β - α))^i
    chi2_componentes = []
    
    for i in range(limite_superior):
        key = str(i)
        o_i = frecuencias.get(key, 0)
        
        # Calcular Ei
        e_i = h * p * ((1 - p) ** i)
        
        # Componente de chi-cuadrada
        if e_i > 0:
            componente = ((e_i - o_i) ** 2) / e_i
        else:
            componente = 0
        
        chi2_componentes.append({
            "i": i,
            "o_i": o_i,
            "e_i": e_i,
            "componente": componente
        })
    
    # Categoría ≥5
    key_alto = f">={limite_superior}"
    o_i_alto = frecuencias.get(key_alto, 0)
    
    # Para ≥5, sumamos todas las probabilidades desde 5 en adelante
    # Usando serie geométrica: Σ(p*(1-p)^i) desde i=5 hasta ∞
    # = h * p * (1-p)^5 / (1 - (1-p)) = h * (1-p)^5
    e_i_alto = h * ((1 - p) ** limite_superior)
    
    if e_i_alto > 0:
        componente_alto = ((e_i_alto - o_i_alto) ** 2) / e_i_alto
    else:
        componente_alto = 0
    
    chi2_componentes.append({
        "i": key_alto,
        "o_i": o_i_alto,
        "e_i": e_i_alto,
        "componente": componente_alto
    })
    
    # Sumar todos los componentes
    chi2_calculado = sum(comp["componente"] for comp in chi2_componentes)
    
    # Grados de libertad = número de categorías - 1
    m = len(chi2_componentes)
    gl = m - 1
    
    # Valor crítico de chi-cuadrada
    # Tabla aproximada para α=0.05
    tabla_chi2 = {
        4: 9.488,
        5: 11.070,
        8: 15.507
    }
    
    alpha_sig = 1 - nivel_confianza
    chi2_critico = tabla_chi2.get(gl, gl + math.sqrt(2 * gl) * 1.96)
    
    # Decisión
    aceptada = chi2_calculado < chi2_critico
    
    return {
        "n": n,
        "intervalo": (alpha, beta),
        "p": p,
        "num_huecos": h,
        "secuencia": secuencia,
        "huecos": huecos,
        "frecuencias": frecuencias,
        "chi2_componentes": chi2_componentes,
        "chi2_calculado": chi2_calculado,
        "grados_libertad": gl,
        "chi2_critico": chi2_critico,
        "nivel_confianza": nivel_confianza,
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
            f"[bold cyan]Prueba de Huecos[/bold cyan]\n"
            f"n = {resultado['n']} datos\n"
            f"Intervalo (α, β) = {resultado['intervalo']}\n"
            f"Número de huecos (h) = {resultado['num_huecos']}\n"
            f"Nivel de confianza: {resultado['nivel_confianza']*100}%"
        ))
        
        # Mostrar secuencia (primeros 80 caracteres)
        seq_muestra = resultado['secuencia'][:80]
        if len(resultado['secuencia']) > 80:
            seq_muestra += "..."
        console.print(f"\n[yellow]Secuencia de 1s y 0s:[/yellow]\n{seq_muestra}\n")
        
        # Mostrar primeros huecos
        huecos_muestra = resultado['huecos'][:10]
        console.print(f"[yellow]Primeros huecos (cantidad de 0s):[/yellow] {huecos_muestra}\n")
        
        # Tabla de frecuencias y chi-cuadrada
        table = Table(title="Análisis de Huecos")
        table.add_column("i (tamaño)", style="cyan")
        table.add_column("Oi (observado)", style="yellow")
        table.add_column("Ei (esperado)", style="green")
        table.add_column("(Ei-Oi)²/Ei", style="magenta")
        
        for comp in resultado['chi2_componentes']:
            table.add_row(
                str(comp['i']),
                str(comp['o_i']),
                f"{comp['e_i']:.4f}",
                f"{comp['componente']:.4f}"
            )
        
        console.print(table)
        
        # Resultados finales
        console.print(f"\n[bold]Σ(Ei-Oi)²/Ei = {resultado['chi2_calculado']:.4f}[/bold]")
        console.print(f"χ² crítico (α={1-resultado['nivel_confianza']}, gl={resultado['grados_libertad']}) = {resultado['chi2_critico']:.4f}")
        
        if resultado['aceptada']:
            console.print("\n[bold green]✓ No se puede rechazar H₀[/bold green]")
            console.print(f"[green]{resultado['chi2_calculado']:.4f} < {resultado['chi2_critico']:.4f}[/green]")
            console.print("[green]Los huecos siguen la distribución esperada.[/green]")
        else:
            console.print("\n[bold red]✗ Se rechaza H₀[/bold red]")
            console.print(f"[red]{resultado['chi2_calculado']:.4f} >= {resultado['chi2_critico']:.4f}[/red]")
            console.print("[red]Los huecos NO siguen la distribución esperada.[/red]")
            
    except ImportError:
        print("\n" + "="*60)
        print("PRUEBA DE HUECOS")
        print("="*60)
        print(f"n = {resultado['n']}")
        print(f"Intervalo (α, β) = {resultado['intervalo']}")
        print(f"Número de huecos (h) = {resultado['num_huecos']}")
        
        seq_muestra = resultado['secuencia'][:80]
        if len(resultado['secuencia']) > 80:
            seq_muestra += "..."
        print(f"\nSecuencia:\n{seq_muestra}")
        
        print(f"\nPrimeros huecos: {resultado['huecos'][:10]}")
        
        print("\nAnálisis:")
        print(f"{'i':>5} {'Oi':>8} {'Ei':>12} {'(Ei-Oi)²/Ei':>15}")
        print("-" * 45)
        for comp in resultado['chi2_componentes']:
            print(f"{str(comp['i']):>5} {comp['o_i']:>8} {comp['e_i']:>12.4f} {comp['componente']:>15.4f}")
        
        print(f"\nχ² calculado: {resultado['chi2_calculado']:.4f}")
        print(f"χ² crítico: {resultado['chi2_critico']:.4f}")
        
        if resultado['aceptada']:
            print("\n✓ No se puede rechazar H₀")
        else:
            print("\n✗ Se rechaza H₀")
        print("="*60)


def main():
    print("Prueba de Huecos")
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
    
    # Definir intervalo (α, β)
    print("\nDefina el intervalo (α, β) para la prueba:")
    print("Ejemplo de clase: (0.8, 1.0)")
    
    try:
        alpha = float(input("α (límite inferior): ").strip() or "0.8")
        beta = float(input("β (límite superior): ").strip() or "1.0")
    except ValueError:
        print("Valores inválidos, usando (0.8, 1.0)")
        alpha, beta = 0.8, 1.0
    
    if alpha >= beta or alpha < 0 or beta > 1:
        print("Intervalo inválido. Debe ser 0 ≤ α < β ≤ 1")
        print("Usando valores por defecto (0.8, 1.0)")
        alpha, beta = 0.8, 1.0
    
    # Nivel de confianza
    nivel = input("Nivel de confianza (90, 95, 98, default=95): ").strip()
    niveles_map = {"90": 0.90, "95": 0.95, "98": 0.98}
    nivel_confianza = niveles_map.get(nivel, 0.95)
    
    # Ejecutar prueba
    resultado = prueba_huecos(datos, alpha, beta, nivel_confianza)
    
    if "error" in resultado:
        print(f"Error: {resultado['error']}")
        return
    
    mostrar_resultados(resultado)


if __name__ == '__main__':
    main()

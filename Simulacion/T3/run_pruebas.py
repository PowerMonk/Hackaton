"""Runner interactivo para las pruebas estadísticas de números pseudoaleatorios.

Este script permite seleccionar y ejecutar cualquiera de las pruebas
implementadas para verificar la calidad de los números pseudoaleatorios.
"""
import importlib


PRUEBAS = [
    ("1", "Prueba de Medias", "Prueba_medias"),
    ("2", "Prueba de Varianza", "Prueba_varianza"),
    ("3", "Prueba de Uniformidad (Kolmogorov-Smirnov)", "Prueba_uniformidad_KS"),
    ("4", "Prueba de Independencia (Corridas arriba y abajo)", "Prueba_independencia_corridas"),
    ("5", "Prueba de Series", "Prueba_series"),
    ("6", "Prueba de Huecos", "Prueba_huecos"),
]


def main():
    print("="*60)
    print("PRUEBAS ESTADÍSTICAS PARA NÚMEROS PSEUDOALEATORIOS")
    print("="*60)
    print("\nSeleccione una prueba:")
    
    for key, label, _ in PRUEBAS:
        print(f"{key}) {label}")
    
    print()
    choice = input("Selección (1-6): ").strip()
    
    module_name = None
    for key, _, mod in PRUEBAS:
        if key == choice:
            module_name = mod
            break
    
    if module_name is None:
        print("Selección inválida")
        return
    
    try:
        # Importar el módulo seleccionado
        mod = importlib.import_module(module_name)
    except Exception as e:
        print(f"Error al importar {module_name}: {e}")
        return
    
    # Ejecutar el main() del módulo
    if hasattr(mod, 'main'):
        print()
        mod.main()
    else:
        print(f"El módulo {module_name} no tiene función main()")


if __name__ == '__main__':
    main()

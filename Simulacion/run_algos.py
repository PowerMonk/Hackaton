import importlib


ALGORITHMS = [
    ("1", "Cuadrados medios", "Cuadrados_medios"),
    ("2", "Productos medios", "Productos_medios"),
    ("3", "Multiplicador constante", "Multiplicador_constante"),
    ("4", "Lineal congruencial (LCG)", "Lineal_congruencial"),
    ("5", "Congruencial multiplicativo", "Multiplicativo"),
    ("6", "Congruencial aditivo", "Aditivo"),
    ("7", "Congruencial cuadrático", "Congruencial_cuadratico"),
    ("8", "Blum, Blum y Shub", "Blum_Blum_Shub"),
]


def main():
    print("Elija un algoritmo:")
    for key, label, _ in ALGORITHMS:
        print(f"{key}) {label}")
    choice = input("Selección: ").strip()
    module_name = None
    for key, _, mod in ALGORITHMS:
        if key == choice:
            module_name = mod
            break
    if module_name is None:
        print("Selección inválida")
        return
    try:
        mod = importlib.import_module(module_name)
    except Exception as e:
        print(f"No se pudo importar {module_name}: {e}")
        return
    if hasattr(mod, 'main'):
        mod.main()
    else:
        print(f"El módulo {module_name} no expone main()")


if __name__ == '__main__':
    main()

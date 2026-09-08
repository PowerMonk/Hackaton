"""Cuadrados medios - implementación autónoma.

Este script pide al usuario la semilla, D y n, y genera los números usando el
método de cuadrados medios. 
"""
from typing import List


def middle_digits(value: int, d: int) -> int:
	s = str(abs(value))
	# Si el número tiene menos dígitos que D, rellena con ceros a la izquierda
	if len(s) < d:
		s = s.zfill(d)
	# Calcula la posición inicial para extraer los dígitos del centro
	start = (len(s) - d) // 2
	return int(s[start:start + d])


def normalize(x: int, d: int) -> float:
	"""Convierte el entero a número decimal entre 0 y 1."""
	return x / (10 ** d)


def mid_square(seed: int, d: int, n: int) -> List[float]:
	x = seed
	out = []
	for _ in range(n):
		# Paso 2: elevar al cuadrado
		y = x * x
		# Paso 3: extraer los D dígitos del centro
		x = middle_digits(y, d)
		# Paso 5: normalizar a r_i = 0.x_i
		out.append(normalize(x, d))
	return out


def ask_int(prompt: str) -> int:
	while True:
		try:
			return int(input(prompt))
		except Exception:
			print("Ingrese un entero válido")


def show(values: List[float]):
	"""Muestra los resultados en una tabla bonita si rich está disponible."""
	try:
		from rich.table import Table
		from rich.console import Console
		console = Console()
		table = Table(title="Cuadrados medios")
		table.add_column("i")
		table.add_column("r_i")
		for i, v in enumerate(values, start=1):
			table.add_row(str(i), f"{v:.6f}")
		console.print(table)
	except Exception:
		# Si no hay rich, usar salida simple
		print("Resultados:")
		for i, v in enumerate(values, start=1):
			print(i, f"{v:.6f}")


def main():
	print("Cuadrados medios")
	seed = ask_int("Semilla (entero): ")
	d = ask_int("D (dígitos a extraer): ")
	n = ask_int("Cantidad de números a generar: ")
	# Generar la secuencia
	vals = mid_square(seed, d, n)
	show(vals)


if __name__ == '__main__':
	main()


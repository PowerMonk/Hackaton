# T3 - Pruebas Estadísticas para Números Pseudoaleatorios

Este directorio contiene las implementaciones de las pruebas estadísticas para verificar la calidad de números pseudoaleatorios, correspondientes a la Unidad 3 del curso de Simulación.

## Pruebas Implementadas

### 1. Prueba de Medias (`Prueba_medias.py`)

Verifica que la media del conjunto sea aproximadamente 0.5.

- **Hipótesis nula:** M = 0.5
- **Fórmulas:**
  - Li = 0.5 - Z\_(α/2) × (1/√(12n))
  - Ls = 0.5 + Z\_(α/2) × (1/√(12n))

### 2. Prueba de Varianza (`Prueba_varianza.py`)

Verifica que la varianza sea aproximadamente 1/12.

- **Hipótesis nula:** σ² = 1/12
- **Fórmulas:**
  - Li = χ²(1-α/2, n-1) / [12(n-1)]
  - Ls = χ²(α/2, n-1) / [12(n-1)]

### 3. Prueba de Uniformidad - Kolmogorov-Smirnov (`Prueba_uniformidad_KS.py`)

Verifica que los números estén uniformemente distribuidos en [0,1].

- **Hipótesis nula:** ri ~ U(0,1)
- **Estadísticos:**
  - D+ = max(i/n - ri)
  - D- = max(ri - (i-1)/n)
  - D = max(D+, D-)

### 4. Prueba de Independencia - Corridas Arriba y Abajo (`Prueba_independencia_corridas.py`)

Verifica que los números sean independientes entre sí.

- **Hipótesis nula:** Los números son independientes
- **Fórmulas:**
  - M_Co = (2n - 1) / 3
  - σ²_Co = (16n - 29) / 90
  - Zo = |Co - M_Co| / σ_Co

### 5. Prueba de Series (`Prueba_series.py`)

Verifica la independencia mediante pares (ri, r(i+1)) en una cuadrícula.

- **Hipótesis nula:** Los pares están uniformemente distribuidos
- **Método:** Chi-cuadrada sobre cuadrantes de matriz m×m

### 6. Prueba de Huecos (`Prueba_huecos.py`)

Verifica los espacios entre números en un intervalo definido.

- **Hipótesis nula:** Los huecos siguen la distribución esperada
- **Fórmula:** Ei = h × (β - α) × (1 - (β - α))^i

## Uso

### Ejecutar pruebas individualmente

```powershell
# Prueba de medias
python Prueba_medias.py

# Prueba de varianza
python Prueba_varianza.py

# Etc...
```

### Ejecutar con el runner interactivo

```powershell
python run_pruebas.py
```

El runner te permite seleccionar la prueba que deseas ejecutar desde un menú.

## Dataset

El archivo `dataset100.txt` contiene 100 números pseudoaleatorios para probar.
Puedes agregar más datasets y especificar el archivo cuando ejecutes las pruebas.

## Dependencias

- **Opcional:** `rich` - Para tablas formateadas en consola
  ```powershell
  pip install rich
  ```

Si `rich` no está instalado, los scripts funcionan igual pero con salida de texto simple.

## Notas

- Todos los scripts son autocontenidos (no comparten utilidades)
- Cada script pide interactivamente los parámetros necesarios
- Los niveles de confianza típicos son: 90%, 95%, 98%, 99%
- Los resultados se comparan con las tablas estadísticas correspondientes

## Estructura de archivos

```
T3/
├── Prueba_medias.py
├── Prueba_varianza.py
├── Prueba_uniformidad_KS.py
├── Prueba_independencia_corridas.py
├── Prueba_series.py
├── Prueba_huecos.py
├── run_pruebas.py
├── dataset100.txt
├── Class_notes_T3.md
└── README.md
```

## Ejemplos de Salida

Las pruebas muestran:

- Valores calculados vs valores críticos
- Tablas de resultados detalladas
- Decisión: ✓ No se puede rechazar H₀ o ✗ Se rechaza H₀
- Explicaciones de los parámetros utilizados

---

Para más detalles sobre las fórmulas y la teoría, consulta `Class_notes_T3.md`.

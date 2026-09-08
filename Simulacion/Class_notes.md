## Unidad 2

Todos los números pseudoaleatorios van del 0 al 1 y representan algo dentro de un evento.

Asegurar que el conjunto de números que utilizaremos en una simulación se comporta de manera muy similar a un conjunto de números _totalmente aleatorios_; por ello es que se les denomina números pseudoaleatorios.

Un algoritmo va a generar número aleatorios durante su _ciclo de vida_.
_Independencia_ se refiere a que no tengan relación unos números con otros.
Los números tienen que estar _correctamente distribuidos_, de manera que su media sea 0.5 o se acerque lo más posible, esto nos asegura la uniformidad.

### Algoritmo de cuadrados medios

- **Paso 1** _Seleccionar una semilla_: $x_{0}$ con D dígitos donde $D > 3$
- **Paso 2**: $y_{0}$ = $x_{0}^{2}$
- **Paso 3**: obtener los $D$ dígitos del centro (de $x_{0}$)
- **Paso 4**: regresar al paso 2 hasta obtener los $n$ números deseados
  - Ejemplo:
    - $D = 4$
    - $x_{0} = 1400^2$
    - $y_{0} = 1960000$
    - $x_{1} = 9600^2$
    - $y_{1} = 92160000$
    - $x_{2} = 1600$
- **Paso 5**: Hacer $r_{i} = 0.x_{i}$ (cero punto $x_{i}$)

$r_{i}$ es el resultado, o el número aleatorio, se itera $n$ cantidad de veces y $n$ es _definido por el programador_, la cantidad de veces que se quiera iterar.

**Nota**: Si no es posible obtener los $D$ dígitos del centro del número $y_{0}$ agregue ceros a la izquierda del número $Y$.

_El profe me anotó con este ejercicio_.

### Algoritmo de productos medios

1. **Seleccionar $x_{0}$ con $D$ dígitos** (la cantidad de dígitos de la semilla). Ejemplo: $4862$
2. **Seleccionar $x_{1}$ con $D$ dígitos** (la cantidad de dígitos de la semilla). Ejemplo: $9315$
3. $y_{0} = x_{0}*x_{1}$. Resultado con este ejemplo: $45289530$
4. $x_{2} = D$ dígitos del centro de $y_{0}$. Resultado con este ejemplo: $2895$
5. $r_{1} = 0.x_{2}$ (cero punto $x_{2}$)
6. **Repetir** hasta obtener $r_{n}$

| $i$ | $y_{i}$  | $x_{i}$  | $r_{i}$ | Explicación(es)                         |
| --- | -------- | -------- | ------- | --------------------------------------- |
| 0   | 45289530 | **4862** | -       | Multiplicar $x_{0}$ y $x_{1}$           |
| 1   |          | **9315** | 0.2895  | colocarlos en $y_{i}$                   |
| 2   |          | 2895     |         | usar los dígitos del medio para $r_{i}$ |
| 3   |          |          |         | repetir.                                |

| $i$ | $y_{i}$    | $x_{i}$  | $r_{i}$ | Explicación(es)                                      |
| --- | ---------- | -------- | ------- | ---------------------------------------------------- |
| 0   | 45,289,530 | 4862     | -       | Al repetir tomamos los siguientes valores            |
| 1   | 26,966,925 | **9315** | 0.2895  | de $x_{n}$ y $x_{m}$, los resaltados en **negritas** |
| 2   |            | **2895** | 0.9669  | y repetir los pasos anteriores                       |
| 3   |            | 0.9669   |         |                                                      |

**Ejemplo con otras dos semillas**:

| $i$ | $y_{i}$       | $x_{i}$   | $r_{i}$ | Explicación(es)                    |
| --- | ------------- | --------- | ------- | ---------------------------------- |
| 0   | 2,150,652,008 | **65288** | -       |                                    |
| 1   |               | **32941** | 0.50652 | Agregamos un $0$ imaginario porque |
| 2   |               | 50652     |         | $D$ es 5 y $y_{0}$ tiene $D$ par   |
| 3   |               |           |         |                                    |

| $i$ | $y_{i}$       | $x_{i}$   | $r_{i}$ | Explicación(es)                      |
| --- | ------------- | --------- | ------- | ------------------------------------ |
| 0   | 2,150,652,008 | 65288     | -       |                                      |
| 1   | 1,668,527,532 | **32941** | 0.50652 | Agregamos otro $0$ imaginario porque |
| 2   |               | **50652** | 0.68527 | $D$ es 5 y $y_{1}$ tiene $D$ par     |
| 3   |               | 68527     |         |                                      |

| $i$ | $y_{i}$       | $x_{i}$   | $r_{i}$ | Explicación(es)                      |
| --- | ------------- | --------- | ------- | ------------------------------------ |
| 0   | 2,150,652,008 | 65288     | -       |                                      |
| 1   | 1,668,527,532 | 32941     | 0.50652 | Agregamos otro $0$ imaginario porque |
| 2   | 3,471,029,604 | **50652** | 0.68527 | $D$ es 5 y $y_{2}$ tiene $D$ par     |
| 3   |               | **68527** | 0.71029 |                                      |
| 4   |               | 71029     |         |                                      |

| $i$ | $y_{i}$       | $x_{i}$   | $r_{i}$ | Explicación(es)                      |
| --- | ------------- | --------- | ------- | ------------------------------------ |
| 0   | 2,150,652,008 | 65288     | -       |                                      |
| 1   | 1,668,527,532 | 32941     | 0.50652 | Agregamos otro $0$ imaginario porque |
| 2   | 3,471,029,604 | 50652     | 0.68527 | $D$ es 5 y $y_{3}$ tiene $D$ par     |
| 3   | 4,867,404,283 | **68527** | 0.71029 |                                      |
| 4   |               | **71029** | 0.67404 |                                      |
| 5   |               | 67404     |         |                                      |

| $i$ | $y_{i}$       | $x_{i}$   | $r_{i}$ | Explicación(es)                      |
| --- | ------------- | --------- | ------- | ------------------------------------ |
| 0   | 2,150,652,008 | 65288     | -       |                                      |
| 1   | 1,668,527,532 | 32941     | 0.50652 | Agregamos otro $0$ imaginario porque |
| 2   | 3,471,029,604 | 50652     | 0.68527 | $D$ es 5 y $y_{4}$ tiene $D$ par     |
| 3   | 4,867,404,283 | 68527     | 0.71029 |                                      |
| 4   | 4,787,638,716 | **71029** | 0.67404 |                                      |
| 5   |               | **67404** | 0.87638 |                                      |
| 6   |               | 87638     |         |                                      |

_El profe me anotó con este ejercicio_.

### Algoritmo de multiplicador constante

1. **Seleccionar $x_{0}$ con $D$ dígitos**. Ejemplo: 4862
2. **Seleccionar $a$ con $D$ dígitos**. Ejemplo: 9315
3. $y_{0} = x_{0}*a$
4. $x_{1} = D$ dígitos
5. $r_{1} = 0.x_{1}$ (cero punto $x_{1}$)
6. **Repetir** hasta obtener $r_{n}$

| $i$ | $y_{i}$        | $x_{i}$ | $r_{i}$      | Explicación(es)                                            |
| --- | -------------- | ------- | ------------ | ---------------------------------------------------------- |
| 0   | **45,289,530** | _4862_  |              | Multiplicar la semilla de $x_{0}$ por $a$, obtener $y_{1}$ |
| 1   | 26,966,925     | _2895_  | **_0.2895_** | tomar los $D$ dígitos y ponerlos en $x_{1}$,               |
| 2   | 90,066,735     | 9669    | 0.9669       | finalmente colocarlos con el punto $r_{i}$.                |
| 3   | 6,449,223      | 0667    | 0.0667       | _"Queda como escalerita"_                                  |
|     |                | 2131    | 0.2131       | Añadimos un $0$ imaginario a $y_{3}$                       |

Ejemplo con semillas: $x_{0} = 65288$ y $a = 32991$

| $i$ | $y_{i}$       | $x_{i}$ | $r_{i}$ | Explicación(es)                                                       |
| --- | ------------- | ------- | ------- | --------------------------------------------------------------------- |
| 0   | 2,153,916,408 | 65288   |         | Agregamos un $0$ imaginario a $y_{0}$, $y_{1}$, $y_{2}$, $y_{3}$ para |
| 1   | 1,778,742,756 | 53916   | 0.53916 | obtener los $D$ dígitos necesarios                                    |
| 2   | 2,597,777,322 | 78742   | 0.78742 |                                                                       |
| 3   | 3,225,761,007 | 97777   | 0.97777 |                                                                       |
| 4   | 849,881,151   | 25761   | 0.25761 |                                                                       |
| 5   |               | 98811   | 0.98811 |                                                                       |

_El profe me anotó con este ejercicio_.

### Algoritmo lineal

- $x_{i+1} = (ax_{i}+c) mod (m)$ el resultado de $x_{i+1}$ es _el residuo_, es decir, el _mod_ del _binomio entre $m$_
- $a$ es la constante multiplicativa
- $c$ es la constante aditiva
- $m$ es el módulo (residuo de una división)
  Todos los anteriores tienen que ser _enteros mayores que 0_
- $r_{i} = \frac{x_{i}}{m-1}$

Ejemplo semilla:
$x_{0}=4709$
$a=61$
$c=35$
$m=83$

| $i$ | $x_{i}$ | $r_{i}$ | $ax+c$  | $(ax+c)*mod(m)$ == **$x_{i}$**                         |
| --- | ------- | ------- | ------- | ------------------------------------------------------ |
| 0   | 4709    | -       | 287,284 | 21 _se "baja" a la siguiente fila ya que es $x_{i+1}$_ |
| 1   | 21      | 0.2561  | 1,316   | 71                                                     |
| 2   | 71      | 0.8658  | 4,366   | 50                                                     |
| 3   | 50      | 0.6097  | 3050    | 62                                                     |
| 4   | 62      | 0.7560  |         |                                                        |

Ejemplo con nuevas semillas:
$x_{0}=3307$
$a=962$
$c=104$
$m=103$

| $i$ | $x_{i}$ | $r_{i}$ | $ax+c$    | $(ax+c)*mod(m)$ == **$x_{i+1}$** |
| --- | ------- | ------- | --------- | -------------------------------- |
| 0   | 3307    | -       | 3,181,438 | 26                               |
| 1   | 77      | 0.7549  | 74,178    | 18                               |
| 2   | 18      | 0.1764  | 17,420    | 13                               |
| 3   | 13      | 0.1274  | 12,610    | 44                               |
| 4   | 44      | 0.4313  | 42,432    | 99                               |
| 5   | 99      | 0.9705  |           |                                  |

**Para sacar el residuo manualmente**: Dividir $ax+c$ entre $m$, el cociente, multiplicarlo por $m$, finalmente, restar $ax+c$ al cociente multiplicado por $m$.

_El profe me anotó con este ejercicio_.

#### Carson, Nelson y Nicol

$m=2^g$
$g=entero$
$a=1+4k$
$c=$ relativamente primo a $m$
$k=entero$

_Ejemplo_:
$x_{0}=1307$
$a=1+4k$ _= 97_
$k = 24$
$g=7$
$m=103$ _= 2^7 = 128_
$c=56$ _= 127_

Pedir _g, k_ y la _semilla_

### Algoritmo congruencial multiplicativo

$x_{i+1}=(ax_{i}) mod(m)$
$r_{i} = \frac{x_{i}}{m-1}$

Requisitos:
$m=2^g$
$g=entero$
$a=3+8k$ ó $5+8k$
$x_{0}=$ _número impar_
$k=entero$

$m=1,048,576$
$g=20$
$a=5+8k$ _= 61_
$x_{0}=8219$
$k = 7$

| $i$ | $ax_{i}$   | $x_{i}$ | $r_{i}$ | _Explicación_ |
| --- | ---------- | ------- | ------- | ------------- |
| 0   | 501,359    | 8219    | -       |               |
| 1   | 30,582,899 | 501,359 | 0.4781  |               |
| 2   | 10,625,895 | 174,195 | 0.1661  |               |
| 3   | 8,548,235  | 140,135 | 0.1336  |               |
| 4   | 9,737,247  | 159,627 | 0.1522  |               |
| 5   |            | 300,063 | 0.2861  |               |

$m=256$
$g=8$
$a=3+8k$ _= 19_
$x_{0}=5311$
$k = 2$

| $i$ | $ax_{i}$ | $x_{i}$ | $r_{i}$ | _Explicación_ |
| --- | -------- | ------- | ------- | ------------- |
| 0   | 100909   | 5311    | -       |               |
| 1   | 855      | 45      | 0.1764  |               |
| 2   | 1653     | 87      | 0.3411  |               |
| 3   | 2223     | 117     | 0.4588  |               |
| 4   | 3325     | 175     | 0.6862  |               |
| 5   |          | 253     | 0.9921  |               |

_Con este ejercicio el profe me anotó_.

### Algoritmo congruencial aditivo

$x_{i}=(x_{i-1}+x_{i-n})mod(m)$
$i=n+1,n+2+ ... + N$
$r_{i}=\frac{x_{i}}{m-1}$

Ejemplo:
$n=4$
$x_{1}=3050$
$x_{2}=1010$
$x_{3}=5315$
$x_{4}=2965$
$m=253$

_Puede variar la cantidad de dígitos en las distintas semillas_

Solve for $x_{5}$:
_Primer número_
$x_{5}=(x_{4}+x_{1})mod(m)$
$x_{5}=(2965+3050)mod(253)$
$x_{5}=6015mod(253)$
$x_{5}=196$
$r_{i}=\frac{196}{252}=0.7777778$

_Segundo número_
$x_{6}=(x_{5}+x_{2})mod(m)$
$x_{6}=(196+1010)mod(253)$
$x_{6}=1206mod(253)$
$x_{6}=194$
$r_{i}=\frac{194}{252}=0.7698$

_Tercer número_
$x_{7}=(x_{6}+x_{3})mod(m)$
$x_{7}=(194+5315)mod(253)$
$x_{7}=5509mod(253)$
$x_{7}=4$
$r_{i}=\frac{4}{252}=0.0158$

Ejemplo 2:
$n=6$
$x_{1}=1193$
$x_{2}=50360$
$x_{3}=368$
$x_{4}=5927$
$x_{5}=8768$
$x_{6}=60549$
$m=1150$

_Primer número_
$x_{7}=(x_{6}+x_{1})mod(m)$
$x_{7}=(60549+1193)mod(1150)$
$x_{7}=61742mod(1150)$
$x_{7}=792$
$r_{i}=\frac{792}{1149}=0.6892$

_Segundo número_
$x_{8}=(x_{7}+x_{2})mod(m)$
$x_{8}=(792+50360)mod(1150)$
$x_{8}=51152mod(1150)$
$x_{8}=552$
$r_{i}=\frac{552}{1149}=0.4804$

_Tercer número_
$x_{9}=(x_{8}+x_{3})mod(m)$
$x_{9}=(552+368)mod(1150)$
$x_{9}=51152mod(1150)$
$x_{9}=920$
$r_{i}=\frac{920}{1149}=0.8006$

_Cuarto número_
$x_{10}=(x_{9}+x_{4})mod(m)$
$x_{10}=(920+5927)mod(1150)$
$x_{10}=6847mod(1150)$
$x_{10}=1097$
$r_{i}=\frac{1097}{1149}=0.9547$

_Quinto número_
$x_{11}=(x_{10}+x_{5})mod(m)$
$x_{11}=(1097+8768)mod(1150)$
$x_{11}=9865mod(1150)$
$x_{11}=665$
$r_{i}=\frac{665}{1149}=0.5787$

_El profe me anotó con este ejercicio_

### Algoritmos congruenciales no lineales
#### Algoritmo congruencial cuadrático

$x_{i+1}=(ax_{i}^2+bx_{i}+c)mod(m)$
$r_{i}=\frac{x_{i}}{m-1}$

$m=2^g$ = 128
$a=$ *número par* = 6
$c=$ *número impar* = 3
$g=$ *número entero* = 7
$(b-1)mod(4)=1$ =10 *tienes que elegir un número que restándole uno y dividiéndolo entre 4, el módulo sea 1*

$x_{0}=6010$

| $i$ | $ax^2$                    | $bx$  | $ax^2+bx+c$ | $x_{i}$ | $r_{i}$ |
| --- | ------------------------- | ----- | ----------- | ------- | ------- |
| 0   | -                         | -     | -           | *6016*  | -       |
| 1   | $6(6016)^2 = 217,153,536$ | 60160 | 217,213,699 | 3       | 0.0236  |
| 2   | $6(3)^2=54$               | 30    | 87          | 87      | 0.6850  |
| 3   | $6(87)^2=45,414$          | 870   | 46,827      | 79      | 0.6220  |
| 4   | $6(79)^2=37,446$          | 790   | 38,239      | 95      | 0.7480  |
| 5   | $6(95)^2=54,150$          | 950   | 55,103      | 63      | 0.4960  |

Ejemplo:
$m=2^g$ = 1024
$a=$ *número par* = 306
$c=$ *número impar* = 121
$g=$ *número entero* = 10
$(b-1)mod(4)=1=406$
$x_{0}=61,142$

| $i$ | $ax^2$                       | $bx$      | $ax^2+bx+c$    | $x_{i}$ | $r_{i}$ |
| --- | ---------------------------- | --------- | -------------- | ------- | ------- |
| 0   | -                            | -         | -              | *6142*  | -       |
| 1   | $306(6142)^2=11,543,594,184$ | 2,493,652 | 11,546,087,960 | 533     | 0.5210  |
| 2   | $306(533)^2=86,931,234$      | 216,398   | 87,147,753     | 233     | 0.2277  |
| 3   | $306(233)^2=16,612,434$      | 94,598    | 16,707,153     | 593     | 0.5796  |
| 4   | $306(593)^2=107,604,594$     | 240,758   | 107,845,473    | 865     | 0.8455  |
| 5   | $306(865)^2=228,956,850$     | 351,190   | 229,308,161    | 769     | 0.7517  |
*El profe me anotó con este ejercicio*.

#### Algoritmo de Blum, Blum y Shub
$x_{i+1}=x_{i}^2mod(m)$
$r_{i}=\frac{x_{i}}{m-1}$

Semilla:
$x_{0}=7221$
$m=916$

| $i$ | $x_{i}^2$  | $x_{i}$ | $r_{i}$ |
| --- | ---------- | ------- | ------- |
| 0   |            | 7,221   |         |
| 1   | 52,142,841 | 457     | 0.4994  |
| 2   | 208,849    | 1       | 0.0010  |
| 3   |            |         |         |
| 4   |            |         |         |
| 5   |            |         |         |

Ejemplo:
$x_{0}=61,142$
$m=59,474$

| $i$ | $x_{i}^2$     | $x_{i}$ | $r_{i}$ |
| --- | ------------- | ------- | ------- |
| 0   |               | 61,142  |         |
| 1   | 3,738,344,164 | 46,420  | 0.7805  |
| 2   | 2,154,816,400 | 13,906  | 0.2338  |
| 3   | 193,376,836   | 26,862  | 0.4516  |
| 4   | 721,567,044   | 28,476  | 0.4788  |
| 5   | 810,882,576   | 14,060  | 0.2364  |
*El profe me anotó con este ejercicio*

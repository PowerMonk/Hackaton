## Unidad 3

### Verificación de números pseudoaleatorios

#### Propiedades de los números pseudoaleatorios

##### Media aritmética:

$$
\begin{aligned}
f(x) &= b - a \\
E(x) &= \int_{a}^{b} f(x)\,dx = \int_{a}^{b} \frac{a}{b - a}\,dx \\ \\
&= \frac{x^2}{2(b - a)} \Big|_{a}^{b} = \frac{b^2}{2(b-a)} - \frac{a^2}{2(b-a)} \\\\
&= \frac{1}{2(1-0)} - \frac{0}{2(1)} = \frac{1}{2}
\end{aligned}
$$

![[Pasted image 20251008174536.png]]

##### Varianza o dispersión:

El rango $+/-$ que se tiene respecto a la media para que oscile nuestra media

$$
\begin{aligned}
&\frac{\sum\limits_{i+1}^{n} (x_{i} - \overline{x})}{n - 1} \\
\\ &E(x)^2=S^2=E(x)^2-M^2 \\
\\ E(x) &= \int_{a}^{b} f(x)\,dx = \int_{a}^{b} \frac{x^2}{b - a}\,dx \\ \\
&= \frac{x^3}{3(b - a)} \Big|_{a}^{b} = \frac{b^3}{3(b-a)} - \frac{a^3}{3(b-a)} \\ \\
&= \frac{(b-a)^3}{3(b-a)} - \frac{(b-a)^2}{3} = \frac{1}{3} \\ \\
&E(x)^2= \frac{1}{3}-\frac{1}{4}=\frac{1}{12}
\end{aligned}
$$

![[Pasted image 20251008180524.png]]

##### Independencia:

![[Pasted image 20251008180636.png]]

##### Uniformidad:

### 1) prueba de medias

La hipótesis nula dice que la media de un conjunto de números pseudoaleatorios debe de ser de $M = 0.5$

Hipótesis nula: $H_{o}: M=0.5$
Hipótesis alternativa: $H_{i}: M \neq 0.5$

Fórmula para _la media_:

$\frac{\sum\limits_{i+1}^{n} x_{i}}{n}$

$L_{i} = 0.5-Z_{\frac{\alpha}{2}}(\frac{1}{\sqrt{12n}})$
$L_{s} = 0.5+Z_{\frac{\alpha}{2}}(\frac{1}{\sqrt{12n}})$

Necesitamos un rango donde puedan caer las medias de los datos

**Ejemplo**:
![[Pasted image 20251009184132.png]]

**Promedio**: 0.432515

Usamos el PDF con las tablas de distribución para verla de acuerdo con el _nivel de significancia_, de esta manera obtendremos $\alpha$ y podremos _obtener los limites inferiores y superiores_.

_0.05_ será nuestro nivel de significancia ya que nuestro _nivel de confianza_ es 95%
$\alpha$ será entonces _0.05_ (significancia, que quede claro!) y solamente tenemos que aplicar la _fórmula_ para $L_{i}$ y $L_{s}$

Finalmente, _restarlos a la media_ para obtener nuestros niveles de tolerancia.

Para _este_ ejemplo $n=40$ y se tiene un _nivel de confianza_ de $95$ _porciento_
También hay que tener en cuenta que, al usar la tabla, tenemos que buscar para _alpha_, el número que obtuvimos al hacer _alpha entre 2_

$$
\begin{aligned}
&95\,\,porciento\\
&Li = 0.5 - Z_{\frac{\alpha}{2}}(\frac{1}{\sqrt{12n}}) \\
&Ls = 0.5 + Z_{\frac{\alpha}{2}}(\frac{1}{\sqrt{12n}}) \\
&\alpha = \frac{0.05}{2}=0.025 = 1.96 \\
&-----------------\\
&Li = 0.5 - 1.96(\frac{1}{\sqrt{12(40)}}) = 0.410539 \\
&Ls = 0.5 + 1.96(\frac{1}{\sqrt{12(40)}}) = 0.589461 \\
\end{aligned}
$$

Para la _misma n_ pero $90$ y $98$ _porciento_ de confianza:

$$
\begin{aligned}
&90\,\,porciento\\
&\alpha = \frac{0.1}{2}=0.05 = 1.645 \\
&Li = 0.5 - 1.645(\frac{1}{\sqrt{12(40)}}) = 0.4249 \\
&Ls = 0.5 + 1.645(\frac{1}{\sqrt{12(40)}}) = 0.5750 \\
&-----------------\\
&98\,\,porciento\\
&\alpha = \frac{0.02}{2}=0.01 = 2.326 \\
&Li = 0.5 - 2.326(\frac{1}{\sqrt{12(40)}}) = 0.3938 \\
&Ls = 0.5 + 2.326(\frac{1}{\sqrt{12(40)}}) = 0.6061 \\
\end{aligned}
$$

![[Pasted image 20251009184054.png]]

El infinito se vuelve la distribución promedio.

Resultados _del profe_ para los distintos niveles de confianza

| N.C. | Intervalo |        | $Z$   |
| ---- | --------- | ------ | ----- |
| 90%  | 0.4249    | 0.5751 | 1.645 |
| 95%  | 0.4105    | 0.5895 | 1.96  |
| 98%  | 0.3938    | 0.6062 | 2.326 |

### 2) prueba de varianza

Hipótesis nula: $Ho=\sigma^2=\frac{1}{12}$
Hipótesis alternativa: $Hi=\sigma^2\neq\frac{1}{12}$

La _significancia_ aparece como $\pi$ en la tabla, la significancia es $x^2(1-\frac{\alpha}{2})$ para $Li$ y $x^2(\frac{\alpha}{2})$ para $Ls$

$Li=\frac{x^2(1-\frac{\alpha}{2}),\,n-1}{12(n-1)}$

$Ls=\frac{x^2(\frac{\alpha}{2}),\,n-1}{12(n-1)}$

_Ejemplo_: saquemos la media para el siguiente conjunto de números, tenemos que utilizar la _media_ ya que lo requiere la _fórmula para la varianza_

_Media_: 0.38832
_Números_: 0.23216, 0.09027, 0.4342, 0.80665, 0.37834

Se resta la media a todos los números del dataset, posteriormente se saca el cuadrado de cada resultado, finalmente se suman todos los cuadrados y se dividen entre $n-1$

$\overline{x}=0.38832$

|                               | $x$     | $x-\overline{x}$ | $(x-\overline{x})^2$ |
| ----------------------------- | ------- | ---------------- | -------------------- |
|                               | 0.23216 | -0.15616         | 0.0244               |
|                               | 0.09027 | -0.29806         | 0.0888               |
|                               | 0.4342  | 0.04588          | 0.0021               |
|                               | 0.80665 | 0.41833          | 0.175                |
|                               | 0.37834 | -0.00998         | 0.0001               |
| SUMATORIAS (cuando necesario) |         |                  | 0.2904               |

$\sigma^2=\frac{\sum\limits_{i=1}^{n} (x_{i}-\overline{x})^2}{4}=0.0726$

$Li=\frac{x^2(1-0.025),\,4}{12(4)} = \frac{0.484}{48} = 0.0101$

$Ls=\frac{x^2_{0.025},\,4}{12(4)} = \frac{11.14}{48}= 0.2321$

![[Pasted image 20251014165159.png]]

![[Pasted image 20251015131954.png]]
Para el dataset de _40 números_:

$\overline{x}=0.432515$

$\sum\limits_{i=1}^{n} (x_{i}-\overline{x})^2 = 3.391074031$

$\sigma^2=\frac{\sum\limits_{i=1}^{n} (x_{i}-\overline{x})^2}{39}=0.08695$

Nivel de confianza:
95% -> $\alpha=0.05$ -> $\frac{0.05}{2} = 0.025$

$x^2$ es el valor que se toma de la intersección de la tabla

$Li=\frac{x^2(1-0.025),\,39}{12(39)} = \frac{24.4}{468} = 0.0521$

$Ls=\frac{x^2_{0.025},\,39}{12(39)} = \frac{59.3}{468}= 0.1267$

Tomaré el $\phi$ como 40 porque _no hay 39 en la tabla_
Se toma la hipótesis nula porque la varianza está dentro del rango.

### 3) pruebas de uniformidad

$Ho = r_{i} \sim U(0,1)$ la U indica _uniformidad_, el $\sim$ que es _similar_

$Hi=r_{i}$ no es uniforme

#### Prueba chi ($\chi$) -cuadrada

$m$ es la _cantidad de clases_
$E$ es el _valor esperado_
$O$ es el _valor observado_

$$
\begin{aligned}
&X_{0}^2= \sum\limits_{i=1}^{m} \frac{(E_{i}-O_{i})^2}{E_{i}} \\ \\
&m = \sqrt{n} \\ \\
&si\,\, X_{0}^2 < X_{\alpha,\, m-1}^2\,\,no\,\,se\,\,puede\,\,rechazar\,\,H_{0}\\ \\
&|-|-|-|-|-|-|-|-|-|-| \\

&0\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,\,10

\end{aligned}
$$

$\frac{1}{m} = \frac{1}{10} = \frac{rango}{n\,clases} = 0.1$ esto es la _longitud de clase_

$E = \frac{n}{m} = \frac{100}{10} = 10$

Estamos usando el _dataset_ de 100 datos

$X_{0}^2= \sum\limits_{i=1}^{m} \frac{(E_{i}-O_{i})^2}{E_{i}}=6.2$
Nivel de _confianza_ = 95% -> $\alpha = 0.05$

$X_{0}^2 < X_{\alpha,\, m-1}$
_Recordar que la segunda x se calcula con m-1 siendo m la cantidad de clases_
$6.2 < 16.92$

| $i$ | intervalo clase | $E$        | $O$ | $E_{i}-O_{i}$ | $(E_{i}-O_{i})^2$ | $\frac{(E_{i}-O_{i})^2}{10}$ |
| --- | --------------- | ---------- | --- | ------------- | ----------------- | ---------------------------- |
| 1   | $[0,0.1)$       | 10         | 7   | 3             | 9                 | 0.9                          |
| 2   | $[0.1,0.2)$     | 10         | 9   | 1             | 1                 | 0.1                          |
| 3   | $[0.2,0.3)$     | 10         | 8   | 2             | 4                 | 0.4                          |
| 4   | $[0.3,0.4)$     | 10         | 9   | 1             | 1                 | 0.1                          |
| 5   | $[0.4,0.5)$     | 10         | 14  | -4            | 16                | 1.6                          |
| 6   | $[0.5,0.6)$     | 10         | 7   | 3             | 9                 | 0.9                          |
| 7   | $[0.6,0.7)$     | 10         | 11  | -1            | 1                 | 0.1                          |
| 8   | $[0.7,0.8)$     | 10         | 14  | -4            | 16                | 1.6                          |
| 9   | $[0.8,0.9)$     | 10         | 9   | 1             | 1                 | 0.1                          |
| 10  | $[0.9,1)$       | 10         | 12  | -2            | 4                 | 0.4                          |
|     |                 | $\sum=100$ |     |               |                   | $\sum=6.2$                   |

| $i$ | intervalo clase   | $E$       | $O$ | $E_{i}-O_{i}$   | $(E_{i}-O_{i})^2$ | $\frac{(E_{i}-O_{i})^2}{6}$ |
| --- | ----------------- | --------- | --- | --------------- | ----------------- | --------------------------- |
| 1   | $[0,0.1667)$      | 6.6667    | 9   | $-2.\overline3$ | $5.\overline4$    | $0.81\overline6$            |
| 2   | $[0.1667,0.3334)$ | 6.6667    | 8   | $-1.\overline3$ | $1.\overline7$    | $0.2\overline6$             |
| 3   | $[0.3334,0.5001)$ | 6.6667    | 6   | $0.\overline6$  | $0.\overline4$    | $0.0\overline6$             |
| 4   | $[0.5001,0.6668)$ | 6.6667    | 6   | $0.\overline6$  | $0.\overline4$    | $0.0\overline6$             |
| 5   | $[0.6668,0.8335)$ | 6.6667    | 5   | $1.\overline6$  | $2.\overline7$    | $0.41\overline6$            |
| 6   | $[0.8335,1.0002)$ | 6.6667    | 6   | $0.\overline6$  | $0.\overline4$    | $0.0\overline6$             |
|     |                   | $\sum=40$ |     |                 |                   | $\sum=1.7$                  |

$\frac{40}{6}=6.\overline6$
$2.91 < 11.07$
$X_{\alpha}^2\,,\,m-1$
$X_{0.05}^2\,,\,5 = 11.07$

La $X_{0}$ puede tomarse como la _base_ o el _resultado_ mediante el cual nos vamos a basar

$X_{0}^2 < X_{\alpha}^2,\,m-1$
$1.7< 11.07$ no se puede rechazar

![[Pasted image 20251022164747.png]]

#### Prueba Kolmogorov - Smirnov

1. Ordenar ascendentemente $r_{i}$
2. Calcular:
   $D^+ = max \,\, 1\le i\le n\,({\frac{i}{n} - r_{i}})$

   $D^- = max \,\, 1\le i\le n\,(r_{i}-\frac{i-1}{n})$

   $D = max(D^+,D^-)$

3. Determinar $D_{\alpha\, , \, n}$
4. Si $D < D_{\alpha\, ,\, n}$ no se puede rechazar $H_{o}$

![[Pasted image 20251022165824.png]]

Ejemplo:

0.97, 0.11, 0.65, 0.26, 0.98, 0.03, 0.13, 0.89, 0.21, 0.68

| $i$  | $\frac{i}{n}$ | $r_{i}$ | $\frac{i-1}{n}$ | $D^+ = \frac{i}{n} - r_{i}$ | $D^-=r_{i}-\frac{i-1}{n}$ |
| ---- | ------------- | ------- | --------------- | --------------------------- | ------------------------- |
| $1$  | 0.1           | 0.03    | 0.0             | 0.07                        | 0.03                      |
| $2$  | 0.2           | 0.11    | 0.1             | 0.09                        | 0.01                      |
| $3$  | 0.3           | 0.13    | 0.2             | 0.17                        | -0.07                     |
| $4$  | 0.4           | 0.21    | 0.3             | 0.19                        | -0.09                     |
| $5$  | 0.5           | 0.26    | 0.4             | _0.24_                      | -0.14                     |
| $6$  | 0.6           | 0.65    | 0.5             | -0.05                       | 0.15                      |
| $7$  | 0.7           | 0.68    | 0.6             | 0.02                        | 0.08                      |
| $8$  | 0.8           | 0.89    | 0.7             | -0.09                       | _0.19_                    |
| $9$  | 0.9           | 0.97    | 0.8             | -0.07                       | 0.17                      |
| $10$ | 1.0           | 0.98    | 0.9             | 0.02                        | 0.08                      |

$D^+=0.24$
$D^-=0.19$
$D=0.24$

_Basado en la tabla kolmogorov-smirnov_, con un _95%_ de confianza, siendo _n el número de datos_
$D_{\alpha\,,\,n}= 0.4093$
$D_{0.05\,,\,10}= 0.4093$

por lo tanto, no se puede rechazar $H_{0}$

![[Pasted image 20251022171827.png]]

Para el dataset de 40 números:

$D^+=0.1605$
$D^-=0.0125$
$D = 0.1605$
$D_{0.05\,,\,40}= 0.2101$

$0.1605 < 0.2101$ por lo tanto, _no_ se puede rechazar $H_{o}$

### 4) pruebas de independencia

$H_{o}$ Los números del $r_{i}$ son independientes
$H_{i}$ Los números del $r_{i}$ _no_ son independientes

#### Prueba de corridos arriba y abajo

$$
\begin {align}
M_{C_{o}} = \frac{2n-1}{3} \\ \\
\sigma^2_{C_{o}} = \frac{16n-29}{90} \\ \\
Z_{o} = |\frac{C_{o}-M_{C_{o}}}{\sigma_{C_{o}}}|
\end {align}
$$

Para calcular el número de corridas se realiza el siguiente procedimiento:

1. Se genera una cadena de 1s y 0s con las siguientes reglas:
   1. Se coloca un $0$ si el número $r_{i}$ es _menor o igual_ al número $r_{i}$ anterior, en caso contrario, se coloca un 1.
   2. Se contabilizan como corrida _cada secuencia del mismo número_ (todos los 0s consecutivos es una corrida)

Para este dataset
![[Pasted image 20251023183205.png]]

1-1-0-1-1-0-1-0-1-1-0-0-1-1-0-0-0-1-0-0-0-1-0-0-0-1-0-1-0-0-1-1-0-1-0-0-1-1-0

Aquí la _contabilización de la secuencia_ mencionada en el _paso 2_

![[Pasted image 20251023183521.png]]

De esta manera obtenemos $C_{o} = 24$, ahora solo tenemos que obtener y sustituir los valores para $M_{C_{o}}$ y $\sigma^2_{C_{o}}$

$M_{C_{o}} =\frac{2(40)-1}{3} = 26.\overline3$

$\sigma^2_{C_{o}} = \frac{16(40)-29}{90} = 6.789$

$\sigma_{C_{o}} = \sqrt{\sigma^2_{C_{o}}} = 2.6055$

$Z_{o} = |\frac{24-26.\overline3}{2.6055}| = 0.8846$

_Nivel de confianza_ de $95$%
$\alpha = 0.05$
$Z_{\frac{\alpha}{2}} = 0.025$
si $Z_{o} < Z_{\frac{\alpha}{2}}$ no se puede rechazar $H_{o}$
$0.8846 < 1.96$
El _1.96_ se obtiene de la tabla de t student o sumando fila y columna de la primera, al buscar $\frac{\alpha}{2}$

![[Pasted image 20251023184601.png]]

Dataset 2:

1-1-0-1-0-1-0-1-1-0-1-0-1-1-0-1-0-1-0-1-1-0-0-0-0-1-1-0-0-1-1-0-1-1-0-1-0-1-1

Co = 27
n = 40

$M_{C_{o}} =\frac{2(40)-1}{3} = 26.\overline3$

$\sigma^2_{C_{o}} = \frac{16(40)-29}{90} = 6.789$

$\sigma_{C_{o}} = \sqrt{\sigma^2_{C_{o}}} = 2.6055$

$Z_{o} = |\frac{27-26.\overline3}{2.6055}| = 0.2688$

_Nivel de confianza_ de $95$%
$\alpha = 0.05$
$Z_{\frac{\alpha}{2}} = 0.025$
si $Z_{o} < Z_{\frac{\alpha}{2}}$ no se puede rechazar $H_{o}$
$0.8846 < 1.96$
El _1.96_ se obtiene de la tabla de t student o sumando fila y columna de la primera, al buscar $\frac{\alpha}{2}$

#### Prueba de corridas arriba y abajo de la media

$$
\begin {align}
M_{C_{o}} = \frac{2n_{0}n_{1}}{n} + \frac{1}{2} \\ \\
\sigma^2_{C_{o}} = \frac{2n_{0}n_{1}(2n_{0}n_{1} - n)}{n^2(n-1)} \\ \\
Z_{o} = \frac{C_{o}-M_{C_{o}}}{\sigma_{C_{o}}}
\end {align}
$$

_si_ $-Z_{\frac{\alpha}{2}} \le Z_{0} \le Z_{\frac{\alpha}{2}}$

no se puede rechazar $H_{0}$,

para construir los 1s y 0s revisamos respecto al 0.5

![[Pasted image 20251028154816.png]]

1-_0-0_-1-_0_-1-1-1-_0_-1
_0-0_-1-1-_0_-1-_0-0_-1-_0_
_0_-1-_0-0-0_-1-1-1-1-1
1-_0-0-0-0-0-0_-1-1-1
1-1-1-1-1-_0-0-0_-1-1

$C_{0} = 21$
$n = 50$
$n_{0} = 23$
$n_{1} = 27$

$M_{C_{o}} = \frac{2(23)(27)}{50} + \frac{1}{2} = 25.34$

$\sigma^2_{C_{o}} = \frac{1242[1242 - 50]}{50^2(50-1)} = 12.0854$

$\sigma_{C_{0}} = 3.4764$

$Z_{o} = \frac{21-25.34}{3.4764} = -1.2484$

_Nivel de confianza_ de $95$%
$\alpha = 0.05$
$Z_{\frac{\alpha}{2}} = 0.025$

$-1.96 \le -1.2484 \le 1.96$

![[Pasted image 20251028160509.png]]

#### Prueba de Poker

0.111 **Todos**
0.125 **Todos Diferentes**
0.385 **Todos Diferentes**
0.484 **1Par**
0.1*00* (hay que rellenar si solo hay uno o dos dígitos) **1Par**
0.98*0* **Todos Diferentes**

0.11111 **Quinta**
0.12511 **Tercia**
0.38511 **1Par**
0.49449 **Full (tercia y par)**
0.98012 **TD**
0.98999 **Poker (porque son 4)**

3 dígitos

| Tipo             | Probabilidad |
| ---------------- | ------------ |
| Todos Diferentes | _0.72_       |
| 1P               | _0.27_       |
| Tercia           | _0.01_       |

4 dígitos

| Tipo             | Probabilidad |
| ---------------- | ------------ |
| Todos Diferentes | _0.504_      |
| 1P               | _0.432_      |
| Tercia           | _0.036_      |
| 2P               | _0.027_      |
| Poker            | _0.001_      |

5 dígitos

| Tipo             | Probabilidad |
| ---------------- | ------------ |
| Todos Diferentes | _0.3024_     |
| 1P               | _0.504_      |
| Tercia           | _0.072_      |
| 2P               | _0.108_      |
| Poker            | _0.0045_     |
| Full             | _0.009_      |
| Quinta           | _0.0001_     |

$\chi^2_{0} = \sum\limits_{i=1}^{m} \frac{(E_{i}-O_{i})^2}{E_{i}}$

Ejemplo:

|     | Tipo             | Probabilidad | $O_{i}$ | $E_{i}$ (valor esperado) | $\frac{(E_{i}-O_{i})^2}{E_{i}}$ |
| --- | ---------------- | ------------ | ------- | ------------------------ | ------------------------------- |
| 1   | Todos Diferentes | _0.3024_     | 8       | 9.072                    | 0.12667                         |
| 2   | 1P               | _0.504_      | 12      | 15.12                    | 0.6438                          |
| 3   | Tercia           | _0.072_      | 4       | 2.16                     | 1.5674                          |
| 4   | 2P               | _0.108_      | 3       | 3.24                     | 0.01777                         |
| 5   | Poker            | _0.0045_     | 0       | 0.135                    | 0.135                           |
| 6   | Full             | _0.009_      | 3       | 0.27                     | 27.6033                         |
| 7   | Quinta           | _0.0001_     | 0       | 0.003                    | 0.003                           |
|     |                  |              |         | $\sum = 30$              | $\sum = 30.0969$                |

_Ei_ es la probabilidad (el valor de _n_) por la _cantidad de datos_

$X_{0}^2 < X_{\alpha,\, m-1}$

$X_{0.05\,,\,6}^2 =12.59$

En este caso, nuestro valor de la sumatoria fue mayor que la chi cuadrada obtenida de la tabla, por lo tanto, se rechaza.

Tarea con dataset de 4 decimales, prueba de _poker_

|     | Tipo             | Probabilidad | $O_{i}$ | $E_{i}$ (valor esperado) | $\frac{(E_{i}-O_{i})^2}{E_{i}}$ |
| --- | ---------------- | ------------ | ------- | ------------------------ | ------------------------------- |
| 1   | Todos Diferentes | 0.504        | 23      | 20.16                    | 0.4000                          |
| 2   | 1P               | 0.432        | 17      | 17.28                    | 0.0045                          |
| 3   | Tercia           | 0.036        | 0       | 1.44                     | 1.44                            |
| 4   | 2P               | 0.027        | 0       | 1.08                     | 1.08                            |
| 5   | Poker            | 0.001        | 0       | 0.04                     | 0.04                            |
|     |                  |              |         |                          | $\sum = 2.9645$                 |

$X_{0}^2 < X_{\alpha,\, m-1}$

$X_{0.05\,,\,4}^2 =2.132$

$2.9645$ _no_ es menor que $2.132$

_corridas de arriba y abajo de la media_

0-0-_1_-0-_1-1_-0-0
_1-1_-0-_1_-0-0-0-0
0-0-_1-1-1-1-1-1_
_1_-0-0-_1-1_-0-0-0
0-0-0-0-0-0-0-0

$C_{0} = 13$
$n = 40$
$n_{0} = 25$
$n_{1} = 15$

$M_{C_{o}} = \frac{2(25)(15)}{40} + \frac{1}{2} = 19.25$

$2n_{0}n_{1} = 750$

$\sigma^2_{C_{o}} = \frac{750[750 - 40]}{40^2(40-1)} = 8.5336$

$\sigma_{C_{0}} = 2.9212$

$Z_{o} = \frac{13-19.25}{2.9212} = -2.1395$

_Nivel de confianza_ de $95$%
$\alpha = 0.05$
$Z_{\frac{\alpha}{2}} = 0.025$

Es menor que 1.96 por lo que no serviría este dataset

#### Prueba de series

1. Crear una gráfica (x,y) con _m_ cuadrados de forma que forme una _matriz cuadrada_ con valor de $\sqrt{n}$
2. Crear los puntos en la gráfica con $(r_{i},r_{i+1})$
3. Realizar prueba de _chi-cuadrada_

Para un dataset de 30 datos:

![[Pasted image 20251029165232.png]]

$\sqrt{n} = \sqrt{30} = 5.48 \sim 5$

Tenemos que escoger un número al cuadrado _mas arriba_ que el número de clases, en caso de que la raíz no se un cuadrado exacto, para este ejemplo _9_ (3x3)

La gráfica tiene que resultar una matriz cuadrada, por lo tanto la cantidad de los cuadros debe ser cercana a $\sqrt{n}$ pero no menor, por lo que será del cuadrado especificado anteriormente

Tomaremos los pares de coordenadas en orden descendente, por ejemplo

$(0.872,0.219)$
$(0.219,0.570)$
$(0.570,0.618)$
$(0.618,0.291)$
$(0.291,0.913)$
$(0.913,0.950)$ (el último de abajo agarra el primero de arriba)
$(0.950,0.041)$
$(0.041,0.842)$
$(0.842,0.512)$
$(0.512,0.151)$
$(0.151,0.511)$
$(0.511,0.343)$
$(0.343,0.036)$
$(0.036,0.706)$

Mi intento en geogebra (deberían ser _29_ valores):

![[Pasted image 20251029170642.png]]

_Resultado de la clase:_

![[Pasted image 20251029170530.png]]

La _cantidad de clases_ es igual a la _cantidad de cuadrantes_ de la matriz

_Ejemplo de enumeración de cuadrantes_

| 7   | 8   | 6   |
| --- | --- | --- |
| 4   | 5   | 6   |
| 1   | 2   | 3   |

$m$ figura como la _cantidad de clases_

| $i$ | $E_{i}=\frac{n-1}{m}$ | $O_{i}$ | $\frac{(E_{i}-O_{i})^2}{E_{i}}$ |
| --- | --------------------- | ------- | ------------------------------- |
| 1   | $3.\overline2$        | 2       | 0.4635                          |
| 2   | $3.\overline2$        | 4       | 0.1877                          |
| 3   | $3.\overline2$        | 4       | 0.1877                          |
| 4   | $3.\overline2$        | 3       | 0.0153                          |
| 5   | $3.\overline2$        | 6       | 2.3946                          |
| 6   | $3.\overline2$        | 2       | 0.4635                          |
| 7   | $3.\overline2$        | 5       | 0.9808                          |
| 8   | $3.\overline2$        | 1       | 1.5325                          |
| 9   | $3.\overline2$        | 2       | 0.4635                          |
|     |                       |         | $\sum =6.6891$                  |

Distribución normal es la distribución de la campana de Gauss, que es la distribución del infinito, esa es la estándar

$X_{0}^2 < X_{\alpha,\, m-1}$

El _valor calculado_ tiene que ser _menor_ que el _valor de la tabla_, se usa la tabla de _distribución_ $\chi^2$

Usando 95% de confianza y m-1 clases, que seria 8

$6.69<15.51$

![[Pasted image 20251029172420.png]]

#### Prueba de Huecos

1. Se define el intervalo $(\alpha,\beta)$
2. Se genera la cadena de 0's y 1's:
   1. 1 si $r_{i}\,\, \epsilon (\alpha.\beta)$
   2. 0 si 1 si $r_{i}\,\, \neq \epsilon (\alpha.\beta)$
3. Se contabilizan los huecos, es decir, todo entre dos 1's y su tamaño
4. Se realiza el estudio de chi-cuadrada con $E=(h)(\beta - \alpha)(1-(\beta-\alpha))^i$

![[Pasted image 20251029173140.png]]

Para el siguiente ejercicio, definiremos el intervalo arbitrario de $(0.8,1)$
![[Pasted image 20251029173550.png]]

_1-1_-0-0-0
0-0-0-0-_1_
0-_1_-0-_1_-0
0-0-0-0-0
0-0-0-0-_1_
_1_-0-0-0-_1_

Se cuentan los huecos aunque hayan dos 1's pegados, sería un hueco con cero 0's, son _7 huecos_ para este ejercicio

| Número de hueco                 | 1   | 2   | 3   | 4   | 5   | 6   | 7   |
| ------------------------------- | --- | --- | --- | --- | --- | --- | --- |
| **Cantidad de 0's en el hueco** | 0   | 7   | 1   | 1   | 10  | 0   | 3   |

| $i$     | $O_{i}$ (cantidad de huecos con $i$ 0's) | $E_{i}$                                     | $\frac{(E_{i}-O_{i})^2}{E_{i}}$ |
| ------- | ---------------------------------------- | ------------------------------------------- | ------------------------------- |
| 0       | 2                                        | $(7)(1-0.8)(1-(1-0.8))^0 = (7)(0.2)(0.8)^0$ | 0.2571                          |
| 1       | 2                                        | $(1.4)(0.8)^1$                              | 0.6914                          |
| 2       | 0                                        | $(1.4)(0.8)^2$                              | 0.896                           |
| 3       | 1                                        | $(1.4)(0.8)^3$                              | 0.1118                          |
| 4       | 0                                        | $(1.4)(0.8)^4$                              | 0.5734                          |
| $\ge 5$ | 2                                        | $(1.4)(0.8)^{\ge5}$                         | 5.1780                          |
|         |                                          |                                             | $\sum=7.7077$                   |

Le pusimos $\ge5$ porque eso nos reduce ampliamente la cantidad de clases, de la misma manera, usaremos 5 como el exponente para las clases altas a pesar de que sean 7 y 10 en este ejemplo

$E=(h)(\beta - \alpha)(1-(\beta-\alpha))^i$

$X_{0}^2 < X_{\alpha,\, m-1}$
$7.7077 < 9.49$

![[Pasted image 20251029180901.png]]

Tarea:

**prueba de series**: $\sum = \sum\frac{(E_{i}-O_{i})^2}{E_{i}} = 8.7688$
$8.7688 < 15.51$

**prueba de huecos**: $\sum = \sum\frac{(E_{i}-O_{i})^2}{E_{i}} = 9.6034$
Nivel de confianza = 95%
$\alpha=0.05$
$9.6034<11.07$

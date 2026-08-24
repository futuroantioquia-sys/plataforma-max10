# BRIEF · CONTABILIDAD Y FINANZAS
## Futuro Antioquia — Plataforma Max 10

> **Para qué sirve este documento:** es la memoria del proyecto. Al abrir un chat
> nuevo dedicado a contabilidad, adjunte este archivo. Con eso el asistente arranca
> sabiendo la infraestructura, las reglas del negocio, los errores ya detectados y
> lo que está pendiente — sin tener que redescubrirlo.
>
> **Última actualización:** 20 de agosto de 2026

---

## 1. REGLA DE ORO

> **Ningún pago se confirma ni se publica automáticamente.**
> El sistema propone y colorea. El botón lo oprime una persona.
> Esta regla la fijó la dirección de la institución y no se cambia sin su
> autorización expresa.

---

## 2. INFRAESTRUCTURA (verificada)

### Base de datos — Supabase

| | |
|---|---|
| **Proyecto ACTIVO** | `fykdyalpuydkwfjqguip` |
| Organización | `npcualkrzsnpcfvoimgi` — "Organización de futuroantioquia-sys" · **Plan Pro (8 GB)** |
| Región | AWS us-west-2 · conexión por `aws-1-us-west-2.pooler.supabase.com:5432` |
| Llave pública | `sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0` |
| **Proyecto VIEJO (no usar)** | `gsovtgtrsqzoruvgmhed` — org `ajxtoodorotvquttnsll`, plan gratis, **bloqueado por cupo**. Se conserva como respaldo. |

**Cuenta que administra Supabase:** `futuroantioquia@hotmail.com`, vinculada a GitHub
(**solo entra por "Continue with GitHub"**, no tiene contraseña propia).

> ⚠️ **EL CONECTOR DE SUPABASE DEL ASISTENTE ESTÁ MAL APUNTADO (20/08/2026).**
> Verificado: la conexión solo ve el proyecto **viejo** `gsovtgtrsqzoruvgmhed`
> (organización `ajxtoodorotvquttnsll`). Contra el proyecto activo responde
> *"You do not have permission to perform this action"*.
> **Consecuencia: el asistente NO puede consultar cifras, ni verificar cuadres,
> ni borrar filas en la base.** Todo diagnóstico sale de leer el código o de los
> pantallazos. Para recuperar esa capacidad hay que reconectar Supabase con la
> cuenta dueña de la organización nueva (`npcualkrzsnpcfvoimgi`).

> ⚠️ Existe una tercera organización huérfana, `futuroantioquia-max10's Org`, dueña del
> proyecto viejo, cuyo acceso se perdió (el administrador salió de la empresa). Por eso
> se migró todo. **No intentar recuperarla.**

### Publicación — Vercel

| | |
|---|---|
| Proyecto | `prj_igzwlM2OLpM5XADIIBgsMmQKOorl` · equipo `team_0prQNtpTrByeCVB2Xi58AcKG` |
| Dirección | https://plataforma-max10.vercel.app |
| Cuenta | `futuroantioquia@hotmail.com` (usuario `futuroantioquia-1234`) |
| Repositorio | github.com/futuroantioquia-sys/plataforma-max10 |

**Cómo se publica:** `VERCEL-DIRECTO.bat` en la raíz del proyecto. Entra a la carpeta
`frontend` y ejecuta `vercel --prod --yes`. **No publica desde GitHub**: sube los
archivos locales del computador.

### Proyecto en el computador

```
C:\Users\Lenovo\Claude\Projects\Plataforma max 100\
  ├── VERCEL-DIRECTO.bat      ← publicar en internet
  ├── PRENDER-LOCAL.bat       ← servidor local (localhost:3000)
  ├── RESPALDO\               ← respaldo completo (18/08/2026) + copias "ANTES" de
  │                             cada archivo que el asistente modifica
  └── frontend\src\
        ├── app\contabilidad\page.tsx                ← EL LIBRO
        ├── app\pagos\page.tsx                       ← Control de Pagos (cartera)
        ├── app\pagos-pendientes\page.tsx            ← soportes enviados por los papás
        ├── app\general\page.tsx                     ← Consolidado Afiliados
        ├── app\dashboard\page.tsx                   ← panel con los contadores
        ├── app\alumnos\[id]\estado-cuenta\page.tsx  ← estado de cuenta
        ├── lib\contabilidad.ts                      ← funciones del libro y el diccionario
        ├── lib\db.ts                                ← acceso a la base
        └── lib\utils.ts                             ← utilidades (incluye abrir PDF)
```

Stack: Next.js 14.2.4 · React · TypeScript · Tailwind · Supabase.

> ⚠️ `next.config.js` tiene `typescript.ignoreBuildErrors: true`. **La compilación no
> avisa de errores**: un error de código llega a producción y deja la pantalla en
> blanco. Toda revisión debe hacerse a mano.

---

## 3. TAMAÑO DE LA OPERACIÓN

| Concepto | Cantidad | Fecha |
|---|---|---|
| Deportistas | 1.165 | 19/08/2026 |
| Movimientos contables | 11.774 (tras borrar 6 filas basura) | 20/08/2026 |
| Diccionario de cuentas | 4.667 relaciones | 19/08/2026 |
| Conceptos contables | 63 | 19/08/2026 |
| Soportes de pago | 54 | 18/08/2026 |

### Estado del semáforo (19/08/2026, antes de los cambios de hoy)

| | |
|---|---|
| Confirmados | 6.639 |
| Verde | 1 |
| Amarillo | 1.075 |
| Rojo | 0 (⚠ ver nota) |
| Morado | 497 |
| Por confirmar / orientar | 496 |

> ⚠️ **Rojo en 0 NO significa que no haya abonos parciales.** Desde el 19/08 los
> pagos ya confirmados pierden el color. Los 1.726 pagos por debajo del 90% de la
> tarifa siguen ahí, escondidos dentro de los 6.639 confirmados. El error #1 sigue vivo.

### Cuentas bancarias

| Cuenta | Movimientos | Desde | Créditos |
|---|---|---|---|
| Bancolombia 613 | 9.438 | 18/11/2025 | $1.201.760.075 |
| Bancolombia 908 | 1.381 | 01/01/2026 | $189.050.694 |
| ST 823 | 426 | 27/02/2025 | $54.717.000 |
| OTRA CUENTA | 401 | 05/03/2026 | $17.074.151 |
| Bancolombia 382 | 47 | 15/12/2025 | $17.951.200 |
| Caja | 17 | 12/02/2025 | $2.863.000 |
| HERNAN | 13 | 06/03/2026 | $1.674.000 |

> Cifras de 19/08/2026. Bajaron un poco al eliminar las 6 filas de CUADRE
> (~$14,1 M en crédito y ~$201,9 M en débito eran inventados del Excel viejo).

---

## 4. REGLAS DEL NEGOCIO

### Tarifas (función `calcTarifa`, en estado-cuenta)

| Programa | Sede | Mensualidad | Con 10% |
|---|---|---|---|
| Estimulación | Niquía | $70.000 | $63.000 |
| Formación | Niquía | $115.000 | $103.500 |
| Resto | Niquía | $138.000 | $124.200 |
| Estimulación | Otras | $80.000 | $72.000 |
| Resto | Otras | $138.000 | $124.200 |

Verificado contra pagos reales de jun–ago 2026: cuadra exacto.
La columna `CUOTA_MANUAL` del deportista, si existe, **manda sobre esta tabla**.

### Ciclo de cobro

`MESES_CICLO` = **FEBRERO a DICIEMBRE 2026** (11 meses; enero no se cobra).
Más `MATRÍCULA 2026`, que no es mensualidad y no se compara contra la tarifa.

### Descuento del 10% (pronto pago)

Válido si: pagó ≥ 90% de la tarifa **y** hasta el día 5 del mes **y** sin meses
anteriores pendientes. Si no cumple, el estado de cuenta lo pinta naranja
("PAGÓ CON MAL DESCUENTO"). El administrador puede validarlo escribiendo el
literal `AUTORIZADO` en `v_cargado`.

### Becas

- Código que empieza por **`B`** (y no `MB`) = **BECADO**, no paga mensualidad.
- Código **`MB`** = **MEDIA BECA**. ⚠️ La función `esMediaBeca()` existe pero
  **nunca se invoca**: hoy a los `MB` se les cobra la tarifa completa. **Sin resolver.**

### Intereses del banco (nuevo, 20/08/2026)

Todo movimiento cuya descripción diga **ABONO INTERESES / INTERESES / RENDIMIENTOS**,
o cuyo concepto sea **INGRESO FINANCIERO**, no es de ningún deportista:
**nunca lleva código ni mes**, no se pinta de ningún color y no cuenta como pendiente.
Al subir el extracto se le quita el código aunque la referencia se parezca a una
cuenta del diccionario.

### Asignación del mes (consecutivo)

Al subir el extracto, el sistema **no usa la fecha del pago**: le asigna
**el siguiente mes del ciclo que el deportista no tenga cubierto**, mirando
`pagos_estado` y el libro. No rellena huecos hacia atrás.

⚠️ **Falla conocida:** el ciclo siempre arranca en FEBRERO, **sin mirar la fecha de
afiliación**. Un deportista afiliado en marzo recibe FEBRERO en su primer pago.

---

## 5. MODELO DE DATOS

### `cont_movimientos` — el libro
`id · banco · fecha · descripcion · referencia · debito · credito · saldo ·
concepto · codigo · deportista · detalle · dictado · origen · hash · creado`

- `codigo` = código del deportista (texto, ej. "26257"). Vacío ⇒ "por orientar".
- `detalle` = el mes ("AGOSTO 2026") o "MATRÍCULA 2026".
- `dictado` = **campo muerto**, no se usa en ninguna parte.
- `hash` = evita duplicados al resubir el mismo extracto.

### `cont_mapeo` — el diccionario
Relaciona **número de cuenta** o **nombre del titular** con el código del deportista.
Se alimenta solo: cada vez que alguien orienta un pago a mano, la cuenta queda guardada.

⚠️ Los pagos por **QR** y las referencias con `"null"` **nunca se cruzan solos**, a
propósito, porque la cuenta del QR es compartida. Siempre caen a "por orientar".

### `pagos_estado` — el estado de cuenta
`deportista_id · detalle · estado · v_cargado · v_pagado · destino · fecha`

- `estado`: `PEND` | `PAGÓ` | `PAGÓ CON 10%`
- `v_cargado` = lo que debe · `v_pagado` = lo que pagó
- Clave única: `(deportista_id, detalle)`

> ⚠️ **DOBLE LLAVE — muy importante.** El libro escribe con `deportista_id = código`
> ("26257"); la edición manual del estado de cuenta escribe con `deportista_id = UUID`
> (o `nuevo_…` en los afiliados por el formulario de la app). **Cualquier pantalla que
> lea esta tabla debe unir las dos llaves y aplicar estas reglas:**
> 1. Base = lo publicado bajo el **código**.
> 2. Encima = las ediciones manuales bajo el **ID interno**.
> 3. Un `PAGÓ` real **no lo pisa** una fila vieja en `PEND`/`PROX`, salvo un reverso
>    intencional (llega con `destino = 'REVERT'`).
> 4. Traducir nombres viejos: `MATRÍCULA` → `MATRÍCULA 2026`, `AGOSTO` → `AGOSTO 2026`…
>
> El estado de cuenta ya lo hacía; **Control de Pagos no**, y por eso un deportista
> aparecía pagado en su ficha y debiendo en el cuadro. Corregido el 20/08/2026.

### `soportes_pago` — comprobantes que suben los papás
`id · deportista_id · nombre · datos · fecha · meses · confirmado · fecha_confirmacion`

- `datos` = el archivo en base64 (`data:image/...` o `data:application/pdf...`).
- Las imágenes se comprimen antes de subir; **los PDF suben tal cual**.

### `facturas_solicitudes` — solicitudes de factura
`id · deportista_id · codigo · nombre_deportista · factura_nombre · cedula ·
direccion · ciudad · telefono · email · detalle · valor · observacion · estado`

- `estado`: `PEND` (pendiente por facturar) | `OK` (ya facturada).

### Observación de cartera (nuevo, 20/08/2026)
Se guarda dentro de las columnas del deportista, con la llave **`OBSERVACIÓN PAGOS`**.
No es una tabla aparte. Como Consolidado Afiliados arma sus columnas con todo lo que
tenga la ficha, esa columna puede aparecer también allá.

---

## 6. EL SEMÁFORO

Está en la pestaña **Libro** de Contabilidad. Colorea la celda del **mes** (columna
DETALLE) con fondo pastel y letra negra.

| Color | Regla |
|---|---|
| 🟢 **Verde** | Valor **exacto**: tarifa completa o tarifa −10%, y el mes le corresponde |
| 🟡 **Amarillo** | Falta el mes · mes repetido · **mes anterior a la afiliación** |
| 🔴 **Rojo** | El valor no cuadra (abono parcial o pago de más) |
| 🟣 **Morado** | Sin código: el diccionario no reconoce la cuenta |
| ⬜ **Sin color** | Ya confirmado · matrícula · becado · institucional · **interés del banco** |

**Botones de la barra del Libro:**

| Botón | Qué hace |
|---|---|
| Verde / Amarillo / Rojo / Morado | Filtran por color y muestran el conteo **de lo que falta** |
| **Confirmados (N)** | Cuenta y filtra lo ya publicado (pierde el color) |
| **✓ Confirmar los N verdes** | Publica en bloque solo los verdes. **No incluye matrículas.** |
| **🎓 Confirmar N matrículas** | Publica las matrículas pendientes (nuevo 20/08) |
| **🗑 Eliminar filas** | Borra filas por su N°, con confirmación y papelera (nuevo 20/08) |
| **↑ Actualizar estados de cuenta** | ⚠️ Publica TODO. Es el botón que da susto. |

**Funciones clave** en `contabilidad/page.tsx`:
`calcTarifaNum` · `mesDeAfiliacion` · `mesNumDeDetalle` · `tarifaPorCod` ·
`mesAfilPorCod` · `semaforo` · `cuentaSem` · `confirmadas` · `verdesPendientes` ·
`matriculasPendientes` · `confirmarVerdes` · `confirmarMatriculas` ·
`eliminarFilasPorNumero` · `esIngresoFinanciero` · `esNoAplica` · `PASTEL_SEM` · `COLOR_SEM`

> La `FECHA DE AFILIACIÓN` puede venir como **número de serie de Excel** (ej. `46102.71` =
> 21/03/2026). `mesDeAfiliacion` convierte los tres formatos: `dd/mm/aaaa`,
> `aaaa-mm-dd` y serie de Excel. **Lo que se guarda desde la plataforma es `dd/mm/aaaa`.**

---

## 7. ERRORES DETECTADOS — ESTADO

### 🔴 Sin resolver (ordenados por impacto)

**1. Los abonos parciales cierran el mes completo.**
El código calcula la proporción pagado/cargado y **descarta el resultado**: siempre
escribe `PAGÓ`. El estado `PAGÓ CON 10%` nunca se calcula.
**Medido: 1.726 pagos por debajo del 90% de la tarifa · faltante estimado $57.168.392.**
Ejemplos reales: NICOLAS GONZALEZ (26083) abonó $2.000 y cerró JUNIO; LEVON CASARES
(26189) abonó $8.000 y cerró JULIO.
⚠️ Como ya están confirmados, **hoy el semáforo no los muestra** (Rojo = 0).

**2. El mes no respeta la fecha de afiliación.**
**Medido: 3.029 pagos · 498 deportistas · $347.918.608** con mes anterior a la
afiliación. Caso verificado: RAYNER LONGARAY (26257), afiliado 21/03/2026, con un pago
de $138.000 marcado FEBRERO 2026.
*El semáforo los marca en amarillo. Ya se puede corregir la fecha desde Control de
Pagos, pero **cambiar la fecha NO reacomoda los meses ya cargados**.*
⚠️ Puede haber falsos positivos (reingresos con fecha actualizada). Revisar antes de tocar.

**3. La media beca no se aplica.** `esMediaBeca()` existe y nunca se llama.

**4. 497 ingresos sin identificar — $42.019.663.** 490 sin detalle alguno. Plata de
papás que pagaron y probablemente siguen apareciendo como morosos.
(La cifra baja al descontar los intereses del banco, que ya salieron del morado.)

**5. Un pago puede caer en la ficha equivocada.** Para buscar pagos, el sistema toma
**cualquier número de 4 o 5 dígitos** de las columnas del deportista como posible
código. Un consecutivo viejo o una talla mal digitada trae pagos ajenos.

**6. Meses duplicados no bloquean.** Se pintan en amarillo, pero al publicar **se suman**
en un solo `v_pagado`. (Siguen en amarillo aunque estén confirmados, a propósito.)

**7. "Actualizar estados de cuenta" publica TODO** — todos los movimientos de todas
las cuentas, no solo lo que se ve en pantalla.

**8. Autorizar un descuento borra el valor cargado** (`v_cargado` se usa como bandera
de texto `AUTORIZADO`, pisando la cifra).

**9. El papá solo ve sus soportes en el aparato donde los subió.** La lista del estado
de cuenta se lee de `localStorage`, no de la base. Desde otro celular le aparece vacío
aunque el soporte sí esté guardado y contabilidad lo esté viendo.

**10. Los PDF de soporte suben sin comprimir.** Un comprobante escaneado de 5 MB se
vuelve ~6,7 MB de texto en la base. Falta revisar si alguno quedó truncado.

### ✅ Ya corregido

**19–20 de agosto de 2026**

- **Semáforo de 4 colores + confirmar verdes** (18–19/08)
- **Validación de mes contra fecha de afiliación** (19/08)
- **Los pagos confirmados pierden el color** — el semáforo solo señala lo que falta.
  De paso se corrigió la doble llave: un pago confirmado a mano bajo el UUID ahora
  también se reconoce.
- **Los intereses de ahorro quedan sin código, sin mes y sin letrero morado.**
- **Botón 🗑 Eliminar filas** por N°, con vista previa, aviso si la fila ya está
  confirmada y papelera en el navegador (últimas 200). Antes **no había ninguna forma
  de borrar una fila del libro**.
- **Se eliminaron 6 filas de CUADRE** (N° 11775–11780) inventadas, heredadas del Excel.
- **Botón 🎓 Confirmar matrículas.** El botón de los verdes nunca las incluía —porque
  la matrícula no se compara contra la tarifa—, así que **las matrículas de los recién
  afiliados nunca llegaban al estado de cuenta**.
- **Los soportes de pago en PDF ya abren.** Los navegadores bloquean los enlaces
  `data:application/pdf`; ahora se convierten a archivo temporal (`blob:`). Se ven
  dentro del visor y también se pueden abrir o descargar. Arreglado en el panel de
  contabilidad y en la vista del papá.
- **Contador de Facturas Pendientes** en el panel, como el de soportes.
- **Control de Pagos: columna OBSERVACIÓN** editable (compromisos de pago, acuerdos),
  guardada en la ficha del deportista, con Guardar / Cancelar.
- **Control de Pagos: la FECHA DE INGRESO se edita** con confirmación (antes → después).
  Se refleja en Consolidado, ficha, estado de cuenta y semáforo, porque es un solo campo.
- **Control de Pagos ya no muestra deudas falsas** (regla de doble llave + traducción
  de nombres viejos, iguales a las del estado de cuenta).
- **Consolidado Afiliados: el N° de fila no se reinicia al filtrar**, y buscar/ordenar
  ya tienen en cuenta lo escrito y todavía sin guardar.

**Antes del 19/08**

- `cntD10` / `cntVer` sin definir en Subir Extracto → dejaba la pantalla en blanco
- 11 archivos apuntaban al proyecto Supabase viejo (incluidos los dos logins)
- La `SUPABASE_SERVICE_ROLE_KEY` no coincidía con la URL → módulo de pagos caído

### ⚪ Descartado como falsa alarma

- **"Los valores se dividen por mil"**: el error existe en el código (el punto se
  interpreta como decimal), pero **no ha dañado los datos**, porque Bancolombia
  entrega los valores como números y no como texto. Los 420 movimientos por debajo de
  $1.000 son **intereses de ahorro legítimos**. Verificado.
- **"Borrar las filas de CUADRE descuadra los totales"**: no. Eran datos inventados;
  al quitarlas los totales quedan más correctos, no menos.

---

## 8. PENDIENTES

**Contabilidad**
1. Que el abono parcial **no** cierre el mes → estado `PEND` con saldo, o `PAGÓ CON 10%`
2. Aplicar la media beca a los códigos `MB` (confirmar antes cuánto pagan)
3. Corregir la asignación del mes para que arranque en el mes de afiliación, y poder
   **reacomodar los meses de UN deportista** al que se le corrigió la fecha
4. Identificar los ingresos morados (el diccionario debe aprender de cada asignación)
5. Reemplazar el botón "Actualizar estados de cuenta" por uno que respete el semáforo
6. Interruptor **"incluir confirmados"** en el semáforo, para poder auditar lo ya
   publicado (hoy Rojo = 0 esconde los 1.726 abonos parciales)

**Soportes de pago**
7. Que el papá vea sus soportes desde cualquier aparato (leerlos de la base, no de
   `localStorage`)
8. Comprimir o limitar el tamaño de los PDF; revisar si alguno de los 54 quedó truncado

**Seguridad** (fuera de contabilidad, pero urgente)
9. **No existe `.gitignore`** y `.env.local` contiene la llave maestra de la base
10. Contraseñas de administrador escritas dentro del código (`api/auth/login/route.ts`)
11. Firma de sesión fija en `lib/session.ts` → permite fabricar cookie de administrador
12. `/api/deportistas`, `/api/profes`, `/api/jornada-proyecto` **sin autenticación**

**Operación**
13. 45 deportistas deben volver a subir 66 documentos (lista en Excel entregada 18/08)
14. Revisar `SUPABASE_SERVICE_ROLE_KEY` en las variables de Vercel
15. **Reconectar el conector de Supabase** a la organización nueva, para que el
    asistente pueda volver a consultar y verificar cifras (ver sección 2)

---

## 9. CÓMO TRABAJAR CON EL ASISTENTE

**Herramientas conectadas:** acceso a los archivos del computador · Vercel ·
Supabase **(hoy inservible: apunta al proyecto viejo, ver sección 2)**.

**Lo que funciona bien:**
- Mandar un **pantallazo** de la pantalla con el problema. Hoy es la forma más rápida
  de darle datos reales, ya que no puede consultar la base.
- Pedir que lea el código y explique por qué algo se comporta raro.
- Pedir agentes de auditoría para revisar código o cuadres.
- **Siempre exigir la verificación** antes de dar un diagnóstico por bueno. Ya pasó una
  vez: se diagnosticó un error de miles que no existía en los datos, y se dio por verde
  un febrero que no le correspondía al deportista.

**Cómo entrega los cambios:**
1. Modifica el archivo directamente en el computador.
2. Deja una copia del archivo anterior en `RESPALDO\...-ANTES-....tsx`.
3. Comprueba que el archivo compile antes de entregarlo (la compilación del proyecto
   no avisa de errores, así que esto se hace aparte).

**Antes de publicar cualquier cambio:**
1. Probar en local (`PRENDER-LOCAL.bat` → localhost:3000) con **Ctrl+F5**
2. Verificar el módulo tocado con datos reales
3. `VERCEL-DIRECTO.bat`
4. Comprobar en https://plataforma-max10.vercel.app con Ctrl+F5

**Nunca:**
- Confirmar o publicar pagos sin autorización expresa
- Tocar el proyecto Supabase viejo
- Publicar sin haber probado en local

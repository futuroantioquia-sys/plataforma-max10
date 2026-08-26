# PENDIENTES — Plataforma MAX 10 / Futuro Antioquia
*(al 25 de agosto de 2026, 5:00 p.m.)*

Claude: si retomas el trabajo, lee esto primero. Está en orden de importancia.

---

## 0. SIN PUBLICAR ⚠️ ← lo primero

Al cierre del 25/08 quedó guardado en el computador pero **NO publicado**:

- El **botón DESCARGAR PDF** de la Valoración Dinámica (baja el archivo solo a
  la carpeta de Descargas, sin la ventana de imprimir) y el sello
  **VALORACIÓN 1 / 2 / 3** al final del informe.
- `next.config.js`: permiso para bajar las librerías del PDF desde
  `cdnjs.cloudflare.com` y `cdn.jsdelivr.net`.

**Qué hacer:** correr `SUBIR-AHORA.bat`. Nada más. NO hay que instalar
librerías: se bajan solas de internet, igual que el lector de Excel.
(`INSTALAR-LIBRERIA-PDF.bat` quedó obsoleto y se puede borrar.)

---

## 0b. WHATSAPP AUTOMÁTICO — conversación abierta

El usuario preguntó el 25/08 cómo comprar el envío automático de los cobros por
WhatsApp. Se le explicó y dijo *"luego seguimos abordando el tema"*.
Resumen de lo dicho, para no repetirlo:

- Hoy la plataforma abre WhatsApp Web con el mensaje escrito y alguien oprime
  enviar. Gratis, pero manual.
- Para que envíe sola hay que contratar la **API de WhatsApp Business** de Meta.
- Costo: los cobros son categoría *utilidad*, unos **12 pesos por mensaje** en
  Colombia. Con 400 familias, unos $5.000 al mes. Lo caro es el intermediario
  ($20–80 USD/mes) si no se va directo con Meta (Cloud API, sin cuota mensual).
- **Ojo con el 1 de octubre de 2026:** Meta empieza a cobrar mensajes que hoy
  son gratis. Cualquier cuenta hay que hacerla con eso encima.
- Los tres frenos: (1) el número que se conecte **deja de servir en la app
  normal de WhatsApp**; (2) verificación de Meta Business con papeles de la
  academia; (3) los textos de *Botones de Cobro* tendrían que volverse
  **plantillas aprobadas** por Meta, con espacios `{{1}}`, no texto libre.
- Recomendación dada: Cloud API directo con Meta, y decidir primero el número
  dedicado, que es lo que frena a la mayoría.

---

## 1. VERIFICAR EL CÓDIGO DE IAN MAZO GALLEGO ⚠️

En la ficha (Total Afiliados) su código aparece como **26022**.
En el Libro Dinámico, la fila de APORTE FORMACIÓN · AGOSTO 2026 parecía
mostrar **28022**.

Puede ser la calidad de la foto, pero **si de verdad son distintos, ese pago
está pegado al código equivocado** y al publicarlo le entraría al estado de
cuenta de otro niño.

**Qué hacer:** buscar 26022 y 28022 en Total Afiliados y ver a quién pertenece
cada uno. Si el del libro está mal, corregir el código en esa fila antes de
publicar el pago.

---

## 2. Escribir de verdad los nombres que faltan en el libro

Hoy (25/08) se arregló que la columna DEPORTISTA saque el nombre del código
cuando la fila no lo tiene guardado. **Pero eso arregla lo que se ve, no lo que
está guardado**: en la base de datos esa casilla sigue vacía.

**Qué falta:** un botón que recorra el libro y escriba de verdad todos los
nombres que falten, igual que el de RECLASIFICAR CONCEPTOS. El usuario lo dejó
para más tarde.

---

## 3. Reconectar Supabase a la cuenta buena  ← lo desbloquea casi todo

La conexión de Claude a Supabase apunta a la cuenta **vieja**
(`futuroantioquia-max10`, proyecto `gsovtgtrsqzoruvgmhed`). La buena es
**`futuroantioquia-sys`**, proyecto `fykdyalpuydkwfjqguip`.

El usuario va a pedirle ayuda a alguien para reconectarla. Mientras tanto,
Claude no puede tocar la base de datos y le toca pedirle al usuario que corra
SQL a mano, cosa que él no sabe hacer con comodidad.

### YA ESTÁ TODO PREPARADO — solo faltan dos doble clic (25/08, 5 p.m.)

No hay que esperar a reconectar Supabase. Se dejaron listos dos botones en la
carpeta principal. **Van en este orden:**

1. **`PASO-1-CREAR-TABLAS.bat`** — abre Chrome con el SQL ya escrito en el
   proyecto BUENO. Crea `config_cobro` y `config_valoracion`, con sus permisos.
   El usuario debe decirle **NO** a la traducción de Chrome (si traduce, la
   página se daña), hacer clic sobre el texto de colores y oprimir
   **Ctrl+Enter**. Debe responder *Success. No rows returned*.
2. **`PASO-2-PASAR-TEXTOS-VALORACION.bat`** — trabaja solo (llama a
   `pasar-textos-valoracion.ps1`). Copia las 3 filas de configuración de
   Valoración de la base vieja a la buena. Es prudente: **si en la buena ya hay
   texto, no lo pisa**. Se puede correr varias veces.

**Después de esos dos pasos, Claude debe:** cambiar en
`frontend/src/lib/valoracion-textos.ts` las dos líneas `SB_URL` y `SB_KEY` por
las del proyecto bueno (están escritas dentro del propio archivo, en el
comentario de arriba), y publicar.

⚠️ **Por qué NO se cambió ya:** en la base buena todavía no existe
`config_valoracion`. Si se cambia antes de crearla, Gestión de Valoración se
queda sin poder guardar. Por eso se dejó apuntando a la vieja a propósito.

Dato útil: la base vieja tiene 3 filas (`descripciones`, `meta`, `categorias`),
la última tocada el 5 de agosto. Como la mudanza fue el 18, **nadie editó esa
pantalla después**: no se perdió nada.

- El resto del código ya se barrió: solo quedaban `valoracion-textos.ts` (este
  pendiente), un comentario en `supabase/client.ts` y la lista de imágenes
  permitidas en `next.config.js`. Los dos últimos son inofensivos.

---

## 4. El repositorio de GitHub está PÚBLICO

`github.com/futuroantioquia-sys/plataforma-max10` es público. Confirmado el
25/08 en los datos del despliegue de Vercel (`githubRepoVisibility: public`).

Cualquiera puede leer el código, los datos de conexión a Supabase que están
escritos dentro de los archivos, y el `DEVOLVER-CLAVES.sql` que se subió antes
(27 contraseñas cifradas).

Ponerlo privado son tres clics en GitHub y **no afecta a Vercel**, que sigue
publicando igual. El resto de pendientes de seguridad están en
`PASOS-SEGURIDAD.md`.

---

## 5. Rediseñar el Estado de Cuenta

`frontend/src/app/alumnos/[id]/estado-cuenta/page.tsx` — 1.866 líneas, todavía
con el diseño claro viejo (fondos blancos, grises, colores de Tailwind).

Hay que ponerle la paleta oficial, la misma de Pagos y Asistencia:
fondo `#333F50`, tarjetas `#3C4759`, campos `#2B3547`, franjas `#232B39`,
bordes `#4A5568`, verde `#00B050`, rojo `#C0504D`, ámbar `#E0A33A`.
Texto todo en BLANCO, negrilla solo en encabezados, botones siempre verdes.

Es trabajo largo: tiene muchas ventanas emergentes (pagar, soportes, revertir,
mal descuento, mensajes, factura).

---

## 6. Que todo funcione bien en el celular

El formador trabaja de pie en la cancha. Cuatro reglas ya acordadas:

1. La página NUNCA se desplaza en horizontal. Lo ancho se desliza dentro de su
   propio marco.
2. Todo lo que se toca mide 44 px de alto como mínimo.
3. En listas largas, CÓDIGO y NOMBRE quedan congelados a la izquierda.
4. En celular, lo que en computador va lado a lado baja uno debajo del otro.

**Ya está hecho en:** asistencia.
**Falta en:** microciclo (escenario y horario van lado a lado) y las pantallas
de los padres.

---

## 7. Destapar la Valoración para los padres

En `frontend/src/app/alumnos/[id]/page.tsx`, vista del padre: el botón
**VALORACIÓN** está marcado con `mant: true` y apunta a `/mantenimiento`.
Hoy ninguna familia puede ver la valoración de su hijo, aunque la pantalla
existe y está bien hecha (`/alumnos/[id]/seguimiento`).

**Antes de destaparlo:** si el deportista no tiene evaluación cargada, esa
pantalla muestra datos INVENTADOS con un sello ámbar que dice "Ejemplo". Hay
que reemplazar esa demo por un mensaje claro tipo *"El formador todavía no ha
registrado la valoración de tu deportista"*.

---

# CÓMO TRABAJAR CON ESTE USUARIO

- Hablar español. **No es programador.** No sabe copiar y pegar en editores de
  código ni en el SQL de Supabase. Lo que hace con confianza es **doble clic**
  en archivos.
- Por eso: hacer los cambios directamente en los archivos y decirle solo
  "oprima F5". No pedirle que edite código.
- Explicarle en palabras sencillas, sin jerga técnica.
- Cuando algo no se pueda, decírselo derecho y ofrecerle la alternativa.
- **Ojo:** ha habido varias conversaciones trabajando sobre los mismos
  archivos y pisándose una a la otra. Antes de escribir un archivo, verificar
  que no haya cambiado desde que se leyó.

## Botones de uso diario

| Para qué | Archivo |
|---|---|
| Prender la plataforma local | `PRENDER-LOCAL.bat` |
| Publicar en internet | `SUBIR-AHORA.bat` |
| Bajar cambios del otro PC | `ACTUALIZAR-DESDE-GITHUB.bat` |
| Respaldar la base de datos | `RESPALDO-AHORA.bat` |

Carpeta buena: `C:\Users\futur\Claude\Projects\Plataforma max 100`
Publicado en: https://plataforma-max10.vercel.app

---

# LO QUE SE HIZO EL 25 DE AGOSTO

- **Control de Pagos** rediseñado: paleta oficial, de 14 columnas a 7, becados
  en gris (ya no morado), se entra por el nombre, filo rojo en la fila que debe.
- **Botones de cobro por WhatsApp:** COBRAR UNO (solo debe el mes en curso) y
  COBRAR AHORA (atrasado). Van derecho a WhatsApp Web, sin la página intermedia
  de permiso, y todos usan la misma pestaña.
- **Cola de cobro:** casillitas para marcar varios y cobrarles de uno en uno.
- **Módulo Botones de Cobro** (Gestión): el administrador edita texto, color y
  mensaje. Falta la tabla — ver pendiente 3.
- **Cuenta de MAX 10:** los seis proyectos SUB 13, 14 y 15 de Selección y
  Desarrollo consignan a la 36000004823 (MAX 10 SPORT); el resto a Futuro
  Antioquia. Misma regla en Pagos y en Estado de Cuenta.
- **Total Afiliados:** dos columnas nuevas después de PROGRAMA — VALOR
  MENSUALIDAD y CONSIGNA A (A FUTURO / A MAX 10 / NO PAGA).
- **Botones de publicar arreglados:** apuntaban a la carpeta del PC viejo
  (`C:\Users\Lenovo\...`).
- **Lector de Excel arreglado** (`next.config.js`): la política de seguridad
  del 24/08 bloqueaba `cdn.sheetjs.com`. Desde esa mañana **toda** subida o
  descarga de Excel fallaba, para todos los usuarios, local y en internet.
- **Intereses en el libro contable:** la regla buscaba "INTERESES" en plural y
  el banco escribe "AJUSTE INTERES AHORROS CR" en singular. Ahora busca
  INTERES. En crédito → INTERESES A FAVOR; en débito → INTERESES FINANCIEROS.
  El DETALLE va vacío en todos los conceptos del banco: solo lleva mes cuando
  quien paga tiene código de deportista.
- **Nombre del deportista en el libro:** se mostraba solo el nombre guardado,
  que se congela al subir el extracto. Ahora, si falta, se saca del código
  (en la tabla, en el filtro y en la exportación a Excel).

---

# LO QUE SE HIZO EL 25 DE AGOSTO, POR LA TARDE

**Informes que no aparecían (el reclamo de los profes).** Eran cuatro causas
distintas, no una:

1. `saveEvaluacion` se tragaba los errores: decía "¡Guardado!" aunque el
   servidor hubiera fallado. Ahora lanza el error de verdad.
2. Al leer el historial, si la consulta fallaba, la app se iba callada a la
   copia vieja del teléfono y mostraba "Aún no hay valoraciones". Ahora
   reintenta y, si falla, lo dice.
3. Control de Informes ignoraba los informes sin número. Ahora los acomoda por
   fecha en los puestos libres.
4. Después de guardar, la pantalla **comprueba contra el servidor** que el
   informe quedó, y muestra un aviso verde fijo con cuántos tiene el deportista
   (antes era un parpadeo de 2 segundos en el botón).
   Y el **número de informe pasó a ser obligatorio** para poder guardar.

**Velocidad.** Se encontró que la app bajaba, en cada carga, la **foto en
base64 de los 1.163 deportistas** — decenas de megas — incluso en pantallas
donde no se ve ninguna foto. Ahora las fotos, el resumen de documentos y el
resumen de informes se piden **solo del proyecto abierto**. "Mis Proyectos" ya
no baja ninguna ficha: le pide el conteo al servidor de Vercel
(`/api/deportistas?conteo=`) y lo guarda en el teléfono para la próxima.
Total Afiliados dibuja la tabla **de a 80 filas**, no las 1.167 de golpe: eso
era lo que trababa el mouse.

**Perfil del formador.** Encabezado del proyecto en un renglón (sin el botón de
inicio, con el grupo en dos líneas SUB/8A); cambio de proyecto **dentro de
Asistencia**, al lado del MES; y botón **DESCARGAR PDF** en la Valoración
Dinámica que baja el archivo solo, sin la ventana de imprimir.

**Administradores.** Nuevo tipo **Acceso total** (entra a todo, Finanzas
incluida; lo único reservado a ADMON es la pantalla de administradores).
⚠️ Si al guardar uno sale un error que mencione `tipo` o `check`, es que la
tabla `admins` tiene una restricción vieja y hay que ampliarla con SQL.
De paso: al administrador **deportivo** le faltaba estar en la lista de
sesiones válidas de `/api/deportistas`, y por eso cargaba por el camino lento.

**Listas desplegables de Total Afiliados.** Salían blancas sobre blanco: la
letra de la tabla es blanca y la lista del navegador se abre sobre fondo
blanco. Ahora las opciones llevan letra oscura.

## Nota de método para el próximo Claude

Este día se cometió un error que conviene no repetir: se hicieron cambios en la
copia de trabajo, se mostraron vistas previas al usuario, y **no se guardaron en
su computador**. El usuario publicó y el commit decía "1 file changed" cuando
debían ser tres. **Después de cada cambio, guardarlo de una en su carpeta y
decírselo explícitamente**, aunque venga una vista previa detrás.

Y los `.bat`: se deben escribir con **fin de línea de Windows (CRLF) y sin
tildes ni eñes**. Un `.bat` con saltos de línea de Linux hace que cmd se coma
letras ("cho" en vez de "echo") y el archivo no sirve.

# PENDIENTES — Plataforma MAX 10 / Futuro Antioquia
*(al 25 de agosto de 2026, 1:30 p.m.)*

Claude: si retomas el trabajo, lee esto primero. Está en orden de importancia.

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

**Cuando esté reconectada, hacer de una:**

- **Crear la tabla `config_cobro`.** Sin ella, el módulo *Botones de Cobro*
  (Gestión → Botones de Cobro) muestra los textos pero **no puede guardar**.
  El SQL ya está listo en `CREAR-TABLA-BOTONES-COBRO.bat`.
- **Arreglar `frontend/src/lib/valoracion-textos.ts`.** Apunta al proyecto
  **viejo** (`gsovtgtrsqzoruvgmhed`). O sea que lo que se edite en
  *Gestión de Valoración* se está guardando en la base muerta.
  ⚠️ **No cambiar la dirección a ciegas:** primero hay que confirmar que la
  tabla `config_valoracion` exista en el proyecto bueno. Si no existe, crearla
  antes; si se cambia sin más, deja de guardar del todo y queda peor que hoy.
- **Barrer el resto del código** buscando otras cosas que sigan mirando al
  proyecto viejo.

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

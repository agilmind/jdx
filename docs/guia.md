# Guía de JDX para sociedades de gestión

JDX es un archivo JSON que acompaña cada entrega de obras a una sociedad de
gestión: quién creó cada obra, de quién es, quién cobra y bajo qué contrato.
Esta guía dice qué llega, cómo se valida y cómo se carga. El detalle de cada
campo está en la [referencia de campos](campos.md).

## 1. Qué llega en una entrega

```
entrega/
  3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json       la declaración
  3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json.jws   su firma
  00034-001-CTTO_2-obras.pdf                             los archivos que describe
  Chacarera-del-Rancho.mp3
```

- **La declaración** se llama `<declaration.id>.r<revision>.jdx.json`. Es
  UTF-8 sin BOM, sin claves repetidas y sin `null` (lo que no se sabe se
  omite), y pesa a lo sumo 2 MiB.
- **La firma** va al lado, en `.jws` (sección 7).
- **Los archivos** (contratos, audios, ejemplar) están en `media`, cada uno con
  su `path` relativo a la raíz de la entrega, su `size` y su `sha256`.
- **El canal no es parte de JDX:** carpeta compartida, API o lo que acuerden el
  emisor y la sociedad. Si llega archivo por archivo, el `.jws` llega último y
  marca la entrega completa.

Cada reenvío es completo: el mismo `declaration.id` con una `revision` mayor.
La sociedad reemplaza la declaración entera y descarta las revisiones que ya
procesó. Los archivos de entregas anteriores se vuelven a declarar, con la
revisión en que viajaron (`delivery`).

## 2. Qué trae el archivo

```json
{
  "$schema": "https://jdx.jupiter.ar/schema/1.0/jdx.schema.json",
  "jdx": "1.0",
  "declaration": { "id": "…", "revision": 1, "createdAt": "…", "issuer": { … } },
  "parties": [ … ], "works": [ … ], "recordings": [ … ],
  "agreements": [ … ], "media": [ … ], "edition": { … }
}
```

| Lista | Qué trae | Dónde va en la base de la sociedad |
|---|---|---|
| `declaration` | Id estable, revisión, emisor, destinatarios | La presentación |
| `parties` | Personas y organizaciones, una vez cada una | Personas, socios, editoras |
| `works` | Obras, con `contributors`, `authorship` y `shares` | Obras, autores, titularidad, reparto |
| `recordings` | Grabaciones: ISRC, intérpretes, productores | Fonogramas |
| `agreements` | Contratos de edición, subedición, cartas de reparto | Contratos |
| `media` | Archivos descritos por tamaño y hash | Documentos |
| `edition` | La edición publicada; si falta, son obras no editadas | Ediciones |

Los objetos se citan por su `id` local (`"party": "p1"`), que solo vale dentro
del archivo. Para reconocer a una persona, una obra o un contrato entre
archivos están los identificadores: IPI, ISWC, CUIT, el código de la sociedad,
el `uid` del contrato.

Ejemplo completo: [`ejemplo/3f2c9a1e-….r1.jdx.json`](ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json).

## 3. Cómo se valida

Hoy, desde este repositorio, se controla el JSON y el schema estricto:

```sh
npm run validate -- entrega/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json
```

El validador de referencia `jdx` (en construcción) suma las reglas del perfil,
la firma, los archivos de la entrega y el historial de la sociedad, y escribe
el reporte:

```sh
jdx validate entrega/3f2c9a1e-….r1.jdx.json --env production --profile sadaic/0.1 \
  --dir entrega --trust-list jdx-trust.json --state-dir estado \
  --received-at 2026-09-30T09:12:00-03:00 --report 3f2c9a1e-….r1.report.json
```

Con `--dir`, cada `path` se busca en la carpeta local de la entrega por su
nombre exacto o, si no está, por el único que coincide sin distinguir
mayúsculas de A a Z; un enlace nunca se sigue. Un archivo de la carpeta que no
está declarado da `JDX-MED-003` (un byte de un nombre que no es UTF-8 válido, y
la barra invertida, van como `\xHH`), salvo los de JDX, que son archivos de
la raíz (`<id>.r<n>.jdx.json`, su `.jws`, su `.report.json` y `jdx-trust.json`),
y los que la sociedad ignora con `--ignore` (repetible): sin `/` el patrón mira
el nombre, con `/` la ruta desde la raíz; `*` no cruza carpetas y `**` cubre
cero o más.

La carpeta no puede cambiar mientras se valida: se valida una copia. Una
carpeta que no se puede usar (no existe, algo de adentro no se puede leer,
tiene más de 100 000 entradas o cambió durante la validación) da
`JDX-ENV-011` con la causa y el lugar: es una falla del entorno (salida 2),
porque lo que no se lee podría esconder archivos.

| Capa | Qué controla | Qué da |
|---|---|---|
| Entorno | Opciones, perfil, lista de confianza, estado, carpeta de la entrega | Salida 2; el archivo no se evalúa |
| JSON y schema | I-JSON, estructura, formatos, listas cerradas | Error |
| Núcleo | Referencias, hashes, nombre del archivo, firma inválida, revisiones | Error |
| Perfil | Las reglas de la sociedad | Aviso en `sadaic/0.x`, error desde `sadaic/1.0` |
| Política | Firma ausente, perfil no declarado, lista por vencer | Lo gradúa la sociedad |

Las reglas tienen códigos `JDX-<ÁREA>-<NNN>` que nunca se reutilizan (por
ejemplo, `JDX-AGR-003`: un contrato da a la editora más que el tope). El
catálogo, con cada regla y su mensaje en español, portugués e inglés, está en
[`catalog/1.0/rules.json`](../catalog/1.0/rules.json), y el vocabulario que
comparten los mensajes, en [`catalog/1.0/terms.json`](../catalog/1.0/terms.json).
Cada mensaje es una plantilla que se llena con los `params` y el `context` del
resultado:

- `{x}`: el valor de `params.x` o, si no está, de `context.x`. Los números van
  con coma decimal en español y portugués, las listas separadas por comas, y
  lo que falta queda vacío.
- `{x:right}`, `{x:part}`, `{x:field}` y `{x:reason}`: el término del valor en
  `terms`, que se llena con los mismos datos; un valor sin término va tal cual.
  Un término al comienzo del mensaje va con mayúscula inicial.
- `{x:flag}`: el término `terms.flag.x` si `x` es `true`; si no, nada.
- `{x:others}`: nada si `x` es 1, `others.one` si es 2 y `others.many` si es
  más, con `{count}` igual a `x` − 1.
- `{x:paren}`: el valor entre paréntesis, con un espacio delante, o nada.

## 4. Cómo se lee el resultado

| Salida | Significa | Qué hace la sociedad |
|---|---|---|
| 0 | Sin errores | Carga o ignora, según `disposition` |
| 1 | El archivo o la entrega tienen errores | Rechaza |
| 2 | Falla el entorno (lista vencida, perfil desconocido) | Frena y avisa, sin rechazar |
| 3 | Falla interna del validador | Reintenta y avisa |

El reporte (`<id>.r<n>.report.json`, schema en
[`jdx-report.schema.json`](../schema/jdx-report.schema.json)) dice qué hacer y
por qué. Un extracto:

```json
{ "jdxReport": "1.0", "valid": true, "disposition": "ingest", "exitCode": 0,
  "signature": { "status": "verified", "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E" },
  "summary": { "error": 0, "warning": 1, "info": 0 },
  "results": [ { "ruleId": "JDX-AGR-003", "level": "warning",
                 "instanceLocation": "/agreements/0/publisherShare/percent",
                 "params": { "percent": 30, "cap": 25 } } ] }
```

- `disposition`: `ingest` (cargar), `ignore` (revisión ya cargada) o `reject`.
- Cada resultado dice la regla, el nivel, dónde está el dato (puntero JSON) y
  sus parámetros. Se decide por `disposition`, `ruleId` y `params`, nunca por
  el texto de `message`.
- De cada regla se listan a lo sumo 100 resultados, los primeros en el orden
  del reporte. `omitted` dice de cuáles quedaron afuera y cuántos; `summary`,
  la salida y `checks` los cuentan a todos.
- `jdx ack` registra la recepción en el estado de la sociedad y deja el
  reporte listo para devolverlo al emisor por el mismo canal.

## 5. Cómo se cargan los datos

1. Si `disposition` es `ingest`, reemplazar la declaración entera por esta
   revisión. Si es `ignore`, no cargar nada.
2. Cargar `parties` primero; después `works` con sus derechos, `recordings`,
   `agreements`, `media` y `edition`, resolviendo cada referencia por su `id`.
3. Guardar los valores de las listas abiertas como texto: pueden llegar
   valores nuevos o propios (`X_…`) sin cambio de schema.
4. Leer los porcentajes como decimal exacto (por ejemplo, `NUMERIC(7,4)`),
   nunca como punto flotante.
5. Ignorar las propiedades que no se conocen: vienen de una versión menor más
   nueva o de `extensions`.
6. Guardar con la declaración el estado de su firma (`signature.status`).
7. Devolver el reporte al emisor.

## 6. Los derechos de una obra

Ana escribió toda la música y Beto toda la letra. Editorial Sur representa a
Ana con el 25 % (contrato `a1`) y Editorial Norte a Beto con el 30 % (`a2`):

```json
"contributors": [ { "party": "p1", "roles": ["composer"] }, { "party": "p2", "roles": ["lyricist"] } ],
"authorship":   [ { "party": "p1", "part": "music", "percent": 50 },
                  { "party": "p2", "part": "lyrics", "percent": 50 } ],
"shares":       [ { "party": "p5", "role": "originalPublisher", "via": ["p1"], "agreement": "a1",
                    "territories": { "include": ["2136"] }, "percent": 12.5 },
                  { "party": "p7", "role": "originalPublisher", "via": ["p2"], "agreement": "a2",
                    "territories": { "include": ["2136"] }, "percent": 15 } ]
```

- **`contributors`:** quién creó la obra y con qué rol.
- **`authorship`:** de quién es la obra entera, por parte: Ana tiene 50 por la
  música y Beto 50 por la letra; un autor de las dos partes tendría 50 y 50.
  Las filas de una obra suman a lo sumo 100.
- **`publisherShare`** (en el contrato): lo que el contrato da a la editora
  sobre la parte de cada autor que representa: 25 en `a1` y 30 en `a2`.
- **`shares`:** quién cobra, sobre la obra entera y ya calculado: el porcentaje
  del contrato por la autoría del autor de `via`, sobre 100. Sur cobra 12,5
  (el 25 % de 50) y Norte 15 (el 30 % de 50); Ana conserva 37,5 y Beto 35. Va
  una fila por autor representado, y varios autores en `via` solo si el
  contrato les da el mismo porcentaje. Para una subeditora, `via` es la
  editora original. Las filas de los autores son opcionales.
- Cada fila es por derecho (`performing`, `mechanical`, `synchronization`,
  `print`) y territorio TIS (`2136` es el mundo). Una fila sin `rights` o sin
  `territories` toma los del contrato; si el contrato no los dice, los cuatro
  derechos y el mundo.
- Las filas son netas y se suman por derecho y país: una editora que cede parte
  a una subeditora en un país declara ahí solo lo que retiene. Las sumas se
  hacen en diezmilésimos, con tolerancia de 0,01 contra 100 y contra lo que da
  el contrato; los topes editoriales se comparan exactos.

## 7. La firma

La firma es un JWS compacto ES256 con el contenido separado: se firman los
bytes exactos del `.jdx.json`, y el `.jws` queda `encabezado..firma`.

```json
{ "alg": "ES256", "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E",
  "typ": "vnd.jupiter.jdx+jws", "cty": "vnd.jupiter.jdx+json",
  "jdx": { "declarationId": "3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13", "revision": 1,
           "issuedAt": "2026-09-12T19:00:00-03:00", "sha256": "…", "size": 48213,
           "env": "production", "aud": ["061"] } }
```

Una firma verifica si:

- `alg` es `ES256` y `typ` es exacto, sin `jwk`, `jku`, `x5u`, `x5c` ni `crit`;
- la clave del `kid` está en la lista de confianza, es del emisor
  `declaration.issuer.id`, es del mismo entorno y está vigente a la hora de
  recepción;
- `kid` es `declaration.issuer.keyId`;
- `declarationId`, `revision`, `sha256` y `size` son los del archivo;
- `aud` incluye a la sociedad que recibe y, si hay `declaration.recipients`,
  es igual a sus códigos.

Un `issuedAt` distinto de `declaration.createdAt`, o más de 5 minutos
posterior a la recepción, da un aviso.

La lista de confianza (schema en
[`trust-list.schema.json`](../schema/trust-list.schema.json)) es un JWS con
las claves de los emisores, firmado por al menos dos raíces fijadas en el
validador y no revocadas. Vence a lo sumo 90 días después de emitida. Con el
estado de la sociedad (`--state-dir`), el validador guarda el mayor `seq` que
vio y no acepta una lista con uno menor. Cada clave está `pending` (no se
acepta), `active` (entre `activeAt` y `expiresAt`), `retired` o `revoked`.
Las raíces viajan con el validador, en
[`trust/roots.json`](../trust/roots.json): la lista no agrega raíces.

## 8. Reglas propias de cada SGC: el perfil `sadaic/0.1`

Un perfil es la lista de reglas de una sociedad (schema en
[`profile.schema.json`](../schema/profile.schema.json)): la elige quien
recibe, con `--profile`. El catálogo trae reglas generales, como que la
autoría de una obra no supere 100, y cada sociedad elige las suyas y sus
parámetros. El primero es el de SADAIC:

- Sociedad `061`; firma opcional; todas sus reglas son avisos.
- La autoría de cada obra suma exactamente 100: se declara la obra entera.
- El `publisherShare.percent` de un contrato de edición no pasa de 25 %, o de
  33 1/3 % (`33.3333`) con una condición del art. 8 del contrato tipo
  (`SADAIC_ART8`). El 30 % de Editorial Norte de la sección 6 lo pasa, aunque
  cobre el 15 % de la obra.
- Pide duración, género de la lista oficial
  ([`values/sadaic-genres.json`](../values/sadaic-genres.json)), registro en la
  DNDA por parte, estado de publicación, titularidad, identificador fiscal y
  afiliación de autores y editoras, y representante legal de autores menores.
- Expande el territorio `2136` y los códigos TIS de país.
- `sadaic/1.0` tendrá las mismas reglas como errores, con firma obligatoria.
- El perfil completo, con sus 35 reglas y sus parámetros, está en
  [`profiles/sadaic/0.1.0.json`](../profiles/sadaic/0.1.0.json).

Un perfil leído de un archivo que no es el que trae el validador figura en el
reporte con `+local` detrás de su versión (`…/sadaic/0.1@0.1.0+local`).

## 9. Versiones

- `jdx` es la versión del formato (`1.0`). Una menor nueva agrega campos
  opcionales; una mayor, cualquier otro cambio.
- Cada menor tiene un schema estricto, con el que se valida, y uno abierto: un
  archivo de una menor más nueva se valida con el abierto de la última conocida
  y da un aviso.
- Las listas cerradas solo crecen en una versión mayor. Las abiertas crecen
  con las listas de valores, fechadas (`values/`, versión `2026-10`).
- La `revision` de una declaración es independiente de la versión del formato.

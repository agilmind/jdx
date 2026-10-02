# Guía de JDX para sociedades de gestión

JDX es un archivo JSON que acompaña cada entrega de obras a una sociedad de
gestión: quién creó cada obra, de quién es, quién cobra y bajo qué contrato.
Quien envía la declaración (una editora, un autor o el sistema que usan) es el
**emisor**; la sociedad que la recibe la valida y, si corresponde, carga los
datos en su sistema. Esta guía explica qué llega, cómo se valida, cómo se lee
el resultado y cómo se cargan los datos. El detalle de cada campo está en la
[referencia de campos](campos.md).

## 1. Qué llega en una entrega

```
entrega/
  3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json       la declaración
  3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json.jws   su firma
  00034-001-CTTO_2-obras.pdf                             los archivos que describe
  Chacarera-del-Rancho.mp3
```

- **La declaración** se llama `<declaration.id>.r<revision>.jdx.json`. Es
  UTF-8 sin BOM, sin claves repetidas y sin `null` (un dato que no se sabe no
  se escribe), y pesa a lo sumo 2 MiB.
- **La firma** va al lado, en un archivo `.jws` (sección 7).
- **Los archivos** (contratos, audios, ejemplares) se describen en `media`:
  cada uno con su `path` relativo a la carpeta de la entrega, su tamaño
  (`size`) y su hash (`sha256`).
- **El canal no es parte de JDX:** puede ser una carpeta compartida, una API o
  lo que acuerden el emisor y la sociedad. Si los archivos llegan de a uno, la
  firma se envía al final: cuando llega el `.jws`, la entrega está completa.

Para corregir o completar una declaración, el emisor la envía otra vez entera:
el mismo `declaration.id` con una `revision` mayor. La sociedad reemplaza todo
lo que tenía de esa declaración por la revisión nueva y no vuelve a procesar
una revisión que ya procesó. Un archivo que viajó en una entrega anterior no se
reenvía: se declara otra vez en `media`, con la revisión en que viajó
(`delivery`).

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

Dentro del archivo, un objeto cita a otro por su `id` local (`"party": "p1"`),
que no vale fuera de ese archivo. Para reconocer a la misma persona, obra o
contrato en archivos distintos están los identificadores: IPI, ISWC, CUIT, el
código de la sociedad o el `uid` del contrato.

Ejemplo completo: [`ejemplo/3f2c9a1e-….r1.jdx.json`](ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json).

## 3. Cómo se valida

La sociedad valida cada entrega antes de cargarla. Hoy, desde este
repositorio, ya se puede controlar el JSON y el schema:

```sh
npm run validate -- entrega/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json
```

El validador de referencia `jdx` (en construcción) revisa además las reglas de
la sociedad, la firma, los archivos de la entrega y lo que la sociedad ya
recibió, y escribe un reporte:

```sh
jdx validate entrega/3f2c9a1e-….r1.jdx.json --env production --profile sadaic/0.1 \
  --dir entrega --trust-list jdx-trust.json --state-dir estado \
  --received-at 2026-09-30T09:12:00-03:00 --report 3f2c9a1e-….r1.report.json
```

| Opción | Qué indica la sociedad |
|---|---|
| `--env` | `production` para entregas reales o `sandbox` para pruebas |
| `--profile` | Su perfil de SGC: sus propias reglas (sección 8) |
| `--dir` | La carpeta de la entrega, para revisar los archivos |
| `--trust-list` | La lista de confianza: las claves con que firman los emisores (sección 7) |
| `--state-dir` | Su estado: lo que ya recibió de cada declaración |
| `--received-at` | Cuándo llegó la entrega |
| `--report` | Dónde se escribe el reporte |

### Qué revisa

El validador revisa en capas. La primera, el **entorno**, no mira el archivo:
controla lo que prepara la sociedad para validar (las opciones de arriba, el
perfil de SGC elegido, la lista de confianza, su estado y la carpeta de la
entrega). Si el entorno falla, el problema no es del archivo: la sociedad lo
corrige y vuelve a validar. Si falla el JSON o el schema, no se revisa nada
más.

| Capa | Qué controla | Qué da |
|---|---|---|
| Entorno | Lo que prepara la sociedad: opciones, perfil de SGC, lista de confianza, estado, carpeta de la entrega | Código de resultado 2: el archivo no se evalúa |
| JSON y schema | Que sea JSON válido (I-JSON), la estructura, los formatos y los valores de las listas cerradas | Código de resultado 1: el archivo tiene errores |
| Núcleo | Las referencias entre objetos, los hashes, el nombre del archivo, una firma inválida, las revisiones | Código de resultado 1: el archivo o la entrega tienen errores |
| Perfil | Las reglas propias de la sociedad (sección 8) | Código de resultado 0 con avisos en `sadaic/0.x`; 1 desde `sadaic/1.0`, donde son errores |
| Política | Lo que decide la sociedad: firma ausente, perfil de SGC no declarado en el archivo, un declarante que no es el de la cuenta, lista de confianza por vencer | Código de resultado 0 con avisos, salvo la firma ausente cuando la sociedad exige firma: 1 |

Algunas reglas son avisos o informativas: no cambian el código de resultado,
que queda en 0. Por ejemplo, una revisión que ya se cargó da 0 y el reporte
dice que se ignore. Con `--fail-on warning`, la sociedad hace que un aviso
también dé 1.

Las reglas tienen códigos `JDX-<ÁREA>-<NNN>` que nunca se reutilizan (por
ejemplo, `JDX-AGR-003`: un contrato da a la editora más que el tope). El
catálogo, con cada regla y su mensaje en español, portugués e inglés, está en
[`catalog/1.0/rules.json`](../catalog/1.0/rules.json).

### Los archivos de la entrega

Con `--dir`, el validador compara la carpeta de la entrega con `media`:

- Busca cada `path` por su nombre exacto o, si no está, por el único que
  coincide sin distinguir mayúsculas de la A a la Z. Nunca sigue un enlace.
- Un archivo de la carpeta que no está en `media` da `JDX-MED-003`. No cuentan
  los archivos de JDX que están en la raíz: los de esta declaración, de
  cualquier revisión (el `.jdx.json`, su `.jws` y su `.report.json`), y
  `jdx-trust.json`. Un nombre
  que no es UTF-8 válido se muestra con cada byte inválido, y cada barra
  invertida, como `\xHH`.
- La sociedad puede excluir archivos con `--ignore <patrón>`, que se repite.
  Un patrón sin `/` mira el nombre; con `/`, la ruta desde la raíz. `*` no
  cruza carpetas y `**` cubre cero o más. El patrón y el nombre se comparan en
  NFC y distinguen mayúsculas; un patrón con una barra al principio, al final o
  doble no cubre nada.

La carpeta no puede cambiar mientras se valida: lo seguro es validar una
copia. Una carpeta que no se puede usar (no existe, algo de adentro no se
puede leer, tiene más de 100 000 entradas que la declaración no pide o cambió
durante la validación) da `JDX-ENV-011`, con la causa y el lugar. Es una falla
del entorno (código de resultado 2) y no un rechazo, porque lo que no se pudo
leer podría esconder archivos.

## 4. Cómo se lee el resultado

El código de resultado está en el reporte (`exitCode`) y es también el código
con que termina el comando `jdx`:

| Código de resultado | Qué significa | Qué hace la sociedad |
|---|---|---|
| 0 | No hay errores (puede haber avisos) | Carga la revisión o la ignora, según `disposition` |
| 1 | El archivo o la entrega tienen errores | No la carga y devuelve el reporte al emisor |
| 2 | Falla el entorno (por ejemplo, perfil desconocido o lista de confianza vencida) | No la carga ni la rechaza: corrige el entorno y vuelve a validar |
| 3 | Falla interna del validador | Reintenta y avisa |

El reporte (`<id>.r<n>.report.json`, schema en
[`jdx-report.schema.json`](../schema/jdx-report.schema.json)) dice qué hacer
con la revisión y por qué. Un extracto:

```json
{ "jdxReport": "1.0", "valid": true, "disposition": "ingest", "exitCode": 0,
  "signature": { "status": "verified", "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E" },
  "summary": { "error": 0, "warning": 1, "info": 0 },
  "results": [ { "ruleId": "JDX-AGR-003", "level": "warning",
                 "instanceLocation": "/agreements/0/publisherShare/percent",
                 "params": { "percent": 30, "cap": 25 } } ] }
```

- `disposition` dice qué hacer con esta revisión: `ingest`, cargarla;
  `ignore`, no cargarla porque ya se cargó esta revisión o una posterior;
  `reject`, rechazarla.
- `signature.status` es el estado de la firma: `verified` si es válida,
  `absent` si no hay, y otros valores si no se pudo verificar (sección 7).
- Cada resultado dice la regla (`ruleId`), el nivel (`error`, `warning` o
  `info`), dónde está el dato (`instanceLocation`, un puntero JSON) y sus
  parámetros (`params`). Un sistema decide por `disposition`, `ruleId` y
  `params`, nunca por el texto del mensaje.
- De cada regla se listan a lo sumo 100 resultados, los primeros en el orden
  del reporte. `omitted` dice de qué reglas quedaron resultados afuera y
  cuántos; `summary`, el código de resultado y `checks` los cuentan a todos.
- `jdx ack` registra la recepción en el estado de la sociedad y deja el
  reporte listo para devolverlo al emisor por el mismo canal.

### Los mensajes

Cada regla trae su mensaje en [`catalog/1.0/rules.json`](../catalog/1.0/rules.json),
y el vocabulario que comparten los mensajes está en
[`catalog/1.0/terms.json`](../catalog/1.0/terms.json). Un mensaje es una
plantilla que se llena con los `params` y el `context` del resultado:

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
- `{x:phrase}`: el término `terms.phrase.x`, llenado con los mismos datos, si
  `x` tiene un valor; si no, nada.

## 5. Cómo carga la sociedad los datos en su sistema

El validador no carga nada: dice en el reporte si la revisión se carga. La
carga la hace el sistema de la sociedad, así:

1. Mirar el campo `disposition` del reporte. Si es `ingest`, reemplazar todo
   lo que se cargó antes de esta declaración (el mismo `declaration.id`) por
   esta revisión, porque cada revisión trae la declaración completa. Si es
   `ignore` o `reject`, no cargar nada.
2. Cargar primero `parties`; después `works` con sus derechos, `recordings`,
   `agreements`, `media` y `edition`, buscando cada referencia por su `id`.
3. Guardar como texto los valores de las listas abiertas: pueden llegar
   valores nuevos o propios (`X_…`) sin que cambie el schema.
4. Guardar los porcentajes como decimal exacto (por ejemplo, `NUMERIC(7,4)`),
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
- **`publisherShare`** (en el contrato): el porcentaje que el contrato da a la
  editora sobre la parte de cada autor que representa: 25 en `a1` y 30 en
  `a2`.
- **`shares`:** quién cobra, sobre la obra entera y ya calculado: el porcentaje
  del contrato por la autoría del autor de `via`, dividido por 100. Sur cobra
  12,5 (el 25 % de 50) y Norte 15 (el 30 % de 50); Ana conserva 37,5 y Beto 35.
  Va una fila por autor representado; varios autores en `via` solo si el
  contrato les da el mismo porcentaje. Para una subeditora, `via` es la
  editora original. Las filas de lo que conservan los propios autores son
  opcionales.
- Cada fila es por derecho (`performing`, `mechanical`, `synchronization`,
  `print`) y territorio TIS (`2136` es el mundo). Una fila sin `rights` o sin
  `territories` toma los del contrato; si el contrato no los dice, son los
  cuatro derechos y el mundo.
- Las filas son netas y se suman por derecho y país: una editora que cede parte
  a una subeditora en un país declara ahí solo lo que retiene. Las sumas se
  hacen en diezmilésimos, con una tolerancia de 0,01 contra 100 y contra lo que
  da el contrato; los topes editoriales se comparan exactos.

## 7. La firma

La firma prueba que el archivo lo emitió quien dice y que no cambió desde
entonces. Es un JWS compacto ES256 con el contenido separado: se firman los
bytes exactos del `.jdx.json`, y el `.jws` queda `encabezado..firma`, sin el
contenido en el medio.

```json
{ "alg": "ES256", "kid": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E",
  "typ": "vnd.jupiter.jdx+jws", "cty": "vnd.jupiter.jdx+json",
  "jdx": { "declarationId": "3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13", "revision": 1,
           "issuedAt": "2026-09-12T19:00:00-03:00", "sha256": "…", "size": 48213,
           "env": "production", "aud": ["061"] } }
```

La firma es válida si:

- `alg` es `ES256` y `typ` es exactamente ese, sin `jwk`, `jku`, `x5u`, `x5c`
  ni `crit`;
- la clave del `kid` está en la lista de confianza, es del emisor
  `declaration.issuer.id`, es del mismo entorno (`production` o `sandbox`) y
  está vigente a la hora en que llegó la entrega;
- `kid` es igual a `declaration.issuer.keyId`;
- `declarationId`, `revision`, `sha256` y `size` son los del archivo;
- `aud` incluye a la sociedad que recibe y, si hay `declaration.recipients`,
  tiene exactamente sus códigos.

Un `issuedAt` distinto de `declaration.createdAt`, o más de 5 minutos
posterior a la llegada, da un aviso.

La lista de confianza (schema en
[`trust-list.schema.json`](../schema/trust-list.schema.json)) dice qué claves
puede usar cada emisor. Es un JWS firmado por al menos dos de las claves raíz
que trae el validador, en [`trust/roots.json`](../trust/roots.json), que no
estén revocadas; la lista no puede agregar raíces. Vence a lo sumo 90 días
después de emitida. Cada lista nueva lleva un número de orden (`seq`) mayor:
con el estado de la sociedad (`--state-dir`), el validador recuerda el mayor
que vio y no acepta una lista con uno menor. Cada clave está `pending`
(todavía no se acepta), `active` (vale entre `activeAt` y `expiresAt`),
`retired` (retirada) o `revoked` (revocada).

## 8. Reglas propias de cada SGC: el perfil `sadaic/0.1`

El catálogo trae reglas generales, como que la autoría de una obra no pase de
100. Además, cada sociedad tiene las suyas: su **perfil de SGC**, que dice qué
reglas aplica y con qué parámetros (schema en
[`profile.schema.json`](../schema/profile.schema.json)). Lo elige la sociedad
que recibe, con `--profile`. El campo `profiles` del archivo solo dice qué
perfil cree el emisor que corresponde; si no nombra el que se aplica, da un
aviso de política.

El primero es el de SADAIC:

- Sociedad `061`; la firma es opcional y todas sus reglas son avisos.
- La autoría de cada obra suma exactamente 100: se declara la obra entera.
- El `publisherShare.percent` de un contrato de edición no pasa de 25 %, o de
  33 1/3 % (`33.3333`) con una condición del art. 8 del contrato tipo
  (`SADAIC_ART8`). El 30 % de Editorial Norte de la sección 6 lo pasa, aunque
  cobre el 15 % de la obra.
- Pide la duración, el género de la lista oficial
  ([`values/sadaic-genres.json`](../values/sadaic-genres.json)), el registro en
  la DNDA de cada parte, el estado de publicación, la titularidad, el
  identificador fiscal y la afiliación de autores y editoras, y el
  representante legal de los autores menores de edad.
- Expande el territorio `2136` y los códigos TIS de país.
- `sadaic/1.0` tendrá las mismas reglas como errores, con firma obligatoria.
- El perfil completo, con sus 35 reglas y sus parámetros, está en
  [`profiles/sadaic/0.1.0.json`](../profiles/sadaic/0.1.0.json).

Si la sociedad usa un perfil desde un archivo propio, y no el que trae el
validador, el reporte lo indica con `+local` detrás de la versión
(`…/sadaic/0.1@0.1.0+local`).

## 9. Versiones

- `jdx` es la versión del formato (`1.0`). Una versión menor nueva (`1.1`)
  solo agrega campos opcionales; una mayor (`2.0`), cualquier otro cambio.
- Cada versión menor tiene dos schemas: uno estricto, con el que se valida, y
  uno abierto. Un archivo de una menor más nueva que el validador no conoce se
  valida con el schema abierto de la última que conoce y da un aviso.
- Las listas cerradas (valores fijos del schema) solo crecen en una versión
  mayor. Las abiertas crecen con las listas de valores de `values/`, que tienen
  fecha (hoy `2026-10`).
- La `revision` de una declaración no tiene que ver con la versión del
  formato.

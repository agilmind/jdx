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
  UTF-8 sin BOM, sin claves repetidas y sin `null`: lo que no se sabe se omite.
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

| Capa | Qué controla | Qué da |
|---|---|---|
| Entorno | Opciones, perfil, lista de confianza, estado | Salida 2; el archivo no se evalúa |
| JSON y schema | I-JSON, estructura, formatos, listas cerradas | Error |
| Núcleo | Referencias, hashes, nombre del archivo, firma inválida, revisiones | Error |
| Perfil | Las reglas de la sociedad | Aviso en `sadaic/0.x`, error desde `sadaic/1.0` |
| Política | Firma ausente, perfil no declarado, lista por vencer | Lo gradúa la sociedad |

Las reglas tienen códigos `JDX-<ÁREA>-<NNN>` que nunca se reutilizan (por
ejemplo, `JDX-SHR-003`: las editoras superan el tope). El catálogo con todas
las reglas va en `catalog/1.0/rules.json`.

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
  "results": [ { "ruleId": "JDX-SHR-003", "level": "warning", "instanceLocation": "/works/0",
                 "params": { "right": "performing", "country": "AR", "sum": 30, "cap": 25 } } ] }
```

- `disposition`: `ingest` (cargar), `ignore` (revisión ya cargada) o `reject`.
- Cada resultado dice la regla, el nivel, dónde está el dato (puntero JSON) y
  sus parámetros. Se decide por `disposition`, `ruleId` y `params`, nunca por
  el texto de `message`.
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

```json
"contributors": [ { "party": "p1", "roles": ["composer"] }, { "party": "p2", "roles": ["lyricist"] } ],
"authorship":   [ { "party": "p1", "part": "music", "percent": 100 },
                  { "party": "p2", "part": "lyrics", "percent": 100 } ],
"shares":       [ { "party": "p5", "role": "originalPublisher", "via": ["p1", "p2"],
                    "agreement": "a1", "territories": { "include": ["2136"] }, "percent": 25 } ]
```

- **`contributors`:** quién creó la obra y con qué rol.
- **`authorship`:** de quién es, por parte. La música suma 100 y la letra
  suma 100.
- **`shares`:** quién cobra, sobre la obra entera, por derecho (`performing`,
  `mechanical`, `synchronization`, `print`) y territorio TIS (`2136` es el
  mundo). `via` dice de quién viene lo que cobra una editora: los autores que
  representa o la editora original. Lo no asignado a editoras es de los
  autores, y cada sociedad lo reparte con sus reglas.
- Una fila sin `rights` o sin `territories` toma los del contrato; si el
  contrato no los dice, los cuatro derechos y el mundo.
- Las filas son netas y se suman por derecho y país: una editora que cede parte
  a una subeditora en un país declara ahí solo lo que retiene. Las sumas se
  hacen en diezmilésimos, con tolerancia de 0,01 solo contra 100; los topes
  editoriales se comparan exactos.

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
validador y no revocadas. Vence a los 90 días y su `seq` nunca baja. Cada
clave está `pending` (no se acepta), `active` (entre `activeAt` y
`expiresAt`), `retired` o `revoked`.

## 8. El perfil `sadaic/0.1`

Un perfil es la lista de reglas de una sociedad (schema en
[`profile.schema.json`](../schema/profile.schema.json)): la elige quien
recibe, con `--profile`. El primero es el de SADAIC:

- Sociedad `061`; firma opcional; todas sus reglas son avisos.
- Pide duración, género de la lista oficial
  ([`values/sadaic-genres.json`](../values/sadaic-genres.json)), registro en la
  DNDA por parte, estado de publicación, titularidad, identificador fiscal y
  afiliación de autores y editoras, y representante legal de autores menores.
- Tope editorial de 25 %, o 33,3333 % con una condición del art. 8 del
  contrato tipo (`SADAIC_ART8`).
- Expande el territorio `2136` y los códigos TIS de país.
- `sadaic/1.0` tendrá las mismas reglas como errores, con firma obligatoria.

## 9. Versiones

- `jdx` es la versión del formato (`1.0`). Una menor nueva agrega campos
  opcionales; una mayor, cualquier otro cambio.
- Cada menor tiene un schema estricto, con el que se valida, y uno abierto: un
  archivo de una menor más nueva se valida con el abierto de la última conocida
  y da un aviso.
- Las listas cerradas solo crecen en una versión mayor. Las abiertas crecen
  con las listas de valores, fechadas (`values/`, versión `2026-10`).
- La `revision` de una declaración es independiente de la versión del formato.

# Referencia de campos de JDX 1.0

<!-- Generado por `npm run gen` desde schema/src/types.json y schema/src/types.overlay.json. No editar a mano. -->

Cada tipo de objeto del documento, con sus campos. La [guía](guia.md) explica cómo se usan juntos.

- **Requerido:** `sí`, `no` o la condición en que el campo es requerido o está prohibido.
- **Listas:** una lista cerrada admite solo sus valores. Una abierta admite los de su archivo en `values/` y valores propios con prefijo `X_` (por ejemplo, `X_MI_SOCIEDAD_CODIGO`).
- **Referencias:** "id de `parties`" es el `id` de un elemento de esa lista del mismo archivo.
- **Ausencia:** lo que no se sabe se omite; ningún campo admite `null`.
- **Datos personales:** la descripción los marca.

## Índice

- **Raíz y declaración:** [`Document`](#document), [`Declaration`](#declaration), [`Issuer`](#issuer), [`Recipient`](#recipient)
- **Tipos comunes:** [`Name`](#name), [`Identifier`](#identifier), [`Classification`](#classification), [`Condition`](#condition), [`StandardContract`](#standardcontract), [`Territories`](#territories), [`Address`](#address), [`Place`](#place), [`Subdivision`](#subdivision), [`Contact`](#contact), [`Amount`](#amount), [`Registration`](#registration), [`WorkRegistration`](#workregistration)
- **Personas:** [`Party`](#party), [`Affiliation`](#affiliation), [`LegalRepresentative`](#legalrepresentative), [`Successor`](#successor), [`Representative`](#representative)
- **Obras:** [`Work`](#work), [`Title`](#title), [`Lyrics`](#lyrics), [`FirstPerformance`](#firstperformance), [`WorkRef`](#workref), [`External`](#external), [`ExternalWriter`](#externalwriter), [`Version`](#version), [`Composite`](#composite), [`Component`](#component), [`Commission`](#commission), [`Ai`](#ai), [`AiElement`](#aielement), [`Instrumentation`](#instrumentation), [`Instrument`](#instrument), [`Origin`](#origin)
- **Derechos:** [`Contributor`](#contributor), [`Authorship`](#authorship), [`Share`](#share)
- **Grabaciones:** [`Recording`](#recording), [`IsrcIssuer`](#isrcissuer), [`FirstPublication`](#firstpublication), [`Producer`](#producer), [`PLine`](#pline), [`Release`](#release), [`Performer`](#performer), [`PerformerInstrument`](#performerinstrument), [`SocietyCategory`](#societycategory), [`Participation`](#participation), [`RecordingContributor`](#recordingcontributor), [`Sample`](#sample), [`ExternalRecording`](#externalrecording), [`RecordingAi`](#recordingai), [`RecordingAiElement`](#recordingaielement), [`Link`](#link)
- **Contratos:** [`Agreement`](#agreement), [`AgreementParty`](#agreementparty), [`AgreementParent`](#agreementparent), [`ExcludedRight`](#excludedright), [`Term`](#term), [`Renewal`](#renewal), [`PostTermCollection`](#posttermcollection), [`PublisherShare`](#publishershare), [`Terms`](#terms), [`Template`](#template), [`TermValues`](#termvalues), [`InvestedAmount`](#investedamount), [`Observation`](#observation)
- **Edición:** [`Edition`](#edition), [`PrintRun`](#printrun), [`Deposit`](#deposit)
- **Archivos:** [`Media`](#media), [`Evidence`](#evidence), [`ESignature`](#esignature), [`Timestamp`](#timestamp), [`Signer`](#signer), [`Annexed`](#annexed), [`Anchor`](#anchor)

## Formatos

| Formato | Regla | Patrón | Ejemplo |
|---|---|---|---|
| instante | RFC 3339 con zona horaria; fracción opcional | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z\|[+-]\d{2}:\d{2})$` | `2026-09-12T15:40:00-03:00` |
| fecha | `AAAA-MM-DD`, una fecha que existe | `^\d{4}-\d{2}-\d{2}$` | `2026-09-12` |
| año | Entero de 1000 a 9999 | — | `2026` |
| duración | ISO 8601, sin semanas ni fracciones | `^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$` | `PT3M25S`, `P10Y` |
| porcentaje | Número de 0 a 100, hasta 4 decimales, sin exponente | `^(100(\.0{1,4})?\|[1-9]?[0-9](\.[0-9]{1,4})?)$` | `33.3333` |
| importe | Texto decimal, hasta 4 decimales | `^\d+(\.\d{1,4})?$` | `"1500.00"` |
| moneda | ISO 4217 | `^[A-Z]{3}$` | `ARS` |
| sha256 | SHA-256 en hexadecimal minúscula | `^[0-9a-f]{64}$` | `5052e13d…a5a6fd2c3` (64 caracteres) |
| uuid | En minúscula, con guiones | `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` | `3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13` |
| id local | Único en todo el archivo | `^[a-z][a-z0-9-]{0,63}$` | `p1`, `w1`, `a1`, `m1` |
| id de emisor | Como un id local | `^[a-z][a-z0-9-]{0,63}$` | `jupiter` |
| kid | Huella RFC 7638 de una clave, en base64url | `^[A-Za-z0-9_-]{43}$` | `3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E` |
| país | ISO 3166-1 alfa-2 | `^[A-Z]{2}$` | `AR` |
| subdivisión | ISO 3166-2 | `^[A-Z]{2}-[A-Z0-9]{1,3}$` | `AR-B` |
| territorio TIS | Código TIS de CISAC, 4 dígitos, como texto | `^\d{4}$` | `2136` (el mundo), `0032` (Argentina) |
| sociedad | Código CISAC de 3 dígitos, o de la lista de sociedades de JDX | `^(\d{3}\|X_JDX_[A-Z0-9_]+)$` | `061`, `X_JDX_AADI` |
| idioma | BCP 47 | `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$` | `es`, `pt-BR` |
| url | HTTP o HTTPS | `^https?://\S+$` | `https://open.spotify.com/track/…` |
| uri | HTTPS | `^https://\S+$` | `https://jdx.jupiter.ar/profiles/sadaic/0.1` |
| email | Una dirección | `^[^@\s]+@[^@\s]+\.[^@\s]+$` | `ana@example.com` |
| teléfono | E.164 | `^\+[1-9]\d{6,14}$` | `+5491155550000` |
| tipo de medio | RFC 6838 | `^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$` | `application/pdf` |
| fracción | Entero/entero | `^[1-9]\d*/[1-9]\d*$` | `1/3` |
| versión | `M.m` | `^\d+\.\d+$` | `1.0` |
| valor de lista abierta | lowerCamelCase, o propio con prefijo `X_` | `^([a-z][A-Za-z0-9]*\|X_[A-Z0-9]+(_[A-Z0-9]+)*)$` | `originalPublisher`, `X_MI_VALOR` |
| esquema | UPPER_SNAKE_CASE (esquemas, registros, tipos de identificador) | `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$` | `SADAIC_GENRE` |
| clave de extensión | Dominio invertido | `^[a-z0-9-]+(\.[a-z0-9-]+)+$` | `ar.example.dato` |

## Raíz y declaración

### `Document`

La raíz del archivo: la declaración y sus listas de personas, obras, grabaciones, contratos y archivos.

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `$schema` | uri | sí | URL del schema de la versión menor del archivo, por ejemplo `https://jdx.jupiter.ar/schema/1.0/jdx.schema.json`. Es un identificador: no se descarga. |
| `jdx` | versión | sí | Versión del formato, `M.m` (hoy `1.0`). |
| `profiles` | lista de uris | no | Perfiles que el emisor cree que aplican. Es informativo: el perfil lo elige quien recibe. |
| `declaration` | [`Declaration`](#declaration) | sí | Qué declaración es, qué revisión y quién la emite. |
| `parties` | lista de [`Party`](#party) | no | Personas y organizaciones: autores, editoras, intérpretes, productores, representantes. Cada una aparece una vez y el resto del archivo la referencia por su id. |
| `works` | lista de [`Work`](#work) | no | Obras declaradas. |
| `recordings` | lista de [`Recording`](#recording) | no | Grabaciones de las obras. |
| `agreements` | lista de [`Agreement`](#agreement) | no | Contratos firmados: edición, subedición, cartas de reparto entre coautores, autorizaciones. |
| `media` | lista de [`Media`](#media) | no | Archivos que viajan aparte (PDF, audios, planillas), descritos por su tamaño y su hash. |
| `edition` | [`Edition`](#edition) | no | La edición publicada. Si falta, la declaración es de obras no editadas. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `Declaration`

Los datos de la declaración: identificador estable, revisión y emisor. Se usa en [`Document.declaration`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | uuid | sí | Identificador estable de la declaración. Es el mismo en todas sus revisiones. |
| `revision` | entero ≥ 1 | sí | Número de revisión. Crece en cada reenvío; quien recibe reemplaza la declaración entera cuando llega una revisión mayor que la última que cargó. |
| `createdAt` | instante | sí | Cuándo se armó esta revisión. Es igual al `issuedAt` de la firma. |
| `issuer` | [`Issuer`](#issuer) | sí | El emisor que arma y firma el archivo. |
| `declarant` | id de `parties` | no | Quién declara: la editora o, en obras no editadas, el autor. |
| `recipients` | lista de [`Recipient`](#recipient) | no | Sociedades a las que va dirigida. |
| `language` | idioma | no | Idioma de los textos libres del archivo. |

### `Issuer`

El emisor del archivo, tal como figura en la lista de confianza. Se usa en [`Declaration.issuer`](#declaration).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id del emisor en la lista de confianza. |
| `name` | texto | sí | Nombre del emisor. |
| `keyId` | kid | sí | Huella (`kid`) de la clave con la que firma. |

### `Recipient`

Una sociedad destinataria. Se usa en [`Declaration.recipients`](#declaration).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `society` | sociedad | sí | Código de la sociedad: el de CISAC (3 dígitos, `061`) o uno de JDX (`X_JDX_AADI`). |

## Tipos comunes

### `Name`

Un nombre de una persona u organización. Se usa en [`Party.names`](#party) y [`ExternalWriter.names`](#externalwriter).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `type` | [abierta](../values/nameTypes.json): `legal`, `pseudonym`, `trade` | sí | Tipo de nombre: legal, seudónimo o nombre comercial. El objeto es dato personal si `type` es `legal`. |
| `given` | texto | no | Nombre o nombres de pila. Solo personas. |
| `family` | texto | al menos uno de `full` y `family` | Apellido o apellidos. Solo personas. |
| `full` | texto | al menos uno de `full` y `family` | Nombre completo sin desglosar: seudónimos, nombres comerciales y organizaciones. |
| `registrations` | lista de [`Registration`](#registration) | no | Registro del seudónimo (`kind`: `pseudonym`). |

### `Identifier`

Un identificador con su esquema: IPI, ISNI, ISWC, ISRC, CUIT, DNI, el código de una sociedad, etc. Se usa en [`Party.identifiers`](#party), [`Work.identifiers`](#work), [`External.identifiers`](#external), [`ExternalWriter.identifiers`](#externalwriter), [`Origin.identifiers`](#origin), [`Recording.identifiers`](#recording), [`Release.identifiers`](#release), [`ExternalRecording.identifiers`](#externalrecording), [`Agreement.identifiers`](#agreement), [`AgreementParent.identifiers`](#agreementparent) y [`Edition.identifiers`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/identifierSchemes.json): `IPI_NAME`, `IPI_BASE`, `ISNI`, `IPN`, `TAX_ID`, `NATIONAL_ID`, `ISSUER`, `ISWC`, `SOCIETY_WORK`, `ISRC`, `SOCIETY_RECORDING`, `ICPN`, `CATALOG_NUMBER`, `ISAN` | sí | Esquema del identificador. Los esquemas propios de un emisor o de una sociedad llevan prefijo `X_`. El objeto es dato personal si `scheme` es `TAX_ID` o `NATIONAL_ID`. |
| `value` | texto | sí | El valor, como texto. Su formato lo controlan las reglas del perfil, no el schema. |
| `country` | país | si `scheme` es `TAX_ID` o `NATIONAL_ID` | País que emite el identificador fiscal o el documento. |
| `type` | [abierta](../values/identifierTypes.json): `CUIT`, `CUIL`, `CDI`, `CPF`, `CNPJ`, `RFC`, `RUT`, `NIT`, `RUC`, `RIF`, `DNI`, `CI`, `CURP`, `CEDULA`, `RG`, `RUN`, `PASSPORT` | si `scheme` es `TAX_ID` o `NATIONAL_ID` | Tipo de identificador fiscal o de documento (`CUIT`, `DNI`, `CPF`…). |
| `society` | sociedad | si `scheme` es `SOCIETY_WORK` o `SOCIETY_RECORDING` | Sociedad que asignó el código. |
| `issuer` | texto | si `scheme` es `CATALOG_NUMBER` | Sello que asignó el número de catálogo. |

### `Classification`

El género de una obra, según el vocabulario de quien lo define. Se usa en [`Work.classifications`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/classificationSchemes.json): `SADAIC_GENRE` | sí | Vocabulario del género, por ejemplo `SADAIC_GENRE`. |
| `code` | texto | sí | Código del género en ese vocabulario. En `SADAIC_GENRE`, de 1 a 3 dígitos, sin ceros a la izquierda. |
| `name` | texto | no | Nombre del género. En `SADAIC_GENRE` identifica el género junto con `code`, porque la lista repite códigos. |

### `Condition`

Una condición de un contrato que cambia el tope editorial. Se usa en [`PublisherShare.condition`](#publishershare).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/conditionSchemes.json): `SADAIC_ART8` | sí | Vocabulario de la condición, por ejemplo `SADAIC_ART8`. |
| `code` | texto | sí | Código de la condición en ese vocabulario. |
| `name` | texto | no | Nombre de la condición. |

### `StandardContract`

El contrato tipo en el que se basa un contrato. Se usa en [`Terms.basedOn`](#terms).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/contractTemplateSchemes.json): `SADAIC_CONTRACT` | sí | Vocabulario del contrato tipo, por ejemplo `SADAIC_CONTRACT`. |
| `code` | texto | sí | Código del contrato tipo en ese vocabulario. |
| `name` | texto | no | Nombre del contrato tipo. |

### `Territories`

Territorios con códigos TIS de CISAC: los incluidos menos los excluidos. Se usa en [`Affiliation.territories`](#affiliation), [`Share.territories`](#share) y [`Agreement.territories`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `include` | lista de territorios TIS, al menos uno | sí | Territorios incluidos, por ejemplo `2136` (el mundo) o `0032` (Argentina). |
| `exclude` | lista de territorios TIS | no | Territorios que se restan de los incluidos. |

### `Address`

Un domicilio postal. Se usa en [`Party.address`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `street` | texto | no | Calle y número. |
| `floor` | texto | no | Piso. |
| `unit` | texto | no | Departamento u oficina. |
| `city` | texto | no | Ciudad o localidad. |
| `subdivision` | [`Subdivision`](#subdivision) | no | Provincia o estado. |
| `postalCode` | texto | no | Código postal. |
| `country` | país | no | País. |

### `Place`

Un lugar: ciudad, provincia y país. Se usa en [`Agreement.signedPlace`](#agreement) y [`Edition.publicationPlace`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `city` | texto | no | Ciudad o localidad. |
| `subdivision` | [`Subdivision`](#subdivision) | no | Provincia o estado. |
| `country` | país | no | País. |

### `Subdivision`

Una provincia, estado o departamento. Se usa en [`Address.subdivision`](#address) y [`Place.subdivision`](#place).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `code` | subdivisión | no | Código ISO 3166-2, por ejemplo `AR-B`. |
| `name` | texto | sí | Nombre, por ejemplo `Buenos Aires`. |

### `Contact`

Datos de contacto. Se usa en [`Party.contact`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `email` | email | no | Correo electrónico. Dato personal. |
| `phone` | teléfono | no | Teléfono en formato internacional, por ejemplo `+5491155550000`. Dato personal. |

### `Amount`

Un importe con su moneda. Se usa en [`Edition.price`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `amount` | importe | sí | Importe como texto decimal, con hasta 4 decimales: `"1500.00"`. |
| `currency` | moneda | sí | Moneda ISO 4217, por ejemplo `ARS`. |

### `Registration`

Un registro ante un organismo nacional: depósito de obra, inscripción de contrato o de seudónimo. Se usa en [`Name.registrations`](#name), [`Agreement.registrations`](#agreement) y [`Edition.registrations`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `registry` | [abierta](../values/registries.json): `DNDA_AR`, `INDAUTOR_MX`, `DNDA_CO`, `DINAPI_PY`, `INDECOPI_PE`, `SENADI_EC`, `DDI_CL`, `BN_UY`, `EDA_BR` | sí | Organismo, por ejemplo `DNDA_AR`. |
| `kind` | [abierta](../values/registrationKinds.json): `unpublishedDeposit`, `publishedWork`, `contract`, `pseudonym` | sí | Qué se registró: obra inédita, obra publicada, contrato o seudónimo. |
| `number` | texto | no | Número de registro o de expediente. |
| `date` | fecha | no | Fecha del registro. |
| `expiryDate` | fecha | no | Vencimiento del registro, si lo tiene. |
| `filing` | id de `media` (`registrationFiling`) | no | El archivo de la presentación. |
| `certificate` | id de `media` (`registrationCertificate`) | no | El archivo del certificado oficial. Puede llegar en una revisión posterior. |

### `WorkRegistration`

Un registro de una obra, que además dice qué parte de la obra registra. Se usa en [`Work.registrations`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `registry` | [abierta](../values/registries.json): `DNDA_AR`, `INDAUTOR_MX`, `DNDA_CO`, `DINAPI_PY`, `INDECOPI_PE`, `SENADI_EC`, `DDI_CL`, `BN_UY`, `EDA_BR` | sí | Organismo, por ejemplo `DNDA_AR`. |
| `kind` | [abierta](../values/registrationKinds.json): `unpublishedDeposit`, `publishedWork`, `contract`, `pseudonym` | sí | Qué se registró: obra inédita, obra publicada, contrato o seudónimo. |
| `part` | cerrada: `music`, `lyrics`, `both` | no | Parte registrada: música, letra o las dos. |
| `number` | texto | no | Número de registro o de expediente. |
| `date` | fecha | no | Fecha del registro. |
| `expiryDate` | fecha | no | Vencimiento del registro, si lo tiene. |
| `filing` | id de `media` (`registrationFiling`) | no | El archivo de la presentación. |
| `certificate` | id de `media` (`registrationCertificate`) | no | El archivo del certificado oficial. Puede llegar en una revisión posterior. |

## Personas

### `Party`

Una persona u organización: autor, editora, intérprete, productor, representante, heredero. Se usa en [`Document.parties`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id local, único en el archivo (`p1`). |
| `kind` | cerrada: `person`, `organization` | sí | Persona humana u organización. |
| `names` | lista de [`Name`](#name) | no | Nombres: el legal y los seudónimos o nombres comerciales. Si `kind` es `organization`, cada elemento lleva `full` y no lleva `given` ni `family`. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | Identificadores: IPI, ISNI, CUIT o CUIL, DNI y otros. |
| `gender` | cerrada: `female`, `male`, `nonBinary`, `undisclosed` | no | Género. Dato personal. |
| `birthDate` | fecha | no | Fecha de nacimiento. Dato personal. |
| `deathDate` | fecha | no | Fecha de fallecimiento. Sirve para el dominio público y los herederos. Dato personal. |
| `nationality` | país | no | Nacionalidad. Dato personal. |
| `maritalStatus` | cerrada: `single`, `married`, `commonLawUnion`, `civilUnion`, `separated`, `divorced`, `widowed`, `notDeclared` | no | Estado civil. Dato personal. |
| `address` | [`Address`](#address) | no | Domicilio. Dato personal. |
| `contact` | [`Contact`](#contact) | no | Correo y teléfono. Dato personal. |
| `affiliations` | lista de [`Affiliation`](#affiliation) | no | Sociedades en las que está afiliada, con su número de socio. |
| `legalRepresentatives` | lista de [`LegalRepresentative`](#legalrepresentative) | no | Padre, madre o tutor de un autor menor de edad. |
| `successors` | lista de [`Successor`](#successor) | no | Herederos o derechohabientes. |
| `representatives` | lista de [`Representative`](#representative) | no | Quienes representan a una organización y pueden firmar por ella. |
| `media` | lista de ids de `media` | no | Archivos de la persona, por ejemplo una constancia de CUIL. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `Affiliation`

La afiliación de una persona u organización a una sociedad. Se usa en [`Party.affiliations`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `society` | sociedad | sí | Código de la sociedad. |
| `memberNumber` | texto | no | Número de socio o, para una editora, su número de cuenta en la sociedad. |
| `rights` | lista, cerrada: `performing`, `mechanical`, `synchronization`, `print` | no | Derechos que la sociedad gestiona para ella. Si falta, todos. |
| `territories` | [`Territories`](#territories) | no | Territorios de la afiliación. Si falta, el mundo (`2136`). |
| `startDate` | fecha | no | Desde cuándo. |
| `endDate` | fecha | no | Hasta cuándo. Si falta, sigue vigente. |

### `LegalRepresentative`

El representante legal de un autor menor de edad. Se usa en [`Party.legalRepresentatives`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El representante. |
| `capacity` | [abierta](../values/legalRepresentativeCapacities.json): `parent`, `guardian` | no | En qué carácter: padre o madre (`parent`) o tutor (`guardian`). |

### `Successor`

Un heredero o derechohabiente. Se usa en [`Party.successors`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El heredero. |
| `capacity` | [abierta](../values/successorCapacities.json): `heir`, `unifiedRepresentative` | no | En qué carácter: heredero (`heir`) o representante unificado (`unifiedRepresentative`). |

### `Representative`

Quien representa a una organización. Se usa en [`Party.representatives`](#party).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | La persona que representa a la organización. |
| `role` | [abierta](../values/representativeRoles.json): `managingPartner`, `director`, `president`, `attorney`, `partner` | no | Cargo: socio gerente, director, presidente, apoderado o socio. |
| `title` | texto | no | El cargo tal como se imprime, por ejemplo `Socia gerente`. |
| `signatory` | booleano | no | Si puede firmar por la organización. |

## Obras

### `Work`

Una obra musical. Se usa en [`Document.works`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id local, único en el archivo (`w1`). |
| `titles` | lista de [`Title`](#title), al menos uno | sí | Títulos: el original y los alternativos. Al menos uno. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | ISWC, código de la obra en una sociedad, id del emisor. |
| `classifications` | lista de [`Classification`](#classification) | no | Géneros. |
| `distributionCategory` | cerrada: `POP`, `SER`, `JAZ`, `UNC` | no | Categoría de reparto de CISAC: popular, seria, jazz o sin clasificar. |
| `duration` | duración | no | Duración, por ejemplo `PT3M25S`. |
| `textMusicRelationship` | cerrada: `music`, `text`, `musicAndText`, `musicAndTextSeparate` | no | Solo música, solo texto, música y texto, o música y texto que no se crearon uno para el otro. |
| `lyricsLanguages` | lista de idiomas | no | Idiomas de la letra. |
| `lyrics` | [`Lyrics`](#lyrics) | no | Texto de la letra. |
| `creationDate` | fecha | no | Fecha de creación. |
| `firstPerformance` | [`FirstPerformance`](#firstperformance) | no | Estreno. |
| `publicationStatus` | cerrada: `unpublished`, `published` | no | Inédita o editada. |
| `registrations` | lista de [`WorkRegistration`](#workregistration) | no | Registros nacionales de la obra (por ejemplo, el depósito en la DNDA), por parte. |
| `version` | [`Version`](#version) | no | Si es original o derivada (arreglo, adaptación, traducción) y de qué obra. |
| `composite` | [`Composite`](#composite) | no | Si combina otras obras: medley, popurrí, mashup. |
| `excerptOf` | [`WorkRef`](#workref) | no | Obra de la que es un fragmento. |
| `commissioned` | [`Commission`](#commission) | no | Si es una obra por encargo y quién la encargó. |
| `ai` | [`Ai`](#ai) | no | Participación de inteligencia artificial en la obra. |
| `instrumentation` | [`Instrumentation`](#instrumentation) | no | Voces e instrumentos, para música de concierto. |
| `grandRights` | booleano | no | Si es una obra dramático-musical. |
| `origin` | [`Origin`](#origin) | no | Uso audiovisual o publicitario para el que se creó. |
| `contributors` | lista de [`Contributor`](#contributor) | no | Quiénes la crearon y con qué rol. |
| `authorship` | lista de [`Authorship`](#authorship) | no | Titularidad original, por parte (música y letra), en porcentajes de la obra entera. Las filas de una obra suman a lo sumo 100. |
| `shares` | lista de [`Share`](#share) | no | Quién cobra: filas por derecho y territorio, cada una con el porcentaje de la obra entera que cobra. |
| `recordings` | lista de ids de `recordings` | no | Grabaciones de la obra. Tiene que coincidir con `works` de cada grabación. |
| `media` | lista de ids de `media` | no | Archivos de la obra: partitura, letra, boletín. |
| `notes` | texto | no | Observaciones generales. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `Title`

Un título de una obra. Se usa en [`Work.titles`](#work) y [`External.titles`](#external).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `type` | [abierta](../values/titleTypes.json): `original`, `alternative`, `translated`, `transliterated`, `firstLine`, `formal`, `incorrect`, `part`, `search` | no | Tipo: original, alternativo, traducido, transliterado, primera línea, etc. |
| `text` | texto | sí | El título. |
| `language` | idioma | no | Idioma del título. |

### `Lyrics`

La letra de una obra. Se usa en [`Work.lyrics`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `text` | texto | sí | Texto completo de la letra. |
| `language` | idioma | no | Idioma de la letra. |

### `FirstPerformance`

El estreno de una obra. Se usa en [`Work.firstPerformance`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `date` | fecha | no | Fecha del estreno. |
| `venue` | texto | no | Sala o lugar. |
| `city` | texto | no | Ciudad. |
| `country` | país | no | País. |

### `WorkRef`

Una referencia a otra obra: una del archivo (`work`) o una externa (`external`), exactamente una de las dos. Se usa en [`Work.excerptOf`](#work) y [`Version.original`](#version).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `work` | id de `works` | exactamente uno de `work` y `external` | Una obra del archivo. |
| `external` | [`External`](#external) | exactamente uno de `work` y `external` | Una obra que no está en el archivo. |

### `External`

Una obra que no está en el archivo. Se usa en [`WorkRef.external`](#workref) y [`Component.external`](#component).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `titles` | lista de [`Title`](#title) | al menos uno de `titles` y `identifiers` | Títulos. |
| `identifiers` | lista de [`Identifier`](#identifier) | al menos uno de `titles` y `identifiers` | Identificadores, por ejemplo el ISWC. |
| `writers` | lista de [`ExternalWriter`](#externalwriter) | no | Sus autores. |
| `publicDomain` | booleano | no | Si está en dominio público, según declara el emisor. |

### `ExternalWriter`

Un autor de una obra externa. Se usa en [`External.writers`](#external).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `names` | lista de [`Name`](#name) | no | Nombres. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | Identificadores, por ejemplo el IPI. |
| `birthDate` | fecha | no | Fecha de nacimiento. |
| `deathDate` | fecha | no | Fecha de fallecimiento. Sirve para el dominio público. |

### `Version`

Si la obra es original o derivada de otra. Se usa en [`Work.version`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `type` | cerrada: `original`, `arrangement`, `adaptation`, `translation`, `lyricReplacement`, `other` | sí | Original, arreglo, adaptación, traducción, reemplazo de la letra u otra. |
| `original` | [`WorkRef`](#workref) | no | La obra de origen de una derivada. |
| `authorization` | id de `agreements` (`derivativeAuthorization`) | no | El contrato que autoriza la derivación. No hace falta si la obra de origen es de dominio público. |

### `Composite`

Una obra hecha de otras. Se usa en [`Work.composite`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `type` | cerrada: `medley`, `potpourri`, `composite`, `mashup`, `withSamples` | sí | Medley, popurrí, obra compuesta, mashup u obra con samples. |
| `components` | lista de [`Component`](#component) | no | Las obras que la componen. |

### `Component`

Una obra que forma parte de una compuesta: del archivo (`work`) o externa (`external`), exactamente una de las dos. Se usa en [`Composite.components`](#composite).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `work` | id de `works` | exactamente uno de `work` y `external` | Una obra del archivo. |
| `external` | [`External`](#external) | exactamente uno de `work` y `external` | Una obra que no está en el archivo. |
| `duration` | duración | no | Duración del fragmento usado. |

### `Commission`

Si la obra fue por encargo. Se usa en [`Work.commissioned`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `commissioned` | booleano | sí | Si fue por encargo. |
| `commissioner` | id de `parties` | no | Quién la encargó. |

### `Ai`

La participación de inteligencia artificial en una obra, por elemento. Se usa en [`Work.ai`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `declared` | booleano | no | Si el declarante informó sobre IA. Ausente o `false` quiere decir «no informado», no «sin IA». |
| `elements` | lista de [`AiElement`](#aielement) | no | La participación en cada elemento: letra, melodía, armonía, arreglo. |
| `humanContribution` | texto | no | Descripción del aporte humano. |

### `AiElement`

La participación de IA en un elemento de la obra. Se usa en [`Ai.elements`](#ai).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `element` | cerrada: `lyrics`, `melody`, `harmony`, `arrangement` | sí | Elemento: letra, melodía, armonía o arreglo. |
| `involvement` | cerrada: `none`, `assisted`, `generated` | sí | Nivel: ninguno, asistido o generado. |
| `tools` | lista de textos | no | Herramientas usadas. |
| `prompt` | texto | no | Instrucción usada, si se informa. |

### `Instrumentation`

Las voces y los instrumentos de una obra. Se usa en [`Work.instrumentation`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `voices` | entero ≥ 0 | no | Cantidad de voces. |
| `instruments` | lista de [`Instrument`](#instrument) | no | Instrumentos. |
| `description` | texto | no | Descripción libre de la instrumentación. |

### `Instrument`

Un instrumento de una obra, con su cantidad. Se usa en [`Instrumentation.instruments`](#instrumentation).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/instrumentSchemes.json), sin valores todavía | sí | Vocabulario del instrumento. Todavía no hay uno recomendado: se usan esquemas propios `X_`. |
| `code` | texto | sí | Código del instrumento en ese vocabulario. |
| `name` | texto | no | Nombre del instrumento. |
| `count` | entero ≥ 1 | no | Cantidad. |

### `Origin`

El uso audiovisual o publicitario para el que se creó una obra. Se usa en [`Work.origin`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `purpose` | [abierta](../values/originPurposes.json): `film`, `television`, `advertising`, `library`, `radio`, `theatre`, `videogame` | no | Para qué: cine, televisión, publicidad, librería musical, radio, teatro, videojuego. |
| `usage` | [abierta](../values/originUsages.json): `background`, `logo`, `theme`, `visual`, `rolledUpCue` | no | Cómo se usa: fondo, logo, tema, visual o cues agrupados. |
| `productionTitle` | texto | no | Título de la producción. |
| `productionNumber` | texto | no | Número de la producción. |
| `productionYear` | año | no | Año de la producción. |
| `episodeTitle` | texto | no | Título del episodio. |
| `episodeNumber` | texto | no | Número del episodio. |
| `advertiser` | texto | no | Anunciante. |
| `product` | texto | no | Producto publicitado. |
| `library` | texto | no | Librería musical. |
| `cdIdentifier` | texto | no | Identificador del CD de la librería. |
| `cutNumber` | entero ≥ 1 | no | Número de corte en ese CD. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | Identificadores de la producción, por ejemplo el ISAN. |

## Derechos

### `Contributor`

Quién creó la obra y con qué rol. Se usa en [`Work.contributors`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | La persona. |
| `roles` | lista, [abierta](../values/contributorRoles.json): `composer`, `lyricist`, `arranger`, `adapter`, `translator`, `subArranger`, `subLyricist`, `librettist`, `creator`, al menos uno | sí | Roles: compositor, autor de la letra, arreglador, adaptador, traductor, etc. Al menos uno. |
| `creditedAs` | texto | no | Nombre con el que figura publicado. |

### `Authorship`

La parte de la obra entera que tiene un autor por la música o por la letra. Se usa en [`Work.authorship`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El autor. |
| `part` | cerrada: `music`, `lyrics` | sí | Parte: música o letra. |
| `percent` | porcentaje | sí | Porcentaje de la obra entera. Si Ana escribió toda la música y Beto toda la letra, cada uno tiene 50; un autor de las dos partes tiene 50 por la música y 50 por la letra. Las filas de una obra suman a lo sumo 100. |
| `agreement` | id de `agreements` (`writerSplit`) | no | La carta de reparto entre coautores, si la hay. |

### `Share`

Una fila de cobro: quién cobra qué porcentaje de la obra entera, por derecho y territorio. Se usa en [`Work.shares`](#work).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | Quién cobra. |
| `role` | cerrada: `writer`, `originalPublisher`, `subPublisher`, `substitutedPublisher`, `administrator`, `incomeParticipant`, `acquirer` | sí | Rol: autor, editora original, subeditora, subeditora sustituta, administradora, partícipe de ingresos o adquirente. |
| `via` | lista de ids de `parties` | no | De dónde sale lo que cobra: para una editora original, el autor que representa (una fila por autor; varios en una fila solo si el contrato les da el mismo porcentaje); para una subeditora, la editora original. |
| `agreement` | id de `agreements` (`publishing`, `subPublishing`, `administration`, `assignment`, `writerSplit`) | no | El contrato que da ese derecho. |
| `rights` | lista, cerrada: `performing`, `mechanical`, `synchronization`, `print` | no | Derechos: ejecución, mecánico, sincronización, impresión. Si falta, los del contrato; si el contrato no los dice, los cuatro. |
| `territories` | [`Territories`](#territories) | no | Territorios. Si falta, los del contrato; si el contrato no los dice, el mundo (`2136`). |
| `percent` | porcentaje | sí | Porcentaje de la obra entera, ya calculado. Para una editora, el `publisherShare.percent` de su contrato por la autoría de los autores de `via`, sobre 100: el 25 % de un autor que tiene 50 es 12,5. |

## Grabaciones

### `Recording`

Una grabación de una o más obras. Se usa en [`Document.recordings`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id local, único en el archivo (`r1`). |
| `title` | texto | no | Título. |
| `versionTitle` | texto | no | Título de la versión, por ejemplo «En vivo». |
| `displayArtist` | texto | no | Artista como figura en los créditos. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | ISRC, código de la grabación en una sociedad, id del emisor. |
| `isrcIssuer` | [`IsrcIssuer`](#isrcissuer) | no | Quién asignó el ISRC. |
| `works` | lista de ids de `works` | no | Obras que contiene. Tiene que coincidir con `recordings` de cada obra. |
| `purposes` | lista, [abierta](../values/recordingPurposes.json): `registrationAudio`, `commercial`, `reference` | no | Para qué se entrega: audio de registro, comercial o de referencia. |
| `type` | [abierta](../values/recordingTypes.json): `studio`, `live`, `remix`, `library`, `demo` | no | Tipo: estudio, en vivo, remix, librería o demo. |
| `duration` | duración | no | Duración. |
| `recordingDate` | fecha | no | Fecha de grabación. |
| `fixationCountry` | país | no | País donde se grabó. |
| `firstPublication` | [`FirstPublication`](#firstpublication) | no | Primera publicación. |
| `producers` | lista de [`Producer`](#producer) | no | Productores fonográficos. |
| `pLine` | [`PLine`](#pline) | no | Leyenda ℗. |
| `label` | id de `parties` | no | Sello. |
| `release` | [`Release`](#release) | no | Lanzamiento en el que salió. |
| `performers` | lista de [`Performer`](#performer) | no | Intérpretes. |
| `contributors` | lista de [`RecordingContributor`](#recordingcontributor) | no | Otros colaboradores: productor artístico, ingenieros, remixer. |
| `samples` | lista de [`Sample`](#sample) | no | Grabaciones sampleadas. |
| `ai` | [`RecordingAi`](#recordingai) | no | Participación de inteligencia artificial en la grabación. |
| `languageOfPerformance` | idioma | no | Idioma en que se canta. |
| `links` | lista de [`Link`](#link) | no | Publicación en plataformas digitales. |
| `media` | lista de ids de `media` | no | Archivos de la grabación: el audio. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `IsrcIssuer`

Quién asignó el ISRC de una grabación. Se usa en [`Recording.isrcIssuer`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `kind` | cerrada: `agency`, `aggregator` | no | Agencia o agregador. |
| `name` | texto | no | Nombre. |

### `FirstPublication`

La primera publicación de una grabación. Se usa en [`Recording.firstPublication`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `date` | fecha | no | Fecha. |
| `country` | país | no | País. |
| `simultaneous` | lista de países | no | Países de publicación simultánea. |

### `Producer`

Un productor fonográfico. Se usa en [`Recording.producers`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El productor. |
| `role` | cerrada: `original`, `licensor`, `licensee` | no | Productor original, licenciante o licenciatario. |
| `percent` | porcentaje | no | Porcentaje de propiedad del máster. |

### `PLine`

La leyenda ℗ de una grabación. Se usa en [`Recording.pLine`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `year` | año | no | Año. |
| `owner` | id de `parties` | no | Titular. |
| `text` | texto | no | Texto completo, por ejemplo `℗ 2026 Sello Sur`. |

### `Release`

Un lanzamiento: álbum, simple. Se usa en [`Recording.release`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `title` | texto | no | Título. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | UPC/EAN (`ICPN`) y número de catálogo (`CATALOG_NUMBER`). |
| `date` | fecha | no | Fecha de lanzamiento. |
| `carrier` | [abierta](../values/carriers.json): `digital`, `cd`, `vinyl`, `cassette` | no | Soporte: digital, CD, vinilo, casete. |

### `Performer`

Un intérprete de una grabación. Se usa en [`Recording.performers`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El intérprete. |
| `role` | [abierta](../values/performerRoles.json): `mainPerformer`, `featuredPerformer`, `conductor`, `sessionMusician`, `backgroundVocalist`, `ensemble` | no | Rol: principal, invitado, director, músico de sesión, corista o conjunto. |
| `instruments` | lista de [`PerformerInstrument`](#performerinstrument) | no | Instrumentos que toca. |
| `credited` | booleano | no | Si figura en los créditos. |
| `societyCategories` | lista de [`SocietyCategory`](#societycategory) | no | Su categoría en una sociedad de intérpretes, si se conoce. |
| `participation` | [`Participation`](#participation) | no | Fracción de participación. |
| `members` | lista de ids de `parties` | no | Integrantes, si es un conjunto. |

### `PerformerInstrument`

Un instrumento de un intérprete. Se usa en [`Performer.instruments`](#performer).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `scheme` | [abierta](../values/instrumentSchemes.json), sin valores todavía | sí | Vocabulario del instrumento. Todavía no hay uno recomendado: se usan esquemas propios `X_`. |
| `code` | texto | sí | Código del instrumento en ese vocabulario. |
| `name` | texto | no | Nombre del instrumento. |

### `SocietyCategory`

La categoría de un intérprete en una sociedad. Se usa en [`Performer.societyCategories`](#performer).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `society` | sociedad | sí | Código de la sociedad. |
| `code` | texto | sí | Categoría en esa sociedad, por ejemplo `G1`. |

### `Participation`

La participación de un intérprete. Se usa en [`Performer.participation`](#performer).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fraction` | fracción | sí | Fracción, por ejemplo `1/3`. |

### `RecordingContributor`

Un colaborador técnico o artístico de una grabación. Se usa en [`Recording.contributors`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | El colaborador. |
| `role` | [abierta](../values/recordingContributorRoles.json): `studioProducer`, `recordingEngineer`, `mixingEngineer`, `masteringEngineer`, `remixer` | sí | Rol: productor artístico, ingeniero de grabación, de mezcla o de masterización, remixer. |

### `Sample`

Una grabación sampleada: del archivo (`recording`) o externa (`external`), exactamente una de las dos. Se usa en [`Recording.samples`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `recording` | id de `recordings` | exactamente uno de `recording` y `external` | Una grabación del archivo. |
| `external` | [`ExternalRecording`](#externalrecording) | exactamente uno de `recording` y `external` | Una grabación que no está en el archivo. |
| `producer` | id de `parties` | no | Productor de la grabación sampleada. |
| `authorization` | id de `agreements` (`derivativeAuthorization`) | no | El contrato que autoriza el uso. |

### `ExternalRecording`

Una grabación que no está en el archivo. Se usa en [`Sample.external`](#sample).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `title` | texto | al menos uno de `title` y `identifiers` | Título. |
| `displayArtist` | texto | no | Artista como figura en los créditos. |
| `identifiers` | lista de [`Identifier`](#identifier) | al menos uno de `title` y `identifiers` | Identificadores, por ejemplo el ISRC. |

### `RecordingAi`

La participación de inteligencia artificial en una grabación, por elemento. Se usa en [`Recording.ai`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `declared` | booleano | no | Si el declarante informó sobre IA. Ausente o `false` quiere decir «no informado», no «sin IA». |
| `elements` | lista de [`RecordingAiElement`](#recordingaielement) | no | La participación en cada elemento: voces, instrumentos, arreglo. |

### `RecordingAiElement`

La participación de IA en un elemento de la grabación. Se usa en [`RecordingAi.elements`](#recordingai).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `element` | cerrada: `vocals`, `instruments`, `arrangement` | sí | Elemento: voces, instrumentos o arreglo. |
| `involvement` | cerrada: `none`, `assisted`, `generated` | sí | Nivel: ninguno, asistido o generado. |
| `tools` | lista de textos | no | Herramientas usadas. |
| `prompt` | texto | no | Instrucción usada, si se informa. |

### `Link`

Una publicación en una plataforma digital. Se usa en [`Recording.links`](#recording).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `platform` | [abierta](../values/platforms.json): `spotify`, `appleMusic`, `youtube`, `youtubeMusic`, `deezer`, `amazonMusic`, `tidal`, `soundcloud`, `bandcamp` | no | Plataforma: Spotify, Apple Music, YouTube, etc. |
| `url` | url | sí | Dirección de la publicación. |

## Contratos

### `Agreement`

Un contrato firmado. Se usa en [`Document.agreements`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id local, único en el archivo (`a1`). |
| `uid` | uuid | no | Identificador estable del contrato: lo reconoce entre revisiones y desde otras declaraciones. |
| `type` | cerrada: `publishing`, `subPublishing`, `administration`, `assignment`, `derivativeAuthorization`, `writerSplit` | sí | Tipo: edición, subedición, administración, cesión, autorización de obra derivada o carta de reparto entre coautores. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | Número de contrato del emisor o de una sociedad. |
| `parties` | lista de [`AgreementParty`](#agreementparty) | no | Las partes y su rol. |
| `parent` | [`AgreementParent`](#agreementparent) | no | Contrato del que depende; por ejemplo, una subedición apunta a su edición. |
| `works` | lista de ids de `works` | no | Obras de esta declaración que cubre. |
| `numberOfWorks` | entero ≥ 1 | no | Total de obras del contrato. |
| `scope` | cerrada: `works`, `catalog` | no | Si cubre obras determinadas o un catálogo. |
| `grantedRights` | lista, cerrada: `performing`, `mechanical`, `synchronization`, `print` | no | Lo que el contrato transfiere; en el contrato tipo, la edición impresa (`print`). |
| `rights` | lista, cerrada: `performing`, `mechanical`, `synchronization`, `print` | no | Derechos sobre los que participa la editora. |
| `excludedRights` | lista de [`ExcludedRight`](#excludedright) | no | Derechos excluidos por una observación. |
| `territories` | [`Territories`](#territories) | no | Territorio del contrato. |
| `signatureDate` | fecha | no | Fecha de la última firma. |
| `signedPlace` | [`Place`](#place) | no | Lugar de la firma. |
| `startDate` | fecha | no | Inicio de la vigencia. |
| `term` | [`Term`](#term) | no | Plazo: el de protección del derecho de autor o uno fijo. |
| `endDate` | fecha | no; prohibido si `term.basis` es `protectionPeriod` | Fin de la vigencia. Con plazo fijo, es el inicio más la duración. |
| `renewal` | [`Renewal`](#renewal) | no | Renovación. |
| `postTermCollection` | [`PostTermCollection`](#posttermcollection) | no | Cobro posterior al fin del contrato. |
| `publisherShare` | [`PublisherShare`](#publishershare) | no | Lo que el contrato da a la editora sobre la parte de quienes lo conceden, con la condición que sube el tope, si la hay. |
| `terms` | [`Terms`](#terms) | no | Plantilla, contrato tipo y valores pactados. |
| `observations` | lista de [`Observation`](#observation) | no | Observaciones impresas en el contrato. |
| `registrations` | lista de [`Registration`](#registration) | no | Inscripción del contrato ante un organismo (`kind`: `contract`). |
| `media` | lista de ids de `media` (`signedContract`, `splitAgreement`) | no | El PDF firmado. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `AgreementParty`

Una parte de un contrato. Se usa en [`Agreement.parties`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | La persona u organización. |
| `role` | cerrada: `grantor`, `grantee`, `coWriter` | sí | Rol: cedente (`grantor`), cesionario (`grantee`) o coautor (`coWriter`, en una carta de reparto). |

### `AgreementParent`

El contrato del que depende otro: del archivo (`agreement`) o de otra declaración (`uid`), exactamente uno de los dos. Se usa en [`Agreement.parent`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `agreement` | id de `agreements` | exactamente uno de `agreement` y `uid` | Un contrato del archivo. |
| `uid` | uuid | exactamente uno de `agreement` y `uid` | El `uid` de un contrato de otra declaración. |
| `identifiers` | lista de [`Identifier`](#identifier) | no | Número de ese contrato. |

### `ExcludedRight`

Un derecho excluido de un contrato. Se usa en [`Agreement.excludedRights`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `right` | cerrada: `performing`, `mechanical`, `synchronization`, `print` | sí | El derecho excluido. |
| `observation` | texto | no | Texto de la observación que lo excluye. |

### `Term`

El plazo de un contrato. Se usa en [`Agreement.term`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `basis` | cerrada: `protectionPeriod`, `fixed` | sí | El plazo de protección del derecho de autor (`protectionPeriod`) o uno fijo (`fixed`). |
| `duration` | duración | si `basis` es `fixed`; prohibido si `basis` es `protectionPeriod` | Duración del plazo fijo, por ejemplo `P10Y`. |

### `Renewal`

La renovación de un contrato. Se usa en [`Agreement.renewal`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `automatic` | booleano | no | Si se renueva sola. |
| `period` | duración | no | Duración de cada renovación. |
| `maxRenewals` | entero ≥ 0 | no | Cantidad máxima de renovaciones. |
| `noticePeriod` | duración | no | Anticipación del aviso para no renovar. |

### `PostTermCollection`

El cobro posterior al fin de un contrato. Se usa en [`Agreement.postTermCollection`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `status` | cerrada: `none`, `openEnded`, `date` | sí | Sin cobro posterior (`none`), sin fecha de fin (`openEnded`) o hasta una fecha (`date`). |
| `endDate` | fecha | si `status` es `date`; si no, prohibido | Hasta cuándo se cobra. |

### `PublisherShare`

El porcentaje que un contrato da a la editora sobre la parte de quienes lo conceden. Se usa en [`Agreement.publisherShare`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `percent` | porcentaje | sí | Porcentaje del contrato sobre la parte de cada `grantor` en la obra, no sobre la obra entera: con 25 y un autor que tiene 50, la editora cobra 12,5 de la obra. Los topes editoriales se comparan con este valor. |
| `condition` | [`Condition`](#condition) | no | Condición que permite superar el tope, por ejemplo una del art. 8 del contrato tipo (`SADAIC_ART8`). |

### `Terms`

Las condiciones de un contrato. Se usa en [`Agreement.terms`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `template` | [`Template`](#template) | no | Plantilla del emisor con la que se generó. |
| `basedOn` | [`StandardContract`](#standardcontract) | no | Contrato tipo en el que se basa. |
| `values` | [`TermValues`](#termvalues) | no | Valores pactados. |

### `Template`

La plantilla con la que se generó un contrato. Se usa en [`Terms.template`](#terms).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `code` | texto | no | Código de la plantilla en el emisor. |
| `sha256` | sha256 | sí | Hash de la plantilla. |

### `TermValues`

Los valores pactados en un contrato tipo. Se usa en [`Terms.values`](#terms).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `retailPricePercent` | porcentaje | no | Porcentaje sobre el precio de venta de la edición impresa. |
| `arrangementRetailPricePercent` | porcentaje | no | Porcentaje sobre el precio de venta de orquestaciones y transcripciones. |
| `collectionStart` | cerrada: `presentationSemester`, `nextSemester` | no | Desde cuándo se cobra: el semestre de la presentación o el siguiente. |
| `investedAmount` | [`InvestedAmount`](#investedamount) | no | Monto invertido por la editora. |

### `InvestedAmount`

El monto invertido por la editora. Se usa en [`TermValues.investedAmount`](#termvalues).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `status` | cerrada: `determined`, `undetermined` | sí | Si el monto está determinado (`determined`) o no (`undetermined`). |
| `amount` | importe | si `status` es `determined`; prohibido si `status` es `undetermined` | Importe. |
| `currency` | moneda | si `status` es `determined`; prohibido si `status` es `undetermined` | Moneda. |

### `Observation`

Una observación impresa en un contrato. Se usa en [`Agreement.observations`](#agreement).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `title` | texto | no | Título. |
| `article` | texto | no | Artículo que modifica, como texto (`"10"`). |
| `parties` | lista de ids de `parties` | no | Partes a las que se refiere. |
| `text` | texto | sí | Texto de la observación. |

## Edición

### `Edition`

Una edición publicada. Se usa en [`Document.edition`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `identifiers` | lista de [`Identifier`](#identifier) | no | Número de edición del emisor o de una sociedad. |
| `name` | texto | no | Nombre de la edición. |
| `registeredTitle` | texto | no | Título registrado. |
| `type` | [abierta](../values/editionTypes.json): `single`, `album`, `integral` | no | Tipo: simple, álbum o integral. |
| `contentType` | cerrada: `scores`, `audios`, `scoresAndAudios` | no | Contenido: partituras, audios o los dos. |
| `ordinal` | entero ≥ 1 | no | Número de edición (1 para la primera). |
| `publishers` | lista de ids de `parties` | no | Editoras de la edición. |
| `publicationDate` | fecha | no | Fecha de publicación. |
| `publicationPlace` | [`Place`](#place) | no | Lugar de publicación. |
| `publicationLinks` | lista de urls | no | Enlaces de la publicación digital. |
| `price` | [`Amount`](#amount) | no | Precio. |
| `printRun` | [`PrintRun`](#printrun) | no | Tirada. |
| `works` | lista de ids de `works` | no | Obras de la edición, en orden. |
| `registrations` | lista de [`Registration`](#registration) | no | Registro de la edición como obra publicada. |
| `deposit` | [`Deposit`](#deposit) | no | Depósito legal. |
| `media` | lista de ids de `media` | no | Archivos de la edición: ejemplar, declaración de tirada, planilla de la sociedad, presentación del registro. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `PrintRun`

La tirada de una edición. Se usa en [`Edition.printRun`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `mode` | cerrada: `printed`, `onDemand` | no | Impresa o bajo demanda. |
| `saleCopies` | entero ≥ 0 | no | Ejemplares para la venta. |
| `promotionalCopies` | entero ≥ 0 | no | Ejemplares de promoción. |

### `Deposit`

El depósito legal de una edición. Se usa en [`Edition.deposit`](#edition).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `mode` | cerrada: `physical`, `digital` | sí | Físico o digital. |
| `sha256` | sha256 | no | Hash del ejemplar depositado. |
| `copy` | id de `media` (`legalDepositCopy`) | no | El archivo del ejemplar. Si van `sha256` y `copy`, los hashes tienen que coincidir. |

## Archivos

### `Media`

Un archivo que viaja aparte, descrito por su tamaño y su hash. Se usa en [`Document.media`](#document).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `id` | id local | sí | Id local, único en el archivo (`m1`). |
| `kind` | [abierta](../values/mediaKinds.json): `signedContract`, `splitAgreement`, `timestampProof`, `printRunStatement`, `legalDepositCopy`, `registrationFiling`, `registrationCertificate`, `societyForm`, `declarationForm`, `score`, `lyrics`, `audio`, `taxIdCertificate` | sí | Qué es: contrato firmado, carta de reparto, ejemplar, declaración de tirada, presentación o certificado de registro, planilla, boletín, partitura, letra, audio, etc. |
| `mediaType` | tipo de medio | no | Tipo de archivo, por ejemplo `application/pdf`. |
| `size` | entero ≥ 0 | no | Tamaño en bytes del archivo entregado. |
| `sha256` | sha256 | no | Hash SHA-256 de los bytes exactos del archivo entregado. |
| `path` | texto | no; prohibido si `delivered` es `false` | Ruta relativa a la raíz de la entrega: segmentos `[A-Za-z0-9._-]` separados por `/`. |
| `delivery` | entero ≥ 1 | no | Revisión en la que viajó el archivo. Un archivo ya entregado se vuelve a declarar en las revisiones siguientes, con su revisión de entrega. |
| `delivered` | booleano | no | `false` si el archivo se declara pero no viaja. Por defecto, `true`. |
| `personalData` | booleano | no | Si el archivo contiene datos personales. |
| `evidence` | [`Evidence`](#evidence) | no | Pruebas de la firma del documento. |
| `extensions` | objeto | no | Datos que el schema no prevé, con claves de dominio invertido (`ar.example.dato`). |

### `Evidence`

Las pruebas de la firma de un documento. Se usa en [`Media.evidence`](#media).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `esignature` | [`ESignature`](#esignature) | no | Firma electrónica: proveedor, tipo y sello de tiempo. |
| `signers` | lista de [`Signer`](#signer) | no | Quién firmó y cuándo. |
| `annexed` | lista de [`Annexed`](#annexed) | no | Archivos anexados al documento, con el hash impreso en el anexo. |
| `anchors` | lista de [`Anchor`](#anchor) | no | Anclajes del documento en una cadena de bloques. |

### `ESignature`

La firma electrónica de un documento. Se usa en [`Evidence.esignature`](#evidence).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `provider` | texto | sí | Proveedor de firma. |
| `envelopeId` | texto | no | Id del documento en el proveedor. |
| `legalClass` | cerrada: `electronic`, `digital` | no | Firma electrónica o firma digital, en el sentido de la ley. |
| `identityMethods` | lista, [abierta](../values/identityMethods.json): `invitationLink`, `emailOtp`, `smsOtp`, `totp`, `digitalCertificate` | no | Cómo se identificó a los firmantes: enlace de invitación, código por correo o SMS, TOTP, certificado digital. |
| `contactSource` | [abierta](../values/contactSources.json): `declarant`, `signer` | no | Quién cargó los datos de contacto de los firmantes: el declarante o el propio firmante. |
| `timestamp` | [`Timestamp`](#timestamp) | no | Sello de tiempo del documento. |

### `Timestamp`

El sello de tiempo RFC 3161 de un documento. Se usa en [`ESignature.timestamp`](#esignature).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `source` | cerrada: `pdfEmbedded`, `tsa` | sí | De dónde se tomó: del PDF (`pdfEmbedded`) o de la autoridad de sellado (`tsa`). |
| `generatedAt` | instante | sí | Fecha y hora del sello. |

### `Signer`

Un firmante de un documento. Se usa en [`Evidence.signers`](#evidence).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `party` | id de `parties` | sí | Quién firmó. |
| `onBehalfOf` | id de `parties` | no | En nombre de quién firmó, si representa a una organización. |
| `signedAt` | instante | no | Cuándo firmó. |

### `Annexed`

Un archivo anexado a un documento. Se usa en [`Evidence.annexed`](#evidence).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `fileName` | texto | no | Nombre del archivo como figura en el anexo. |
| `media` | id de `media` | no | El archivo, si viaja en la entrega. Su hash tiene que coincidir. |
| `sha256` | sha256 | sí | Hash impreso en el anexo. |

### `Anchor`

Un anclaje de un documento en una cadena de bloques. Se usa en [`Evidence.anchors`](#evidence).

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `method` | [abierta](../values/anchorMethods.json): `openTimestamps` | sí | Método, por ejemplo `openTimestamps`. |
| `proof` | id de `media` (`timestampProof`) | no | El archivo de la prueba (`.ots`). |

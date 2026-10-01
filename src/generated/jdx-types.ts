/**
 * Tipos del documento JDX 1.0: generado por `npm run gen`
 * desde schema/src/types.json. No editar a mano.
 *
 * Los nombres son los de types.json, salvo los de TS_RENAMES:
 * Document → JdxDocument, Signer → EvidenceSigner, Condition → AgreementCondition.
 * Los patrones, las restricciones condicionales y las listas abiertas los
 * controla el schema: acá un id, una fecha o un valor de lista abierta son `string`.
 */

/** El valor de una extensión: cualquier JSON salvo null. */
export type ExtensionValue = boolean | number | string | readonly ExtensionValue[] | { readonly [key: string]: ExtensionValue };

/** Extensiones: cada clave es un dominio invertido (`ar.example.x`). */
export type Extensions = { readonly [key: string]: ExtensionValue };

/** La raíz del archivo: la declaración y sus listas de personas, obras, grabaciones, contratos y archivos. */
export interface JdxDocument {
  /** URL del schema de la versión menor del archivo, por ejemplo `https://jdx.jupiter.ar/schema/1.0/jdx.schema.json`. Es un identificador: no se descarga. */
  readonly $schema: string;
  /** Versión del formato, `M.m` (hoy `1.0`). */
  readonly jdx: string;
  /** Perfiles que el emisor cree que aplican. Es informativo: el perfil lo elige quien recibe. */
  readonly profiles?: readonly string[];
  /** Qué declaración es, qué revisión y quién la emite. */
  readonly declaration: Declaration;
  /** Personas y organizaciones: autores, editoras, intérpretes, productores, representantes. Cada una aparece una vez y el resto del archivo la referencia por su id. */
  readonly parties?: readonly Party[];
  /** Obras declaradas. */
  readonly works?: readonly Work[];
  /** Grabaciones de las obras. */
  readonly recordings?: readonly Recording[];
  /** Contratos firmados: edición, subedición, cartas de reparto entre coautores, autorizaciones. */
  readonly agreements?: readonly Agreement[];
  /** Archivos que viajan aparte (PDF, audios, planillas), descritos por su tamaño y su hash. */
  readonly media?: readonly Media[];
  /** La edición publicada. Si falta, la declaración es de obras no editadas. */
  readonly edition?: Edition;
  readonly extensions?: Extensions;
}

/** Los datos de la declaración: identificador estable, revisión y emisor. */
export interface Declaration {
  /** Identificador estable de la declaración. Es el mismo en todas sus revisiones. */
  readonly id: string;
  /** Número de revisión. Crece en cada reenvío; quien recibe reemplaza la declaración entera cuando llega una revisión mayor que la última que cargó. */
  readonly revision: number;
  /** Cuándo se armó esta revisión. Es igual al `issuedAt` de la firma. */
  readonly createdAt: string;
  /** El emisor que arma y firma el archivo. */
  readonly issuer: Issuer;
  /** Quién declara: la editora o, en obras no editadas, el autor. Id local de `parties`. */
  readonly declarant?: string;
  /** Sociedades a las que va dirigida. */
  readonly recipients?: readonly Recipient[];
  /** Idioma de los textos libres del archivo. */
  readonly language?: string;
}

/** El emisor del archivo, tal como figura en la lista de confianza. */
export interface Issuer {
  /** Id del emisor en la lista de confianza. */
  readonly id: string;
  /** Nombre del emisor. */
  readonly name: string;
  /** Huella (`kid`) de la clave con la que firma. */
  readonly keyId: string;
}

/** Una sociedad destinataria. */
export interface Recipient {
  /** Código de la sociedad: el de CISAC (3 dígitos, `061`) o uno de JDX (`X_JDX_AADI`). */
  readonly society: string;
}

/** Un nombre de una persona u organización. */
export interface Name {
  /** Tipo de nombre: legal, seudónimo o nombre comercial. Lista abierta `nameTypes`: legal, pseudonym, trade, o un valor propio `X_`. */
  readonly type: string;
  /** Nombre o nombres de pila. Solo personas. */
  readonly given?: string;
  /** Apellido o apellidos. Solo personas. */
  readonly family?: string;
  /** Nombre completo sin desglosar: seudónimos, nombres comerciales y organizaciones. */
  readonly full?: string;
  /** Registro del seudónimo (`kind`: `pseudonym`). */
  readonly registrations?: readonly Registration[];
}

/** Un identificador con su esquema: IPI, ISNI, ISWC, ISRC, CUIT, DNI, el código de una sociedad, etc. */
export interface Identifier {
  /** Esquema del identificador. Los esquemas propios de un emisor o de una sociedad llevan prefijo `X_`. Lista abierta `identifierSchemes`: IPI_NAME, IPI_BASE, ISNI, IPN, TAX_ID, NATIONAL_ID, ISSUER, ISWC, SOCIETY_WORK, ISRC, SOCIETY_RECORDING, ICPN, CATALOG_NUMBER, ISAN, o un valor propio `X_`. */
  readonly scheme: string;
  /** El valor, como texto. Su formato lo controlan las reglas del perfil, no el schema. */
  readonly value: string;
  /** País que emite el identificador fiscal o el documento. */
  readonly country?: string;
  /** Tipo de identificador fiscal o de documento (`CUIT`, `DNI`, `CPF`…). Lista abierta `identifierTypes`: CUIT, CUIL, CDI, CPF, CNPJ, RFC, RUT, NIT, RUC, RIF, DNI, CI, CURP, CEDULA, RG, RUN, PASSPORT, o un valor propio `X_`. */
  readonly type?: string;
  /** Sociedad que asignó el código. */
  readonly society?: string;
  /** Sello que asignó el número de catálogo. */
  readonly issuer?: string;
}

/** El género de una obra, según el vocabulario de quien lo define. */
export interface Classification {
  /** Vocabulario del género, por ejemplo `SADAIC_GENRE`. Lista abierta `classificationSchemes`: SADAIC_GENRE, o un valor propio `X_`. */
  readonly scheme: string;
  /** Código del género en ese vocabulario. En `SADAIC_GENRE`, de 1 a 3 dígitos, sin ceros a la izquierda. */
  readonly code: string;
  /** Nombre del género. En `SADAIC_GENRE` identifica el género junto con `code`, porque la lista repite códigos. */
  readonly name?: string;
}

/** Una condición de un contrato que cambia el tope editorial. */
export interface AgreementCondition {
  /** Vocabulario de la condición, por ejemplo `SADAIC_ART8`. Lista abierta `conditionSchemes`: SADAIC_ART8, o un valor propio `X_`. */
  readonly scheme: string;
  /** Código de la condición en ese vocabulario. */
  readonly code: string;
  /** Nombre de la condición. */
  readonly name?: string;
}

/** El contrato tipo en el que se basa un contrato. */
export interface StandardContract {
  /** Vocabulario del contrato tipo, por ejemplo `SADAIC_CONTRACT`. Lista abierta `contractTemplateSchemes`: SADAIC_CONTRACT, o un valor propio `X_`. */
  readonly scheme: string;
  /** Código del contrato tipo en ese vocabulario. */
  readonly code: string;
  /** Nombre del contrato tipo. */
  readonly name?: string;
}

/** Territorios con códigos TIS de CISAC: los incluidos menos los excluidos. */
export interface Territories {
  /** Territorios incluidos, por ejemplo `2136` (el mundo) o `0032` (Argentina). */
  readonly include: readonly string[];
  /** Territorios que se restan de los incluidos. */
  readonly exclude?: readonly string[];
}

/** Un domicilio postal. */
export interface Address {
  /** Calle y número. */
  readonly street?: string;
  /** Piso. */
  readonly floor?: string;
  /** Departamento u oficina. */
  readonly unit?: string;
  /** Ciudad o localidad. */
  readonly city?: string;
  /** Provincia o estado. */
  readonly subdivision?: Subdivision;
  /** Código postal. */
  readonly postalCode?: string;
  /** País. */
  readonly country?: string;
}

/** Un lugar: ciudad, provincia y país. */
export interface Place {
  /** Ciudad o localidad. */
  readonly city?: string;
  /** Provincia o estado. */
  readonly subdivision?: Subdivision;
  /** País. */
  readonly country?: string;
}

/** Una provincia, estado o departamento. */
export interface Subdivision {
  /** Código ISO 3166-2, por ejemplo `AR-B`. */
  readonly code?: string;
  /** Nombre, por ejemplo `Buenos Aires`. */
  readonly name: string;
}

/** Datos de contacto. */
export interface Contact {
  /** Correo electrónico. */
  readonly email?: string;
  /** Teléfono en formato internacional, por ejemplo `+5491155550000`. */
  readonly phone?: string;
}

/** Un importe con su moneda. */
export interface Amount {
  /** Importe como texto decimal, con hasta 4 decimales: `"1500.00"`. */
  readonly amount: string;
  /** Moneda ISO 4217, por ejemplo `ARS`. */
  readonly currency: string;
}

/** Un registro ante un organismo nacional: depósito de obra, inscripción de contrato o de seudónimo. */
export interface Registration {
  /** Organismo, por ejemplo `DNDA_AR`. Lista abierta `registries`: DNDA_AR, INDAUTOR_MX, DNDA_CO, DINAPI_PY, INDECOPI_PE, SENADI_EC, DDI_CL, BN_UY, EDA_BR, o un valor propio `X_`. */
  readonly registry: string;
  /** Qué se registró: obra inédita, obra publicada, contrato o seudónimo. Lista abierta `registrationKinds`: unpublishedDeposit, publishedWork, contract, pseudonym, o un valor propio `X_`. */
  readonly kind: string;
  /** Número de registro o de expediente. */
  readonly number?: string;
  /** Fecha del registro. */
  readonly date?: string;
  /** Vencimiento del registro, si lo tiene. */
  readonly expiryDate?: string;
  /** El archivo de la presentación. Id local de `media` (registrationFiling). */
  readonly filing?: string;
  /** El archivo del certificado oficial. Puede llegar en una revisión posterior. Id local de `media` (registrationCertificate). */
  readonly certificate?: string;
}

/** Un registro de una obra, que además dice qué parte de la obra registra. */
export interface WorkRegistration {
  /** Organismo, por ejemplo `DNDA_AR`. Lista abierta `registries`: DNDA_AR, INDAUTOR_MX, DNDA_CO, DINAPI_PY, INDECOPI_PE, SENADI_EC, DDI_CL, BN_UY, EDA_BR, o un valor propio `X_`. */
  readonly registry: string;
  /** Qué se registró: obra inédita, obra publicada, contrato o seudónimo. Lista abierta `registrationKinds`: unpublishedDeposit, publishedWork, contract, pseudonym, o un valor propio `X_`. */
  readonly kind: string;
  /** Parte registrada: música, letra o las dos. */
  readonly part?: 'music' | 'lyrics' | 'both';
  /** Número de registro o de expediente. */
  readonly number?: string;
  /** Fecha del registro. */
  readonly date?: string;
  /** Vencimiento del registro, si lo tiene. */
  readonly expiryDate?: string;
  /** El archivo de la presentación. Id local de `media` (registrationFiling). */
  readonly filing?: string;
  /** El archivo del certificado oficial. Puede llegar en una revisión posterior. Id local de `media` (registrationCertificate). */
  readonly certificate?: string;
}

/** Una persona u organización: autor, editora, intérprete, productor, representante, heredero. */
export interface Party {
  /** Id local, único en el archivo (`p1`). */
  readonly id: string;
  /** Persona humana u organización. */
  readonly kind: 'person' | 'organization';
  /** Nombres: el legal y los seudónimos o nombres comerciales. */
  readonly names?: readonly Name[];
  /** Identificadores: IPI, ISNI, CUIT o CUIL, DNI y otros. */
  readonly identifiers?: readonly Identifier[];
  /** Género. */
  readonly gender?: 'female' | 'male' | 'nonBinary' | 'undisclosed';
  /** Fecha de nacimiento. */
  readonly birthDate?: string;
  /** Fecha de fallecimiento. Sirve para el dominio público y los herederos. */
  readonly deathDate?: string;
  /** Nacionalidad. */
  readonly nationality?: string;
  /** Estado civil. */
  readonly maritalStatus?: 'single' | 'married' | 'commonLawUnion' | 'civilUnion' | 'separated' | 'divorced' | 'widowed' | 'notDeclared';
  /** Domicilio. */
  readonly address?: Address;
  /** Correo y teléfono. */
  readonly contact?: Contact;
  /** Sociedades en las que está afiliada, con su número de socio. */
  readonly affiliations?: readonly Affiliation[];
  /** Padre, madre o tutor de un autor menor de edad. */
  readonly legalRepresentatives?: readonly LegalRepresentative[];
  /** Herederos o derechohabientes. */
  readonly successors?: readonly Successor[];
  /** Quienes representan a una organización y pueden firmar por ella. */
  readonly representatives?: readonly Representative[];
  /** Archivos de la persona, por ejemplo una constancia de CUIL. Id local de `media`. */
  readonly media?: readonly string[];
  readonly extensions?: Extensions;
}

/** La afiliación de una persona u organización a una sociedad. */
export interface Affiliation {
  /** Código de la sociedad. */
  readonly society: string;
  /** Número de socio o, para una editora, su número de cuenta en la sociedad. */
  readonly memberNumber?: string;
  /** Derechos que la sociedad gestiona para ella. Si falta, todos. */
  readonly rights?: readonly ('performing' | 'mechanical' | 'synchronization' | 'print')[];
  /** Territorios de la afiliación. Si falta, el mundo (`2136`). */
  readonly territories?: Territories;
  /** Desde cuándo. */
  readonly startDate?: string;
  /** Hasta cuándo. Si falta, sigue vigente. */
  readonly endDate?: string;
}

/** El representante legal de un autor menor de edad. */
export interface LegalRepresentative {
  /** El representante. Id local de `parties`. */
  readonly party: string;
  /** En qué carácter: padre o madre (`parent`) o tutor (`guardian`). Lista abierta `legalRepresentativeCapacities`: parent, guardian, o un valor propio `X_`. */
  readonly capacity?: string;
}

/** Un heredero o derechohabiente. */
export interface Successor {
  /** El heredero. Id local de `parties`. */
  readonly party: string;
  /** En qué carácter: heredero (`heir`) o representante unificado (`unifiedRepresentative`). Lista abierta `successorCapacities`: heir, unifiedRepresentative, o un valor propio `X_`. */
  readonly capacity?: string;
}

/** Quien representa a una organización. */
export interface Representative {
  /** La persona que representa a la organización. Id local de `parties`. */
  readonly party: string;
  /** Cargo: socio gerente, director, presidente, apoderado o socio. Lista abierta `representativeRoles`: managingPartner, director, president, attorney, partner, o un valor propio `X_`. */
  readonly role?: string;
  /** El cargo tal como se imprime, por ejemplo `Socia gerente`. */
  readonly title?: string;
  /** Si puede firmar por la organización. */
  readonly signatory?: boolean;
}

/** Una obra musical. */
export interface Work {
  /** Id local, único en el archivo (`w1`). */
  readonly id: string;
  /** Títulos: el original y los alternativos. Al menos uno. */
  readonly titles: readonly Title[];
  /** ISWC, código de la obra en una sociedad, id del emisor. */
  readonly identifiers?: readonly Identifier[];
  /** Géneros. */
  readonly classifications?: readonly Classification[];
  /** Categoría de reparto de CISAC: popular, seria, jazz o sin clasificar. */
  readonly distributionCategory?: 'POP' | 'SER' | 'JAZ' | 'UNC';
  /** Duración, por ejemplo `PT3M25S`. */
  readonly duration?: string;
  /** Solo música, solo texto, música y texto, o música y texto que no se crearon uno para el otro. */
  readonly textMusicRelationship?: 'music' | 'text' | 'musicAndText' | 'musicAndTextSeparate';
  /** Idiomas de la letra. */
  readonly lyricsLanguages?: readonly string[];
  /** Texto de la letra. */
  readonly lyrics?: Lyrics;
  /** Fecha de creación. */
  readonly creationDate?: string;
  /** Estreno. */
  readonly firstPerformance?: FirstPerformance;
  /** Inédita o editada. */
  readonly publicationStatus?: 'unpublished' | 'published';
  /** Registros nacionales de la obra (por ejemplo, el depósito en la DNDA), por parte. */
  readonly registrations?: readonly WorkRegistration[];
  /** Si es original o derivada (arreglo, adaptación, traducción) y de qué obra. */
  readonly version?: Version;
  /** Si combina otras obras: medley, popurrí, mashup. */
  readonly composite?: Composite;
  /** Obra de la que es un fragmento. */
  readonly excerptOf?: WorkRef;
  /** Si es una obra por encargo y quién la encargó. */
  readonly commissioned?: Commission;
  /** Participación de inteligencia artificial en la obra. */
  readonly ai?: Ai;
  /** Voces e instrumentos, para música de concierto. */
  readonly instrumentation?: Instrumentation;
  /** Si es una obra dramático-musical. */
  readonly grandRights?: boolean;
  /** Uso audiovisual o publicitario para el que se creó. */
  readonly origin?: Origin;
  /** Quiénes la crearon y con qué rol. */
  readonly contributors?: readonly Contributor[];
  /** Titularidad original por parte (música y letra). Cada parte suma 100. */
  readonly authorship?: readonly Authorship[];
  /** Quién cobra: filas por derecho y territorio, con porcentajes sobre la obra entera. */
  readonly shares?: readonly Share[];
  /** Grabaciones de la obra. Tiene que coincidir con `works` de cada grabación. Id local de `recordings`. */
  readonly recordings?: readonly string[];
  /** Archivos de la obra: partitura, letra, boletín. Id local de `media`. */
  readonly media?: readonly string[];
  /** Observaciones generales. */
  readonly notes?: string;
  readonly extensions?: Extensions;
}

/** Un título de una obra. */
export interface Title {
  /** Tipo: original, alternativo, traducido, transliterado, primera línea, etc. Lista abierta `titleTypes`: original, alternative, translated, transliterated, firstLine, formal, incorrect, part, search, o un valor propio `X_`. */
  readonly type?: string;
  /** El título. */
  readonly text: string;
  /** Idioma del título. */
  readonly language?: string;
}

/** La letra de una obra. */
export interface Lyrics {
  /** Texto completo de la letra. */
  readonly text: string;
  /** Idioma de la letra. */
  readonly language?: string;
}

/** El estreno de una obra. */
export interface FirstPerformance {
  /** Fecha del estreno. */
  readonly date?: string;
  /** Sala o lugar. */
  readonly venue?: string;
  /** Ciudad. */
  readonly city?: string;
  /** País. */
  readonly country?: string;
}

/** Una referencia a otra obra: una del archivo (`work`) o una externa (`external`), exactamente una de las dos. */
export interface WorkRef {
  /** Una obra del archivo. Id local de `works`. */
  readonly work?: string;
  /** Una obra que no está en el archivo. */
  readonly external?: External;
}

/** Una obra que no está en el archivo. */
export interface External {
  /** Títulos. */
  readonly titles?: readonly Title[];
  /** Identificadores, por ejemplo el ISWC. */
  readonly identifiers?: readonly Identifier[];
  /** Sus autores. */
  readonly writers?: readonly ExternalWriter[];
  /** Si está en dominio público, según declara el emisor. */
  readonly publicDomain?: boolean;
}

/** Un autor de una obra externa. */
export interface ExternalWriter {
  /** Nombres. */
  readonly names?: readonly Name[];
  /** Identificadores, por ejemplo el IPI. */
  readonly identifiers?: readonly Identifier[];
  /** Fecha de nacimiento. */
  readonly birthDate?: string;
  /** Fecha de fallecimiento. Sirve para el dominio público. */
  readonly deathDate?: string;
}

/** Si la obra es original o derivada de otra. */
export interface Version {
  /** Original, arreglo, adaptación, traducción, reemplazo de la letra u otra. */
  readonly type: 'original' | 'arrangement' | 'adaptation' | 'translation' | 'lyricReplacement' | 'other';
  /** La obra de origen de una derivada. */
  readonly original?: WorkRef;
  /** El contrato que autoriza la derivación. No hace falta si la obra de origen es de dominio público. Id local de `agreements` (derivativeAuthorization). */
  readonly authorization?: string;
}

/** Una obra hecha de otras. */
export interface Composite {
  /** Medley, popurrí, obra compuesta, mashup u obra con samples. */
  readonly type: 'medley' | 'potpourri' | 'composite' | 'mashup' | 'withSamples';
  /** Las obras que la componen. */
  readonly components?: readonly Component[];
}

/** Una obra que forma parte de una compuesta: del archivo (`work`) o externa (`external`), exactamente una de las dos. */
export interface Component {
  /** Una obra del archivo. Id local de `works`. */
  readonly work?: string;
  /** Una obra que no está en el archivo. */
  readonly external?: External;
  /** Duración del fragmento usado. */
  readonly duration?: string;
}

/** Si la obra fue por encargo. */
export interface Commission {
  /** Si fue por encargo. */
  readonly commissioned: boolean;
  /** Quién la encargó. Id local de `parties`. */
  readonly commissioner?: string;
}

/** La participación de inteligencia artificial en una obra, por elemento. */
export interface Ai {
  /** Si el declarante informó sobre IA. Ausente o `false` quiere decir «no informado», no «sin IA». */
  readonly declared?: boolean;
  /** La participación en cada elemento: letra, melodía, armonía, arreglo. */
  readonly elements?: readonly AiElement[];
  /** Descripción del aporte humano. */
  readonly humanContribution?: string;
}

/** La participación de IA en un elemento de la obra. */
export interface AiElement {
  /** Elemento: letra, melodía, armonía o arreglo. */
  readonly element: 'lyrics' | 'melody' | 'harmony' | 'arrangement';
  /** Nivel: ninguno, asistido o generado. */
  readonly involvement: 'none' | 'assisted' | 'generated';
  /** Herramientas usadas. */
  readonly tools?: readonly string[];
  /** Instrucción usada, si se informa. */
  readonly prompt?: string;
}

/** Las voces y los instrumentos de una obra. */
export interface Instrumentation {
  /** Cantidad de voces. */
  readonly voices?: number;
  /** Instrumentos. */
  readonly instruments?: readonly Instrument[];
  /** Descripción libre de la instrumentación. */
  readonly description?: string;
}

/** Un instrumento de una obra, con su cantidad. */
export interface Instrument {
  /** Vocabulario del instrumento. Todavía no hay uno recomendado: se usan esquemas propios `X_`. Lista abierta `instrumentSchemes`: sin valores iniciales, o un valor propio `X_`. */
  readonly scheme: string;
  /** Código del instrumento en ese vocabulario. */
  readonly code: string;
  /** Nombre del instrumento. */
  readonly name?: string;
  /** Cantidad. */
  readonly count?: number;
}

/** El uso audiovisual o publicitario para el que se creó una obra. */
export interface Origin {
  /** Para qué: cine, televisión, publicidad, librería musical, radio, teatro, videojuego. Lista abierta `originPurposes`: film, television, advertising, library, radio, theatre, videogame, o un valor propio `X_`. */
  readonly purpose?: string;
  /** Cómo se usa: fondo, logo, tema, visual o cues agrupados. Lista abierta `originUsages`: background, logo, theme, visual, rolledUpCue, o un valor propio `X_`. */
  readonly usage?: string;
  /** Título de la producción. */
  readonly productionTitle?: string;
  /** Número de la producción. */
  readonly productionNumber?: string;
  /** Año de la producción. */
  readonly productionYear?: number;
  /** Título del episodio. */
  readonly episodeTitle?: string;
  /** Número del episodio. */
  readonly episodeNumber?: string;
  /** Anunciante. */
  readonly advertiser?: string;
  /** Producto publicitado. */
  readonly product?: string;
  /** Librería musical. */
  readonly library?: string;
  /** Identificador del CD de la librería. */
  readonly cdIdentifier?: string;
  /** Número de corte en ese CD. */
  readonly cutNumber?: number;
  /** Identificadores de la producción, por ejemplo el ISAN. */
  readonly identifiers?: readonly Identifier[];
}

/** Quién creó la obra y con qué rol. */
export interface Contributor {
  /** La persona. Id local de `parties`. */
  readonly party: string;
  /** Roles: compositor, autor de la letra, arreglador, adaptador, traductor, etc. Al menos uno. Lista abierta `contributorRoles`: composer, lyricist, arranger, adapter, translator, subArranger, subLyricist, librettist, creator, o un valor propio `X_`. */
  readonly roles: readonly string[];
  /** Nombre con el que figura publicado. */
  readonly creditedAs?: string;
}

/** La titularidad original de una parte de la obra. */
export interface Authorship {
  /** El autor. Id local de `parties`. */
  readonly party: string;
  /** Parte: música o letra. */
  readonly part: 'music' | 'lyrics';
  /** Porcentaje de esa parte. Cada parte suma 100 en cada obra. */
  readonly percent: number;
  /** La carta de reparto entre coautores, si la hay. Id local de `agreements` (writerSplit). */
  readonly agreement?: string;
}

/** Una fila de cobro: quién cobra qué porcentaje de la obra, por derecho y territorio. */
export interface Share {
  /** Quién cobra. Id local de `parties`. */
  readonly party: string;
  /** Rol: autor, editora original, subeditora, subeditora sustituta, administradora, partícipe de ingresos o adquirente. */
  readonly role: 'writer' | 'originalPublisher' | 'subPublisher' | 'substitutedPublisher' | 'administrator' | 'incomeParticipant' | 'acquirer';
  /** De dónde sale lo que cobra: para una editora original, los autores que representa; para una subeditora, la editora original. Id local de `parties`. */
  readonly via?: readonly string[];
  /** El contrato que da ese derecho. Id local de `agreements` (publishing, subPublishing, administration, assignment, writerSplit). */
  readonly agreement?: string;
  /** Derechos: ejecución, mecánico, sincronización, impresión. Si falta, los del contrato; si el contrato no los dice, los cuatro. */
  readonly rights?: readonly ('performing' | 'mechanical' | 'synchronization' | 'print')[];
  /** Territorios. Si falta, los del contrato; si el contrato no los dice, el mundo (`2136`). */
  readonly territories?: Territories;
  /** Porcentaje sobre la obra entera. */
  readonly percent: number;
}

/** Una grabación de una o más obras. */
export interface Recording {
  /** Id local, único en el archivo (`r1`). */
  readonly id: string;
  /** Título. */
  readonly title?: string;
  /** Título de la versión, por ejemplo «En vivo». */
  readonly versionTitle?: string;
  /** Artista como figura en los créditos. */
  readonly displayArtist?: string;
  /** ISRC, código de la grabación en una sociedad, id del emisor. */
  readonly identifiers?: readonly Identifier[];
  /** Quién asignó el ISRC. */
  readonly isrcIssuer?: IsrcIssuer;
  /** Obras que contiene. Tiene que coincidir con `recordings` de cada obra. Id local de `works`. */
  readonly works?: readonly string[];
  /** Para qué se entrega: audio de registro, comercial o de referencia. Lista abierta `recordingPurposes`: registrationAudio, commercial, reference, o un valor propio `X_`. */
  readonly purposes?: readonly string[];
  /** Tipo: estudio, en vivo, remix, librería o demo. Lista abierta `recordingTypes`: studio, live, remix, library, demo, o un valor propio `X_`. */
  readonly type?: string;
  /** Duración. */
  readonly duration?: string;
  /** Fecha de grabación. */
  readonly recordingDate?: string;
  /** País donde se grabó. */
  readonly fixationCountry?: string;
  /** Primera publicación. */
  readonly firstPublication?: FirstPublication;
  /** Productores fonográficos. */
  readonly producers?: readonly Producer[];
  /** Leyenda ℗. */
  readonly pLine?: PLine;
  /** Sello. Id local de `parties`. */
  readonly label?: string;
  /** Lanzamiento en el que salió. */
  readonly release?: Release;
  /** Intérpretes. */
  readonly performers?: readonly Performer[];
  /** Otros colaboradores: productor artístico, ingenieros, remixer. */
  readonly contributors?: readonly RecordingContributor[];
  /** Grabaciones sampleadas. */
  readonly samples?: readonly Sample[];
  /** Participación de inteligencia artificial en la grabación. */
  readonly ai?: RecordingAi;
  /** Idioma en que se canta. */
  readonly languageOfPerformance?: string;
  /** Publicación en plataformas digitales. */
  readonly links?: readonly Link[];
  /** Archivos de la grabación: el audio. Id local de `media`. */
  readonly media?: readonly string[];
  readonly extensions?: Extensions;
}

/** Quién asignó el ISRC de una grabación. */
export interface IsrcIssuer {
  /** Agencia o agregador. */
  readonly kind?: 'agency' | 'aggregator';
  /** Nombre. */
  readonly name?: string;
}

/** La primera publicación de una grabación. */
export interface FirstPublication {
  /** Fecha. */
  readonly date?: string;
  /** País. */
  readonly country?: string;
  /** Países de publicación simultánea. */
  readonly simultaneous?: readonly string[];
}

/** Un productor fonográfico. */
export interface Producer {
  /** El productor. Id local de `parties`. */
  readonly party: string;
  /** Productor original, licenciante o licenciatario. */
  readonly role?: 'original' | 'licensor' | 'licensee';
  /** Porcentaje de propiedad del máster. */
  readonly percent?: number;
}

/** La leyenda ℗ de una grabación. */
export interface PLine {
  /** Año. */
  readonly year?: number;
  /** Titular. Id local de `parties`. */
  readonly owner?: string;
  /** Texto completo, por ejemplo `℗ 2026 Sello Sur`. */
  readonly text?: string;
}

/** Un lanzamiento: álbum, simple. */
export interface Release {
  /** Título. */
  readonly title?: string;
  /** UPC/EAN (`ICPN`) y número de catálogo (`CATALOG_NUMBER`). */
  readonly identifiers?: readonly Identifier[];
  /** Fecha de lanzamiento. */
  readonly date?: string;
  /** Soporte: digital, CD, vinilo, casete. Lista abierta `carriers`: digital, cd, vinyl, cassette, o un valor propio `X_`. */
  readonly carrier?: string;
}

/** Un intérprete de una grabación. */
export interface Performer {
  /** El intérprete. Id local de `parties`. */
  readonly party: string;
  /** Rol: principal, invitado, director, músico de sesión, corista o conjunto. Lista abierta `performerRoles`: mainPerformer, featuredPerformer, conductor, sessionMusician, backgroundVocalist, ensemble, o un valor propio `X_`. */
  readonly role?: string;
  /** Instrumentos que toca. */
  readonly instruments?: readonly PerformerInstrument[];
  /** Si figura en los créditos. */
  readonly credited?: boolean;
  /** Su categoría en una sociedad de intérpretes, si se conoce. */
  readonly societyCategories?: readonly SocietyCategory[];
  /** Fracción de participación. */
  readonly participation?: Participation;
  /** Integrantes, si es un conjunto. Id local de `parties`. */
  readonly members?: readonly string[];
}

/** Un instrumento de un intérprete. */
export interface PerformerInstrument {
  /** Vocabulario del instrumento. Todavía no hay uno recomendado: se usan esquemas propios `X_`. Lista abierta `instrumentSchemes`: sin valores iniciales, o un valor propio `X_`. */
  readonly scheme: string;
  /** Código del instrumento en ese vocabulario. */
  readonly code: string;
  /** Nombre del instrumento. */
  readonly name?: string;
}

/** La categoría de un intérprete en una sociedad. */
export interface SocietyCategory {
  /** Código de la sociedad. */
  readonly society: string;
  /** Categoría en esa sociedad, por ejemplo `G1`. */
  readonly code: string;
}

/** La participación de un intérprete. */
export interface Participation {
  /** Fracción, por ejemplo `1/3`. */
  readonly fraction: string;
}

/** Un colaborador técnico o artístico de una grabación. */
export interface RecordingContributor {
  /** El colaborador. Id local de `parties`. */
  readonly party: string;
  /** Rol: productor artístico, ingeniero de grabación, de mezcla o de masterización, remixer. Lista abierta `recordingContributorRoles`: studioProducer, recordingEngineer, mixingEngineer, masteringEngineer, remixer, o un valor propio `X_`. */
  readonly role: string;
}

/** Una grabación sampleada: del archivo (`recording`) o externa (`external`), exactamente una de las dos. */
export interface Sample {
  /** Una grabación del archivo. Id local de `recordings`. */
  readonly recording?: string;
  /** Una grabación que no está en el archivo. */
  readonly external?: ExternalRecording;
  /** Productor de la grabación sampleada. Id local de `parties`. */
  readonly producer?: string;
  /** El contrato que autoriza el uso. Id local de `agreements` (derivativeAuthorization). */
  readonly authorization?: string;
}

/** Una grabación que no está en el archivo. */
export interface ExternalRecording {
  /** Título. */
  readonly title?: string;
  /** Artista como figura en los créditos. */
  readonly displayArtist?: string;
  /** Identificadores, por ejemplo el ISRC. */
  readonly identifiers?: readonly Identifier[];
}

/** La participación de inteligencia artificial en una grabación, por elemento. */
export interface RecordingAi {
  /** Si el declarante informó sobre IA. Ausente o `false` quiere decir «no informado», no «sin IA». */
  readonly declared?: boolean;
  /** La participación en cada elemento: voces, instrumentos, arreglo. */
  readonly elements?: readonly RecordingAiElement[];
}

/** La participación de IA en un elemento de la grabación. */
export interface RecordingAiElement {
  /** Elemento: voces, instrumentos o arreglo. */
  readonly element: 'vocals' | 'instruments' | 'arrangement';
  /** Nivel: ninguno, asistido o generado. */
  readonly involvement: 'none' | 'assisted' | 'generated';
  /** Herramientas usadas. */
  readonly tools?: readonly string[];
  /** Instrucción usada, si se informa. */
  readonly prompt?: string;
}

/** Una publicación en una plataforma digital. */
export interface Link {
  /** Plataforma: Spotify, Apple Music, YouTube, etc. Lista abierta `platforms`: spotify, appleMusic, youtube, youtubeMusic, deezer, amazonMusic, tidal, soundcloud, bandcamp, o un valor propio `X_`. */
  readonly platform?: string;
  /** Dirección de la publicación. */
  readonly url: string;
}

/** Un contrato firmado. */
export interface Agreement {
  /** Id local, único en el archivo (`a1`). */
  readonly id: string;
  /** Identificador estable del contrato: lo reconoce entre revisiones y desde otras declaraciones. */
  readonly uid?: string;
  /** Tipo: edición, subedición, administración, cesión, autorización de obra derivada o carta de reparto entre coautores. */
  readonly type: 'publishing' | 'subPublishing' | 'administration' | 'assignment' | 'derivativeAuthorization' | 'writerSplit';
  /** Número de contrato del emisor o de una sociedad. */
  readonly identifiers?: readonly Identifier[];
  /** Las partes y su rol. */
  readonly parties?: readonly AgreementParty[];
  /** Contrato del que depende; por ejemplo, una subedición apunta a su edición. */
  readonly parent?: AgreementParent;
  /** Obras de esta declaración que cubre. Id local de `works`. */
  readonly works?: readonly string[];
  /** Total de obras del contrato. */
  readonly numberOfWorks?: number;
  /** Si cubre obras determinadas o un catálogo. */
  readonly scope?: 'works' | 'catalog';
  /** Lo que el contrato transfiere; en el contrato tipo, la edición impresa (`print`). */
  readonly grantedRights?: readonly ('performing' | 'mechanical' | 'synchronization' | 'print')[];
  /** Derechos sobre los que participa la editora. */
  readonly rights?: readonly ('performing' | 'mechanical' | 'synchronization' | 'print')[];
  /** Derechos excluidos por una observación. */
  readonly excludedRights?: readonly ExcludedRight[];
  /** Territorio del contrato. */
  readonly territories?: Territories;
  /** Fecha de la última firma. */
  readonly signatureDate?: string;
  /** Lugar de la firma. */
  readonly signedPlace?: Place;
  /** Inicio de la vigencia. */
  readonly startDate?: string;
  /** Plazo: el de protección del derecho de autor o uno fijo. */
  readonly term?: Term;
  /** Fin de la vigencia. Con plazo fijo, es el inicio más la duración. */
  readonly endDate?: string;
  /** Renovación. */
  readonly renewal?: Renewal;
  /** Cobro posterior al fin del contrato. */
  readonly postTermCollection?: PostTermCollection;
  /** Total de las editoras sobre la obra bajo este contrato, con la condición que sube el tope, si la hay. */
  readonly publisherShare?: PublisherShare;
  /** Plantilla, contrato tipo y valores pactados. */
  readonly terms?: Terms;
  /** Observaciones impresas en el contrato. */
  readonly observations?: readonly Observation[];
  /** Inscripción del contrato ante un organismo (`kind`: `contract`). */
  readonly registrations?: readonly Registration[];
  /** El PDF firmado. Id local de `media` (signedContract, splitAgreement). */
  readonly media?: readonly string[];
  readonly extensions?: Extensions;
}

/** Una parte de un contrato. */
export interface AgreementParty {
  /** La persona u organización. Id local de `parties`. */
  readonly party: string;
  /** Rol: cedente (`grantor`), cesionario (`grantee`) o coautor (`coWriter`, en una carta de reparto). */
  readonly role: 'grantor' | 'grantee' | 'coWriter';
}

/** El contrato del que depende otro: del archivo (`agreement`) o de otra declaración (`uid`), exactamente uno de los dos. */
export interface AgreementParent {
  /** Un contrato del archivo. Id local de `agreements`. */
  readonly agreement?: string;
  /** El `uid` de un contrato de otra declaración. */
  readonly uid?: string;
  /** Número de ese contrato. */
  readonly identifiers?: readonly Identifier[];
}

/** Un derecho excluido de un contrato. */
export interface ExcludedRight {
  /** El derecho excluido. */
  readonly right: 'performing' | 'mechanical' | 'synchronization' | 'print';
  /** Texto de la observación que lo excluye. */
  readonly observation?: string;
}

/** El plazo de un contrato. */
export interface Term {
  /** El plazo de protección del derecho de autor (`protectionPeriod`) o uno fijo (`fixed`). */
  readonly basis: 'protectionPeriod' | 'fixed';
  /** Duración del plazo fijo, por ejemplo `P10Y`. */
  readonly duration?: string;
}

/** La renovación de un contrato. */
export interface Renewal {
  /** Si se renueva sola. */
  readonly automatic?: boolean;
  /** Duración de cada renovación. */
  readonly period?: string;
  /** Cantidad máxima de renovaciones. */
  readonly maxRenewals?: number;
  /** Anticipación del aviso para no renovar. */
  readonly noticePeriod?: string;
}

/** El cobro posterior al fin de un contrato. */
export interface PostTermCollection {
  /** Sin cobro posterior (`none`), sin fecha de fin (`openEnded`) o hasta una fecha (`date`). */
  readonly status: 'none' | 'openEnded' | 'date';
  /** Hasta cuándo se cobra. */
  readonly endDate?: string;
}

/** El porcentaje total de las editoras bajo un contrato. */
export interface PublisherShare {
  /** Porcentaje sobre la obra entera. */
  readonly percent: number;
  /** Condición que permite superar el tope, por ejemplo una del art. 8 del contrato tipo (`SADAIC_ART8`). */
  readonly condition?: AgreementCondition;
}

/** Las condiciones de un contrato. */
export interface Terms {
  /** Plantilla del emisor con la que se generó. */
  readonly template?: Template;
  /** Contrato tipo en el que se basa. */
  readonly basedOn?: StandardContract;
  /** Valores pactados. */
  readonly values?: TermValues;
}

/** La plantilla con la que se generó un contrato. */
export interface Template {
  /** Código de la plantilla en el emisor. */
  readonly code?: string;
  /** Hash de la plantilla. */
  readonly sha256: string;
}

/** Los valores pactados en un contrato tipo. */
export interface TermValues {
  /** Porcentaje sobre el precio de venta de la edición impresa. */
  readonly retailPricePercent?: number;
  /** Porcentaje sobre el precio de venta de orquestaciones y transcripciones. */
  readonly arrangementRetailPricePercent?: number;
  /** Desde cuándo se cobra: el semestre de la presentación o el siguiente. */
  readonly collectionStart?: 'presentationSemester' | 'nextSemester';
  /** Monto invertido por la editora. */
  readonly investedAmount?: InvestedAmount;
}

/** El monto invertido por la editora. */
export interface InvestedAmount {
  /** Si el monto está determinado (`determined`) o no (`undetermined`). */
  readonly status: 'determined' | 'undetermined';
  /** Importe. */
  readonly amount?: string;
  /** Moneda. */
  readonly currency?: string;
}

/** Una observación impresa en un contrato. */
export interface Observation {
  /** Título. */
  readonly title?: string;
  /** Artículo que modifica, como texto (`"10"`). */
  readonly article?: string;
  /** Partes a las que se refiere. Id local de `parties`. */
  readonly parties?: readonly string[];
  /** Texto de la observación. */
  readonly text: string;
}

/** Una edición publicada. */
export interface Edition {
  /** Número de edición del emisor o de una sociedad. */
  readonly identifiers?: readonly Identifier[];
  /** Nombre de la edición. */
  readonly name?: string;
  /** Título registrado. */
  readonly registeredTitle?: string;
  /** Tipo: simple, álbum o integral. Lista abierta `editionTypes`: single, album, integral, o un valor propio `X_`. */
  readonly type?: string;
  /** Contenido: partituras, audios o los dos. */
  readonly contentType?: 'scores' | 'audios' | 'scoresAndAudios';
  /** Número de edición (1 para la primera). */
  readonly ordinal?: number;
  /** Editoras de la edición. Id local de `parties`. */
  readonly publishers?: readonly string[];
  /** Fecha de publicación. */
  readonly publicationDate?: string;
  /** Lugar de publicación. */
  readonly publicationPlace?: Place;
  /** Enlaces de la publicación digital. */
  readonly publicationLinks?: readonly string[];
  /** Precio. */
  readonly price?: Amount;
  /** Tirada. */
  readonly printRun?: PrintRun;
  /** Obras de la edición, en orden. Id local de `works`. */
  readonly works?: readonly string[];
  /** Registro de la edición como obra publicada. */
  readonly registrations?: readonly Registration[];
  /** Depósito legal. */
  readonly deposit?: Deposit;
  /** Archivos de la edición: ejemplar, declaración de tirada, planilla de la sociedad, presentación del registro. Id local de `media`. */
  readonly media?: readonly string[];
  readonly extensions?: Extensions;
}

/** La tirada de una edición. */
export interface PrintRun {
  /** Impresa o bajo demanda. */
  readonly mode?: 'printed' | 'onDemand';
  /** Ejemplares para la venta. */
  readonly saleCopies?: number;
  /** Ejemplares de promoción. */
  readonly promotionalCopies?: number;
}

/** El depósito legal de una edición. */
export interface Deposit {
  /** Físico o digital. */
  readonly mode: 'physical' | 'digital';
  /** Hash del ejemplar depositado. */
  readonly sha256?: string;
  /** El archivo del ejemplar. Si van `sha256` y `copy`, los hashes tienen que coincidir. Id local de `media` (legalDepositCopy). */
  readonly copy?: string;
}

/** Un archivo que viaja aparte, descrito por su tamaño y su hash. */
export interface Media {
  /** Id local, único en el archivo (`m1`). */
  readonly id: string;
  /** Qué es: contrato firmado, carta de reparto, ejemplar, declaración de tirada, presentación o certificado de registro, planilla, boletín, partitura, letra, audio, etc. Lista abierta `mediaKinds`: signedContract, splitAgreement, timestampProof, printRunStatement, legalDepositCopy, registrationFiling, registrationCertificate, societyForm, declarationForm, score, lyrics, audio, taxIdCertificate, o un valor propio `X_`. */
  readonly kind: string;
  /** Tipo de archivo, por ejemplo `application/pdf`. */
  readonly mediaType?: string;
  /** Tamaño en bytes del archivo entregado. */
  readonly size?: number;
  /** Hash SHA-256 de los bytes exactos del archivo entregado. */
  readonly sha256?: string;
  /** Ruta relativa a la raíz de la entrega: segmentos `[A-Za-z0-9._-]` separados por `/`. */
  readonly path?: string;
  /** Revisión en la que viajó el archivo. Un archivo ya entregado se vuelve a declarar en las revisiones siguientes, con su revisión de entrega. */
  readonly delivery?: number;
  /** `false` si el archivo se declara pero no viaja. Por defecto, `true`. */
  readonly delivered?: boolean;
  /** Si el archivo contiene datos personales. */
  readonly personalData?: boolean;
  /** Pruebas de la firma del documento. */
  readonly evidence?: Evidence;
  readonly extensions?: Extensions;
}

/** Las pruebas de la firma de un documento. */
export interface Evidence {
  /** Firma electrónica: proveedor, tipo y sello de tiempo. */
  readonly esignature?: ESignature;
  /** Quién firmó y cuándo. */
  readonly signers?: readonly EvidenceSigner[];
  /** Archivos anexados al documento, con el hash impreso en el anexo. */
  readonly annexed?: readonly Annexed[];
  /** Anclajes del documento en una cadena de bloques. */
  readonly anchors?: readonly Anchor[];
}

/** La firma electrónica de un documento. */
export interface ESignature {
  /** Proveedor de firma. */
  readonly provider: string;
  /** Id del documento en el proveedor. */
  readonly envelopeId?: string;
  /** Firma electrónica o firma digital, en el sentido de la ley. */
  readonly legalClass?: 'electronic' | 'digital';
  /** Cómo se identificó a los firmantes: enlace de invitación, código por correo o SMS, TOTP, certificado digital. Lista abierta `identityMethods`: invitationLink, emailOtp, smsOtp, totp, digitalCertificate, o un valor propio `X_`. */
  readonly identityMethods?: readonly string[];
  /** Quién cargó los datos de contacto de los firmantes: el declarante o el propio firmante. Lista abierta `contactSources`: declarant, signer, o un valor propio `X_`. */
  readonly contactSource?: string;
  /** Sello de tiempo del documento. */
  readonly timestamp?: Timestamp;
}

/** El sello de tiempo RFC 3161 de un documento. */
export interface Timestamp {
  /** De dónde se tomó: del PDF (`pdfEmbedded`) o de la autoridad de sellado (`tsa`). */
  readonly source: 'pdfEmbedded' | 'tsa';
  /** Fecha y hora del sello. */
  readonly generatedAt: string;
}

/** Un firmante de un documento. */
export interface EvidenceSigner {
  /** Quién firmó. Id local de `parties`. */
  readonly party: string;
  /** En nombre de quién firmó, si representa a una organización. Id local de `parties`. */
  readonly onBehalfOf?: string;
  /** Cuándo firmó. */
  readonly signedAt?: string;
}

/** Un archivo anexado a un documento. */
export interface Annexed {
  /** Nombre del archivo como figura en el anexo. */
  readonly fileName?: string;
  /** El archivo, si viaja en la entrega. Su hash tiene que coincidir. Id local de `media`. */
  readonly media?: string;
  /** Hash impreso en el anexo. */
  readonly sha256: string;
}

/** Un anclaje de un documento en una cadena de bloques. */
export interface Anchor {
  /** Método, por ejemplo `openTimestamps`. Lista abierta `anchorMethods`: openTimestamps, o un valor propio `X_`. */
  readonly method: string;
  /** El archivo de la prueba (`.ots`). Id local de `media` (timestampProof). */
  readonly proof?: string;
}

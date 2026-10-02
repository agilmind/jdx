/**
 * Contratos compartidos del validador JDX: solo tipos, sin valores en runtime.
 *
 * Las funciones y las clases viven en su módulo; acá están las formas que
 * intercambian.
 */
import type { JdxDocument } from './generated/jdx-types.js';

// ───────────── Valores cerrados ─────────────

export type Env = 'production' | 'sandbox';
export type Lang = 'es' | 'pt' | 'en';
export type Level = 'error' | 'warning' | 'info';
export type FailOn = 'error' | 'warning';
export type SignaturePolicy = 'optional' | 'required';
export type ExitCode = 0 | 1 | 2 | 3;
export type Disposition = 'ingest' | 'ignore' | 'reject';
export type AckStatus = 'ingested' | 'ignored' | 'rejected';
/** `JDX-<ÁREA>-<NNN>`: /^JDX-[A-Z]{3}-\d{3}$/. */
export type RuleId = `JDX-${string}-${string}`;
export type Layer = 'environment' | 'core' | 'schema' | 'profile' | 'policy';
export type CheckName = 'environment' | 'json' | 'schema' | 'core' | 'profile' | 'policy' | 'media' | 'signature';
export type CheckStatus = 'passed' | 'warning' | 'failed' | 'notEvaluated' | 'verified' | 'absent';
export type SignatureStatus =
  | 'absent' | 'verified' | 'invalid' | 'unknownKey' | 'keyPending' | 'keyRetired' | 'keyRevoked' | 'notEvaluated';
export type SignatureReason = 'signature' | 'header' | 'alg' | 'payload' | 'aud' | 'audience'
  | 'unknownKey' | 'pending' | 'retired' | 'expired' | 'compromised' | 'env' | 'issuer' | 'scope';
export type RootList = 'parties' | 'works' | 'recordings' | 'agreements' | 'media';

// ───────────── JSON (src/json/parse.ts, src/json/pointer.ts) ─────────────

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
/** RFC 6901; '' es el documento entero. */
export type JsonPointer = string;
export interface ParsedJson {
  readonly value: JsonValue;
  readonly numberTexts: ReadonlyMap<JsonPointer, string>;
}
export type JsonFailureReason = 'bom' | 'utf8' | 'syntax' | 'duplicateKey' | 'loneSurrogate' | 'integerRange'
  | 'numberRange' | 'empty' | 'depth';
export interface JsonFailure { reason: JsonFailureReason; pointer: JsonPointer; offset: number }
/** Sin valor parcial: con una falla no hay `json`. */
export type ParseResult = { ok: true; json: ParsedJson } | { ok: false; failures: JsonFailure[] };

// ───────────── Convenciones (src/conventions/*.ts) ─────────────

export interface Instant { readonly text: string; readonly epochNanos: bigint; readonly localDate: string }
/** Entero de diezmilésimos, 0..1_000_000. */
export type TenK = number;
export type PatternName = 'instant' | 'date' | 'duration' | 'percent' | 'amount' | 'currency' | 'sha256' | 'uuid'
  | 'localId' | 'issuerId' | 'kid' | 'country' | 'subdivision' | 'tis' | 'society' | 'language' | 'url' | 'uri'
  | 'email' | 'phone' | 'mediaType' | 'fraction' | 'schemaVersion' | 'enumValue' | 'schemeValue' | 'extensionKey';
export type ScalarName = 'text' | 'boolean' | 'integer' | 'integer>=0' | 'integer>=1' | 'year' | 'percent'
  | 'instant' | 'date' | 'duration' | 'amount' | 'currency' | 'sha256' | 'uuid' | 'localId' | 'issuerId' | 'kid'
  | 'country' | 'subdivision' | 'tis' | 'society' | 'language' | 'url' | 'uri' | 'email' | 'phone' | 'mediaType'
  | 'fraction' | 'schemaVersion';

// ───────────── Modelo de tipos (schema/src/types.json + types.overlay.json) ─────────────

export type TypeRef =
  | { scalar: ScalarName }
  | { type: string }                                       // otro tipo de types.json (su nombre ahí, no el de TS)
  | { ref: RootList; refTypes?: string[] }
  | { closed: string[] }
  | { open: string }                                       // nombre de la lista abierta (TypesSource.openLists)
  | { array: TypeRef; minItems?: 1 };
/** `description`: qué es el campo, en español (docs/campos.md). */
export interface PropSpec { type: TypeRef; required: boolean; personalData?: true; description: string }
/** `group`: la sección de docs/campos.md; `description`: qué es el tipo. */
export interface TypeSpec { group: string; description: string; extensions: boolean; props: Record<string, PropSpec> }
export interface OpenListSpec { initial: string[]; style: 'enum' | 'scheme' }
export interface TypesSource { jdx: string; types: Record<string, TypeSpec>; openLists: Record<string, OpenListSpec> }
/** `path`: propiedad del mismo objeto o camino con punto ('term.basis'). */
export interface Condition { path: string; in: string[] }
export type Constraint =
  | { id: string; kind: 'anyOfRequired' | 'oneOfRequired'; type: string; props: string[] }
  | { id: string; kind: 'requiredIf' | 'forbiddenIf'; type: string; when: Condition; props: string[] }
  | { id: string; kind: 'requiredIff'; type: string; when: Condition; prop: string }
  | { id: string; kind: 'itemsIf'; type: string; when: Condition; items: string; require: string[]; forbid: string[] };
export interface TypesOverlay {
  constraints: Constraint[];
  personalDataWhen: Record<string, Condition>;             // 'Tipo.prop' → condición (dato personal solo en ese caso)
  translations: Record<string, Partial<Record<'pt' | 'en', string>>>;   // 'Tipo' o 'Tipo.prop' → descripción en pt y en
}
export interface TypesModel { source: TypesSource; overlay: TypesOverlay }

// ───────────── Schemas (src/schema/*.ts) ─────────────

export interface RefSite { pattern: string; list: RootList; refTypes?: string[] }
export interface OpenListSite { pattern: string; list: string; style: 'enum' | 'scheme' }
/** El objeto de `pattern` es dato personal cuando su propiedad `path` vale uno de `in` (Name legal, Identifier TAX_ID). */
export interface PersonalDataWhenSite { pattern: string; path: string; in: string[] }
export interface SchemaIndex {
  minor: string; refs: RefSite[]; openLists: OpenListSite[]; percents: string[];
  dates: string[]; instants: string[];
  personalData: string[];                                  // siempre dato personal, con lo que tenga adentro
  personalDataWhen: PersonalDataWhenSite[];                // dato personal según una propiedad del objeto
}
export type AuxSchemaName = 'profile' | 'catalog' | 'terms' | 'trustList' | 'state' | 'report' | 'accounts';
/** Ruta del repo → texto (src/generated/data.ts: files). */
export type BundleFiles = Readonly<Record<string, string>>;
export interface SchemaBundle {
  minors: readonly string[];
  open: Readonly<Record<string, object>>;
  strict: Readonly<Record<string, object>>;
  index: Readonly<Record<string, SchemaIndex>>;
  aux: Readonly<Partial<Record<AuxSchemaName, object>>>;   // Partial: el bundle crece a medida que llegan los schemas
}
export interface SchemaError {
  instanceLocation: JsonPointer; keywordLocation: JsonPointer; keyword: string; params: Record<string, JsonValue>;
}
export interface SchemaValidators {
  validateDocument(minor: string, strict: boolean, value: JsonValue): SchemaError[];
  validateAux(name: AuxSchemaName, value: JsonValue): SchemaError[];   // lanza si ese schema no está en el bundle
  firstAuxError(name: AuxSchemaName, value: JsonValue): SchemaError | null;   // se detiene en el primer error; null si cumple
  validateWith(schema: object, value: JsonValue): SchemaError[];       // params/context del catálogo; caché por identidad
}

// ───────────── Índice del documento ─────────────

export interface IndexedObject {
  list: RootList; index: number; pointer: JsonPointer; id: string; obj: { [k: string]: JsonValue };
}
export interface ResolvedRef { pointer: JsonPointer; value: string; site: RefSite; target: IndexedObject | null }
export interface DocIndex {
  readonly byId: ReadonlyMap<string, IndexedObject>;
  readonly refs: readonly ResolvedRef[];
  get(list: RootList, id: string): IndexedObject | undefined;   // undefined si no existe o es de otra lista
  unresolved(pointerPrefix: JsonPointer): boolean;             // el objeto tiene una ref que no resuelve
}

// ───────────── Hallazgos y resultados ─────────────

export interface FindingContext { work?: string; party?: string; agreement?: string; media?: string; recording?: string }
export interface Finding {
  ruleId: RuleId;
  instanceLocation: JsonPointer;
  keywordLocation?: JsonPointer;                            // solo JDX-SCH-001
  context?: FindingContext;
  params?: { [k: string]: JsonValue };
  level?: Level;                                           // solo cuando el nivel depende del caso (JDX-SIG-001)
}
export interface Result {
  ruleId: RuleId;
  level: Level;
  source: 'environment' | 'core' | 'schema' | 'policy' | `profile:${string}@${string}`;
  instanceLocation: JsonPointer;
  keywordLocation?: JsonPointer;
  context?: FindingContext;
  message: string;
  params?: { [k: string]: JsonValue };
}

// ───────────── Reporte (schema/jdx-report.schema.json) ─────────────

/** Media de una revisión, en el reporte y en el estado. */
export interface MediaRecord { path: string; delivery: number; size: number; sha256: string }
export interface ReportSignature {
  status: SignatureStatus;
  kid: string | null;
  issuer: { id: string; name: string } | null;             // emisor de la clave; solo con status verified
  env: Env | null;
  reason?: SignatureReason | null;                         // opcional en el schema; el validador siempre lo emite
}
export interface ReportDocument {
  fileName: string;
  declarationId: string | null;
  revision: number | null;
  jdx: string | null;
  sha256: string;
  size: number;
  declaredProfiles: string[] | null;
  issuer?: { id: string; name: string } | null;             // declaration.issuer; opcional en el schema, el validador lo emite
  media?: MediaRecord[] | null;                            // media de la revisión, para ack; opcional en el schema, el validador lo emite
}
export interface Report {
  jdxReport: '1.0';
  valid: boolean | null;
  disposition: Disposition | null;
  exitCode: ExitCode;
  validator: { name: 'jdx'; version: string; catalog: string };
  options: {
    env: Env | null; profile: string | null; signature: SignaturePolicy | null; failOn: FailOn;
    receivedAt: string | null; dir: boolean; dirLookup: MediaLookup | null; lang: Lang;
  };
  document: ReportDocument;
  appliedProfiles: string[];                               // `${uri}@${version}`
  checks: Record<CheckName, CheckStatus>;
  signature: ReportSignature;
  trustList: { seq: number; expiresAt: string } | null;
  summary: { error: number; warning: number; info: number };   // también los resultados que no se listan
  results: Result[];
  omitted?: OmittedResult[];                               // opcional en el schema; el validador lo emite
  ack?: { status: AckStatus; at: string };
}
/** Un código con resultados que el reporte no lista: cuántos, o null si el paso dejó de buscar en el tope. */
export interface OmittedResult { ruleId: RuleId; count: number | null }
/** Hallazgos que no se listan, de un código y un nivel (para summary y checks). */
export interface OmittedFindings { ruleId: RuleId; level: Level; count: number }
export interface ReportParts {
  validator: Report['validator'];
  options: Report['options'];
  document: ReportDocument;
  appliedProfiles: string[];
  outcome: 'completed' | 'environment' | 'internal';       // environment → salida 2; internal → salida 3 (valid y disposition null)
  evaluated: ReadonlySet<CheckName>;                       // buckets que corrieron; los demás quedan notEvaluated (media sin --dir)
  hasState: boolean;                                       // sin estado no hay ignore
  signature: ReportSignature;
  trustList: Report['trustList'];
  results: Result[];
  omitted?: readonly OmittedFindings[];                    // los que no se listan; cuentan en summary y checks
  stopped?: readonly RuleId[];                             // códigos cuyo paso dejó de buscar en el tope
  catalog: Catalog;                                        // bucket de cada ruleId
}

// ───────────── Catálogo (catalog/1.0/rules.json) ─────────────

export interface CatalogRule {
  id: RuleId;
  layer: Layer;
  check: CheckName;
  status: 'active' | 'retired';
  since: string;
  implemented: boolean;
  level?: Level;                                           // fijo en environment/core/schema/policy
  predicate: Record<Lang, string>;
  message: Record<Lang, string>;                           // plantillas "{sum}", "{right:right}", "{countries:others}"
  profileParamsSchema: object;                             // params del perfil
  resultParamsSchema: object;                              // results[].params del reporte
  contextSchema: object;                                   // results[].context
  example: { params?: { [k: string]: JsonValue }; context?: FindingContext };
}
export interface Catalog { catalog: string; rules: CatalogRule[] }

// ───────────── Perfil (schema/profile.schema.json) ─────────────

export interface ProfileRuleRef { ruleId: RuleId; level?: Level; params?: { [k: string]: JsonValue } }
export interface Profile {
  id: string; version: string; jdx: string; catalog: string; requiresValidator: string;
  society: string; signature: SignaturePolicy; defaultLevel: 'warning' | 'error'; rules: ProfileRuleRef[];
}
export interface ResolvedRule { ruleId: RuleId; level: Level; params: { [k: string]: JsonValue } }
export interface ResolvedProfile {
  profile: Profile; shortId: string; source: `profile:${string}@${string}`; applied: string; rules: ResolvedRule[];
}

// ───────────── Listas de valores (values/) ─────────────

/** `schemes`: esquemas a los que pertenece el valor (values/identifierTypes.json). */
export interface ValueEntry { code: string; name?: Partial<Record<Lang, string>>; schemes?: string[] }
export interface OpenValueList { list: string; version: string; values: ValueEntry[] }
export interface TisEntry {
  code: string; kind: 'country' | 'group'; iso2?: string; members?: string[]; validFrom?: string; validTo?: string;
}
export interface SocietyEntry { code: string; name: string; country?: string; cisac: boolean; replacedBy?: string }
export interface CountryEntry { iso2: string; numeric: string; name: Record<Lang, string> }
export interface GenreEntry { code: string; name: string; group: string }
export interface ValueLists {
  version: string;
  open: ReadonlyMap<string, OpenValueList>;
  tis: TisEntry[];
  societies: SocietyEntry[];
  countries: CountryEntry[];
  sadaicGenres: GenreEntry[];
  sadaicArt8: OpenValueList;
  sadaicContract: OpenValueList;
}
export interface TerritoryExpander {
  expand(t: { include: string[]; exclude?: string[] }): { countries: ReadonlySet<string>; unknown: string[] };
}

// ───────────── Estado del receptor (schema/jdx-state.schema.json) ─────────────

export interface Receipt { revision: number; sha256: string; receivedAt: string; kid?: string; ackStatus: AckStatus }
export interface DeclarationState { owner?: string; lastIngestedRevision?: number; receipts: Receipt[]; media: MediaRecord[] }
export interface State {
  stateVersion: 1;
  env?: Env;                                               // ausente solo en un estado nunca escrito; en el archivo es obligatorio
  trust: { maxSeq: number };
  declarations: { [declarationId: string]: DeclarationState };
}
/** Acceso al estado del receptor. */
export interface StateStore {
  /** Bloqueo compartido: lee el estado; no puede escribirlo. */
  read<T>(fn: (state: State) => Promise<T>): Promise<T>;
  /** Bloqueo exclusivo: relee el estado, aplica fn y escribe el resultado en forma atómica. Es la única escritura. */
  update(fn: (state: State) => Promise<State>): Promise<State>;
}

// ───────────── Carpeta de la entrega ─────────────

/** Cómo se busca en la carpeta: cada entrada desde su carpeta ya identificada, o por su ruta (solo en una copia privada). */
export type MediaLookup = 'anchored' | 'path';
export interface MediaResolver {
  list(): AsyncIterable<{ path: string; type: 'file' | 'symlink' | 'other' }>;
  /** Dónde termina un path: el tipo, el tamaño y, si lo sabe, la entrada donde terminó (la ruta como la da list). */
  stat(path: string): Promise<{ type: 'file' | 'symlink' | 'other'; size: number; path?: string } | null>;
  sha256(path: string): Promise<string>;
  /**
   * La raíz de la carpeta, en el paso de entorno, antes que lo demás: lanza un MediaFolderError si no se puede usar y,
   * si lo sabe, dice cómo va a buscar. privateCopy: el receptor dice que es una copia privada que nada más escribe.
   */
  check?(opts?: { privateCopy?: boolean }): Promise<MediaLookup | void>;
}

// ───────────── Lista de confianza (schema/trust-list.schema.json) ─────────────

export interface EcPublicJwk { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export interface EcPrivateJwk extends EcPublicJwk { d: string }
export interface RootKey extends EcPublicJwk { kid: string }
export type PinnedRoots = Readonly<Record<Env, readonly RootKey[]>>;
export interface TrustKeyMeta {
  issuer: { id: string; name: string };
  status: 'pending' | 'active' | 'retired' | 'revoked';
  activeAt: string;
  expiresAt: string;
  retiredAt?: string;
  compromisedAt?: string;
  reason?: 'superseded' | 'issuerDeregistered' | 'certificationWithdrawn' | 'compromised';
  scope: { recipients: string[]; profiles: string[]; jdxMajor: number };
}
export interface TrustKey extends EcPublicJwk { kid: string; alg: 'ES256'; use: 'sig'; jdx: TrustKeyMeta }
export interface TrustList {
  iss: 'https://jdx.jupiter.ar';
  env: Env;
  seq: number;
  issuedAt: string;
  expiresAt: string;
  validator: { minVersion: string };
  revokedRoots: string[];
  keys: TrustKey[];
  trustAnchors?: { esignatureRoots?: string[] };   // huellas SHA-256 de las raíces de firma electrónica
}
export interface GeneralJws { payload: string; signatures: { protected: string; signature: string }[] }
export interface VerifiedTrustList { list: TrustList; rootKids: string[] }
export type TrustListOutcome =
  | { ok: true; trust: VerifiedTrustList }                              // TRU-001 lo emite policy.ts
  | { ok: false; findings: Finding[] };                                 // JDX-ENV-001/002/003/004/007/009

// ───────────── Estado de una clave ─────────────

export interface KeyEvaluation {
  accepted: boolean;
  status: 'verified' | 'keyPending' | 'keyRetired' | 'keyRevoked';
  reason: 'pending' | 'retired' | 'expired' | 'compromised' | null;
}

// ───────────── Firma ─────────────

export interface DeclarationJwsHeader {
  alg: 'ES256'; kid: string; typ: 'vnd.jupiter.jdx+jws'; cty: 'vnd.jupiter.jdx+json';
  jdx: { declarationId: string; revision: number; issuedAt: string; sha256: string; size: number; env: Env; aud: string[] };
}
export interface SignatureOutcome { report: ReportSignature; findings: Finding[]; key: TrustKey | null }

// ───────────── Firmante ─────────────

export interface JwsSigner {
  readonly kid: string;                                     // huella RFC 7638 de publicJwk
  readonly publicJwk: EcPublicJwk;
  sign(signingInput: Uint8Array): Promise<Uint8Array>;      // ES256 crudo r‖s, 64 bytes
}

// ───────────── Reglas ─────────────

export interface Account { id: string; identifiers: { scheme: string; value: string }[] }
export interface EffectiveOptions {
  env: Env; profileShortId: string; signature: SignaturePolicy; signatureExplicit: boolean;
  failOn: FailOn; receivedAt: Instant; lang: Lang; dir: boolean;
}
export interface RuleContext {
  doc: JdxDocument;
  json: ParsedJson;
  index: DocIndex;
  schemaIndex: SchemaIndex;
  input: { fileName: string; sha256: string; size: number };
  options: EffectiveOptions;
  now: Instant;                                             // reloj del validador (TRU-001)
  profile: ResolvedProfile;
  values: ValueLists;
  territories: TerritoryExpander;
  state: State | null;                                      // snapshot leído en el paso 1; null sin estado
  media: MediaResolver | null;                              // null sin --dir
  account: Account | null;
  signature: SignatureOutcome;
  trust: VerifiedTrustList | null;
}
/**
 * Lo que da una regla: sus hallazgos, o, si pueden ser muchos más que los que
 * lista el reporte, los primeros en el orden del reporte (firstFindings) y
 * cuántos más encontró, todos con el nivel de la regla.
 */
export type RuleFindings = Finding[] | { findings: Finding[]; omitted: number };
export interface Rule<P extends { [k: string]: JsonValue } = { [k: string]: JsonValue }> {
  id: RuleId;
  requires?: readonly ('state' | 'media' | 'account')[];   // si falta alguno, la regla no se evalúa y no da hallazgos
  evaluate(ctx: RuleContext, params: P): RuleFindings | Promise<RuleFindings>;
}

// ───────────── Entorno y etapas ─────────────

export type EnvironmentOutcome =
  | { ok: true; options: EffectiveOptions; reportOptions: Report['options']; profile: ResolvedProfile;
      state: State | null; trust: VerifiedTrustList | null }
  | { ok: false; reportOptions: Report['options']; profile: ResolvedProfile | null; findings: Finding[] };   // un ENV-* por falla
export type SchemaStageOutcome =
  | { kind: 'passed'; doc: JdxDocument; minor: string; schemaIndex: SchemaIndex; findings: Finding[] }   // findings: VER-003
  | { kind: 'failed'; findings: Finding[]; capped?: true }                                              // VER-001/002, SCH-001; capped: el schema dejó de buscar en el tope
  | { kind: 'environment'; findings: Finding[] };                                                       // ENV-006 jdxNotAdmitted

// ───────────── Librería ─────────────

/**
 * El archivo a validar: sus bytes, o, para uno de más de MAX_DOCUMENT_BYTES, solo su tamaño y su sha256, así quien
 * lo valida no lo lee entero (da JDX-JSN-001 `size` igual que con los bytes).
 */
export type ValidateInput =
  | { bytes: Uint8Array; fileName: string; jws?: string }
  | { size: number; sha256: string; fileName: string; jws?: string };
export interface ValidateOptions {
  profile: string | Profile;
  env: Env;
  signature?: SignaturePolicy;
  trustList?: Uint8Array;
  state?: StateStore;
  media?: MediaResolver;
  privateCopy?: boolean;                                    // la carpeta de media es una copia privada: se puede buscar por la ruta
  receivedAt: string;
  failOn?: FailOn;
  account?: Account;
  lang?: Lang;
}
export interface ValidatorDeps {
  clock: () => Date;
  roots: PinnedRoots;
  schemas: SchemaBundle;
  validators: SchemaValidators;
  catalog: Catalog;
  profiles: readonly Profile[];
  values: ValueLists;
  rules: ReadonlyMap<RuleId, Rule>;
  validatorVersion: string;
}

// ───────────── Auditoría y diff ─────────────

export interface AuditEntry {
  declarationId: string; revision: number; sha256: string; kid: string; receivedAt: string; compromisedAt: string;
}
export interface SemanticDifference { pointer: JsonPointer; kind: 'missing' | 'extra' | 'changed'; a?: JsonValue; b?: JsonValue }
export type DiffResult =
  | { ok: true; equal: boolean; differences: SemanticDifference[] }
  | { ok: false; unreadable: ('a' | 'b')[] };

// ───────────── Conformidad ─────────────

/** case.json; raíces de conformidad siempre. */
export interface ValidatorCase {
  description: string; file: string; jws?: string; trustList?: string; state?: string; dir?: string;
  options: {
    profile: string; env: Env; signature?: SignaturePolicy; failOn?: FailOn; receivedAt: string; lang?: Lang; account?: Account;
    ignore?: string[];                                     // patrones de --ignore
  };
  now: string;
  expected: string;
}
export interface IngestStep {
  file: string; jws?: string; trustList?: string; dir?: string; receivedAt: string; now: string;
  ack: { status: AckStatus; at: string };                  // at fijo: el reporte de ack es determinista
  expected: { report: string; ackReport: string; state: string };
}
/** steps.json. */
export interface IngestCase {
  description: string;
  options: { profile: string; env: Env; signature?: SignaturePolicy; failOn?: FailOn; ignore?: string[] };
  steps: IngestStep[];
}
/** input.yaml; forma exacta en issuer-input.schema.json. */
export interface IssuerInput { declarationId: string; agreements: { key: string; uid: string }[]; [fact: string]: JsonValue }
export interface IssuerOutput { file: Uint8Array; fileName: string; jws: string; trustList: Uint8Array }
export interface CaseOutcome { kind: 'validator' | 'ingest' | 'issuer'; name: string; passed: boolean; differences: string[] }

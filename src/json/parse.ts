/**
 * Parser I-JSON (RFC 7493) de JDX: bytes → valor, el texto original de cada
 * número por puntero y las fallas de JDX-JSN-001.
 *
 * - Iterativo: una pila explícita, nunca recursión. La profundidad máxima es de
 *   64 contenedores, como el MaxDepth por defecto de System.Text.Json: el
 *   contenedor 65 corta con `depth` en el byte donde abre.
 * - Las claves son propiedades propias (`Object.defineProperty`): `__proto__` y
 *   `constructor` son datos y ningún prototipo cambia.
 * - Números: un número cuyo double pasa de 2^53 − 1 en magnitud da
 *   `integerRange` en cualquier notación (`9007199254740992`, `1e20`,
 *   `9007199254740993.0`), también un literal entero que desborda a ±∞. Un
 *   literal con `.` o exponente da `numberRange` si desborda a ±∞ o si trae más
 *   de lo que guarda un double (RFC 7493 §2.2): su decimal no es el más corto
 *   que vuelve a su double (`1.0000000000000001`, `9007199254740991.4`, y el no
 *   nulo que queda en 0, `1e-400`).
 * - Las fallas que dejan seguir leyendo (BOM, UTF-8 inválido dentro de un
 *   string, surrogate escapado suelto, clave duplicada, número fuera de rango)
 *   se acumulan en el orden del texto; el UTF-8 inválido y el surrogate suelto,
 *   una vez por string. Sintaxis, profundidad y entrada vacía cortan la
 *   lectura, y también la falla número MAX_FAILURES y la que lleva la suma de
 *   los punteros a MAX_FAILURE_POINTER_CHARS. Con cualquier falla no hay
 *   valor.
 * - `offset` es el byte de la entrada (BOM incluido) donde empieza lo que
 *   falla: la comilla de la clave duplicada, el primer byte del número, la
 *   barra del escape, el byte inválido.
 * - Lineal en el largo de la entrada: `numberTexts` no guarda un puntero por
 *   número sino el texto junto a su contenedor, y arma los punteros recién al
 *   iterar. V8 hashea por el largo los strings de más de 16 383 caracteres: un
 *   Map con un puntero por número compararía cada puntero largo con todos los
 *   del mismo largo. Las fallas llevan su puntero entero, que puede ser tan
 *   largo como la entrada: por eso tienen dos topes, de cantidad y de largo.
 */
import type { JsonFailure, JsonFailureReason, JsonPointer, JsonValue, ParseResult } from '../types.js';

/** Contenedores anidados que se admiten. */
export const MAX_DEPTH = 64;

/** Fallas que se informan como máximo: con la última, el parser deja de leer. */
export const MAX_FAILURES = 100;

/**
 * Caracteres de puntero que suman las fallas: con la falla que llega a este
 * total, el parser deja de leer. Así las fallas suman menos que esto más
 * el puntero de la última, que no pasa del doble del largo de la entrada.
 */
export const MAX_FAILURE_POINTER_CHARS = 1_000_000;

/** Decodifica tramos ya validados; `ignoreBOM` conserva un U+FEFF al principio de un string. */
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

type JsonObject = { [key: string]: JsonValue };

/**
 * Lo que `numberTexts` guarda de cada contenedor, por índice o por clave: el
 * texto de cada número y los slots de cada contenedor hijo. Los objetos usan un
 * Map, que se recorre en el orden del texto (un objeto pondría primero las
 * claves que parecen índices).
 */
type Slot = string | Slot[] | Map<string, Slot>;
type Slots = Slot[] | Map<string, Slot>;

interface Frame {
  readonly container: JsonValue[] | JsonObject;
  readonly isArray: boolean;
  readonly slots: Slots;
  key: string;   // clave del miembro que se está leyendo (objetos)
  index: number; // índice del elemento que se está leyendo (arreglos)
  keep: boolean; // false si la clave trae UTF-8 inválido: no se sabe qué clave es, no se compara ni se guarda
}

/** Falla que corta la lectura; no sale de este módulo. */
class Stop {}

const escapeSegment = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const unescapeSegment = (s: string) => (/~(?![01])/.test(s) ? null : s.replace(/~1/g, '/').replace(/~0/g, '~'));

/**
 * Valor de un número de JSON sin el signo, como `<dígitos>e<n>` (0,dígitos ×
 * 10^n) y sin ceros de más: `12.50`, `1.25E1` y `12.5` dan `125e2`; todo cero
 * da `0`. Recorre con índices, sin expresiones regulares que retrocedan, así es
 * lineal también con un millón de dígitos.
 */
function decimalKey(text: string): string {
  const e = text.search(/[eE]/);
  const mantissa = text.slice(text.startsWith('-') ? 1 : 0, e < 0 ? text.length : e);
  const exponent = e < 0 ? 0 : Number(text.slice(e + 1));
  const dot = mantissa.indexOf('.');
  const digits = dot < 0 ? mantissa : mantissa.slice(0, dot) + mantissa.slice(dot + 1);
  let first = 0;
  while (digits.charCodeAt(first) === 0x30) first++;
  if (first === digits.length) return '0';
  let last = digits.length;
  while (digits.charCodeAt(last - 1) === 0x30) last--;
  return `${digits.slice(first, last)}e${(dot < 0 ? mantissa.length : dot) - first + exponent}`;
}

/**
 * `numberTexts`: busca el texto bajando por los slots y arma cada puntero
 * recién al iterar, en el orden del texto. Así leer el documento es lineal
 * aunque los punteros sean largos.
 */
class NumberTexts implements ReadonlyMap<JsonPointer, string> {
  readonly #root: Slots | null;
  readonly #rootText: string | undefined;
  readonly #size: number;

  constructor(root: Slots | null, rootText: string | undefined, size: number) {
    this.#root = root;
    this.#rootText = rootText;
    this.#size = size;
  }

  get size(): number {
    return this.#size;
  }

  get(pointer: JsonPointer): string | undefined {
    if (pointer === '') return this.#rootText;
    if (!pointer.startsWith('/')) return undefined;
    let slot: Slot | undefined = this.#root ?? undefined;
    for (const raw of pointer.slice(1).split('/')) {
      if (slot === undefined || typeof slot === 'string') return undefined;
      const segment = unescapeSegment(raw);
      if (segment === null) return undefined;
      if (Array.isArray(slot)) slot = /^(0|[1-9]\d*)$/.test(segment) ? slot[Number(segment)] : undefined;
      else slot = slot.get(segment);
    }
    return typeof slot === 'string' ? slot : undefined;
  }

  has(pointer: JsonPointer): boolean {
    return this.get(pointer) !== undefined;
  }

  forEach(fn: (value: string, key: JsonPointer, map: ReadonlyMap<JsonPointer, string>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#pairs()) fn.call(thisArg, value, key, this);
  }

  entries(): MapIterator<[JsonPointer, string]> {
    return this.#pairs();
  }

  *keys(): MapIterator<JsonPointer> {
    for (const [key] of this.#pairs()) yield key;
  }

  *values(): MapIterator<string> {
    for (const [, value] of this.#pairs()) yield value;
  }

  [Symbol.iterator](): MapIterator<[JsonPointer, string]> {
    return this.#pairs();
  }

  /** Recorre los slots en profundidad con una pila explícita (64 niveles como máximo). */
  *#pairs(): Generator<[JsonPointer, string], undefined, unknown> {
    if (this.#rootText !== undefined) yield ['', this.#rootText];
    if (this.#root === null) return;
    const stack: { prefix: JsonPointer; items: Iterator<[string | number, Slot | undefined]> }[] = [
      { prefix: '', items: this.#root.entries() },
    ];
    for (;;) {
      const top = stack[stack.length - 1];
      if (top === undefined) return;
      const next = top.items.next();
      if (next.done === true) {
        stack.pop();
        continue;
      }
      const [segment, slot] = next.value;
      if (slot === undefined) continue;
      const pointer = `${top.prefix}/${escapeSegment(String(segment))}`;
      if (typeof slot === 'string') yield [pointer, slot];
      else stack.push({ prefix: pointer, items: slot.entries() });
    }
  }
}

/** Escapes de un carácter (RFC 8259 §7); `\u` va aparte. */
const SIMPLE_ESCAPES: ReadonlyMap<number, string> = new Map([
  [0x22, '"'], [0x5c, '\\'], [0x2f, '/'], [0x62, '\b'], [0x66, '\f'], [0x6e, '\n'], [0x72, '\r'], [0x74, '\t'],
]);

class Parser {
  readonly failures: JsonFailure[] = [];
  rootSlots: Slots | null = null;
  rootText: string | undefined;
  numbers = 0;
  private readonly b: Uint8Array;
  private readonly stack: Frame[] = [];
  private pos = 0;
  private badUtf8 = false; // el último string leído traía UTF-8 inválido
  private pointerChars = 0; // lo que suman los punteros de las fallas

  constructor(bytes: Uint8Array) {
    this.b = bytes;
  }

  document(): JsonValue {
    const b = this.b;
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
      this.add('bom', '', 0);
      this.pos = 3;
    }
    this.skipWhitespace();
    if (this.pos >= b.length) this.stop('empty', '', this.pos);
    const root = this.values();
    this.skipWhitespace();
    if (this.pos < b.length) this.unexpected('');
    return root;
  }

  /** Lee un valor completo con una pila explícita. */
  private values(): JsonValue {
    const b = this.b;
    const stack = this.stack;
    for (;;) {
      this.skipWhitespace();
      const c = b[this.pos];
      let done: JsonValue;
      if (c === 0x7b || c === 0x5b) {
        if (stack.length >= MAX_DEPTH) this.stop('depth', this.pointer(), this.pos);
        const isArray = c === 0x5b;
        const container: JsonValue[] | JsonObject = isArray ? [] : {};
        const slots: Slots = isArray ? [] : new Map();
        const parent = stack[stack.length - 1];
        if (parent === undefined) this.rootSlots = slots;
        else this.setSlot(parent, slots);
        this.pos++;
        stack.push({ container, isArray, slots, key: '', index: 0, keep: true });
        this.skipWhitespace();
        if (b[this.pos] !== (isArray ? 0x5d : 0x7d)) {
          if (!isArray) this.member();
          continue;
        }
        this.pos++;
        stack.pop();
        done = container;
      } else {
        done = this.scalar();
      }
      // Cuelga el valor en su contenedor y cierra los que terminan.
      for (;;) {
        const top = stack[stack.length - 1];
        if (top === undefined) return done;
        if (Array.isArray(top.container)) top.container.push(done);
        else if (top.keep) Object.defineProperty(top.container, top.key, { value: done, writable: true, enumerable: true, configurable: true });
        this.skipWhitespace();
        const d = b[this.pos];
        if (d === 0x2c) {
          this.pos++;
          if (top.isArray) top.index++;
          else {
            this.skipWhitespace();
            this.member();
          }
          break;
        }
        if (d !== (top.isArray ? 0x5d : 0x7d)) this.unexpected(this.pointer(stack.length - 1));
        this.pos++;
        stack.pop();
        done = top.container;
      }
    }
  }

  /**
   * Clave de un miembro y sus dos puntos; controla duplicados sobre la clave ya
   * sin escapes. La falla de la clave repetida va antes que las de adentro de
   * la clave, en el orden del texto.
   */
  private member(): void {
    const top = this.stack[this.stack.length - 1]!;
    if (this.b[this.pos] !== 0x22) this.unexpected(this.pointer(this.stack.length - 1));
    const start = this.pos;
    const mark = this.failures.length;
    top.key = this.string(true);
    top.keep = !this.badUtf8;
    if (top.keep && Object.hasOwn(top.container, top.key)) this.add('duplicateKey', this.pointer(), start, mark);
    this.skipWhitespace();
    if (this.b[this.pos] !== 0x3a) this.unexpected(this.pointer());
    this.pos++;
  }

  private scalar(): JsonValue {
    const c = this.b[this.pos];
    if (c === 0x22) return this.string(false);
    if (c === 0x2d || (c !== undefined && c >= 0x30 && c <= 0x39)) return this.number();
    if (c === 0x74) return this.literal('true', true);
    if (c === 0x66) return this.literal('false', false);
    if (c === 0x6e) return this.literal('null', null);
    return this.unexpected(this.pointer());
  }

  private literal<T extends JsonValue>(word: string, value: T): T {
    for (let k = 0; k < word.length; k++) {
      if (this.b[this.pos + k] !== word.charCodeAt(k)) this.stop('syntax', this.pointer(), this.pos);
    }
    this.pos += word.length;
    return value;
  }

  private number(): number {
    const b = this.b;
    const start = this.pos;
    const isDigit = (k: number) => {
      const c = b[k];
      return c !== undefined && c >= 0x30 && c <= 0x39;
    };
    let i = start;
    if (b[i] === 0x2d) i++;
    if (b[i] === 0x30) i++;
    else if (isDigit(i)) while (isDigit(i)) i++;
    else this.stop('syntax', this.pointer(), i);
    let integer = true;
    if (b[i] === 0x2e) {
      integer = false;
      i++;
      if (!isDigit(i)) this.stop('syntax', this.pointer(), i);
      while (isDigit(i)) i++;
    }
    if (b[i] === 0x65 || b[i] === 0x45) {
      integer = false;
      i++;
      if (b[i] === 0x2b || b[i] === 0x2d) i++;
      if (!isDigit(i)) this.stop('syntax', this.pointer(), i);
      while (isDigit(i)) i++;
    }
    const text = decoder.decode(b.subarray(start, i));
    const value = Number(text);
    // Un literal entero mayor que 2^53 − 1 siempre da un double mayor que 2^53 − 1
    // (o ∞): alcanza con comparar el double, sin BigInt.
    const tooBig = !(Math.abs(value) <= Number.MAX_SAFE_INTEGER);
    let reason: JsonFailureReason | null = null;
    if (integer) reason = tooBig ? 'integerRange' : null;
    else if (!Number.isFinite(value)) reason = 'numberRange';
    else if (tooBig) reason = 'integerRange';
    // Con punto o exponente, el texto tiene que valer lo mismo que el decimal más
    // corto de su double (String(value)): si no, trae más precisión que un double.
    // Un literal no nulo que queda en 0 también cae acá; un cero escrito no.
    else {
      const shortest = String(value);
      if (text !== shortest && decimalKey(text) !== decimalKey(shortest)) reason = 'numberRange';
    }
    if (reason !== null) this.add(reason, this.pointer(), start);
    const top = this.stack[this.stack.length - 1];
    if (top === undefined) this.rootText = text;
    else this.setSlot(top, text);
    this.numbers++;
    this.pos = i;
    return value;
  }

  /**
   * String desde la comilla de apertura. En una clave, las fallas apuntan al
   * objeto que la contiene (la clave todavía no tiene puntero).
   */
  private string(isKey: boolean): string {
    const b = this.b;
    const where = () => (isKey ? this.pointer(this.stack.length - 1) : this.pointer());
    let reportedUtf8 = false;
    let reportedSurrogate = false;
    const loneSurrogate = (at: number) => {
      if (!reportedSurrogate) this.add('loneSurrogate', where(), at);
      reportedSurrogate = true;
    };
    let out = '';
    let i = this.pos + 1;
    let run = i; // comienzo del tramo sin escapes
    for (;;) {
      const c = b[i];
      if (c === undefined) this.stop('syntax', where(), i);
      if (c === 0x22) {
        out += decoder.decode(b.subarray(run, i));
        this.pos = i + 1;
        this.badUtf8 = reportedUtf8;
        return out;
      }
      if (c === 0x5c) {
        out += decoder.decode(b.subarray(run, i));
        const e = b[i + 1];
        const simple = e === undefined ? undefined : SIMPLE_ESCAPES.get(e);
        if (simple !== undefined) {
          out += simple;
          i += 2;
        } else if (e === 0x75) {
          const u = this.hex4(i + 2);
          if (u < 0) this.stop('syntax', where(), i);
          if (u >= 0xd800 && u <= 0xdbff) {
            const v = b[i + 6] === 0x5c && b[i + 7] === 0x75 ? this.hex4(i + 8) : -1;
            if (v >= 0xdc00 && v <= 0xdfff) {
              out += String.fromCharCode(u, v);
              i += 12;
            } else {
              loneSurrogate(i);
              out += String.fromCharCode(u);
              i += 6;
            }
          } else {
            if (u >= 0xdc00 && u <= 0xdfff) loneSurrogate(i);
            out += String.fromCharCode(u);
            i += 6;
          }
        } else {
          this.stop('syntax', where(), i);
        }
        run = i;
        continue;
      }
      if (c < 0x20) this.stop('syntax', where(), i);
      if (c < 0x80) {
        i++;
        continue;
      }
      const n = this.utf8Length(i);
      if (n === 0) {
        if (!reportedUtf8) this.add('utf8', where(), i);
        reportedUtf8 = true;
        i++;
      } else {
        i += n;
      }
    }
  }

  /** Cuatro dígitos hexadecimales en `at`; -1 si no los hay. */
  private hex4(at: number): number {
    let v = 0;
    for (let k = 0; k < 4; k++) {
      const c = this.b[at + k];
      const d = c === undefined ? -1
        : c >= 0x30 && c <= 0x39 ? c - 0x30
        : c >= 0x41 && c <= 0x46 ? c - 0x37
        : c >= 0x61 && c <= 0x66 ? c - 0x57
        : -1;
      if (d < 0) return -1;
      v = v * 16 + d;
    }
    return v;
  }

  /**
   * Largo de la secuencia UTF-8 bien formada que empieza en `at` (Unicode,
   * tabla 3-7): 0 si no lo es. Rechaza formas largas, surrogates codificados
   * (CESU-8) y puntos de código mayores que U+10FFFF.
   */
  private utf8Length(at: number): number {
    const b = this.b;
    const c = b[at];
    if (c === undefined) return 0;
    if (c < 0x80) return 1;
    let more: number;
    let lo = 0x80;
    let hi = 0xbf;
    if (c >= 0xc2 && c <= 0xdf) more = 1;
    else if (c >= 0xe0 && c <= 0xef) {
      more = 2;
      if (c === 0xe0) lo = 0xa0;
      if (c === 0xed) hi = 0x9f;
    } else if (c >= 0xf0 && c <= 0xf4) {
      more = 3;
      if (c === 0xf0) lo = 0x90;
      if (c === 0xf4) hi = 0x8f;
    } else return 0;
    for (let k = 1; k <= more; k++) {
      const d = b[at + k];
      if (d === undefined || d < (k === 1 ? lo : 0x80) || d > (k === 1 ? hi : 0xbf)) return 0;
    }
    return more + 1;
  }

  private skipWhitespace(): void {
    const b = this.b;
    for (;;) {
      const c = b[this.pos];
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return;
      this.pos++;
    }
  }

  /** Guarda en los slots del contenedor el texto de un número o los slots de un hijo. */
  private setSlot(frame: Frame, slot: Slot): void {
    if (Array.isArray(frame.slots)) frame.slots[frame.index] = slot;
    else if (frame.keep) frame.slots.set(frame.key, slot);
  }

  /** Puntero de los primeros `depth` niveles de la pila (por defecto, el valor que se está leyendo). */
  private pointer(depth = this.stack.length): JsonPointer {
    let out = '';
    for (let k = 0; k < depth; k++) {
      const f = this.stack[k]!;
      out += `/${f.isArray ? String(f.index) : escapeSegment(f.key)}`;
    }
    return out;
  }

  /**
   * Agrega una falla en `at` (por defecto, al final). Deja de leer con la falla
   * número MAX_FAILURES y con la que lleva la suma de los punteros a
   * MAX_FAILURE_POINTER_CHARS.
   */
  private add(reason: JsonFailureReason, pointer: JsonPointer, offset: number, at = this.failures.length): void {
    this.failures.splice(at, 0, { reason, pointer, offset });
    this.pointerChars += pointer.length;
    if (this.failures.length >= MAX_FAILURES || this.pointerChars >= MAX_FAILURE_POINTER_CHARS) throw new Stop();
  }

  private stop(reason: JsonFailureReason, pointer: JsonPointer, offset: number): never {
    this.add(reason, pointer, offset);
    throw new Stop();
  }

  /** Byte inesperado fuera de un string: `utf8` si ni siquiera es UTF-8, si no `syntax`. */
  private unexpected(pointer: JsonPointer): never {
    const c = this.b[this.pos];
    return this.stop(c !== undefined && this.utf8Length(this.pos) === 0 ? 'utf8' : 'syntax', pointer, this.pos);
  }
}

/**
 * Bytes → valor I-JSON y texto de cada número, o las fallas encontradas (a lo
 * sumo MAX_FAILURES, y con los punteros acotados por
 * MAX_FAILURE_POINTER_CHARS). No lanza por lo que dice la entrada. Con cientos de
 * megabytes lo que se acaba es el runtime (V8 no crea strings de más de
 * 0x1fffffe8 caracteres), así que el tamaño lo acota quien lee el archivo.
 */
export function parseJson(bytes: Uint8Array): ParseResult {
  const parser = new Parser(bytes);
  let value: JsonValue | undefined;
  try {
    value = parser.document();
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  if (value === undefined || parser.failures.length > 0) return { ok: false, failures: parser.failures };
  return { ok: true, json: { value, numberTexts: new NumberTexts(parser.rootSlots, parser.rootText, parser.numbers) } };
}

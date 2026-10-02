/**
 * Base64url sin relleno (RFC 7515 §2), el de los JWS de JDX. Un texto da unos
 * bytes y nada más: sin `=`, solo `A-Z a-z 0-9 - _`, y con los bits que sobran
 * del último carácter en cero. Otra forma de escribir los mismos bytes no se
 * lee, así dos lectores nunca leen distinto el mismo texto.
 */

const ALPHABET = /^[A-Za-z0-9_-]*$/u;

/** Los bytes de un texto base64url sin relleno y canónico, o null si no lo es. */
export function fromBase64url(text: string): Uint8Array | null {
  if (typeof text !== 'string' || !ALPHABET.test(text) || text.length % 4 === 1) return null;
  const bytes = Buffer.from(text, 'base64url');
  // Codificados de nuevo dan el mismo texto: los bits que sobran, en cero.
  return bytes.toString('base64url') === text ? new Uint8Array(bytes) : null;
}

/** El texto base64url sin relleno de unos bytes, o de un texto en UTF-8. */
export function toBase64url(value: Uint8Array | string): string {
  return (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.buffer, value.byteOffset, value.byteLength)).toString('base64url');
}

/** Si un texto tiene solo caracteres de base64url (sin leerlo). */
export function isBase64urlText(text: string): boolean {
  return ALPHABET.test(text);
}

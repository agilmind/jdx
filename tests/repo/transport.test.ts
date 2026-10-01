/**
 * Canal de entrega: JDX define el contenido de una entrega (la declaración, su
 * firma y los archivos que describe), nunca el canal. Ningún texto del
 * repositorio nombra un protocolo de transferencia de archivos, los archivos
 * temporales de una subida ni la carpeta de entrega de un emisor.
 *
 * Los términos que se buscan llevan una letra escrita como escape (\x66 = f,
 * \x72 = r, \x46 = F, \x52 = R) para que este archivo no los nombre. Los datos
 * codificados (claves, huellas, firmas) se blanquean antes de buscar: sus
 * letras al azar pueden formar un término.
 */
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { lineHits, planter } from '../helpers/files.js';
import { blankEncodedData } from '../helpers/wording.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Un protocolo de transferencia de archivos, el temporal de una subida o la carpeta de entrega de un emisor. */
const CHANNEL = /s\x66tp|\b\x66tp|\x66tp\b|dni[-_\s]?auto\x72es|(?:^|[\s*`'"(])\.pa\x72t\b|\.[a-z0-9]{2,5}\.pa\x72t\b/iu;

const channelHits = (root: string): string[] => lineHits(root, (line) => CHANNEL.test(blankEncodedData(line)));

const trees = planter('jdx-transport-');
afterEach(() => trees.cleanup());

describe('transport', () => {
  it('no repository text names a transfer protocol, upload temporaries or a delivery folder layout', () => {
    expect(channelHits(ROOT)).toEqual([]);
  });

  it('the channel guard reads every text file and skips node_modules, .git, dist, coverage, package-lock.json and binaries', () => {
    const planted = trees.plant({
      'README.md': 'Cada entrega viaja por S\x46TP.',
      'docs/es/receiver.md': 'Primera línea.\nLos archivos *.pa\x72t se ignoran.\nY obra.pdf.pa\x72t también.\n',
      'docs/en/receiver.md': 'The DNI AUTO\x52ES folder.',
      'conformance/ingest/caso/case.json': '{ "dir": "DNI-AUTO\x52ES/a.pdf" }',
      // Un identificador largo sin dígitos no es un dato codificado: cuenta.
      'src/x.ts': "const url = '\x66tp://example.com/a';\nconst s\x66tpUploadClientConfigurationForEveryDelivery = url;",
      // Una clave es un dato codificado: las letras al azar de sus coordenadas no cuentan.
      'conformance/keys/issuer.jwk.json':
        '{ "kty": "EC", "x": "q7Xs\x66tpK2-\x66tp-Zr9xW4mN8bV1cY6dT3hJ0gL5pE2uR", "y": "\x66tp_Wd3kQ9vL2mR8sT4yN6bH1cJ7gF0aZ5xP3eU8iOq" }',
      // `params.part` es un parámetro de JDX-CMP-003 y `Registration.part`, un campo: no son archivos de subida.
      'docs/x.md': 'JDX-CMP-003 con `params.part: "music"` y `Registration.part`.',
      'node_modules/a/README.md': 'S\x46TP',
      'tests/consumers/app/node_modules/b/index.js': 'S\x46TP',
      '.git/config': 'S\x46TP',
      'dist/index.js': 'S\x46TP',
      'coverage/index.html': 'S\x46TP',
      'package-lock.json': '{ "name": "s\x66tp-client" }',
      'docs/fuentes/package-lock.json': '{ "name": "s\x66tp-client" }',
      'docs/es/imagen.png': '\u0000S\x46TP',
    });
    expect(channelHits(planted)).toEqual([
      'README.md:1',
      'conformance/ingest/caso/case.json:1',
      'docs/en/receiver.md:1',
      'docs/es/receiver.md:2',
      'docs/es/receiver.md:3',
      'src/x.ts:1',
      'src/x.ts:2',
    ]);
  });
});

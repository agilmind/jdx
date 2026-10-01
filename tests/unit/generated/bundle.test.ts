/**
 * Tipos TS del documento y datos empaquetados (src/generated/*): la librería
 * funciona sin conexión y sin disco, con todo lo que necesita
 * como texto en data.ts, las raíces aparte en roots.ts y la versión en version.ts.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { checkGenerated } from '../../../scripts/gen.js';
import { files } from '../../../src/generated/data.js';
import { roots } from '../../../src/generated/roots.js';
import { VERSION } from '../../../src/generated/version.js';
import { AUX_SCHEMA_FILES, BUNDLE_MANIFEST, inBundle, schemaBundle } from '../../../src/schema/bundle.js';
import { TS_RENAMES } from '../../../src/schema/generate.js';
import { defaultValidators } from '../../../src/schema/validators.js';
import type { JsonValue } from '../../../src/types.js';
import { TEST_ROOTS } from '../../helpers/trustFixtures.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const TYPES_TS = read('src/generated/jdx-types.ts');
const EXAMPLE_TEXT = read('docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json');

/** Typecheck estricto de archivos en memoria (rutas absolutas falsas); da los mensajes de error. */
function typecheck(sources: Record<string, string>): string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const directoryExists = host.directoryExists?.bind(host);
  host.readFile = (name) => sources[name] ?? readFile(name);
  host.fileExists = (name) => name in sources || fileExists(name);
  host.directoryExists = (dir) => Object.keys(sources).some((name) => name.startsWith(`${dir}/`)) || (directoryExists?.(dir) ?? false);
  const program = ts.createProgram(Object.keys(sources), options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/** Los nombres que exporta un módulo de tipos. */
function exportedTypes(text: string): string[] {
  return [...text.matchAll(/^export (?:interface|type) ([A-Za-z0-9_]+)/gm)].map((m) => m[1] as string);
}

/** Los archivos del repositorio que van al bundle, en orden de ruta. */
function bundledFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (inBundle(child)) out.push(child);
    }
  };
  walk(dir);
  return out;
}

const copies: string[] = [];
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('tipos TS y bundle', () => {
  it('JdxDocument accepts the example (typecheck)', () => {
    const check = (json: string) =>
      typecheck({
        '/virtual/jdx-types.ts': TYPES_TS,
        '/virtual/check.ts': `import type { JdxDocument } from './jdx-types.js';\nexport const doc: JdxDocument = ${json};\n`,
      });
    expect(check(EXAMPLE_TEXT)).toEqual([]);
    // El chequeo no es vacío: un valor fuera de una lista cerrada y una propiedad desconocida fallan.
    expect(check(EXAMPLE_TEXT.replace('"kind": "person"', '"kind": "robot"'))).toEqual([
      `Type '"robot"' is not assignable to type '"person" | "organization"'.`,
    ]);
    expect(check(EXAMPLE_TEXT.replace('"percent": 12.5 }', '"percnet": 12.5 }')).join('\n')).toContain(
      "Object literal may only specify known properties, and '\"percnet\"' does not exist in type 'Share'.",
    );
  });

  it('TS_RENAMES apply (Document → JdxDocument, Signer → EvidenceSigner)', () => {
    expect(TS_RENAMES).toEqual({ Document: 'JdxDocument', Signer: 'EvidenceSigner', Condition: 'AgreementCondition' });
    const names = exportedTypes(TYPES_TS);
    expect(names).toEqual(expect.arrayContaining(['JdxDocument', 'EvidenceSigner', 'AgreementCondition', 'Extensions', 'ExtensionValue']));
    expect(names).not.toContain('Document');
    expect(names).not.toContain('Signer');
    expect(names).not.toContain('Condition');
    // 80 tipos y las dos definiciones de las extensiones.
    expect(names).toHaveLength(82);
    expect(TYPES_TS).toContain('readonly signers?: readonly EvidenceSigner[];');
    expect(TYPES_TS).toContain('readonly condition?: AgreementCondition;');
  });

  it('no generated type name collides with src/types.ts', () => {
    const own = new Set(exportedTypes(read('src/types.ts')));
    expect(own.size).toBeGreaterThan(100);
    expect(exportedTypes(TYPES_TS).filter((name) => own.has(name))).toEqual([]);
  });

  it('data.ts holds every BUNDLE_MANIFEST file that exists, as a string equal to its bytes', () => {
    expect(BUNDLE_MANIFEST).toContain('schema/*.*/jdx.schema.json');
    expect(inBundle('schema/1.0/jdx.strict.schema.json')).toBe(true);
    expect(inBundle('schema/src/types.schema.json')).toBe(false);
    expect(inBundle('values/CHANGELOG.md')).toBe(false);
    const expected = ['schema', 'values', 'catalog', 'profiles'].flatMap((dir) => {
      try {
        return bundledFiles(dir);
      } catch {
        return [];
      }
    });
    expect(Object.keys(files)).toEqual([...expected].sort());
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['schema/1.0/index.json', 'schema/1.0/jdx.schema.json', 'schema/1.0/jdx.strict.schema.json']),
    );
    for (const path of expected) {
      expect(Buffer.from(files[path] as string, 'utf8').equals(readFileSync(join(ROOT, path))), path).toBe(true);
    }
  });

  it('data.ts is typed Readonly<Record<string, string>> (no literal types in the emitted d.ts)', () => {
    const { outputText, diagnostics } = ts.transpileDeclaration(read('src/generated/data.ts'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    });
    expect(diagnostics).toEqual([]);
    expect(outputText).toBe('/**\n * Archivos empaquetados (BUNDLE_MANIFEST de src/schema/bundle.ts), como texto:\n * generado por `npm run gen`. No editar a mano.\n */\nexport declare const files: Readonly<Record<string, string>>;\n');
    expect(Object.isFrozen(files)).toBe(true);
  });

  it('roots.ts is separate from data.ts', () => {
    expect(roots).toEqual({ production: [], sandbox: [] });
    // data.ts no trae el archivo de raíces ni las exporta: la imagen de producción las filtra en roots.ts sin tocarlo.
    expect(Object.hasOwn(files, 'trust/roots.json')).toBe(false);
    expect(Object.keys(files).some((path) => path.startsWith('trust/'))).toBe(false);
    expect(read('src/generated/data.ts')).not.toMatch(/\bexport\s+const\s+roots\b/u);
    expect(read('src/generated/roots.ts')).toContain('export const roots: PinnedRoots = ');
  });

  it('version.ts equals package.json version', () => {
    expect(VERSION).toBe(JSON.parse(read('package.json')).version);
    expect(VERSION).toBe('1.0.0');
  });

  it('schemaBundle(files) exposes the minors and the aux schemas present', () => {
    const bundle = schemaBundle(files);
    expect(bundle.minors).toEqual(['1.0']);
    expect(bundle.open['1.0']).toEqual(JSON.parse(read('schema/1.0/jdx.schema.json')));
    expect(bundle.strict['1.0']).toEqual(JSON.parse(read('schema/1.0/jdx.strict.schema.json')));
    expect(bundle.index['1.0']).toEqual(JSON.parse(read('schema/1.0/index.json')));
    // Cada auxiliar empaquetado, y ninguno más.
    const present = Object.entries(AUX_SCHEMA_FILES).filter(([, path]) => Object.hasOwn(files, path));
    expect(Object.keys(bundle.aux).sort()).toEqual(present.map(([name]) => name).sort());
    for (const [name, path] of present) expect(bundle.aux[name as keyof typeof bundle.aux], name).toEqual(JSON.parse(read(path)));
    // Los auxiliares que existan y las menores en orden de versión; una menor a medias lanza.
    const more = { ...files, 'schema/jdx-report.schema.json': '{"$comment":"x"}', 'schema/1.10/jdx.schema.json': '{}', 'schema/1.10/jdx.strict.schema.json': '{}', 'schema/1.10/index.json': '{}', 'schema/1.9/jdx.schema.json': '{}', 'schema/1.9/jdx.strict.schema.json': '{}', 'schema/1.9/index.json': '{}' };
    expect(schemaBundle(more).minors).toEqual(['1.0', '1.9', '1.10']);
    expect(schemaBundle(more).aux.report).toEqual({ $comment: 'x' });
    expect(() => schemaBundle({ ...files, 'schema/1.1/jdx.schema.json': '{}' })).toThrow(
      'bundle incompleto para la menor 1.1: falta schema/1.1/jdx.strict.schema.json, schema/1.1/index.json',
    );
    // defaultValidators valida con el bundle empaquetado, y es uno solo.
    const example = JSON.parse(EXAMPLE_TEXT) as JsonValue;
    expect(defaultValidators().validateDocument('1.0', true, example)).toEqual([]);
    expect(defaultValidators()).toBe(defaultValidators());
  });

  it('gen:check detects a stale bundle', () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), 'jdx-bundle-'));
    copies.push(root);
    const skip = new Set(['node_modules', '.git', 'dist', 'coverage']);
    cpSync(ROOT, root, { recursive: true, filter: (src) => !skip.has(basename(src)) });
    expect(checkGenerated(root)).toEqual([]);
    // Un archivo de datos cambiado sin regenerar, raíces nuevas y otra versión del paquete.
    writeFileSync(join(root, 'values/titleTypes.json'), '{ "list": "titleTypes" }\n');
    // trust/roots.json existe en el repositorio; gen lo controla con parseRootsFile, así que la raíz es una de prueba.
    writeFileSync(join(root, 'trust/roots.json'), `${JSON.stringify({ production: [TEST_ROOTS.production[0]], sandbox: [] })}\n`);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ ...pkg, version: '1.0.1' }, null, 2)}\n`);
    expect(checkGenerated(root)).toEqual(['src/generated/data.ts', 'src/generated/roots.ts', 'src/generated/version.ts']);
  });

  it('library modules touch neither disk nor network', () => {
    // Los módulos de disco, red, procesos e hilos de Node, importados con nombre o solo por su efecto, y lo que carga
    // un módulo sin import (process.getBuiltinModule, createRequire) o sale a la red (fetch, WebSocket).
    const IMPORT =
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"](?:node:)?(?:fs|net|http|https|http2|tls|dns|dgram|child_process|cluster|worker_threads)(?:\/[^'"]*)?['"]/;
    const GLOBAL = /\bfetch\s*\(|\bWebSocket\b|\bgetBuiltinModule\s*\(|\bcreateRequire\b/;
    // Las expresiones reconocen las formas que tienen que encontrar.
    for (const line of [
      "import { readFileSync } from 'node:fs';",
      "await import('fs/promises')",
      'import net from "net";',
      "require('node:net')",
      "import { request } from 'node:https';",
      "import http from 'http';",
      "await import('node:http2')",
      "import { connect } from 'tls';",
      "import { lookup } from 'dns/promises';",
      "require('dgram')",
      "import { execFile } from 'node:child_process';",
      "import 'node:fs';",
      'import "fs/promises";',
      "import cluster from 'node:cluster';",
      "import { Worker } from 'node:worker_threads';",
    ]) {
      expect(IMPORT.test(line), line).toBe(true);
    }
    for (const line of [
      "await fetch('https://jdx.jupiter.ar/trust/keys.json')",
      'const ws = new WebSocket(url);',
      "const fs = process.getBuiltinModule('node:fs');",
      'const { readFileSync } = process.getBuiltinModule(name);',
      'const require = createRequire(import.meta.url);',
      "import { createRequire } from 'node:module';",
    ]) {
      expect(GLOBAL.test(line), line).toBe(true);
    }
    for (const line of [
      "import { join } from 'node:path';",
      "import { x } from './https-helpers.js';",
      "import './fs-polyfill.js';",
      "import 'node:module';",
      'prefetch(list)',
    ]) {
      expect(IMPORT.test(line) || GLOBAL.test(line), line).toBe(false);
    }
    const exempt = (rel: string) => /^src\/(state|media|cli|conformance)\//.test(rel) || rel === 'src/sign/pkcs11.ts';
    const found: string[] = [];
    const walk = (rel: string): void => {
      for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (child.endsWith('.ts') && !exempt(child) && (IMPORT.test(read(child)) || GLOBAL.test(read(child)))) found.push(child);
      }
    };
    walk('src');
    expect(found).toEqual([]);
  });
});

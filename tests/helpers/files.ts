/**
 * Los archivos de texto de un árbol con la forma del repositorio, para las
 * guardas que recorren todo el texto (canal de entrega, higiene).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Carpetas que el recorrido no abre, a cualquier profundidad. */
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'coverage']);
/** Archivos que no lee, a cualquier profundidad: el lockfile es de npm. */
const SKIP_FILES: ReadonlySet<string> = new Set(['package-lock.json']);

/** Archivos de texto bajo `root` (rutas con `/`, en orden), sin lo salteado; un byte 0 marca un binario. */
export function textFiles(root: string, dir = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...textFiles(root, rel));
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name) && !readFileSync(join(root, rel)).includes(0)) {
      files.push(rel);
    }
  }
  return files.sort();
}

/** `archivo:línea` de cada línea de cada archivo de texto en la que `test` encuentra algo. */
export function lineHits(root: string, test: (line: string) => boolean): string[] {
  return textFiles(root).flatMap((rel) =>
    readFileSync(join(root, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => (test(line) ? [`${rel}:${i + 1}`] : [])),
  );
}

/** Árboles temporales con la forma del repositorio, para probar las guardas. */
export function planter(prefix: string): { plant(files: Record<string, string>): string; cleanup(): void } {
  const dirs: string[] = [];
  return {
    plant(files) {
      const root = mkdtempSync(join(realpathSync(tmpdir()), prefix));
      dirs.push(root);
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), text);
      }
      return root;
    },
    cleanup() {
      for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    },
  };
}

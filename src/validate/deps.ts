/**
 * Las dependencias de una validación con lo que trae el validador: los datos
 * empaquetados (schemas, catálogo, perfiles y listas de valores), las raíces
 * fijadas, el registro de reglas, la versión y el reloj del sistema. Los datos
 * se arman una vez por proceso; cada llamada da un objeto nuevo y congelado.
 */
import { loadCatalog } from '../catalog/load.js';
import { files } from '../generated/data.js';
import { VERSION } from '../generated/version.js';
import { bundledProfiles } from '../profile/resolve.js';
import { RULES } from '../rules/registry.js';
import { schemaBundle } from '../schema/bundle.js';
import { defaultValidators } from '../schema/validators.js';
import { pinnedRoots } from '../trust/roots.js';
import type { JsonValue, ValidatorDeps } from '../types.js';
import { loadValues } from '../values/load.js';

const CATALOG_FILE = 'catalog/1.0/rules.json';

let bundled: Omit<ValidatorDeps, 'clock'> | undefined;

export function defaultDeps(): ValidatorDeps {
  if (bundled === undefined) {
    const validators = defaultValidators();
    bundled = Object.freeze({
      roots: pinnedRoots(),
      schemas: schemaBundle(files),
      validators,
      catalog: loadCatalog(JSON.parse(files[CATALOG_FILE] as string) as JsonValue, validators),
      profiles: Object.freeze(bundledProfiles(files)),
      values: loadValues(files),
      rules: RULES,
      validatorVersion: VERSION,
    });
  }
  return Object.freeze({ ...bundled, clock: () => new Date() });
}

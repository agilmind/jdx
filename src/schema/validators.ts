/**
 * Validadores de schema sobre un bundle (SchemaBundle): el documento abierto o
 * estricto de cada menor, los schemas auxiliares y cualquier schema suelto (los
 * params y el context del catálogo).
 *
 * Una sola instancia de Ajv por compileSchemas. Cada schema se compila la
 * primera vez que se usa, y una sola vez: la caché es por identidad del objeto.
 * Los errores salen como SchemaError con keywordLocation absoluto dentro del
 * schema que validó (toSchemaErrorsIn).
 *
 * defaultValidators es el de los datos empaquetados (src/generated/data.ts),
 * uno solo por proceso: lo usan las funciones públicas que no reciben deps.
 */
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { files } from '../generated/data.js';
import type { AuxSchemaName, JsonValue, SchemaBundle, SchemaError, SchemaValidators } from '../types.js';
import { createAjv, toSchemaErrorsIn } from './ajv.js';
import { schemaBundle } from './bundle.js';

export function compileSchemas(bundle: SchemaBundle): SchemaValidators {
  const ajv = createAjv();
  const compiled = new WeakMap<object, ValidateFunction>();

  function run(schema: object, value: JsonValue): SchemaError[] {
    let validate = compiled.get(schema);
    if (validate === undefined) {
      validate = ajv.compile(schema);
      compiled.set(schema, validate);
    }
    return validate(value) ? [] : toSchemaErrorsIn(schema, validate.errors);
  }

  return {
    validateDocument(minor: string, strict: boolean, value: JsonValue): SchemaError[] {
      const set = strict ? bundle.strict : bundle.open;
      const schema = Object.hasOwn(set, minor) ? set[minor] : undefined;
      if (schema === undefined) {
        throw new Error(`el bundle no trae el schema ${strict ? 'estricto' : 'abierto'} de la menor ${minor}`);
      }
      return run(schema, value);
    },
    validateAux(name: AuxSchemaName, value: JsonValue): SchemaError[] {
      const schema = Object.hasOwn(bundle.aux, name) ? bundle.aux[name] : undefined;
      if (schema === undefined) throw new Error(`el bundle no trae el schema auxiliar ${name}`);
      return run(schema, value);
    },
    validateWith(schema: object, value: JsonValue): SchemaError[] {
      return run(schema, value);
    },
  };
}

let bundled: SchemaValidators | undefined;

/** Los validadores del bundle empaquetado; se arman la primera vez que se piden. */
export function defaultValidators(): SchemaValidators {
  bundled ??= compileSchemas(schemaBundle(files));
  return bundled;
}

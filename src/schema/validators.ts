/**
 * Validadores de schema sobre un bundle (SchemaBundle): el documento abierto o
 * estricto de cada menor, los schemas auxiliares y cualquier schema suelto (los
 * params y el context del catálogo).
 *
 * Una sola instancia de Ajv por compileSchemas, y otra que se detiene en el
 * primer error (firstAuxError), que se arma recién cuando se usa. Cada schema
 * se compila la primera vez que se usa, y una sola vez en cada instancia: la
 * caché es por identidad del objeto. Los errores salen como SchemaError con
 * keywordLocation absoluto dentro del schema que validó (toSchemaErrorsIn), a
 * lo sumo MAX_SCHEMA_ERRORS.
 *
 * Con un valor que junta más de SCHEMA_ERROR_LIMIT errores en un lugar, Ajv se
 * corta (src/schema/ajv.ts): los errores son los juntados hasta ahí, si el
 * validador que se detiene en el primer error confirma que el valor no cumple.
 * Si cumple, los errores eran de ramas que se descartan, y no hay ninguno. Un
 * corte nunca sale de acá: ningún validador lanza por lo que dice el valor.
 *
 * defaultValidators es el de los datos empaquetados (src/generated/data.ts),
 * uno solo por proceso: lo usan las funciones públicas que no reciben deps.
 */
import type { Ajv2020, ValidateFunction } from 'ajv/dist/2020.js';
import { files } from '../generated/data.js';
import type { AuxSchemaName, JsonValue, SchemaBundle, SchemaError, SchemaValidators } from '../types.js';
import { createAjv, cutErrors, toSchemaErrorsIn } from './ajv.js';
import { schemaBundle } from './bundle.js';

export function compileSchemas(bundle: SchemaBundle): SchemaValidators {
  const first = compiler(() => createAjv({ allErrors: false }));
  const all = compiler(createAjv, (schema, value) => first(schema, value).length > 0);

  function auxSchema(name: AuxSchemaName): object {
    const schema = Object.hasOwn(bundle.aux, name) ? bundle.aux[name] : undefined;
    if (schema === undefined) throw new Error(`el bundle no trae el schema auxiliar ${name}`);
    return schema;
  }

  return {
    validateDocument(minor: string, strict: boolean, value: JsonValue): SchemaError[] {
      const set = strict ? bundle.strict : bundle.open;
      const schema = Object.hasOwn(set, minor) ? set[minor] : undefined;
      if (schema === undefined) {
        throw new Error(`el bundle no trae el schema ${strict ? 'estricto' : 'abierto'} de la menor ${minor}`);
      }
      return all(schema, value);
    },
    validateAux(name: AuxSchemaName, value: JsonValue): SchemaError[] {
      return all(auxSchema(name), value);
    },
    firstAuxError(name: AuxSchemaName, value: JsonValue): SchemaError | null {
      return first(auxSchema(name), value)[0] ?? null;
    },
    validateWith(schema: object, value: JsonValue): SchemaError[] {
      return all(schema, value);
    },
  };
}

type Check = (schema: object, value: JsonValue) => SchemaError[];

/**
 * Valida con los schemas compilados por un Ajv, que se arma la primera vez y
 * compila cada schema una vez. `fails` dice, después de un corte, si el valor
 * no cumple; sin `fails` (el validador que se detiene en el primer error), un
 * corte cuenta como que no cumple. Eso solo pasa con errores que se descartan
 * en cantidad, como los de contains, que ningún schema empaquetado usa.
 */
function compiler(create: () => Ajv2020, fails?: (schema: object, value: JsonValue) => boolean): Check {
  let ajv: Ajv2020 | undefined;
  const compiled = new WeakMap<object, ValidateFunction>();
  return (schema, value) => {
    let validate = compiled.get(schema);
    if (validate === undefined) {
      ajv ??= create();
      validate = ajv.compile(schema);
      compiled.set(schema, validate);
    }
    try {
      return validate(value) ? [] : toSchemaErrorsIn(schema, validate.errors);
    } catch (thrown) {
      const cut = cutErrors(thrown);
      if (cut === undefined) throw thrown;
      if (fails !== undefined && !fails(schema, value)) return [];
      const errors = toSchemaErrorsIn(schema, cut);
      // Si todos eran de los que se descartan, el primero que no es un `if` dice dónde.
      return errors.length > 0 ? errors : toSchemaErrorsIn(schema, cut.filter((e) => e.keyword !== 'if').slice(0, 1));
    }
  };
}

let bundled: SchemaValidators | undefined;

/** Los validadores del bundle empaquetado; se arman la primera vez que se piden. */
export function defaultValidators(): SchemaValidators {
  bundled ??= compileSchemas(schemaBundle(files));
  return bundled;
}

# Changelog

## 1.0.0 — en desarrollo

- Catálogo de reglas 1.0 (`catalog/1.0/rules.json`): 76 reglas de entorno, núcleo, perfil y política, con su mensaje en español, portugués e inglés y el vocabulario que comparten los mensajes (`catalog/1.0/terms.json`); cuatro códigos retirados, que no se reutilizan.
- Perfil `sadaic/0.1` (`profiles/sadaic/0.1.0.json`) y su resolución por id corto o URI, al patch más alto empaquetado: un perfil con una regla desconocida, retirada o sin implementar, o con params que no cumplen, no se aplica (salida 2); un perfil leído de un archivo que no es el empaquetado lleva `+local` detrás de su versión en el reporte.
- La lista de confianza se lee con más rigor (el JWS exacto, a lo sumo 8 firmas, claves en base64url canónico, la lista hasta 90 días y cada clave hasta 2 años) y una carpeta de estado que no existe no es un estado vacío: `JDX-ENV-001` y `JDX-ENV-005` dicen la causa en `params.cause`.
- Un documento de más de 2 MiB no se lee (`JDX-JSN-001` con `params.reason: size`).
- El reporte lista a lo sumo 100 resultados de cada regla, los primeros en su orden, y menos si sus lugares y textos llegan a 1 000 000 de caracteres; `omitted` dice de qué reglas quedaron resultados afuera y cuántos, y `summary`, la salida y `checks` los cuentan a todos.
- Un id repetido da `JDX-REF-001` en cada repetición después de la primera, en el orden `parties`, `works`, `recordings`, `agreements` y `media`, y una referencia se resuelve en la lista de su lugar aunque el id esté también en otra lista.
- Un valor de una lista abierta que su archivo de valores da solo para otros esquemas, como un tipo de identificador bajo otro `scheme`, da `JDX-VER-004` con `params.scheme`.
- La carpeta local de la entrega (`dirMediaResolver`, con `ignore`): cada path se busca por los nombres de cada carpeta, el exacto o el único sin distinguir mayúsculas de A a Z, sin seguir enlaces ni abrir lo que no es un archivo regular; un archivo con otras mayúsculas cuenta como declarado para `JDX-MED-003` solo si tiene los bytes del que resuelve el path.
- Las reglas del núcleo (porcentajes y fechas, el nombre del archivo, el estado del receptor, los archivos con y sin su carpeta, las listas abiertas) y `JDX-MED-003` dan cada resultado en un lugar fijo del documento.
- Una carpeta de la entrega que no se puede usar (no existe, no es una carpeta, algo de adentro no se puede leer o cambió mientras se validaba) es una falla del entorno, `JDX-ENV-011` con `params.cause` y `params.path`, salida 2: no rechaza ni acepta.
- Un nombre de la carpeta de la entrega que no es UTF-8 válido se lee igual y se muestra con `\xHH` por cada byte que no lo es, y por la barra invertida: dos nombres distintos nunca se confunden.

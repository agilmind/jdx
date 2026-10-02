# Changelog

## 1.0.0 — en desarrollo

- Catálogo de reglas 1.0 (`catalog/1.0/rules.json`): 75 reglas de entorno, núcleo, perfil y política, con su mensaje en español, portugués e inglés y el vocabulario que comparten los mensajes (`catalog/1.0/terms.json`); cuatro códigos retirados, que no se reutilizan.
- Perfil `sadaic/0.1` (`profiles/sadaic/0.1.0.json`) y su resolución por id corto o URI, al patch más alto empaquetado: un perfil con una regla desconocida, retirada o sin implementar, o con params que no cumplen, no se aplica (salida 2); un perfil leído de un archivo que no es el empaquetado lleva `+local` detrás de su versión en el reporte.
- La lista de confianza se lee con más rigor (el JWS exacto, a lo sumo 8 firmas, claves en base64url canónico, la lista hasta 90 días y cada clave hasta 2 años) y una carpeta de estado que no existe no es un estado vacío: `JDX-ENV-001` y `JDX-ENV-005` dicen la causa en `params.cause`.
- Un documento de más de 2 MiB no se lee (`JDX-JSN-001` con `params.reason: size`).
- El reporte lista a lo sumo 100 resultados de cada regla, los primeros en su orden, y menos si sus lugares y textos llegan a 1 000 000 de caracteres; `omitted` dice de qué reglas quedaron resultados afuera y cuántos, y `summary`, la salida y `checks` los cuentan a todos.
- Un id repetido da `JDX-REF-001` en cada repetición después de la primera, en el orden `parties`, `works`, `recordings`, `agreements` y `media`, y una referencia se resuelve en la lista de su lugar aunque el id esté también en otra lista.

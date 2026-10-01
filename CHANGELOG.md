# Changelog

## 1.0.0 — en desarrollo

- Catálogo de reglas 1.0 (`catalog/1.0/rules.json`): 75 reglas de entorno, núcleo, perfil y política, con su mensaje en español, portugués e inglés y el vocabulario que comparten los mensajes (`catalog/1.0/terms.json`); cuatro códigos retirados, que no se reutilizan.
- Perfil `sadaic/0.1` (`profiles/sadaic/0.1.0.json`) y su resolución por id corto o URI, al patch más alto empaquetado: un perfil con una regla desconocida, retirada o sin implementar, o con params que no cumplen, no se aplica (salida 2); un perfil leído de un archivo que no es el empaquetado lleva `+local` detrás de su versión en el reporte.

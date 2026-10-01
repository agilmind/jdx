# JDX

JDX (Jupiter Data eXchange) es un archivo JSON para declarar obras musicales, sus derechos y sus contratos ante las Sociedades de Gestión Colectiva (SGC): un estándar creado por Agilmind SRL para ser implementado por las Sociedades de Gestión.

```json
{
  "$schema": "https://jdx.jupiter.ar/schema/1.0/jdx.schema.json",
  "jdx": "1.0",
  "declaration": {
    "id": "3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13",
    "revision": 1,
    "createdAt": "2026-09-12T19:00:00-03:00",
    "issuer": { "id": "jupiter", "name": "Jupiter", "keyId": "3ifADueZaLjFGBgto_xCbTohNZKhf7ziQ8gS_yx6r6E" },
    "recipients": [{ "society": "061" }]
  },
  "parties": [
    { "id": "p1", "kind": "person", "names": [{ "type": "legal", "given": "Ana María", "family": "Pérez" }] },
    { "id": "p5", "kind": "organization", "names": [{ "type": "legal", "full": "Editorial Sur SRL" }] }
  ],
  "works": [{
    "id": "w1",
    "titles": [{ "type": "original", "text": "Chacarera del Rancho" }],
    "contributors": [{ "party": "p1", "roles": ["composer", "lyricist"] }],
    "authorship": [
      { "party": "p1", "part": "music", "percent": 50 },
      { "party": "p1", "part": "lyrics", "percent": 50 }
    ],
    "shares": [{ "party": "p5", "role": "originalPublisher", "via": ["p1"], "agreement": "a1", "percent": 25 }]
  }],
  "agreements": [{
    "id": "a1", "type": "publishing", "works": ["w1"], "signatureDate": "2026-09-12",
    "parties": [{ "party": "p1", "role": "grantor" }, { "party": "p5", "role": "grantee" }],
    "publisherShare": { "percent": 25 }
  }]
}
```

## Cómo validarlo

Con Node 20.19 o posterior:

```sh
npm install
npm run validate -- docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json
npm test
```

## Documentación

- [Guía para sociedades de gestión](docs/guia.md): qué llega, cómo se valida y cómo se carga.
- [Referencia de campos](docs/campos.md): cada objeto y cada campo. En inglés: [field reference](docs/en/campos.md).
- [Ejemplo completo](docs/ejemplo/3f2c9a1e-5b7d-4c21-9e0a-7d4b2f8c6a13.r1.jdx.json), los JSON Schemas en [`schema/`](schema/) y las listas de valores en [`values/`](values/).

## Estado

En desarrollo. Los schemas, las listas de valores y la referencia de campos están disponibles; el validador de referencia completo (perfiles, firma y reporte) está en construcción. La primera implementación está en curso con una SGC de Argentina.

## Licencia

Leer, evaluar y probar JDX es libre, y las SGC pueden usarlo sin autorización para recibir, validar y cargar declaraciones.
Los intercambios en producción con una SGC, los productos o servicios basados en JDX y su redistribución requieren autorización escrita de Agilmind SRL.
Ver [LICENSE](LICENSE), [NOTICE](NOTICE) y [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES).

Contacto: jdx@jupiter.ar · [Seguridad](SECURITY.md) · [Contribuciones](CONTRIBUTING.md)

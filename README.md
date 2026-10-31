# Biblioteca de Ruth

Un estante giratorio con los ensayos, artículos y libros que he leído y recomiendo. Bilingüe (español e inglés).

## Cómo agregar lecturas

**Un artículo o ensayo en línea:** abre [`fuentes/enlaces.txt`](fuentes/enlaces.txt) en GitHub, pulsa el lápiz ✎, pega el enlace en una línea nueva al final y guarda ("Commit changes").

**Un libro, capítulo o artículo académico:** agrega un bloque a [`fuentes/referencias.json`](fuentes/referencias.json) copiando uno de los que ya están (con `isbn` si es libro, `doi` si es artículo académico).

En unos minutos la GitHub Action **Actualizar biblioteca**:

1. visita la fuente y anota título, autor, fecha, idioma y si tiene muro de pago (`datos/metadatos.json`);
2. crea una ficha provisional en `essays.json`;
3. descarga la portada a `covers/` (Open Library para libros, imagen para compartir para artículos; nunca logos);
4. escribe en [`datos/informe.md`](datos/informe.md) lo que no pudo resolver.

Vercel publica el sitio solo en cuanto hay cambios.

Las fichas nuevas aparecen como "Sin clasificar" hasta que tienen tema y descripción en los dos idiomas. Para eso, abre el proyecto con Claude y pídele: *"Clasifica y describe las fichas pendientes de la biblioteca"*.

Cada lunes la Action revisa otra vez todos los enlaces y marca los rotos; si encuentra copia en Wayback Machine, la enlaza.

## Estructura

| Archivo | Para qué sirve |
| --- | --- |
| `essays.json` | Todas las fichas y los temas. Es lo que lee el sitio. |
| `fuentes/enlaces.txt` | Lista de lecturas en línea. |
| `fuentes/referencias.json` | Libros y artículos académicos. |
| `datos/metadatos.json` | Lo que la Action encontró en cada fuente (no se edita a mano). |
| `datos/informe.md` | Enlaces rotos, portadas faltantes y fichas pendientes. |
| `covers/` | Portadas, una por ficha, nombradas por su `id`. |
| `scripts/actualizar.mjs` | El script que corre la Action. |
| `index.html`, `assets/` | El sitio. |

### Campos de cada ficha en `essays.json`

`id`, `kind` (essay, book, chapter, paper, data), `title`, `author`, `publication`, `year`, `lang` (idioma del texto: en, es, pt, fr), `description.en`, `description.es`, `link`, `status` (working, paid, broken), `archive` (copia en Wayback si está roto), `topic`, `length` (`words` o `pages`, define el grosor del libro), `cover`.

Si quieres fijar un estado a mano y que la Action no lo cambie, agrega `"status_manual": true` a la ficha.

## Ver el sitio en tu computadora

```
python3 -m http.server
```

y abre http://localhost:8000.

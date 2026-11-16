# Changelog

Todos los cambios notables de la plataforma **Judy French Flashcards Hub** quedan registrados en este documento.

---

## [Unreleased] - 2026-11-15

### Added
- **Persistencia de sesión en el backend (`/api/srs/progress`):**
  - Guarda automáticamente el curso activo, número de tarjeta (`card_index`), dirección de estudio (`es_to_fr` / `fr_to_es`), y contadores de aciertos/errores en `data/profiles.json`.
  - Al recargar la página (F5) o ingresar desde otro dispositivo, la sesión se restaura exactamente donde se dejó.
- **Insignias de estado en tarjetas:** Indicadores visuales de `Nueva`, `Repasada (Nx)` o `Dominada` directamente sobre la tarjeta flashcard.
- **Teclado virtual de acentos franceses en Modo Examen / Quiz:**
  - Botones de acceso rápido para insertar caracteres con diacríticos (`é`, `è`, `ê`, `à`, `â`, `ù`, `û`, `ç`, `î`, `ï`, `ô`, `œ`, `«`, `»`) sin requerir reconfiguración de teclado físico.
  - Función global `window.insertFrenchChar` con inserción precisa en la posición del cursor en `<textarea>`.
- **Integración de Cursos 4, 5 y 6:**
  - Descarga y procesamiento de transcripciones con sincronización temporal exacta.
  - Generación de tarjetas con fonética IPA, etiquetas TEF Canada, análisis de liaisons y notas en Markdown (`Judy_Course_04.md`, `Judy_Course_05.md`, `Judy_Course_06.md`).
- **Control de versiones con Git & GitHub:**
  - Creación de repositorio público oficial en GitHub mediante `gh`.
  - Configuración de `.gitignore` excluyendo cachés de audio y binarios volátiles.

### Fixed
- **Sanitización de rutas de usuario:**
  - Removidas rutas locales fijas del sistema en `README.md` y `app.py`, reemplazándolas por rutas relativas o variables de entorno configurables (`FRENCH_NOTES_DIR`).
- **Portapapeles en contextos no seguros (`navigator.clipboard`):**
  - Fallback automático mediante `document.execCommand('copy')` y `prompt()` cuando no se cuenta con HTTPS o `window.isSecureContext`.
- **Invalidador de caché en assets (`cache-busting`):**
  - Versionado de parámetros en `index.html` para `app.js` (`?v=20261115_accents_fix`) evitando referencias rotas por caché persistente del navegador.

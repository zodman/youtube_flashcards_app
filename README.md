# 🇫🇷 Judy French Flashcards Hub & Native SRS Platform

Plataforma interactiva de estudio acelerado de francés basada en la serie de **54 Cursos para Principiantes de Judy**, diseñada específicamente para la preparación del examen **TEF Canada (Speaking A/B)** con repetición espaciada nativa (sin Anki), detección de liaisons y sincronización de video.

---

## 🚀 Acceso & Servicios

- **Web:** `http://localhost:8050/` o `http://<IP_LAN>:8050/`
- **Dashboard (Caddy):** `http://localhost:8080/` (Accesos directos `/flashcards` y `/judy`)
- **Gestor Procfile:**
  ```procfile
  flashcards: ./run.sh
  ```

---

## 🧠 Características Principales

1. **Repetición Espaciada Nativa (Algoritmo SM-2):**
   - Botones 1 a 4:
     - `1` (Repetir / ~15m)
     - `2` (Difícil / 1-2d)
     - `3` (Bien / 3-4d)
     - `4` (Fácil / 7-10d)
   - Atajos: `Espacio` (voltear), `1-4` (calificar), `R` (audio TTS francés).
   - Racha diaria y cálculo automático de frases pendientes.

2. **Insignias y Distintivos:**
   - **⭐ TEF A1/A2:** Frases de alto rendimiento para el examen oficial TEF Canada.
   - **🧩 Compleja:** Oraciones compuestas fluidas que combinan adverbios, régimen preposicional de infinitivo (`de + faire`, `d'être`) y subordinadas.
   - **🔗 Liaisons:** Resaltado fonético exacto (`[t]`, `[z]`, `[n]`, `[ʁ]`).

3. **Video y Citas con Expansión:**
   - YouTube embebido con saltos por segundo exacto.
   - Botón **Toggle** para expandir el video a pantalla completa (`col-12`) u ocultar/mostrar las citas laterales.

4. **Modo Examen / Quiz:**
   - Evaluador de traducción escrita al francés con selector de curso para aislar la lección actual.

5. **Notas de Estudio en Markdown:**
   - Ubicación: `french_notes/judy/`
   - Guía completa: `GUIA_PLATAFORMA_FLASHCARDS_JUDY.md`
   - Curso 1: `Judy_Course_01.md` (36 tarjetas)
   - Curso 2: `Judy_Course_02.md` (44 tarjetas)
   - Curso 3: `Judy_Course_03.md` (46 tarjetas)
   - Curso 4: `Judy_Course_04.md` (46 tarjetas)
   - Curso 5: `Judy_Course_05.md` (34 tarjetas)
   - Curso 6: `Judy_Course_06.md` (31 tarjetas)

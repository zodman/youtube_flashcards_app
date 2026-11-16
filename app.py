import os
import re
import json
import hashlib
import ssl
import urllib.parse
import urllib.request
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import HTMLResponse, FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

import generator
import srs
import db

db.init_db()

ssl._create_default_https_context = ssl._create_unverified_context

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
AUDIO_CACHE_DIR = os.path.join(BASE_DIR, "audio_cache")
NOTES_DIR = os.path.expanduser(os.environ.get("FRENCH_NOTES_DIR", "~/french_notes"))

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(AUDIO_CACHE_DIR, exist_ok=True)
os.makedirs(NOTES_DIR, exist_ok=True)

app = FastAPI(title="YouTube French Flashcard Generator & Learning Hub", version="1.0.0")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class GenerateRequest(BaseModel):
    url_or_id: str

class CardItem(BaseModel):
    id: Optional[str] = None
    french: str
    spanish: str
    english: Optional[str] = ""
    phonetics: Optional[str] = ""
    tip: Optional[str] = ""
    grammar: Optional[str] = ""
    tef_level: Optional[str] = "A1"
    timestamp: Optional[int] = 0
    tags: Optional[List[str]] = []

class UpdateDeckRequest(BaseModel):
    title: Optional[str] = None
    cards: List[CardItem]

# --- API ROUTES ---

@app.get("/api/playlist")
def get_playlist(profile: Optional[str] = None):
    videos = generator.fetch_playlist_videos()
    decks = generator.load_decks()
    srs_data = srs.load_srs_data(profile=profile)
    vault = srs_data.get("srs_vault", {})
    mastered_set = set(srs_data.get("mastered_cards", []))
    completed_courses = set(srs_data.get("completed_courses", []))

    enriched = []
    for v in videos:
        vid = v["video_id"]
        v_copy = dict(v)
        has_deck = vid in decks
        v_copy["has_deck"] = has_deck
        cards = decks[vid]["cards"] if has_deck else []
        total = len(cards)
        v_copy["card_count"] = total

        if has_deck and total > 0:
            reviewed_count = sum(1 for c in cards if c.get("id") in vault and vault[c["id"]].get("review_count", 0) > 0)
            mastered_count = sum(1 for c in cards if c.get("id") in mastered_set or vault.get(c.get("id"), {}).get("state") == "mastered")
            is_finished = (vid in completed_courses) or (reviewed_count >= total) or (mastered_count >= total)
            v_copy["reviewed_count"] = reviewed_count
            v_copy["mastered_count"] = mastered_count
            v_copy["is_finished"] = is_finished
        else:
            v_copy["reviewed_count"] = 0
            v_copy["mastered_count"] = 0
            v_copy["is_finished"] = False

        enriched.append(v_copy)
    return enriched

@app.get("/api/decks")
def get_decks():
    return generator.load_decks()

@app.get("/api/decks/{deck_id}")
def get_deck(deck_id: str):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    return decks[deck_id]

@app.post("/api/generate")
def generate_deck(req: GenerateRequest):
    return {
        "status": "error",
        "detail": "La generación automática está desactivada. Pide a Antigravity en el chat generar barajas curadas una a una con alta fidelidad fonética y TEF."
    }

@app.put("/api/decks/{deck_id}")
def update_deck(deck_id: str, req: UpdateDeckRequest):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    if req.title:
        decks[deck_id]["title"] = req.title
    decks[deck_id]["cards"] = [c.dict() for c in req.cards]
    generator.save_decks(decks)
    return {"status": "ok", "deck": decks[deck_id]}

@app.post("/api/decks/{deck_id}/cards")
def add_card(deck_id: str, card: CardItem):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    new_card = card.dict()
    if not new_card.get("id"):
        new_card["id"] = f"{deck_id}_{len(decks[deck_id]['cards']) + 1:02d}"
    decks[deck_id]["cards"].append(new_card)
    generator.save_decks(decks)
    return {"status": "ok", "card": new_card, "total_cards": len(decks[deck_id]["cards"])}

@app.delete("/api/decks/{deck_id}/cards/{card_id}")
def delete_card(deck_id: str, card_id: str):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    decks[deck_id]["cards"] = [c for c in decks[deck_id]["cards"] if c["id"] != card_id]
    generator.save_decks(decks)
    return {"status": "ok", "total_cards": len(decks[deck_id]["cards"])}

# --- NATIVE FRENCH TTS ENGINE (fr-CA & fr-FR) ---
@app.get("/tts")
def tts(text: str = "", lang: str = "fr-CA"):
    raw_text = text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Text parameter is required.")
    
    clean_text = raw_text[:300]
    target_lang = lang if lang in ["fr-CA", "fr-FR", "es"] else "fr-CA"
    cache_key = hashlib.md5(f"{target_lang}_{clean_text.lower()}".encode("utf-8")).hexdigest()
    cache_path = os.path.join(AUDIO_CACHE_DIR, f"{cache_key}.mp3")
    
    if os.path.isfile(cache_path) and os.path.getsize(cache_path) > 200:
        return FileResponse(cache_path, media_type="audio/mpeg")
    
    try:
        encoded_q = urllib.parse.quote(clean_text)
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl={target_lang}&client=tw-ob&q={encoded_q}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://translate.google.com/"
            }
        )
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            audio_bytes = resp.read()
            
        if audio_bytes and len(audio_bytes) > 200:
            with open(cache_path, "wb") as f:
                f.write(audio_bytes)
            return FileResponse(cache_path, media_type="audio/mpeg")
        else:
            raise HTTPException(status_code=502, detail="Received invalid audio stream.")
    except Exception as e:
        print(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

# --- EXPORT TO ANKI / CSV / JSON / MARKDOWN ---

@app.get("/api/export/{deck_id}")
def export_deck(deck_id: str, format: str = Query("anki", regex="^(anki|csv|json|md)$")):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    deck = decks[deck_id]
    cards = deck.get("cards", [])

    if format == "json":
        return Response(
            content=json.dumps(deck, indent=2, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{deck_id}_flashcards.json"'}
        )

    if format == "anki" or format == "csv":
        # Anki TSV format: Front \t Back \t Notes \t Tags
        # Front: Spanish prompt + English
        # Back: French target + Phonetics + Grammar + Tip + YouTube jump link
        lines = []
        lines.append("#separator:tab")
        lines.append("#html:true")
        lines.append("#tags column:6")
        for c in cards:
            front = f"<div style='font-size: 22px; font-weight: bold;'>{c.get('spanish', '')}</div>"
            if c.get("english"):
                front += f"<div style='color: #6c757d; font-size: 14px;'>{c['english']}</div>"
            
            raw_fr = c.get('french', '')
            fr_anki = highlight_liaisons(raw_fr, format='html')
            back = f"<div style='font-size: 24px; font-weight: bold; color: #0d6efd;'>{fr_anki}</div>"
            if c.get("phonetics"):
                back += f"<div style='color: #198754; font-family: monospace; font-size: 16px;'>{c['phonetics']}</div>"
            if c.get("tip"):
                back += f"<div style='background: #fff3cd; color: #856404; padding: 6px; border-radius: 4px; font-size: 13px; margin-top: 6px;'>💡 {c['tip']}</div>"
            if c.get("timestamp"):
                t = c["timestamp"]
                yt_link = f"https://www.youtube.com/watch?v={deck_id}&t={t}s"
                back += f"<div style='margin-top: 6px;'><a href='{yt_link}' target='_blank' style='font-size: 12px; color: #dc3545;'>▶ Ver en video de Judy ({t//60}:{t%60:02d})</a></div>"

            grammar = c.get("grammar", "")
            tef = c.get("tef_level", "A1")
            tags = " ".join([t.replace(" ", "_") for t in c.get("tags", [])] + [f"Judy_Course_{deck.get('lesson_number', 1)}", tef])
            
            lines.append(f"{front}\t{back}\t{grammar}\t{tef}\tJudy_French\t{tags}")

        tsv_content = "\n".join(lines)
        return Response(
            content=tsv_content,
            media_type="text/tab-separated-values",
            headers={"Content-Disposition": f'attachment; filename="{deck_id}_anki.tsv"'}
        )

    if format == "md":
        md = generate_markdown_notes(deck)
        return Response(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{deck_id}_notes.md"'}
        )

@app.post("/api/export_to_notes/{deck_id}")
def export_to_french_notes(deck_id: str):
    decks = generator.load_decks()
    if deck_id not in decks:
        raise HTTPException(status_code=404, detail="Deck not found")
    deck = decks[deck_id]
    lesson_num = deck.get("lesson_number", 1)
    filename = f"Judy_Course_{lesson_num:02d}.md"
    target_path = os.path.join(NOTES_DIR, filename)

    md_content = generate_markdown_notes(deck)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    return {
        "status": "ok",
        "file_path": target_path,
        "message": f"Successfully exported {len(deck['cards'])} flashcards to {target_path}"
    }

def highlight_liaisons(text, format="html"):
    if not text:
        return text
    vowel = r"[aâàeéèêëiîïoôuûüyh]"
    t_pattern = rf"\b(c'est|est|sont|ont|vraiment)\s+({vowel}\w*)"
    n_pattern = rf"\b(un|mon|ton|son|en)\s+({vowel}\w*)"
    z_pattern = rf"\b(très|pas|dans|chez|sous|sans|plus|les|des|ces|mes|tes|ses)\s+({vowel}\w*)"
    r_pattern = rf"\b(être)\s+(ici|ailleurs|assis|à|en|au)\b"

    if format == "html":
        text = re.sub(t_pattern, r"<mark style='background:#fff3bf;border-bottom:2px dashed #f59f00;padding:0 2px;'>\1<span style='color:#e03131;font-weight:bold;'>‿</span>\2</mark> <span style='background:#212529;color:#ffc107;font-size:11px;padding:1px 5px;border-radius:4px;font-family:monospace;'>[t]</span>", text, flags=re.I)
        text = re.sub(n_pattern, r"<mark style='background:#fff3bf;border-bottom:2px dashed #f59f00;padding:0 2px;'>\1<span style='color:#e03131;font-weight:bold;'>‿</span>\2</mark> <span style='background:#212529;color:#ffc107;font-size:11px;padding:1px 5px;border-radius:4px;font-family:monospace;'>[n]</span>", text, flags=re.I)
        text = re.sub(z_pattern, r"<mark style='background:#fff3bf;border-bottom:2px dashed #f59f00;padding:0 2px;'>\1<span style='color:#e03131;font-weight:bold;'>‿</span>\2</mark> <span style='background:#212529;color:#ffc107;font-size:11px;padding:1px 5px;border-radius:4px;font-family:monospace;'>[z]</span>", text, flags=re.I)
        text = re.sub(r_pattern, r"<mark style='background:#fff3bf;border-bottom:2px dashed #f59f00;padding:0 2px;'>\1<span style='color:#e03131;font-weight:bold;'>‿</span>\2</mark> <span style='background:#212529;color:#ffc107;font-size:11px;padding:1px 5px;border-radius:4px;font-family:monospace;'>[ʁ]</span>", text, flags=re.I)
    else: # markdown
        text = re.sub(t_pattern, r"\1**‿**\2 *(🔗 [t])*", text, flags=re.I)
        text = re.sub(n_pattern, r"\1**‿**\2 *(🔗 [n])*", text, flags=re.I)
        text = re.sub(z_pattern, r"\1**‿**\2 *(🔗 [z])*", text, flags=re.I)
        text = re.sub(r_pattern, r"\1**‿**\2 *(🔗 [ʁ])*", text, flags=re.I)
    return text

def generate_markdown_notes(deck):
    title = deck.get("title", "French Lesson")
    vid = deck.get("video_id", "")
    cards = deck.get("cards", [])
    lines = [
        f"# {title}",
        f"> **YouTube:** [Ver Lección en YouTube](https://www.youtube.com/watch?v={vid})  ",
        f"> **Nivel TEF:** {deck.get('tef_level', 'A1')} | **Total Tarjetas:** {len(cards)}",
        "",
        "## 🇫🇷 Vocabulario y Expresiones Clave con Liaisons",
        "> *(Las frases marcadas con ⭐ representan estructuras de alto rendimiento para el examen TEF Canada)*",
        "",
        "| Francés (con Liaisons 🔗) | Español | Inglés | Fonética / Regla | Nivel TEF | Video |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |"
    ]
    for c in cards:
        raw_fr = c.get("french", "").replace("|", "-")
        fr_highlighted = highlight_liaisons(raw_fr, format="markdown")
        es = c.get("spanish", "").replace("|", "-")
        en = c.get("english", "").replace("|", "-")
        ph = f"`{c.get('phonetics', '')}` - {c.get('tip', '')}".replace("|", "-")
        ts = c.get("timestamp", 0)
        link = f"[{ts//60}:{ts%60:02d}](https://www.youtube.com/watch?v={vid}&t={ts}s)"
        is_key = c.get("is_tef_key") or any(t in ["tef_star", "tef_speaking", "examen_final", "esencial"] for t in c.get("tags", []))
        is_complex = c.get("is_complex") or "complej" in (c.get("tip") or "").lower() or "complej" in (c.get("grammar") or "").lower() or "compleja" in c.get("tags", [])
        complex_suffix = " 🧩 *(Compleja)*" if is_complex else ""
        tef_label = f"⭐ **TEF {c.get('tef_level', 'A1')}**{complex_suffix}" if is_key else f"TEF {c.get('tef_level', 'A1')}{complex_suffix}"
        lines.append(f"| **{fr_highlighted}** | {es} | {en} | {ph} | {tef_label} | {link} |")

    lines.append("")
    lines.append("## 📝 Pregunta Examen / Reto del Curso")
    exam_cards = [c for c in cards if "examen" in " ".join(c.get("tags", [])).lower()]
    if exam_cards:
        for ec in exam_cards:
            lines.append(f"- **Reto:** {ec['spanish']}")
            lines.append(f"- **Respuesta Francés:** `{highlight_liaisons(ec['french'], format='markdown')}`")
            lines.append(f"- **Consejo:** {ec['tip']}")
    lines.append("")
    lines.append("<!-- vim: set spell spelllang=fr,es,en: -->")
    return "\n".join(lines)

# --- NATIVE SPACED REPETITION SYSTEM (SRS) & PROFILES API ---

def get_all_registered_cards():
    decks = generator.load_decks()
    all_cards = []
    for d in decks.values():
        all_cards.extend(d.get("cards", []))
    return all_cards

@app.get("/api/profiles")
def get_profiles_endpoint(profile: Optional[str] = None):
    cards = get_all_registered_cards()
    return srs.get_profiles_summary(cards, active_override=profile)

@app.post("/api/profiles")
def set_profile_endpoint(payload: dict):
    target = payload.get("profile") or payload.get("active_profile") or "andres"
    active = srs.set_active_profile(target)
    cards = get_all_registered_cards()
    return {
        "status": "ok",
        "active_profile": active,
        "summary": srs.get_profiles_summary(cards, active_override=active)
    }

@app.get("/api/srs/progress")
def get_study_progress_endpoint(profile: Optional[str] = None):
    return {
        "status": "ok",
        "profile": srs.normalize_profile(profile),
        "progress": srs.get_profile_progress(profile)
    }

@app.post("/api/srs/progress")
def save_study_progress_endpoint(payload: dict, profile: Optional[str] = None):
    prof = payload.get("profile") or profile
    updated = srs.save_profile_progress(payload, profile=prof)
    return {
        "status": "ok",
        "profile": srs.normalize_profile(prof),
        "progress": updated
    }

@app.get("/api/srs/stats")
def get_srs_stats_endpoint(deck_id: Optional[str] = None, profile: Optional[str] = None):
    decks = generator.load_decks()
    if deck_id and deck_id in decks:
        cards = decks[deck_id].get("cards", [])
    else:
        cards = get_all_registered_cards()
    return srs.get_srs_stats(cards, profile=profile)

@app.get("/api/srs/due")
def get_srs_due_cards_endpoint(deck_id: Optional[str] = None, profile: Optional[str] = None):
    decks = generator.load_decks()
    if deck_id and deck_id in decks:
        cards = decks[deck_id].get("cards", [])
    else:
        cards = get_all_registered_cards()
    due_cards = srs.get_due_cards(cards, profile=profile)
    return {
        "status": "ok",
        "profile": srs.normalize_profile(profile),
        "total_due": len(due_cards),
        "cards": due_cards
    }

@app.get("/api/srs/intervals/{card_id}")
def get_card_intervals(card_id: str, profile: Optional[str] = None):
    return srs.calculate_next_intervals(card_id, profile=profile)

@app.post("/api/srs/rate")
def rate_card_endpoint(payload: dict, profile: Optional[str] = None):
    cid = payload.get("card_id")
    score = payload.get("score", 3)
    prof = payload.get("profile") or profile
    if not cid:
        raise HTTPException(status_code=400, detail="card_id is required")
    res = srs.rate_srs_card(cid, int(score), profile=prof)
    return {"status": "ok", "result": res}

@app.post("/api/srs/master/{card_id}")
def mark_mastered_endpoint(card_id: str, profile: Optional[str] = None):
    res = srs.mark_card_mastered(card_id, profile=profile)
    return {"status": "ok", "result": res}

@app.post("/api/srs/reset/{card_id}")
def reset_card_endpoint(card_id: str, profile: Optional[str] = None):
    res = srs.reset_card_srs(card_id, profile=profile)
    return {"status": "ok", "result": res}

@app.get("/api/srs/library")
def get_srs_library(profile: Optional[str] = None):
    decks = generator.load_decks()
    srs_data = srs.load_srs_data(profile=profile)
    vault = srs_data.get("srs_vault", {})
    mastered_set = set(srs_data.get("mastered_cards", []))

    library = []
    now = time.time() if 'time' in globals() else __import__('time').time()
    for d_id, d in decks.items():
        lesson_num = d.get("lesson_number", 1)
        for c in d.get("cards", []):
            cid = c.get("id")
            c_info = dict(c)
            c_info["course_title"] = d.get("title", "")
            c_info["lesson_number"] = lesson_num
            c_info["video_id"] = d_id
            st = vault.get(cid, {})
            due = st.get("due_timestamp", 0)
            is_due = (cid not in vault) or (due <= now)
            is_mastered = (cid in mastered_set) or (st.get("state") == "mastered")
            
            c_info["srs"] = {
                "state": "mastered" if is_mastered else st.get("state", "new"),
                "repetitions": st.get("repetitions", 0),
                "interval": st.get("interval", 0),
                "is_due": is_due and not is_mastered,
                "review_count": st.get("review_count", 0)
            }
            library.append(c_info)
    return library

# --- QUIZ / EXAM DATABASE PERSISTENCE ---

class QuizAnswerRecord(BaseModel):
    card_id: Optional[str] = ""
    question_prompt: str
    expected_answer: str
    user_answer: str
    is_correct: bool
    written_pct: Optional[float] = None

class QuizSessionRecord(BaseModel):
    profile: Optional[str] = None
    scope: Optional[str] = "current"
    total_questions: int
    score: int
    accuracy: Optional[float] = None
    answers: List[QuizAnswerRecord] = []

@app.post("/api/quiz/save")
def save_quiz_session(record: QuizSessionRecord, profile: Optional[str] = None):
    prof = record.profile or profile or srs.load_all_profiles_data().get("active_profile", "andres")
    res = db.save_quiz_result(
        scope=record.scope or "current",
        total_questions=record.total_questions,
        score=record.score,
        answers=[a.dict() for a in record.answers],
        accuracy_override=record.accuracy,
        profile=prof
    )
    return {"status": "ok", "result": res}

@app.get("/api/quiz/history")
def get_quiz_history(limit: int = 20, profile: Optional[str] = None):
    prof = profile or srs.load_all_profiles_data().get("active_profile", "andres")
    history = db.get_quiz_history(limit=limit, profile=prof)
    return {"status": "ok", "profile": db.normalize_profile(prof), "history": history}

@app.get("/", response_class=HTMLResponse)
def index():
    html_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return "<h3>YouTube Flashcard Generator Hub Loading...</h3>"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8050)

import os
import sqlite3
import time
from typing import List, Dict, Any, Optional

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "app.db")

VALID_PROFILES = ("andres", "patty", "marco")
DEFAULT_PROFILE = "andres"


def normalize_profile(profile: Optional[str] = None) -> str:
    if not profile:
        return DEFAULT_PROFILE
    clean = str(profile).strip().lower()
    if clean in VALID_PROFILES:
        return clean
    return DEFAULT_PROFILE


def get_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_column(cursor: sqlite3.Cursor, table: str, column: str, col_def: str):
    cursor.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    if column not in cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS quiz_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile TEXT DEFAULT 'andres',
            scope TEXT,
            total_questions INTEGER,
            score INTEGER,
            accuracy REAL,
            created_at REAL
        );

        CREATE TABLE IF NOT EXISTS quiz_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            profile TEXT DEFAULT 'andres',
            card_id TEXT,
            question_prompt TEXT,
            expected_answer TEXT,
            user_answer TEXT,
            is_correct INTEGER,
            created_at REAL,
            FOREIGN KEY(session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS srs_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile TEXT DEFAULT 'andres',
            card_id TEXT,
            score INTEGER,
            interval REAL,
            created_at REAL
        );

        CREATE INDEX IF NOT EXISTS idx_quiz_answers_session ON quiz_answers(session_id);
        CREATE INDEX IF NOT EXISTS idx_srs_history_card ON srs_history(card_id);
    """)

    # Migrate existing tables if profile column was not yet present
    _ensure_column(cursor, "quiz_sessions", "profile", "TEXT DEFAULT 'andres'")
    _ensure_column(cursor, "quiz_answers", "profile", "TEXT DEFAULT 'andres'")
    _ensure_column(cursor, "srs_history", "profile", "TEXT DEFAULT 'andres'")

    cursor.execute("UPDATE quiz_sessions SET profile = 'andres' WHERE profile IS NULL OR profile = ''")
    cursor.execute("UPDATE quiz_answers SET profile = 'andres' WHERE profile IS NULL OR profile = ''")
    cursor.execute("UPDATE srs_history SET profile = 'andres' WHERE profile IS NULL OR profile = ''")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quiz_sessions_profile ON quiz_sessions(profile)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_srs_history_profile ON srs_history(profile)")

    conn.commit()
    conn.close()


def save_quiz_result(
    scope: str,
    total_questions: int,
    score: int,
    answers: List[Dict[str, Any]] = None,
    accuracy_override: Optional[float] = None,
    profile: Optional[str] = None
):
    init_db()
    prof = normalize_profile(profile)
    conn = get_db()
    cursor = conn.cursor()
    now = time.time()
    if accuracy_override is not None:
        accuracy = round(float(accuracy_override), 1)
    elif answers and any("written_pct" in a and a["written_pct"] is not None for a in answers) and total_questions > 0:
        total_pct = sum(float(a.get("written_pct") or 0) for a in answers)
        accuracy = round(total_pct / total_questions, 1)
    else:
        accuracy = round((score / total_questions) * 100, 1) if total_questions > 0 else 0.0

    cursor.execute("""
        INSERT INTO quiz_sessions (profile, scope, total_questions, score, accuracy, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (prof, scope, total_questions, score, accuracy, now))
    session_id = cursor.lastrowid

    if answers:
        for ans in answers:
            cursor.execute("""
                INSERT INTO quiz_answers (
                    session_id, profile, card_id, question_prompt, expected_answer, user_answer, is_correct, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                session_id,
                prof,
                ans.get("card_id", ""),
                ans.get("question_prompt", ""),
                ans.get("expected_answer", ""),
                ans.get("user_answer", ""),
                1 if ans.get("is_correct") else 0,
                now
            ))

    conn.commit()
    conn.close()
    return {
        "session_id": session_id,
        "profile": prof,
        "score": score,
        "total": total_questions,
        "accuracy": accuracy
    }


def get_quiz_history(limit: int = 20, profile: Optional[str] = None):
    init_db()
    prof = normalize_profile(profile)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, COALESCE(profile, 'andres') AS profile, scope, total_questions, score, accuracy, created_at
        FROM quiz_sessions
        WHERE COALESCE(profile, 'andres') = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (prof, limit))
    rows = cursor.fetchall()
    results = [dict(r) for r in rows]
    conn.close()
    return results


def get_latest_exam_per_course(profile: Optional[str] = None, decks_map: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    init_db()
    prof = normalize_profile(profile)
    conn = get_db()
    cursor = conn.cursor()

    # Query all sessions with card_ids
    cursor.execute("""
        SELECT s.id, s.profile, s.scope, s.total_questions, s.score, s.accuracy, s.created_at,
               GROUP_CONCAT(a.card_id) as card_ids
        FROM quiz_sessions s
        LEFT JOIN quiz_answers a ON s.id = a.session_id
        WHERE COALESCE(s.profile, 'andres') = ?
        GROUP BY s.id
        ORDER BY s.created_at DESC
    """, (prof,))
    rows = cursor.fetchall()
    conn.close()

    # Build map of card_id -> video_id
    card_to_vid = {}
    lesson_to_vid = {}
    if decks_map:
        for vid, d in decks_map.items():
            l_num = d.get("lesson_number")
            if l_num:
                lesson_to_vid[str(l_num)] = vid
                lesson_to_vid[f"c{l_num}"] = vid
            for c in d.get("cards", []):
                cid = c.get("id")
                if cid:
                    card_to_vid[cid] = vid

    latest_per_vid = {}
    for r in rows:
        row_dict = dict(r)
        scope = row_dict.get("scope") or "current"
        card_ids_str = row_dict.get("card_ids") or ""
        card_ids = [c.strip() for c in card_ids_str.split(",") if c.strip()]

        matched_vids = set()
        if scope in (decks_map or {}):
            matched_vids.add(scope)
        elif scope in lesson_to_vid:
            matched_vids.add(lesson_to_vid[scope])

        for cid in card_ids:
            if cid in card_to_vid:
                matched_vids.add(card_to_vid[cid])
            else:
                # heuristic: e.g. c1_01 -> lesson 1
                if cid.startswith("c") and "_" in cid:
                    prefix = cid.split("_")[0]  # e.g. "c1"
                    if prefix in lesson_to_vid:
                        matched_vids.add(lesson_to_vid[prefix])

        for vid in matched_vids:
            if vid not in latest_per_vid:
                latest_per_vid[vid] = {
                    "accuracy": row_dict.get("accuracy", 0.0),
                    "score": row_dict.get("score", 0),
                    "total_questions": row_dict.get("total_questions", 0),
                    "created_at": row_dict.get("created_at", 0),
                    "session_id": row_dict.get("id")
                }

    return latest_per_vid


def log_srs_review(card_id: str, score: int, interval: float, profile: Optional[str] = None):
    init_db()
    prof = normalize_profile(profile)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO srs_history (profile, card_id, score, interval, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (prof, card_id, score, interval, time.time()))
    conn.commit()
    conn.close()

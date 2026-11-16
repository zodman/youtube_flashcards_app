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

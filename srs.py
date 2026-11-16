import os
import json
import time
from datetime import datetime, date
import db

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PROFILES_FILE = os.path.join(DATA_DIR, "profiles.json")

DEFAULT_MAX_NEW_CARDS_PER_DAY = 15
PROFILES_LIST = ["andres", "patty", "marco"]
DEFAULT_PROFILE = "andres"


def _default_user_profile(name: str):
    return {
        "active_user": name,
        "streak": 1,
        "last_study_date": str(date.today()),
        "reviews_today": 0,
        "new_cards_today": 0,
        "max_new_cards_per_day": DEFAULT_MAX_NEW_CARDS_PER_DAY,
        "srs_vault": {},
        "mastered_cards": [],
        "last_progress": {
            "deck_id": "XUKt0Uqireo",
            "card_index": 0,
            "direction": "es_to_fr",
            "study_mode": "all",
            "scores": {"correct": 0, "again": 0}
        }
    }


def normalize_profile(profile: str = None, root_data: dict = None) -> str:
    if profile:
        clean = str(profile).strip().lower()
        if clean in PROFILES_LIST:
            return clean
    if root_data and root_data.get("active_profile"):
        clean = str(root_data["active_profile"]).strip().lower()
        if clean in PROFILES_LIST:
            return clean
    return DEFAULT_PROFILE


def load_all_profiles_data() -> dict:
    default_root = {
        "active_profile": DEFAULT_PROFILE,
        "profiles_list": list(PROFILES_LIST),
        "profiles": {
            p: _default_user_profile(p) for p in PROFILES_LIST
        }
    }
    if not os.path.exists(PROFILES_FILE):
        return default_root

    try:
        with open(PROFILES_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        return default_root

    # Migrate legacy single-user format into "andres"
    if not isinstance(raw, dict):
        return default_root

    migrated = False
    if "profiles" not in raw or not isinstance(raw.get("profiles"), dict):
        andres_prof = _default_user_profile("andres")
        for k in ("streak", "last_study_date", "reviews_today", "new_cards_today", "max_new_cards_per_day", "srs_vault", "mastered_cards"):
            if k in raw:
                andres_prof[k] = raw[k]
        raw = {
            "active_profile": DEFAULT_PROFILE,
            "profiles_list": list(PROFILES_LIST),
            "profiles": {
                "andres": andres_prof,
                "patty": _default_user_profile("patty"),
                "marco": _default_user_profile("marco")
            }
        }
        migrated = True

    raw["profiles_list"] = list(PROFILES_LIST)
    raw["active_profile"] = normalize_profile(raw.get("active_profile"))
    profiles_map = raw.setdefault("profiles", {})

    for p in PROFILES_LIST:
        def_p = _default_user_profile(p)
        if p not in profiles_map or not isinstance(profiles_map[p], dict):
            profiles_map[p] = def_p
            migrated = True
        else:
            profiles_map[p]["active_user"] = p
            for k, v in def_p.items():
                if k not in profiles_map[p]:
                    profiles_map[p][k] = v

    if migrated:
        save_all_profiles_data(raw)

    return raw


def save_all_profiles_data(root_data: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = PROFILES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(root_data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, PROFILES_FILE)


def load_srs_data(profile: str = None) -> dict:
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    return root["profiles"][prof]


def save_srs_data(profile_data: dict, profile: str = None):
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    profile_data["active_user"] = prof
    root["profiles"][prof] = profile_data
    save_all_profiles_data(root)


def set_active_profile(profile: str) -> str:
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    root["active_profile"] = prof
    save_all_profiles_data(root)
    return prof


def get_profile_progress(profile: str = None) -> dict:
    data = load_srs_data(profile)
    return data.get("last_progress", {
        "deck_id": "XUKt0Uqireo",
        "card_index": 0,
        "direction": "es_to_fr",
        "study_mode": "all",
        "scores": {"correct": 0, "again": 0}
    })


def save_profile_progress(progress_data: dict, profile: str = None) -> dict:
    data = load_srs_data(profile)
    current_prog = data.setdefault("last_progress", {})
    if "deck_id" in progress_data and progress_data["deck_id"]:
        current_prog["deck_id"] = str(progress_data["deck_id"]).strip()
    if "card_index" in progress_data:
        try:
            current_prog["card_index"] = max(0, int(progress_data["card_index"]))
        except (ValueError, TypeError):
            pass
    if "direction" in progress_data and progress_data["direction"]:
        current_prog["direction"] = str(progress_data["direction"]).strip()
    if "study_mode" in progress_data and progress_data["study_mode"]:
        current_prog["study_mode"] = str(progress_data["study_mode"]).strip()
    if "scores" in progress_data and isinstance(progress_data["scores"], dict):
        current_prog["scores"] = {
            "correct": int(progress_data["scores"].get("correct", 0)),
            "again": int(progress_data["scores"].get("again", 0))
        }
    current_prog["updated_at"] = time.time()
    save_srs_data(data, profile)
    return current_prog


def get_profiles_summary(all_cards=None, active_override: str = None) -> dict:
    root = load_all_profiles_data()
    active_prof = normalize_profile(active_override, root)
    cards = all_cards or []
    summary_profiles = {}
    for p in PROFILES_LIST:
        stats = get_srs_stats(cards, profile=p)
        summary_profiles[p] = {
            "name": p,
            "display_name": p.capitalize(),
            "streak": stats["streak"],
            "reviews_today": stats["reviews_today"],
            "due_today": stats["due_today"],
            "mastered": stats["mastered"],
            "learning": stats["learning"] + stats["review"],
            "total_cards": stats["total_cards"]
        }
    return {
        "active_profile": active_prof,
        "profiles_list": list(PROFILES_LIST),
        "profiles": summary_profiles
    }


def calculate_next_intervals(card_id, profile: str = None):
    data = load_srs_data(profile)
    vault = data.get("srs_vault", {})
    card_state = vault.get(card_id, {
        "interval": 1,
        "repetitions": 0,
        "ease": 2.5
    })
    interval = card_state.get("interval", 1)
    reps = card_state.get("repetitions", 0)
    ease = card_state.get("ease", 2.5)

    # Preview next intervals in days
    again_days = 0.01  # ~15 mins
    hard_days = max(1, round(interval * 1.2, 1))

    if reps == 0:
        good_days = 1
    elif reps == 1:
        good_days = 4
    else:
        good_days = max(4, round(interval * ease, 1))

    easy_days = max(7, round(interval * ease * 1.3 + 4, 1))

    return {
        "again": {"days": again_days, "label": "15m"},
        "hard": {"days": hard_days, "label": f"{int(hard_days)}d" if hard_days >= 1 else "1d"},
        "good": {"days": good_days, "label": f"{int(good_days)}d"},
        "easy": {"days": easy_days, "label": f"{int(easy_days)}d"},
        "current_status": {
            "state": card_state.get("state", "new"),
            "review_count": card_state.get("review_count", 0),
            "interval": interval,
            "due_timestamp": card_state.get("due_timestamp", 0),
            "is_mastered": card_state.get("state") == "mastered" or card_id in data.get("mastered_cards", [])
        }
    }


def rate_srs_card(card_id, score, profile: str = None):
    """
    score: 1 = Again (Repetir), 2 = Hard (Difícil), 3 = Good (Bien), 4 = Easy (Fácil)
    """
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    data = root["profiles"][prof]
    now = time.time()
    today_str = str(date.today())

    # Check streak
    last_date = data.get("last_study_date", "")
    if last_date != today_str:
        try:
            d_last = datetime.strptime(last_date, "%Y-%m-%d").date()
            d_now = date.today()
            delta = (d_now - d_last).days
            if delta == 1:
                data["streak"] = data.get("streak", 0) + 1
            elif delta > 1:
                data["streak"] = 1
        except Exception:
            data["streak"] = 1
        data["last_study_date"] = today_str
        data["reviews_today"] = 0
        data["new_cards_today"] = 0

    data["reviews_today"] = data.get("reviews_today", 0) + 1

    vault = data.setdefault("srs_vault", {})
    is_new = card_id not in vault
    card_state = vault.setdefault(card_id, {
        "interval": 1,
        "repetitions": 0,
        "ease": 2.5,
        "review_count": 0,
        "due_timestamp": now,
        "history": []
    })

    if is_new:
        data["new_cards_today"] = data.get("new_cards_today", 0) + 1

    interval = card_state.get("interval", 1)
    reps = card_state.get("repetitions", 0)
    ease = card_state.get("ease", 2.5)

    if score == 1:  # Again
        reps = 0
        interval = 0.01  # due in 15 minutes
        ease = max(1.3, ease - 0.2)
        state_label = "learning"
    elif score == 2:  # Hard
        interval = max(1, interval * 1.2)
        ease = max(1.3, ease - 0.15)
        state_label = "learning" if reps < 2 else "review"
    elif score == 3:  # Good
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 4
        else:
            interval = round(interval * ease)
        reps += 1
        state_label = "review" if interval < 21 else "mastered"
    elif score == 4:  # Easy
        interval = round(interval * ease * 1.3) + 4
        reps += 1
        ease = min(3.0, ease + 0.15)
        state_label = "mastered" if interval >= 14 else "review"
    else:
        state_label = card_state.get("state", "review")

    due_ts = now + (interval * 86400)

    card_state["interval"] = interval
    card_state["repetitions"] = reps
    card_state["ease"] = round(ease, 2)
    card_state["review_count"] = card_state.get("review_count", 0) + 1
    card_state["due_timestamp"] = due_ts
    card_state["last_reviewed"] = now
    card_state["state"] = state_label

    # Keep small history of last 10 ratings
    hist = card_state.setdefault("history", [])
    hist.append({"time": now, "score": score, "interval": interval})
    if len(hist) > 10:
        card_state["history"] = hist[-10:]

    save_srs_data(data, profile=prof)
    try:
        db.log_srs_review(card_id, score, interval, profile=prof)
    except Exception as e:
        print(f"Error logging SRS review to SQLite: {e}")
    return {
        "profile": prof,
        "card_id": card_id,
        "score": score,
        "card_state": card_state,
        "streak": data["streak"],
        "reviews_today": data["reviews_today"]
    }


def mark_card_mastered(card_id, profile: str = None):
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    data = root["profiles"][prof]
    now = time.time()
    vault = data.setdefault("srs_vault", {})
    card_state = vault.setdefault(card_id, {
        "interval": 60,
        "repetitions": 5,
        "ease": 2.8,
        "review_count": 1,
        "due_timestamp": now + (60 * 86400),
        "state": "mastered"
    })
    card_state["interval"] = 60
    card_state["due_timestamp"] = now + (60 * 86400)
    card_state["state"] = "mastered"

    mastered_list = data.setdefault("mastered_cards", [])
    if card_id not in mastered_list:
        mastered_list.append(card_id)

    save_srs_data(data, profile=prof)
    return {"profile": prof, "card_id": card_id, "status": "mastered"}


def reset_card_srs(card_id, profile: str = None):
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    data = root["profiles"][prof]
    vault = data.setdefault("srs_vault", {})
    if card_id in vault:
        del vault[card_id]
    mastered_list = data.setdefault("mastered_cards", [])
    if card_id in mastered_list:
        mastered_list.remove(card_id)
    save_srs_data(data, profile=prof)
    return {"profile": prof, "card_id": card_id, "status": "reset"}


def get_srs_stats(all_cards, profile: str = None):
    root = load_all_profiles_data()
    prof = normalize_profile(profile, root)
    data = root["profiles"][prof]
    vault = data.get("srs_vault", {})
    mastered_set = set(data.get("mastered_cards", []))
    now = time.time()

    total_cards = len(all_cards)
    due_reviews = 0
    learning_cards = 0
    review_cards = 0
    mastered_cards = 0
    new_cards = 0

    for c in all_cards:
        cid = c.get("id")
        if cid in vault:
            st = vault[cid]
            due = st.get("due_timestamp", 0)
            state_label = "mastered" if (cid in mastered_set or st.get("state") == "mastered") else st.get("state", "learning")
            if due <= now and state_label != "mastered":
                due_reviews += 1
            if state_label == "mastered":
                mastered_cards += 1
            elif state_label == "review":
                review_cards += 1
            else:
                learning_cards += 1
        elif cid in mastered_set:
            mastered_cards += 1
        else:
            new_cards += 1

    max_new = data.get("max_new_cards_per_day", DEFAULT_MAX_NEW_CARDS_PER_DAY)
    new_done_today = data.get("new_cards_today", 0)
    new_due_today = max(0, min(new_cards, max_new - new_done_today))
    due_today = due_reviews + new_due_today

    return {
        "profile": prof,
        "total_cards": total_cards,
        "due_today": due_today,
        "due_reviews": due_reviews,
        "due_new": new_due_today,
        "learning": learning_cards,
        "review": review_cards,
        "mastered": mastered_cards,
        "new": new_cards,
        "max_new_per_day": max_new,
        "streak": data.get("streak", 1),
        "reviews_today": data.get("reviews_today", 0)
    }


def get_due_cards(all_cards, limit_new=True, profile: str = None):
    data = load_srs_data(profile)
    vault = data.get("srs_vault", {})
    mastered_set = set(data.get("mastered_cards", []))
    now = time.time()
    due_reviews = []
    unseen_cards = []

    for c in all_cards:
        cid = c.get("id")
        if cid in vault:
            st = vault[cid]
            is_mastered = cid in mastered_set or st.get("state") == "mastered"
            if st.get("due_timestamp", 0) <= now and not is_mastered:
                c_copy = dict(c)
                c_copy["srs"] = st
                due_reviews.append(c_copy)
        elif cid not in mastered_set:
            c_copy = dict(c)
            c_copy["srs"] = {"state": "new", "repetitions": 0, "interval": 0}
            unseen_cards.append(c_copy)

    if limit_new:
        max_new = data.get("max_new_cards_per_day", DEFAULT_MAX_NEW_CARDS_PER_DAY)
        new_done_today = data.get("new_cards_today", 0)
        allowed_new = max(0, max_new - new_done_today)
        unseen_cards = unseen_cards[:allowed_new]

    # Review cards first, followed by new cards
    return due_reviews + unseen_cards

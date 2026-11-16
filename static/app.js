// --- Judy French Flashcard App State ---
const PROFILES_LIST = ["andres", "patty", "marco"];
const PROFILE_LABELS = {
    andres: "Andres",
    patty: "Patty",
    marco: "Marco"
};

function getInitialProfile() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = (urlParams.get("profile") || "").trim().toLowerCase();
        if (PROFILES_LIST.includes(fromUrl)) {
            localStorage.setItem("judy_active_profile", fromUrl);
            return fromUrl;
        }
        const saved = (localStorage.getItem("judy_active_profile") || "").trim().toLowerCase();
        if (PROFILES_LIST.includes(saved)) {
            return saved;
        }
    } catch (e) {}
    return "andres";
}

const state = {
    currentProfile: getInitialProfile(),
    decks: {},
    playlist: [],
    currentDeckId: "XUKt0Uqireo",
    currentDeck: null,
    cards: [],
    cardIndex: 0,
    isFlipped: false,
    direction: "es_to_fr", // "es_to_fr" or "fr_to_es"
    studyMode: "all", // "all" or "srs"
    scores: {
        correct: 0,
        again: 0
    },
    srsStats: {
        due_today: 0,
        streak: 1,
        mastered: 0
    },
    libraryCards: [],
    libraryFilter: "all",
    librarySearchQuery: "",
    quiz: {
        questions: [],
        currentIndex: 0,
        score: 0,
        currentCard: null
    },
    audioPlayer: new Audio()
};

function updateProfileUI() {
    const prof = state.currentProfile || "andres";
    const displayLabel = PROFILE_LABELS[prof] || prof.charAt(0).toUpperCase() + prof.slice(1);

    PROFILES_LIST.forEach(p => {
        const btn = document.getElementById(`btnProfile-${p}`);
        if (btn) {
            if (p === prof) btn.classList.add("active");
            else btn.classList.remove("active");
        }
    });

    document.querySelectorAll(".active-profile-label").forEach(el => {
        el.innerText = displayLabel;
    });
}

async function selectProfile(profileName) {
    const clean = String(profileName || "").trim().toLowerCase();
    if (!PROFILES_LIST.includes(clean)) return;

    state.currentProfile = clean;
    try {
        localStorage.setItem("judy_active_profile", clean);
    } catch (e) {}

    updateProfileUI();

    try {
        await fetch("/api/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: clean })
        });
    } catch (e) {}

    state.scores = { correct: 0, again: 0 };
    await loadSrsStats();
    await loadPlaylist();

    if (state.studyMode === "srs") {
        await switchStudyMode("srs");
    } else {
        renderFlashcard();
    }

    const quizSec = document.getElementById("tab-content-quiz");
    const libSec = document.getElementById("tab-content-library");
    const anaSec = document.getElementById("tab-content-analytics");

    if (quizSec && !quizSec.classList.contains("d-none")) {
        startNewQuiz();
    }
    if (libSec && !libSec.classList.contains("d-none")) {
        await loadLibrary();
    }
    if (anaSec && !anaSec.classList.contains("d-none")) {
        await renderAnalyticsTab();
    }

    const displayLabel = PROFILE_LABELS[clean] || clean;
    showNotification(`👤 Perfil activo: ${displayLabel} — Progreso y resultados aislados`, "info");
}

let syncProgressTimer = null;

function queueSaveProgress() {
    clearTimeout(syncProgressTimer);
    syncProgressTimer = setTimeout(async () => {
        try {
            await fetch(`/api/srs/progress?profile=${encodeURIComponent(state.currentProfile)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    profile: state.currentProfile,
                    deck_id: state.currentDeckId,
                    card_index: state.cardIndex,
                    direction: state.direction,
                    study_mode: state.studyMode,
                    scores: state.scores
                })
            });
        } catch (e) {
            console.error("Error saving progress to backend:", e);
        }
    }, 400);
}

async function loadProfileProgress() {
    try {
        const res = await fetch(`/api/srs/progress?profile=${encodeURIComponent(state.currentProfile)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "ok" && data.progress) {
                const prog = data.progress;
                if (prog.deck_id && state.decks[prog.deck_id]) {
                    state.currentDeckId = prog.deck_id;
                }
                if (typeof prog.card_index === "number") {
                    state.cardIndex = Math.max(0, prog.card_index);
                }
                if (prog.direction) {
                    state.direction = prog.direction;
                    const lbl = document.getElementById("directionLabel");
                    if (lbl) {
                        lbl.innerText = state.direction === "es_to_fr" ? "Español ➔ Francés" : "Francés ➔ Español";
                    }
                }
                if (prog.scores && typeof prog.scores.correct === "number") {
                    state.scores = {
                        correct: Number(prog.scores.correct) || 0,
                        again: Number(prog.scores.again) || 0
                    };
                }
                return prog;
            }
        }
    } catch (e) {
        console.error("Error loading progress from backend:", e);
    }
    return null;
}

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
    updateProfileUI();
    setupKeyboardShortcuts();
    await loadPlaylist();
    await loadDecks();
    await loadSrsStats();
    await loadPlaylist();

    // Restore last session progress from backend
    const savedProg = await loadProfileProgress();

    const targetDeckId = (savedProg && savedProg.deck_id && state.decks[savedProg.deck_id])
        ? savedProg.deck_id
        : (state.decks[state.currentDeckId] ? state.currentDeckId : Object.keys(state.decks)[0]);

    if (targetDeckId) {
        const restoreIdx = (savedProg && typeof savedProg.card_index === "number") ? savedProg.card_index : 0;
        selectDeck(targetDeckId, restoreIdx);
    }
});

// --- Tab Switching ---
const SECTION_META = {
    study:     { menu: "menu-study",    label: "Estudiar Curso",       icon: "fa-layer-group" },
    video:     { menu: "menu-study",    label: "Video y Citas",        icon: "fa-circle-play" },
    playlist:  { menu: "menu-study",    label: "Catálogo (54 Cursos)", icon: "fa-list-check" },
    srs:       { menu: "menu-practice", label: "Repaso Diario SRS",    icon: "fa-brain" },
    quiz:      { menu: "menu-practice", label: "Modo Examen / Quiz",   icon: "fa-feather" },
    analytics: { menu: "menu-progress", label: "Mis Avances",          icon: "fa-chart-line" },
    library:   { menu: "menu-progress", label: "Biblioteca Completa",  icon: "fa-book-bookmark" }
};

function updateNavActiveState(activeKey) {
    document.querySelectorAll(".nav-main-menu").forEach(m => m.classList.remove("active"));
    document.querySelectorAll(".submenu-item").forEach(item => item.classList.remove("active"));

    const targetSub = document.getElementById(`nav-${activeKey}`);
    if (targetSub) targetSub.classList.add("active");

    const meta = SECTION_META[activeKey];
    if (meta) {
        const parentMenu = document.getElementById(meta.menu);
        if (parentMenu) parentMenu.classList.add("active");

        const activeBadge = document.getElementById("activeSectionBadge");
        if (activeBadge) {
            activeBadge.innerHTML = `<i class="fa-solid ${meta.icon} me-1"></i> ${meta.label}`;
        }
    }
}

function switchTab(tabName) {
    // If leaving the video tab, pause YouTube playback so it doesn't collide with Flashcard audio
    if (tabName !== "video") {
        pauseYouTubeVideoQuietly();
    }

    document.querySelectorAll(".tab-section").forEach(sec => sec.classList.add("d-none"));

    const targetSec = document.getElementById(`tab-content-${tabName}`);
    if (targetSec) targetSec.classList.remove("d-none");

    updateNavActiveState(tabName);

    if (tabName === "video") {
        renderVideoTimeline();
        initYouTubeBridge();
        setTimeout(initYouTubeBridge, 500);
    } else if (tabName === "quiz") {
        startNewQuiz();
    } else if (tabName === "library") {
        loadLibrary();
    } else if (tabName === "analytics") {
        renderAnalyticsTab();
    } else if (tabName === "playlist") {
        renderPlaylistGrid();
    }
}

// --- Native SRS Mode Switching ---
async function switchStudyMode(mode) {
    state.studyMode = mode;
    switchTab("study");

    const srsBanner = document.getElementById("srsModeBanner");

    if (mode === "srs") {
        updateNavActiveState("srs");
        if (srsBanner) srsBanner.classList.remove("d-none");

        showNotification("Cargando tarjetas programadas para repaso hoy...", "info");
        try {
            const res = await fetch(`/api/srs/due?profile=${encodeURIComponent(state.currentProfile)}`);
            const data = await res.json();
            if (data.status === "ok") {
                if (data.cards.length === 0) {
                    showNotification("¡Felicidades! 🎉 Estás al día. No hay tarjetas pendientes para hoy.", "success");
                    // Fallback to all deck cards
                    state.cards = state.currentDeck ? state.currentDeck.cards : [];
                } else {
                    state.cards = data.cards;
                    showNotification(`Tienes ${data.cards.length} tarjetas pendientes para consolidar hoy.`, "warning");
                }
                state.cardIndex = 0;
                state.scores = { correct: 0, again: 0 };
                renderFlashcard();
            }
        } catch (e) {
            console.error("Error loading SRS due cards:", e);
        }
    } else {
        updateNavActiveState("study");
        if (srsBanner) srsBanner.classList.add("d-none");

        if (state.currentDeck) {
            state.cards = state.currentDeck.cards || [];
            state.cardIndex = 0;
            state.scores = { correct: 0, again: 0 };
            renderFlashcard();
        }
    }
    await loadSrsStats();
    await loadPlaylist();
}

async function loadSrsStats() {
    try {
        const res = await fetch(`/api/srs/stats?profile=${encodeURIComponent(state.currentProfile)}`);
        if (res.ok) {
            const stats = await res.json();
            state.srsStats = stats;
            const dueBadge = document.getElementById("navSrsDueBadge");
            const subDueBadge = document.getElementById("subSrsDueBadge");
            const streakNav = document.getElementById("navStreakCounter");
            if (dueBadge) dueBadge.innerText = String(stats.due_today);
            if (subDueBadge) subDueBadge.innerText = String(stats.due_today);
            if (streakNav) streakNav.innerText = `Racha: ${stats.streak}d (${stats.reviews_today} hoy)`;
        }
    } catch (e) {
        console.error("Error loading SRS stats:", e);
    }
}

// --- Load Data from API ---
async function loadPlaylist() {
    try {
        const res = await fetch(`/api/playlist?profile=${encodeURIComponent(state.currentProfile)}`);
        if (res.ok) {
            state.playlist = await res.json();
            renderPlaylistGrid();
            renderDeckSelector();
        }
    } catch (e) {
        console.error("Error loading playlist:", e);
    }
}

async function loadDecks() {
    try {
        const res = await fetch("/api/decks");
        if (res.ok) {
            state.decks = await res.json();
            renderDeckSelector();
        }
    } catch (e) {
        console.error("Error loading decks:", e);
    }
}

function renderDeckSelector() {
    const sel = document.getElementById("deckSelector");
    if (!sel) return;
    sel.innerHTML = "";

    const playlistMap = {};
    if (state.playlist && Array.isArray(state.playlist)) {
        state.playlist.forEach(item => {
            playlistMap[item.video_id] = item;
        });
    }

    const deckIds = Object.keys(state.decks).sort((a, b) => {
        return (state.decks[a].lesson_number || 99) - (state.decks[b].lesson_number || 99);
    });
    deckIds.forEach(id => {
        const d = state.decks[id];
        const opt = document.createElement("option");
        opt.value = id;
        const count = (d.cards || []).length;
        const plItem = playlistMap[id];
        const isFinished = plItem ? Boolean(plItem.is_finished) : false;
        const finishMark = isFinished ? " [X] " : "";
        opt.innerText = `${finishMark}Curso ${d.lesson_number || 1} (${count} tarjetas)${isFinished ? ' ✓ Completado' : ''}`;
        if (id === state.currentDeckId) opt.selected = true;
        sel.appendChild(opt);
    });
    updateQuizScopeSelector();
}

function updateQuizScopeSelector() {
    const sel = document.getElementById("quizScopeSelect");
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = "";

    const curOpt = document.createElement("option");
    curOpt.value = "current";
    const curTitle = state.currentDeck ? `Curso ${state.currentDeck.lesson_number || 1} (Solo este curso)` : "Curso Actual";
    curOpt.innerText = `🎯 ${curTitle}`;
    sel.appendChild(curOpt);

    const sortedIds = Object.keys(state.decks).sort((a, b) => {
        return (state.decks[a].lesson_number || 99) - (state.decks[b].lesson_number || 99);
    });
    sortedIds.forEach(id => {
        const d = state.decks[id];
        const opt = document.createElement("option");
        opt.value = id;
        opt.innerText = `Curso ${d.lesson_number || 1} (${(d.cards || []).length} frases)`;
        if (id === currentVal) opt.selected = true;
        sel.appendChild(opt);
    });

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.innerText = "🌐 Todas las lecciones combinadas";
    if (currentVal === "all") allOpt.selected = true;
    sel.appendChild(allOpt);

    if (currentVal && currentVal !== "current" && sel.querySelector(`option[value="${currentVal}"]`)) {
        sel.value = currentVal;
    }
}

function renderPlaylistGrid() {
    const grid = document.getElementById("playlistGrid");
    if (!grid) return;
    grid.innerHTML = "";

    state.playlist.forEach(item => {
        const col = document.createElement("div");
        col.className = "col-md-6 col-lg-4";
        const isCurrent = item.video_id === state.currentDeckId;
        const hasDeck = item.has_deck;
        const isFinished = Boolean(item.is_finished);
        const reviewedCount = item.reviewed_count || 0;
        const totalCards = item.card_count || 0;

        col.innerHTML = `
            <div class="card playlist-card h-100 p-3 shadow-sm ${isCurrent ? 'border-primary border-2' : ''} ${isFinished ? 'bg-success-subtle border-success' : ''}">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div class="d-flex align-items-center gap-1">
                        <span class="badge ${isFinished ? 'bg-success' : 'bg-primary'} fs-6">
                            ${isFinished ? '[X] ' : ''}Curso ${item.lesson_number}
                        </span>
                        ${isFinished ? '<span class="badge bg-success-subtle text-success border border-success fw-bold"><i class="fa-solid fa-circle-check me-1"></i>Terminado [X]</span>' : ''}
                    </div>
                    <span class="badge ${isFinished ? 'bg-success text-white' : (hasDeck ? 'bg-light text-dark border' : 'bg-light text-muted border')}">
                        ${hasDeck ? `<i class="fa-solid ${isFinished ? 'fa-check-double' : 'fa-layer-group'} me-1"></i>${reviewedCount > 0 ? `${reviewedCount}/` : ''}${totalCards} Tarjetas` : '⏳ Pendiente'}
                    </span>
                </div>
                <h6 class="fw-bold mb-2 text-truncate ${isFinished ? 'text-success-emphasis' : ''}" title="${item.title}">
                    ${isFinished ? '<i class="fa-solid fa-check text-success me-1"></i>' : ''}${item.title}
                </h6>
                <div class="text-muted small mb-3">ID: <code>${item.video_id}</code></div>
                <div class="mt-auto d-flex gap-2">
                    ${hasDeck ? `
                        <button class="btn btn-sm ${isFinished ? 'btn-success' : 'btn-primary'} flex-grow-1 fw-bold" onclick="selectDeck('${item.video_id}'); switchTab('study'); switchStudyMode('all');">
                            <i class="fa-solid fa-play me-1"></i> ${isFinished ? 'Repasar [X]' : 'Estudiar Baraja'}
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-outline-secondary flex-grow-1" onclick="copyPromptForCourse(${item.lesson_number}, '${item.video_id}')" title="Copiar mensaje para pedir en el chat">
                            <i class="fa-solid fa-comments me-1 text-primary"></i> Pedir en el Chat
                        </button>
                    `}
                    <a href="${item.url}" target="_blank" class="btn btn-sm btn-outline-danger" title="Ver lección en YouTube">
                        <i class="fa-brands fa-youtube"></i>
                    </a>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}

function copyTextToClipboard(text, successMsg = "Copiado al portapapeles") {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification(successMsg, "success");
        }).catch(() => {
            fallbackCopyText(text, successMsg);
        });
    } else {
        fallbackCopyText(text, successMsg);
    }
}

function fallbackCopyText(text, successMsg) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
            showNotification(successMsg, "success");
            return;
        }
    } catch (err) {
        // Ignored fallback failure
    }
    prompt("Copia este mensaje:", text);
}

function copyPromptForCourse(num, videoId) {
    const text = `Por favor genera las flashcards para el Curso ${num}: https://www.youtube.com/watch?v=${videoId}`;
    copyTextToClipboard(text, `📋 Copiado al portapapeles: "${text}". ¡Pégalo en el chat!`);
}

// --- LIAISON DETECTION & HIGHLIGHTING ENGINE ---
const VOWEL_START = "[aâàeéèêëiîïoôuûüyh]";

const LIAISON_RULES = [
    {
        regex: new RegExp(`\\b(c'est|est|sont|ont)\\s+(${VOWEL_START}\\w*)`, "gi"),
        letter: "t",
        sound: "[t]",
        title: "Verbe Être/Avoir + Voyelle (Liaison Obligatoire)",
        tip: (w1, w2) => `La « t » finale de « <strong>${w1}</strong> » se lie obligatoirement en <strong>[t]</strong> avec « <strong>${w2}</strong> » (« ${w1}‿${w2} »).`
    },
    {
        regex: new RegExp(`\\b(un|mon|ton|son|en)\\s+(${VOWEL_START}\\w*)`, "gi"),
        letter: "n",
        sound: "[n]",
        title: "Déterminant / Préposition nasale + Voyelle (Liaison Obligatoire)",
        tip: (w1, w2) => `Le « n » de « <strong>${w1}</strong> » enchaîne un son <strong>[n]</strong> franc sur « <strong>${w2}</strong> » (« ${w1}‿${w2} »).`
    },
    {
        regex: new RegExp(`\\b(très|pas|dans|chez|sous|sans|plus|les|des|ces|mes|tes|ses)\\s+(${VOWEL_START}\\w*)`, "gi"),
        letter: "s",
        sound: "[z]",
        title: "Adverbe / Préposition / Déterminant pluriel + Voyelle (Liaison Obligatoire)",
        tip: (w1, w2) => `La « s » muette de « <strong>${w1}</strong> » se transforme en <strong>[z]</strong> sonore devant « <strong>${w2}</strong> » (« ${w1}‿${w2} »).`
    },
    {
        regex: new RegExp(`\\b(vraiment)\\s+(${VOWEL_START}\\w*)`, "gi"),
        letter: "t",
        sound: "[t]",
        title: "Adverbe en -ment + Voyelle",
        tip: (w1, w2) => `Le « t » de « <strong>${w1}</strong> » se lie en <strong>[t]</strong> devant « <strong>${w2}</strong> » (« ${w1}‿${w2} »).`
    },
    {
        regex: new RegExp(`\\b(être)\\s+(ici|ailleurs|assis|à|en|au)\\b`, "gi"),
        letter: "r",
        sound: "[ʁ]",
        title: "Enchaînement vocalique avec être",
        tip: (w1, w2) => `La consonne « r » de « <strong>${w1}</strong> » s'enchaîne de façon fluide sur la voyelle de « <strong>${w2}</strong> » (« ${w1}‿${w2} »).`
    }
];

function analyzeLiaisons(text) {
    if (!text) return { hasLiaison: false, matches: [], highlightedHtml: text };
    let matches = [];
    let highlightedHtml = text;

    LIAISON_RULES.forEach(rule => {
        let m;
        const re = new RegExp(rule.regex.source, "gi");
        while ((m = re.exec(text)) !== null) {
            const w1 = m[1];
            const w2 = m[2];
            const originalPair = m[0];
            const tied = `${w1}‿${w2}`;
            matches.push({
                raw: originalPair,
                w1,
                w2,
                tied,
                letter: rule.letter,
                sound: rule.sound,
                title: rule.title,
                desc: rule.tip(w1, w2)
            });
        }
    });

    matches.forEach(m => {
        const span = `<span class="liaison-highlight" title="Liaison ${m.sound}">${m.w1}<span class="liaison-tie">‿</span>${m.w2}</span>`;
        highlightedHtml = highlightedHtml.replace(m.raw, span);
    });

    return {
        hasLiaison: matches.length > 0,
        matches,
        highlightedHtml
    };
}

// --- Deck Selection & Flashcard Display ---
function onDeckSelected(deckId) {
    selectDeck(deckId);
}

function selectDeck(deckId, initialCardIndex = 0) {
    state.currentDeckId = deckId;
    state.currentDeck = state.decks[deckId];
    if (!state.currentDeck) return;
    updateQuizScopeSelector();

    if (state.studyMode === "all") {
        state.cards = state.currentDeck.cards || [];
        const maxIdx = Math.max(0, state.cards.length - 1);
        state.cardIndex = Math.min(Math.max(0, initialCardIndex), maxIdx);
        state.isFlipped = false;
        if (initialCardIndex === 0 && !state.scores.correct && !state.scores.again) {
            state.scores = { correct: 0, again: 0 };
        }
    }

    // Update Header Meta
    const titleEl = document.getElementById("studyDeckTitle");
    const metaEl = document.getElementById("studyDeckMeta");
    const vTitleEl = document.getElementById("videoTabTitle");
    if (titleEl) titleEl.innerText = state.currentDeck.title;
    if (metaEl) metaEl.innerText = `${(state.currentDeck.cards || []).length} Tarjetas • Nivel ${state.currentDeck.tef_level || 'A1'} • ${state.currentDeck.channel || 'Judy'}`;
    if (vTitleEl) vTitleEl.innerText = state.currentDeck.title;

    // Update YouTube Player for selected course
    ytState.currentTime = 0;
    ytState.lastSyncTimestamp = 0;
    ytState.isPlaying = false;
    ytState.activeCardId = null;
    ytState.userScrollLockUntil = 0;
    updatePlayPauseButtonUI();

    if (ytPlayer && ytState.ready && typeof ytPlayer.cueVideoById === "function") {
        try {
            ytPlayer.cueVideoById(deckId);
        } catch (e) {}
    } else {
        const iframe = document.getElementById("youtubeIframe");
        if (iframe) {
            const currentSrc = iframe.getAttribute("src") || "";
            if (!currentSrc.includes(`/embed/${deckId}`)) {
                ytPlayer = null;
                ytState.ready = false;
                iframe.onload = () => {
                    initYouTubeBridge();
                    setTimeout(initYouTubeBridge, 800);
                };
                iframe.src = `https://www.youtube.com/embed/${deckId}?enablejsapi=1`;
            } else {
                initYouTubeBridge();
            }
        }
    }

    renderDeckSelector();
    renderFlashcard();
    renderVideoTimeline();
    queueSaveProgress();
}

async function renderFlashcard() {
    if (!state.cards || state.cards.length === 0) return;
    const card = state.cards[state.cardIndex];
    if (!card) return;

    // Reset Flip
    state.isFlipped = false;
    const cardEl = document.getElementById("flashcardElement");
    if (cardEl) cardEl.classList.remove("flipped");

    // Counter & Progress
    const total = state.cards.length;
    const cur = state.cardIndex + 1;
    const counterEl = document.getElementById("studyCardCounter");
    const progEl = document.getElementById("studyProgressBar");
    if (counterEl) {
        counterEl.innerText = state.studyMode === "srs" 
            ? `Repaso SRS: ${cur} de ${total}` 
            : `Tarjeta ${cur} de ${total}`;
    }
    if (progEl) progEl.style.width = `${(cur / total) * 100}%`;

    // Scores
    document.getElementById("correctScore").innerText = String(state.scores.correct);
    document.getElementById("againScore").innerText = String(state.scores.again);

    // Front & Back Elements
    const frontText = document.getElementById("frontText");
    const backText = document.getElementById("backText");
    const backPhonetic = document.getElementById("backPhonetic");
    const backEnglish = document.getElementById("backEnglish");
    const backTip = document.getElementById("backTip");
    const frontCat = document.getElementById("frontCategoryBadge");
    const backGrammar = document.getElementById("backGrammarBadge");
    const frontSub = document.getElementById("frontSubLabel");
    const liaisonBadge = document.getElementById("cardLiaisonBadge");
    const liaisonBox = document.getElementById("cardLiaisonBox");

    // Analyze liaisons in French text
    const liaison = analyzeLiaisons(card.french);

    if (state.direction === "es_to_fr") {
        if (frontSub) frontSub.innerText = "¿CÓMO SE DICE EN FRANCÉS?";
        if (frontText) frontText.innerText = card.spanish;
        if (backText) backText.innerHTML = liaison.hasLiaison ? liaison.highlightedHtml : card.french;
        if (backEnglish) backEnglish.innerText = card.english ? `Inglés: ${card.english}` : "";
    } else {
        if (frontSub) frontSub.innerText = "¿QUÉ SIGNIFICA EN ESPAÑOL?";
        if (frontText) frontText.innerHTML = liaison.hasLiaison ? liaison.highlightedHtml : card.french;
        if (backText) backText.innerText = card.spanish;
        if (backEnglish) backEnglish.innerText = card.english ? `Inglés: ${card.english}` : "";
    }

    // Liaison Badge & Box
    if (liaisonBadge) {
        if (liaison.hasLiaison) {
            const sounds = Array.from(new Set(liaison.matches.map(m => m.sound))).join(", ");
            liaisonBadge.innerHTML = `<i class="fa-solid fa-link me-1"></i>Liaison ${sounds}`;
            liaisonBadge.classList.remove("d-none");
        } else {
            liaisonBadge.classList.add("d-none");
        }
    }

    if (liaisonBox) {
        if (liaison.hasLiaison) {
            liaisonBox.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-warning">
                    <span class="fw-bold small text-uppercase"><i class="fa-solid fa-link me-1"></i>Guía Fonética de Enlace (Liaison TEF)</span>
                    <span class="badge bg-warning text-dark font-monospace">${liaison.matches.map(m => m.tied).join(" • ")}</span>
                </div>
                <div class="d-flex flex-column gap-1">
                    ${liaison.matches.map(m => `
                        <div class="liaison-item">
                            <div class="d-flex align-items-center justify-content-between">
                                <span class="fw-bold text-dark font-monospace">${m.w1} <span class="liaison-tie">‿</span> ${m.w2}</span>
                                <span class="badge bg-dark text-warning font-monospace">${m.letter} ➔ ${m.sound}</span>
                            </div>
                            <div class="small text-muted mt-1">${m.desc}</div>
                        </div>
                    `).join("")}
                </div>
            `;
            liaisonBox.classList.remove("d-none");
        } else {
            liaisonBox.classList.add("d-none");
        }
    }

    if (backPhonetic) backPhonetic.innerText = card.phonetics || "";
    if (backTip) {
        backTip.innerHTML = `💡 <strong>Consejo de Judy:</strong> ${card.tip || "Practica la pronunciación conectada."}`;
    }
    if (frontCat) frontCat.innerText = (card.tags && card.tags[0]) ? card.tags[0].toUpperCase() : "EXPRESIÓN";
    if (backGrammar) backGrammar.innerText = card.grammar || "Gramática TEF A1";

    // Star near TEF A1 badge for key high-yield TEF phrases, plus 🧩 for complex phrases
    const frontTef = document.getElementById("frontTefBadge");
    const backTef = document.getElementById("backTefBadge");
    const isTefKey = card.is_tef_key || (card.tags && (card.tags.includes("tef_star") || card.tags.includes("tef_speaking") || card.tags.includes("examen_final") || card.tags.includes("esencial")));
    const isComplex = card.is_complex || (card.tip && card.tip.toLowerCase().includes("complej")) || (card.grammar && card.grammar.toLowerCase().includes("complej")) || (card.tags && card.tags.includes("compleja"));
    const tefLvl = card.tef_level || "A1";

    if (frontTef) {
        if (isTefKey) {
            frontTef.className = "badge tef-star-badge shadow-sm";
            frontTef.innerHTML = `<i class="fa-solid fa-star tef-star-icon"></i> ⭐ TEF ${tefLvl}${isComplex ? ' 🧩' : ''}`;
            frontTef.title = `⭐ Frase de alto rendimiento clave para el examen TEF (Speaking Section A/B)${isComplex ? ' • 🧩 Estructura Compleja' : ''}`;
        } else {
            frontTef.className = "badge bg-light text-dark border";
            frontTef.innerHTML = `TEF ${tefLvl}${isComplex ? ' 🧩' : ''}`;
            frontTef.title = `Nivel TEF ${tefLvl}${isComplex ? ' • 🧩 Frase Compleja' : ''}`;
        }
        let cBadge = document.getElementById("frontComplexBadge");
        if (isComplex) {
            if (!cBadge) {
                cBadge = document.createElement("span");
                cBadge.id = "frontComplexBadge";
                frontTef.parentNode.appendChild(cBadge);
            }
            cBadge.className = "badge complex-badge shadow-sm ms-1";
            cBadge.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> 🧩 Compleja`;
            cBadge.title = "🧩 Frase Compleja: Estructura fluida combinada (adverbios, enlaces y calificativos de alto valor TEF)";
            cBadge.style.display = "inline-flex";
        } else if (cBadge) {
            cBadge.style.display = "none";
        }
    }

    if (backTef) {
        if (isTefKey) {
            backTef.className = "badge tef-star-badge shadow-sm";
            backTef.innerHTML = `<i class="fa-solid fa-star tef-star-icon"></i> ⭐ TEF ${tefLvl}${isComplex ? ' 🧩' : ''}`;
            backTef.title = `⭐ Frase de alto rendimiento clave para el examen TEF (Speaking Section A/B)${isComplex ? ' • 🧩 Estructura Compleja' : ''}`;
        } else {
            backTef.className = "badge bg-info text-dark";
            backTef.innerHTML = `TEF ${tefLvl}${isComplex ? ' 🧩' : ''}`;
            backTef.title = `Nivel TEF ${tefLvl}${isComplex ? ' • 🧩 Frase Compleja' : ''}`;
        }
        let cBadgeBack = document.getElementById("backComplexBadge");
        if (isComplex) {
            if (!cBadgeBack) {
                cBadgeBack = document.createElement("span");
                cBadgeBack.id = "backComplexBadge";
                backTef.parentNode.appendChild(cBadgeBack);
            }
            cBadgeBack.className = "badge complex-badge shadow-sm ms-1";
            cBadgeBack.innerHTML = `<i class="fa-solid fa-puzzle-piece"></i> 🧩 Compleja`;
            cBadgeBack.title = "🧩 Frase Compleja: Estructura fluida combinada (adverbios, enlaces y calificativos de alto valor TEF)";
            cBadgeBack.style.display = "inline-flex";
        } else if (cBadgeBack) {
            cBadgeBack.style.display = "none";
        }
    }

    // Update expected interval labels on grading buttons
    updateIntervalLabels(card.id);
}

async function updateIntervalLabels(cardId) {
    if (!cardId) return;
    try {
        const res = await fetch(`/api/srs/intervals/${cardId}?profile=${encodeURIComponent(state.currentProfile)}`);
        if (res.ok) {
            const data = await res.json();
            const lblAgain = document.getElementById("lblIntervalAgain");
            const lblHard = document.getElementById("lblIntervalHard");
            const lblGood = document.getElementById("lblIntervalGood");
            const lblEasy = document.getElementById("lblIntervalEasy");

            if (lblAgain) lblAgain.innerText = data.again.label;
            if (lblHard) lblHard.innerText = data.hard.label;
            if (lblGood) lblGood.innerText = data.good.label;
            if (lblEasy) lblEasy.innerText = data.easy.label;

            // Optional status indicator on card
            const st = data.current_status;
            let statusBadge = document.getElementById("cardReviewStatusBadge");
            if (!statusBadge) {
                statusBadge = document.createElement("span");
                statusBadge.id = "cardReviewStatusBadge";
                const tefBadge = document.getElementById("frontTefBadge");
                if (tefBadge && tefBadge.parentNode) {
                    tefBadge.parentNode.insertBefore(statusBadge, tefBadge);
                }
            }
            if (statusBadge && st) {
                if (st.is_mastered) {
                    statusBadge.className = "badge bg-warning text-dark me-1 shadow-sm";
                    statusBadge.innerHTML = `<i class="fa-solid fa-crown me-1"></i>Dominada`;
                    statusBadge.style.display = "inline-flex";
                } else if (st.review_count > 0) {
                    statusBadge.className = "badge bg-info text-dark me-1 shadow-sm";
                    statusBadge.innerHTML = `<i class="fa-solid fa-rotate me-1"></i>Repasada (${st.review_count}x)`;
                    statusBadge.style.display = "inline-flex";
                } else {
                    statusBadge.className = "badge bg-light text-secondary border me-1";
                    statusBadge.innerHTML = `<i class="fa-solid fa-sparkles me-1"></i>Nueva`;
                    statusBadge.style.display = "inline-flex";
                }
            }
        }
    } catch (e) {}
}

function flipCard() {
    state.isFlipped = !state.isFlipped;
    const cardEl = document.getElementById("flashcardElement");
    if (cardEl) {
        if (state.isFlipped) cardEl.classList.add("flipped");
        else cardEl.classList.remove("flipped");
    }
    if (state.isFlipped) {
        playCurrentAudio("fr-CA");
    }
}

function nextCard() {
    if (state.cardIndex < state.cards.length - 1) {
        state.cardIndex++;
        renderFlashcard();
        queueSaveProgress();
    } else {
        if (state.studyMode === "srs") {
            showNotification("¡Excelente! Has completado todos tus repasos programados para hoy. 🎉", "success");
        } else {
            showNotification("¡Has completado todas las tarjetas de esta lección! 🎉", "success");
            // Mark course completed in backend
            if (state.currentDeckId) {
                fetch(`/api/srs/progress?profile=${encodeURIComponent(state.currentProfile)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        profile: state.currentProfile,
                        mark_course_completed: state.currentDeckId
                    })
                }).then(() => {
                    loadPlaylist();
                }).catch(() => {});
            }
        }
        queueSaveProgress();
    }
}

function prevCard() {
    if (state.cardIndex > 0) {
        state.cardIndex--;
        renderFlashcard();
        queueSaveProgress();
    }
}

function restartDeck() {
    state.cardIndex = 0;
    state.scores = { correct: 0, again: 0 };
    renderFlashcard();
    queueSaveProgress();
}

function toggleCardDirection() {
    state.direction = state.direction === "es_to_fr" ? "fr_to_es" : "es_to_fr";
    const lbl = document.getElementById("directionLabel");
    if (lbl) {
        lbl.innerText = state.direction === "es_to_fr" ? "Español ➔ Francés" : "Francés ➔ Español";
    }
    renderFlashcard();
    queueSaveProgress();
}

async function rateCard(score) {
    if (!state.cards || state.cards.length === 0) return;
    const card = state.cards[state.cardIndex];

    if (score === 1) state.scores.again++;
    else state.scores.correct++;

    // Send native SRS update to server
    try {
        await fetch(`/api/srs/rate?profile=${encodeURIComponent(state.currentProfile)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ card_id: card.id, score: score, profile: state.currentProfile })
        });
        loadSrsStats();
    } catch (e) {}

    queueSaveProgress();
    nextCard();
}

async function quickMarkMastered() {
    if (!state.cards || state.cards.length === 0) return;
    const card = state.cards[state.cardIndex];
    if (!card) return;

    try {
        await fetch(`/api/srs/master/${card.id}?profile=${encodeURIComponent(state.currentProfile)}`, { method: "POST" });
        showNotification(`«${card.french}» marcada como dominada y guardada.`, "success");
        loadSrsStats();
        nextCard();
    } catch (e) {
        console.error(e);
    }
}

// --- Audio Player ---
function playCurrentAudio(lang = "fr-CA") {
    if (!state.cards || state.cards.length === 0) return;
    const card = state.cards[state.cardIndex];
    if (!card) return;

    playFrenchText(card.french, lang);
}

function playFrenchText(text, lang = "fr-CA") {
    const textToSpeak = String(text || "").replace(/\.\.\./g, "");
    state.audioPlayer.src = `/tts?text=${encodeURIComponent(textToSpeak)}&lang=${lang}`;
    state.audioPlayer.play().catch(e => console.log("Audio play error:", e));
}

// --- YouTube Timestamp Video Jump & Playback Controls ---
let ytPlayer = null;
const ytState = {
    ready: false,
    currentTime: 0,
    lastSyncTimestamp: 0,
    isPlaying: false,
    osdTimer: null,
    autoScroll: true,
    activeCardId: null,
    userScrollLockUntil: 0,
    syncIntervalId: null
};

function scrollCitasItemIntoView(itemEl) {
    const list = document.getElementById("videoTimelineList");
    if (!list || !itemEl) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();
    if (listRect.height <= 0) return;

    const offsetInsideList = itemRect.top - listRect.top;
    const targetScrollTop = list.scrollTop + offsetInsideList - (listRect.height / 2) + (itemRect.height / 2);
    list.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth"
    });
}

function syncVideoTimelineWithPlayer(forceScroll = false) {
    const videoSec = document.getElementById("tab-content-video");
    if (!videoSec || videoSec.classList.contains("d-none")) return;

    if (ytPlayer && ytState.ready) {
        try {
            if (typeof ytPlayer.getPlayerState === "function") {
                const pState = ytPlayer.getPlayerState();
                if (typeof pState === "number" && pState !== 3) {
                    const nowPlaying = (pState === 1);
                    if (nowPlaying !== ytState.isPlaying) {
                        ytState.isPlaying = nowPlaying;
                        updatePlayPauseButtonUI();
                    }
                }
            }
            if (typeof ytPlayer.getCurrentTime === "function") {
                const t = ytPlayer.getCurrentTime();
                if (typeof t === "number" && !isNaN(t)) {
                    ytState.currentTime = t;
                    ytState.lastSyncTimestamp = Date.now();
                }
            }
        } catch (e) {}
    }

    const currentSec = getEstimatedYouTubeTime();
    if (!forceScroll && !ytState.isPlaying && currentSec <= 0) return;

    const list = document.getElementById("videoTimelineList");
    if (!list) return;
    const items = Array.from(list.querySelectorAll(".yt-playlist-item"));
    if (items.length === 0) return;

    let matchedItem = items[0];
    for (const item of items) {
        const ts = Number(item.dataset.timestamp || 0);
        if (ts <= currentSec + 0.4) {
            matchedItem = item;
        } else {
            break;
        }
    }

    const matchedId = matchedItem.dataset.cardId || "";
    if (matchedId !== ytState.activeCardId || forceScroll) {
        ytState.activeCardId = matchedId;
        items.forEach(r => r.classList.remove("active"));
        matchedItem.classList.add("active");

        const np = document.getElementById("ytNowPlaying");
        if (np) {
            const timeStr = matchedItem.dataset.timeStr || "0:00";
            const frText = matchedItem.dataset.french || "";
            np.innerHTML = `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-play me-1"></i>${timeStr}</span> <span class="fw-semibold text-dark">${frText}</span>`;
        }

        if (forceScroll || (ytState.autoScroll && Date.now() >= ytState.userScrollLockUntil)) {
            scrollCitasItemIntoView(matchedItem);
        }
    }
}

function toggleVideoAutoScroll() {
    ytState.autoScroll = !ytState.autoScroll;
    ytState.userScrollLockUntil = 0;
    const btn = document.getElementById("btnToggleAutoScroll");
    const lbl = document.getElementById("lblAutoScroll");
    if (btn) {
        btn.className = ytState.autoScroll
            ? "btn btn-xs btn-primary rounded-pill d-flex align-items-center gap-1"
            : "btn btn-xs btn-outline-secondary rounded-pill d-flex align-items-center gap-1";
    }
    if (lbl) {
        lbl.innerText = ytState.autoScroll ? "Sync ON" : "Sync OFF";
    }
    if (ytState.autoScroll) {
        syncVideoTimelineWithPlayer(true);
    }
    reclaimFocusForVideoShortcuts();
}

window.toggleVideoAutoScroll = toggleVideoAutoScroll;

function reclaimFocusForVideoShortcuts() {
    setTimeout(() => {
        const videoSec = document.getElementById("tab-content-video");
        const isVideoTabActive = videoSec && !videoSec.classList.contains("d-none");
        if (!isVideoTabActive) return;

        const active = document.activeElement;
        if (active && (active.id === "youtubeIframe" || active.tagName === "BUTTON" || active.tagName === "A")) {
            active.blur();
            document.body.setAttribute("tabindex", "-1");
            document.body.focus({ preventScroll: true });
        }
    }, 80);
}

function initYouTubeBridge() {
    const iframe = document.getElementById("youtubeIframe");
    if (!iframe) return;

    if (!ytPlayer && window.YT && window.YT.Player) {
        try {
            ytPlayer = new window.YT.Player("youtubeIframe", {
                events: {
                    onReady: () => {
                        ytState.ready = true;
                    },
                    onStateChange: (event) => {
                        ytState.isPlaying = (event.data === 1);
                        if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
                            const t = ytPlayer.getCurrentTime();
                            if (typeof t === "number" && !isNaN(t)) {
                                ytState.currentTime = t;
                                ytState.lastSyncTimestamp = Date.now();
                            }
                        }
                        updatePlayPauseButtonUI();
                        reclaimFocusForVideoShortcuts();
                    }
                }
            });
        } catch (e) {}
    }

    if (iframe.contentWindow) {
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: "listening",
                id: "youtubeIframe",
                channel: "widget"
            }), "*");
        } catch (e) {}
    }
}

window.onYouTubeIframeAPIReady = function () {
    initYouTubeBridge();
};

function getEstimatedYouTubeTime() {
    if (ytPlayer && ytState.ready && typeof ytPlayer.getCurrentTime === "function") {
        try {
            const apiTime = ytPlayer.getCurrentTime();
            if (typeof apiTime === "number" && !isNaN(apiTime)) {
                ytState.currentTime = apiTime;
                ytState.lastSyncTimestamp = Date.now();
                return Math.max(0, apiTime);
            }
        } catch (e) {}
    }
    if (ytState.isPlaying && ytState.lastSyncTimestamp > 0) {
        const elapsed = (Date.now() - ytState.lastSyncTimestamp) / 1000;
        return Math.max(0, ytState.currentTime + elapsed);
    }
    return Math.max(0, ytState.currentTime);
}

function showVideoOsd(text) {
    const overlay = document.getElementById("ytOsdOverlay");
    const label = document.getElementById("ytOsdText");
    if (!overlay || !label) return;
    label.innerText = text;
    overlay.classList.remove("d-none");
    if (ytState.osdTimer) clearTimeout(ytState.osdTimer);
    ytState.osdTimer = setTimeout(() => {
        overlay.classList.add("d-none");
    }, 900);
}

function updatePlayPauseButtonUI() {
    const icon = document.getElementById("iconYtPlayPause");
    if (icon) {
        icon.className = ytState.isPlaying ? "fa-solid fa-pause me-1" : "fa-solid fa-play me-1";
    }
}

function jumpToCurrentVideoTimestamp() {
    if (!state.cards || state.cards.length === 0) return;
    const card = state.cards[state.cardIndex];
    if (!card) return;
    const ts = card.timestamp || 0;

    switchTab("video");
    seekYouTubePlayer(ts);
}

function seekYouTubePlayer(seconds) {
    const iframe = document.getElementById("youtubeIframe");
    if (!iframe) return;
    const target = Math.max(0, Number(seconds) || 0);
    ytState.currentTime = target;
    ytState.lastSyncTimestamp = Date.now();
    ytState.isPlaying = true;
    ytState.userScrollLockUntil = 0;
    initYouTubeBridge();

    if (ytPlayer && ytState.ready && typeof ytPlayer.seekTo === "function") {
        try {
            ytPlayer.seekTo(target, true);
            ytPlayer.playVideo();
        } catch (e) {}
    } else if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [target, true]
        }), "*");
        iframe.contentWindow.postMessage(JSON.stringify({
            event: "command",
            func: "playVideo",
            args: []
        }), "*");
    }
    updatePlayPauseButtonUI();
    syncVideoTimelineWithPlayer(true);
    reclaimFocusForVideoShortcuts();
}

function pauseYouTubeVideoQuietly() {
    const iframe = document.getElementById("youtubeIframe");
    if (ytState.isPlaying) {
        ytState.currentTime = getEstimatedYouTubeTime();
        ytState.isPlaying = false;
        ytState.lastSyncTimestamp = Date.now();
    }
    if (ytPlayer && ytState.ready && typeof ytPlayer.pauseVideo === "function") {
        try {
            ytPlayer.pauseVideo();
        } catch (e) {}
    } else if (iframe && iframe.contentWindow) {
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: "command",
                func: "pauseVideo",
                args: []
            }), "*");
        } catch (e) {}
    }
    updatePlayPauseButtonUI();
}

function toggleVideoPlayPause() {
    const iframe = document.getElementById("youtubeIframe");
    if (!iframe) return;
    initYouTubeBridge();

    let currentlyPlaying = ytState.isPlaying;
    if (ytPlayer && ytState.ready && typeof ytPlayer.getPlayerState === "function") {
        try {
            const pState = ytPlayer.getPlayerState();
            if (typeof pState === "number") {
                currentlyPlaying = (pState === 1 || pState === 3);
            }
        } catch (e) {}
    }

    if (currentlyPlaying) {
        ytState.currentTime = getEstimatedYouTubeTime();
        ytState.isPlaying = false;
        ytState.lastSyncTimestamp = Date.now();
        if (ytPlayer && ytState.ready && typeof ytPlayer.pauseVideo === "function") {
            try { ytPlayer.pauseVideo(); } catch (e) {}
        } else if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: "command",
                func: "pauseVideo",
                args: []
            }), "*");
        }
        showVideoOsd("⏸ Pausa");
    } else {
        ytState.isPlaying = true;
        ytState.lastSyncTimestamp = Date.now();
        if (ytPlayer && ytState.ready && typeof ytPlayer.playVideo === "function") {
            try { ytPlayer.playVideo(); } catch (e) {}
        } else if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: "command",
                func: "playVideo",
                args: []
            }), "*");
        }
        showVideoOsd("▶ Reproduciendo");
    }
    updatePlayPauseButtonUI();
    reclaimFocusForVideoShortcuts();
}

function seekVideoRelative(deltaSeconds) {
    const iframe = document.getElementById("youtubeIframe");
    if (!iframe) return;
    initYouTubeBridge();

    const baseTime = getEstimatedYouTubeTime();
    const target = Math.max(0, Math.round(baseTime + deltaSeconds));
    ytState.currentTime = target;
    ytState.lastSyncTimestamp = Date.now();

    if (ytPlayer && ytState.ready && typeof ytPlayer.seekTo === "function") {
        try {
            ytPlayer.seekTo(target, true);
        } catch (e) {}
    } else if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [target, true]
        }), "*");
    }

    const timeStr = `${Math.floor(target / 60)}:${String(target % 60).padStart(2, "0")}`;
    const label = deltaSeconds < 0 ? `⏪ ${deltaSeconds}s • ${timeStr}` : `⏩ +${deltaSeconds}s • ${timeStr}`;
    ytState.userScrollLockUntil = 0;
    showVideoOsd(label);
    syncVideoTimelineWithPlayer(true);
    reclaimFocusForVideoShortcuts();
}

window.toggleVideoPlayPause = toggleVideoPlayPause;
window.seekVideoRelative = seekVideoRelative;
window.pauseYouTubeVideoQuietly = pauseYouTubeVideoQuietly;

// --- YouTube Watch Mode & Right Menu Controls ---
let isTheaterMode = false;
let isCitasPanelHidden = false;
let ytTimelineFilter = 'all';
let ytTimelineSearchQuery = '';

function toggleTheaterMode() {
    isTheaterMode = !isTheaterMode;
    const layoutRow = document.getElementById("videoLayoutRow");
    const playerCol = document.getElementById("videoPlayerCol");
    const btn = document.getElementById("btnTheaterMode");
    const lbl = document.getElementById("lblTheaterMode");
    const icon = document.getElementById("iconTheater");

    if (!layoutRow || !playerCol) return;

    if (isTheaterMode) {
        layoutRow.classList.add("theater-mode-active");
        if (lbl) lbl.innerText = "Modo Normal";
        if (icon) icon.className = "fa-solid fa-compress";
        if (btn) btn.className = "btn btn-dark btn-sm rounded-pill fw-bold px-3 d-flex align-items-center gap-1";
    } else {
        layoutRow.classList.remove("theater-mode-active");
        if (lbl) lbl.innerText = "Modo Cine";
        if (icon) icon.className = "fa-solid fa-rectangle-ad";
        if (btn) btn.className = "btn btn-outline-dark btn-sm rounded-pill fw-bold px-3 d-flex align-items-center gap-1";
    }
}

function toggleCitasPanel() {
    isCitasPanelHidden = !isCitasPanelHidden;
    const playerCol = document.getElementById("videoPlayerCol");
    const citasCol = document.getElementById("videoCitasCol");
    const btn = document.getElementById("btnToggleCitas");
    const btnText = document.getElementById("btnToggleCitasText");
    const icon = document.getElementById("iconSidebarToggle");

    if (!playerCol || !citasCol) return;

    if (isCitasPanelHidden) {
        citasCol.classList.add("d-none");
        playerCol.classList.remove("col-xl-8", "col-lg-7");
        playerCol.classList.add("col-12");
        if (btnText) btnText.innerText = "Mostrar Menú";
        if (icon) icon.className = "fa-solid fa-list-check";
        if (btn) {
            btn.className = "btn btn-primary btn-sm rounded-pill fw-bold px-3 d-flex align-items-center gap-1";
            btn.title = "Mostrar el menú lateral de frases y explicaciones de Judy";
        }
    } else {
        citasCol.classList.remove("d-none");
        if (!isTheaterMode) {
            playerCol.classList.remove("col-12");
            playerCol.classList.add("col-xl-8", "col-lg-7");
        }
        if (btnText) btnText.innerText = "Ocultar Menú";
        if (icon) icon.className = "fa-solid fa-list-check";
        if (btn) {
            btn.className = "btn btn-outline-primary btn-sm rounded-pill fw-bold px-3 d-flex align-items-center gap-1";
            btn.title = "Ocultar el menú lateral de frases para expandir el video al 100%";
        }
    }
}

function filterVideoTimeline(filterType) {
    ytTimelineFilter = filterType;
    document.querySelectorAll(".yt-filter-btn").forEach(btn => {
        btn.classList.remove("active", "btn-dark");
        btn.classList.add("btn-outline-secondary");
    });
    const map = {
        'all': 'btnFilterYtAll',
        'tef': 'btnFilterYtTef',
        'compleja': 'btnFilterYtComp',
        'liaison': 'btnFilterYtLiaison'
    };
    const activeBtn = document.getElementById(map[filterType]);
    if (activeBtn) {
        activeBtn.classList.remove("btn-outline-secondary");
        activeBtn.classList.add("active", "btn-dark");
    }
    renderVideoTimeline();
    reclaimFocusForVideoShortcuts();
}

function onVideoTimelineSearch(keyword) {
    ytTimelineSearchQuery = (keyword || "").trim().toLowerCase();
    renderVideoTimeline();
}

// --- Video Timeline List (YouTube Right Menu Style) ---
function renderVideoTimeline() {
    const list = document.getElementById("videoTimelineList");
    if (!list) return;

    const deck = state.currentDeck;
    const cards = deck ? (deck.cards || []) : (state.cards || []);

    // Update YouTube Metadata Bar
    if (deck) {
        const titleEl = document.getElementById("videoTabTitle");
        const channelEl = document.getElementById("videoChannelTitle");
        const subBadge = document.getElementById("videoSubtitleBadge");
        const descText = document.getElementById("videoDescriptionText");
        const ytLink = document.getElementById("videoYtDirectLink");
        const countBadge = document.getElementById("ytSidebarCount");
        const deckNameBadge = document.getElementById("ytSidebarDeckName");

        if (titleEl) titleEl.innerText = deck.title;
        if (channelEl) channelEl.innerText = deck.channel || "Aprender Francés con Judy";
        if (subBadge) subBadge.innerText = `Curso ${deck.lesson_number || 1} • ${cards.length} frases • Nivel ${deck.tef_level || 'A1'}`;
        if (descText) descText.innerText = deck.description || "Metodología de Judy para construir frases desde cero sin reglas gramaticales complejas. Haz clic en cualquier frase del menú lateral derecho para saltar al segundo exacto.";
        if (ytLink) ytLink.href = `https://www.youtube.com/watch?v=${deck.video_id}`;
        if (countBadge) countBadge.innerText = `${cards.length} frases`;
        if (deckNameBadge) deckNameBadge.innerText = `Curso ${deck.lesson_number || 1}`;
    }

    list.innerHTML = "";

    // Filter cards
    let filtered = cards.filter(card => {
        if (ytTimelineSearchQuery) {
            const haystack = `${card.french} ${card.spanish} ${card.english || ''} ${card.tip || ''} ${card.phonetics || ''}`.toLowerCase();
            if (!haystack.includes(ytTimelineSearchQuery)) return false;
        }
        if (ytTimelineFilter === 'tef') {
            return card.is_tef_key || (card.tags && card.tags.includes("tef_star"));
        }
        if (ytTimelineFilter === 'compleja') {
            return card.is_complex || (card.tags && card.tags.includes("compleja"));
        }
        if (ytTimelineFilter === 'liaison') {
            return analyzeLiaisons(card.french).hasLiaison;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fa-solid fa-filter-circle-xmark fs-3 mb-2"></i>
                <div class="small">No se encontraron frases con los filtros actuales.</div>
            </div>
        `;
        return;
    }

    filtered.forEach((card) => {
        const row = document.createElement("div");
        const activeId = ytState.activeCardId || (state.cards[state.cardIndex] ? String(state.cards[state.cardIndex].id) : null);
        const isCurrent = String(card.id) === String(activeId);
        row.className = `yt-playlist-item ${isCurrent ? 'active' : ''}`;
        row.id = `yt-item-${card.id}`;

        const ts = card.timestamp || 0;
        const timeStr = `${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, '0')}`;
        row.dataset.timestamp = String(ts);
        row.dataset.cardId = String(card.id);
        row.dataset.timeStr = timeStr;
        row.dataset.french = card.french || "";

        const liaison = analyzeLiaisons(card.french);
        const frHtml = liaison.hasLiaison ? liaison.highlightedHtml : card.french;
        const isTef = card.is_tef_key || (card.tags && (card.tags.includes("tef_star") || card.tags.includes("tef_speaking")));
        const isComp = card.is_complex || (card.tags && card.tags.includes("compleja"));

        row.innerHTML = `
            <div class="yt-item-timestamp" title="Saltar a ${timeStr} en el video">
                <i class="fa-solid fa-play" style="font-size:0.65rem;"></i> ${timeStr}
            </div>
            <div class="flex-grow-1 text-start overflow-hidden">
                <div class="d-flex align-items-center flex-wrap gap-1 mb-1">
                    <span class="fw-bold text-dark text-break" style="font-size: 0.95rem;">${frHtml}</span>
                    ${isTef ? '<span class="badge tef-star-badge shadow-sm" style="font-size:0.65rem; padding: 1px 5px;" title="Frase Clave TEF Canada">⭐ TEF</span>' : ''}
                    ${isComp ? '<span class="badge complex-badge shadow-sm" style="font-size:0.65rem; padding: 1px 5px;" title="Frase Compleja">🧩</span>' : ''}
                </div>
                <div class="text-secondary small text-truncate" title="${card.spanish}">${card.spanish}</div>
                ${card.phonetics ? `<div class="font-monospace text-muted" style="font-size: 0.72rem;">${card.phonetics}</div>` : ''}
                ${card.tip ? `<div class="yt-tip-callout"><span class="fw-bold">💡 Judy:</span> ${card.tip}</div>` : ''}
            </div>
            <button class="yt-item-audio-btn" title="Escuchar pronunciación" onclick="event.stopPropagation(); playFrenchText('${card.french.replace(/'/g, "\\'")}'); reclaimFocusForVideoShortcuts();">
                <i class="fa-solid fa-volume-high"></i>
            </button>
        `;

        row.onclick = () => {
            ytState.activeCardId = String(card.id);
            ytState.userScrollLockUntil = 0;
            document.querySelectorAll(".yt-playlist-item").forEach(r => r.classList.remove("active"));
            row.classList.add("active");

            const np = document.getElementById("ytNowPlaying");
            if (np) {
                np.innerHTML = `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-play me-1"></i>${timeStr}</span> <span class="fw-semibold text-dark">${card.french}</span>`;
            }
            if (ytState.autoScroll) {
                scrollCitasItemIntoView(row);
            }
            seekYouTubePlayer(ts);
            reclaimFocusForVideoShortcuts();
        };

        list.appendChild(row);
    });

    const activeEl = list.querySelector(".yt-playlist-item.active");
    if (activeEl && ytState.autoScroll) {
        setTimeout(() => scrollCitasItemIntoView(activeEl), 80);
    }
}

// --- Library & Explorer ---
async function loadLibrary() {
    try {
        const res = await fetch(`/api/srs/library?profile=${encodeURIComponent(state.currentProfile)}`);
        if (res.ok) {
            state.libraryCards = await res.json();
            renderLibraryTable();
        }
    } catch (e) {
        console.error("Error loading library:", e);
    }
}

function filterLibrary(type) {
    state.libraryFilter = type;
    document.querySelectorAll("#btnFilterAll, #btnFilterDue, #btnFilterMastered").forEach(b => b.classList.remove("active"));
    const btn = document.getElementById(type === "all" ? "btnFilterAll" : type === "due" ? "btnFilterDue" : "btnFilterMastered");
    if (btn) btn.classList.add("active");
    renderLibraryTable();
}

function onLibrarySearch(query) {
    state.librarySearchQuery = query.toLowerCase().trim();
    renderLibraryTable();
}

function renderLibraryTable() {
    const tbody = document.getElementById("libraryTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const allCount = state.libraryCards.length;
    const dueCount = state.libraryCards.filter(c => c.srs && c.srs.is_due).length;
    const masteredCount = state.libraryCards.filter(c => c.srs && c.srs.state === "mastered").length;

    document.getElementById("libCountAll").innerText = String(allCount);
    document.getElementById("libCountDue").innerText = String(dueCount);
    document.getElementById("libCountMastered").innerText = String(masteredCount);

    let filtered = state.libraryCards.filter(c => {
        if (state.libraryFilter === "due") return c.srs && c.srs.is_due;
        if (state.libraryFilter === "mastered") return c.srs && c.srs.state === "mastered";
        return true;
    });

    if (state.librarySearchQuery) {
        filtered = filtered.filter(c => 
            (c.french && c.french.toLowerCase().includes(state.librarySearchQuery)) ||
            (c.spanish && c.spanish.toLowerCase().includes(state.librarySearchQuery)) ||
            (c.tip && c.tip.toLowerCase().includes(state.librarySearchQuery))
        );
    }

    filtered.forEach(c => {
        const tr = document.createElement("tr");
        const s = c.srs || {};
        let statusBadge = `<span class="badge bg-secondary">Nuevo</span>`;
        if (s.state === "mastered") {
            statusBadge = `<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i>Dominada</span>`;
        } else if (s.is_due) {
            statusBadge = `<span class="badge bg-danger"><i class="fa-solid fa-fire me-1"></i>Pendiente</span>`;
        } else if (s.repetitions > 0) {
            statusBadge = `<span class="badge bg-info text-dark">Repaso</span>`;
        }

        const liaison = analyzeLiaisons(c.french);
        const frHtml = liaison.hasLiaison ? liaison.highlightedHtml : c.french;
        const ts = c.timestamp || 0;
        const timeStr = `${Math.floor(ts / 60)}:${String(ts % 60).padStart(2, '0')}`;

        const isTefStar = c.is_tef_key || (c.tags && (c.tags.includes('tef_star') || c.tags.includes('tef_speaking') || c.tags.includes('examen_final') || c.tags.includes('esencial')));
        const isComplex = c.is_complex || (c.tip && c.tip.toLowerCase().includes("complej")) || (c.grammar && c.grammar.toLowerCase().includes("complej")) || (c.tags && c.tags.includes("compleja"));
        const tefLvl = c.tef_level || 'A1';
        const tefBadgeHtml = isTefStar 
            ? `<div class="mt-1"><span class="badge tef-star-badge" title="⭐ Frase de alto rendimiento para el examen TEF${isComplex ? ' • 🧩 Estructura Compleja' : ''}"><i class="fa-solid fa-star tef-star-icon"></i> ⭐ TEF ${tefLvl}${isComplex ? ' 🧩' : ''}</span></div>`
            : `<div class="mt-1"><span class="badge bg-light text-dark border">TEF ${tefLvl}${isComplex ? ' 🧩' : ''}</span></div>`;
        const complexBadgeHtml = isComplex 
            ? `<div class="mt-1"><span class="badge complex-badge shadow-sm" title="🧩 Frase Compleja (Estructura fluida combinada)"><i class="fa-solid fa-puzzle-piece"></i> 🧩 Compleja</span></div>` 
            : '';

        tr.innerHTML = `
            <td>
                ${statusBadge}
                ${tefBadgeHtml}
                ${complexBadgeHtml}
            </td>
            <td>
                <div class="fw-bold fs-6">${frHtml}</div>
                <div class="text-muted small font-monospace">${c.phonetics || ""}</div>
            </td>
            <td>
                <div class="text-dark">${c.spanish}</div>
                <div class="small text-muted fst-italic">${c.tip || ""}</div>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary rounded-pill px-2 py-1" onclick="playFrenchText('${c.french.replace(/'/g, "\\'")}')">
                    <i class="fa-solid fa-volume-high me-1"></i> Audio
                </button>
            </td>
            <td>
                <a href="https://www.youtube.com/watch?v=${c.video_id}&t=${ts}s" target="_blank" class="btn btn-sm btn-outline-danger rounded-pill px-2 py-1">
                    <i class="fa-brands fa-youtube me-1"></i> ${timeStr}
                </a>
            </td>
            <td>
                <span class="badge bg-light text-dark border font-monospace">
                    ${s.interval ? `${s.interval}d` : '0d'} (rev: ${s.repetitions || 0})
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-success" onclick="quickMasterFromLibrary('${c.id}')" title="Marcar como dominada">
                        <i class="fa-solid fa-bolt"></i>
                    </button>
                    <button class="btn btn-outline-secondary" onclick="quickResetFromLibrary('${c.id}')" title="Reiniciar progreso">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function quickMasterFromLibrary(cardId) {
    try {
        await fetch(`/api/srs/master/${cardId}?profile=${encodeURIComponent(state.currentProfile)}`, { method: "POST" });
        await loadLibrary();
        await loadSrsStats();
    await loadPlaylist();
        showNotification("Tarjeta marcada como dominada.", "success");
    } catch (e) {}
}

async function quickResetFromLibrary(cardId) {
    try {
        await fetch(`/api/srs/reset/${cardId}?profile=${encodeURIComponent(state.currentProfile)}`, { method: "POST" });
        await loadLibrary();
        await loadSrsStats();
    await loadPlaylist();
        showNotification("Progreso de la tarjeta reiniciado.", "info");
    } catch (e) {}
}

// --- Quiz Mode (Multiline, Writing % Accuracy, Visual Diff, Skip/Unanswered & Final 0-100 Qualification) ---

function escapeQuizHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function cleanFrenchForQuiz(s) {
    return String(s || "")
        .replace(/[’‘`´]/g, "'")
        .replace(/[.,!?;:¡¿"«»()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripAccentsQuiz(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function computeEditDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const ca = a[i - 1];
            const cb = b[j - 1];
            if (ca === cb) {
                dp[i][j] = dp[i - 1][j - 1];
            } else if (stripAccentsQuiz(ca) === stripAccentsQuiz(cb)) {
                // Accent-only difference costs 0.5 of a character error
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + 0.5
                );
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

function buildCharDiffHtml(userStr, targetStr) {
    const u = Array.from(userStr);
    const t = Array.from(targetStr);
    const m = u.length;
    const n = t.length;

    // LCS matrix where base-character match (ignoring accents/case) counts
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            const ua = u[i].toLowerCase();
            const tb = t[j].toLowerCase();
            if (ua === tb) {
                dp[i][j] = 1 + dp[i + 1][j + 1];
            } else if (stripAccentsQuiz(ua) === stripAccentsQuiz(tb)) {
                dp[i][j] = 0.9 + dp[i + 1][j + 1];
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    let i = 0;
    let j = 0;
    let userHtml = "";
    let targetHtml = "";

    while (i < m && j < n) {
        const ua = u[i].toLowerCase();
        const tb = t[j].toLowerCase();
        if (ua === tb) {
            userHtml += `<span class="quiz-char-ok">${escapeQuizHtml(u[i])}</span>`;
            targetHtml += `<span class="quiz-char-ok">${escapeQuizHtml(t[j])}</span>`;
            i++;
            j++;
        } else if (stripAccentsQuiz(ua) === stripAccentsQuiz(tb) && dp[i][j] === 0.9 + dp[i + 1][j + 1]) {
            userHtml += `<span class="quiz-char-accent" title="Acento/tilde diferente (esperado: ${escapeQuizHtml(t[j])})">${escapeQuizHtml(u[i])}</span>`;
            targetHtml += `<span class="quiz-char-accent" title="Acento requerido">${escapeQuizHtml(t[j])}</span>`;
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            userHtml += `<span class="quiz-char-del" title="Carácter sobrante o incorrecto">${escapeQuizHtml(u[i])}</span>`;
            i++;
        } else {
            targetHtml += `<span class="quiz-char-ins" title="Carácter faltante">${escapeQuizHtml(t[j])}</span>`;
            j++;
        }
    }
    while (i < m) {
        userHtml += `<span class="quiz-char-del" title="Carácter sobrante">${escapeQuizHtml(u[i])}</span>`;
        i++;
    }
    while (j < n) {
        targetHtml += `<span class="quiz-char-ins" title="Carácter faltante">${escapeQuizHtml(t[j])}</span>`;
        j++;
    }

    if (!userHtml) {
        userHtml = `<span class="text-muted fst-italic">(Sin respuesta escrita)</span>`;
    }
    return { userHtml, targetHtml };
}

function buildWordDiffHtml(userStr, targetStr) {
    const uWords = userStr ? userStr.split(/\s+/).filter(Boolean) : [];
    const tWords = targetStr ? targetStr.split(/\s+/).filter(Boolean) : [];
    const m = uWords.length;
    const n = tWords.length;

    function wordSim(w1, w2) {
        const a = w1.toLowerCase();
        const b = w2.toLowerCase();
        if (a === b) return 1.0;
        if (stripAccentsQuiz(a) === stripAccentsQuiz(b)) return 0.9;
        const maxL = Math.max(a.length, b.length, 1);
        const d = computeEditDistance(a, b);
        const sim = (maxL - d) / maxL;
        return sim >= 0.55 ? sim : 0;
    }

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            const sim = wordSim(uWords[i], tWords[j]);
            if (sim > 0) {
                dp[i][j] = Math.max(sim + dp[i + 1][j + 1], dp[i + 1][j], dp[i][j + 1]);
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    let i = 0;
    let j = 0;
    const pills = [];

    while (i < m && j < n) {
        const sim = wordSim(uWords[i], tWords[j]);
        if (sim > 0 && Math.abs(dp[i][j] - (sim + dp[i + 1][j + 1])) < 1e-6) {
            if (uWords[i].toLowerCase() === tWords[j].toLowerCase()) {
                pills.push(`<span class="quiz-word-pill word-ok"><i class="fa-solid fa-check"></i> ${escapeQuizHtml(tWords[j])}</span>`);
            } else {
                pills.push(`<span class="quiz-word-pill word-fix" title="Corrección en palabra"><span class="text-decoration-line-through text-danger">${escapeQuizHtml(uWords[i])}</span> <i class="fa-solid fa-arrow-right small"></i> <strong>${escapeQuizHtml(tWords[j])}</strong></span>`);
            }
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            pills.push(`<span class="quiz-word-pill word-extra" title="Palabra extra"><i class="fa-solid fa-minus"></i> <span class="text-decoration-line-through">${escapeQuizHtml(uWords[i])}</span></span>`);
            i++;
        } else {
            pills.push(`<span class="quiz-word-pill word-missing" title="Palabra faltante"><i class="fa-solid fa-plus"></i> ${escapeQuizHtml(tWords[j])}</span>`);
            j++;
        }
    }
    while (i < m) {
        pills.push(`<span class="quiz-word-pill word-extra" title="Palabra extra"><i class="fa-solid fa-minus"></i> <span class="text-decoration-line-through">${escapeQuizHtml(uWords[i])}</span></span>`);
        i++;
    }
    while (j < n) {
        pills.push(`<span class="quiz-word-pill word-missing" title="Palabra faltante"><i class="fa-solid fa-plus"></i> ${escapeQuizHtml(tWords[j])}</span>`);
        j++;
    }

    return pills.join(" ");
}

function insertFrenchChar(char) {
    const input = document.getElementById("quizAnswerInput");
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const currentVal = input.value || "";

    input.value = currentVal.substring(0, start) + char + currentVal.substring(end);
    const newPos = start + char.length;
    input.focus();
    input.setSelectionRange(newPos, newPos);

    if (typeof onQuizInputChanged === "function") {
        onQuizInputChanged(input.value);
    }
}
window.insertFrenchChar = insertFrenchChar;

function evaluateFrenchWriting(userRaw, expectedRaw) {
    const userClean = cleanFrenchForQuiz(userRaw);
    const targetClean = cleanFrenchForQuiz(expectedRaw);

    const userLower = userClean.toLowerCase();
    const targetLower = targetClean.toLowerCase();

    let writtenPct = 0;
    const isExact = (userLower.length > 0 && userLower === targetLower);

    if (!userLower) {
        writtenPct = 0;
    } else if (isExact) {
        writtenPct = 100;
    } else {
        const dist = computeEditDistance(userLower, targetLower);
        const maxLen = Math.max(userLower.length, targetLower.length, 1);
        const rawPct = Math.round(((maxLen - dist) / maxLen) * 100);
        writtenPct = Math.max(0, Math.min(99, rawPct));
    }

    const { userHtml, targetHtml } = buildCharDiffHtml(userClean, targetClean);
    const wordDiffHtml = buildWordDiffHtml(userClean, targetClean);

    return {
        writtenPct,
        isExact,
        userClean,
        targetClean,
        userDiffHtml: userHtml,
        targetDiffHtml: targetHtml,
        wordDiffHtml
    };
}

function startNewQuiz() {
    let pool = [];
    const scopeSelect = document.getElementById("quizScopeSelect");
    const scope = scopeSelect ? scopeSelect.value : "current";

    if (scope === "current" && state.currentDeck && state.currentDeck.cards) {
        pool = state.currentDeck.cards;
    } else if (scope === "all") {
        pool = [];
        Object.values(state.decks).forEach(d => {
            if (d.cards) pool.push(...d.cards);
        });
    } else if (state.decks[scope] && state.decks[scope].cards) {
        pool = state.decks[scope].cards;
    } else if (state.currentDeck && state.currentDeck.cards) {
        pool = state.currentDeck.cards;
    } else {
        pool = state.cards || [];
    }

    if (!pool || pool.length === 0) return;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const count = Math.min(10, shuffled.length);
    state.quiz.questions = shuffled.slice(0, count);
    state.quiz.currentIndex = 0;
    state.quiz.score = 0;
    state.quiz.historyAnswers = new Array(count).fill(null);
    state.quiz.drafts = new Array(count).fill("");
    state.quiz.skipped = new Array(count).fill(false);
    state.quiz.finished = false;
    state.quiz.scope = scope;

    const activeArea = document.getElementById("quizActiveQuestionArea");
    const summaryArea = document.getElementById("quizFinalSummaryArea");
    if (activeArea) activeArea.classList.remove("d-none");
    if (summaryArea) {
        summaryArea.classList.add("d-none");
        summaryArea.innerHTML = "";
    }

    renderQuizQuestion();
    loadQuizHistory();
}

function recomputeQuizLiveTotals() {
    const total = state.quiz.questions.length || 0;
    const answers = state.quiz.historyAnswers || [];
    let exactCount = 0;
    let answeredCount = 0;
    let sumWrittenPct = 0;

    for (let i = 0; i < total; i++) {
        const a = answers[i];
        if (a && a.answered) {
            answeredCount++;
            sumWrittenPct += Number(a.written_pct || 0);
            if (a.is_correct) exactCount++;
        }
    }

    state.quiz.score = exactCount;
    const unansweredCount = Math.max(0, total - answeredCount);
    const avgWritten = answeredCount > 0 ? Math.round(sumWrittenPct / answeredCount) : null;

    const scoreEl = document.getElementById("quizScore");
    const avgEl = document.getElementById("quizAvgWrittenPct");
    const unansBtn = document.getElementById("btnGoUnanswered");
    const unansCountEl = document.getElementById("quizUnansweredCount");

    if (scoreEl) scoreEl.innerText = `${exactCount} / ${total}`;
    if (avgEl) avgEl.innerText = avgWritten !== null ? `${avgWritten}%` : "--%";
    if (unansCountEl) unansCountEl.innerText = String(unansweredCount);
    if (unansBtn) {
        if (unansweredCount > 0) {
            unansBtn.classList.remove("d-none");
        } else {
            unansBtn.classList.add("d-none");
        }
    }

    return { total, exactCount, answeredCount, unansweredCount, avgWritten, sumWrittenPct };
}

function renderQuizNavPills() {
    const navBar = document.getElementById("quizQuestionNavBar");
    if (!navBar) return;
    navBar.innerHTML = "";

    const total = state.quiz.questions.length || 0;
    const answers = state.quiz.historyAnswers || [];
    const skipped = state.quiz.skipped || [];

    for (let i = 0; i < total; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        const a = answers[i];
        let statusClass = "status-unanswered";
        let labelHtml = `${i + 1}`;
        let titleText = `Pregunta ${i + 1}: Sin responder`;

        if (a && a.answered) {
            const pct = Math.round(Number(a.written_pct || 0));
            if (pct === 100) {
                statusClass = "status-perfect";
                labelHtml = `${i + 1} <i class="fa-solid fa-check small"></i>`;
            } else if (pct >= 60) {
                statusClass = "status-partial";
                labelHtml = `${i + 1} <span style="font-size:0.7rem;">(${pct}%)</span>`;
            } else {
                statusClass = "status-low";
                labelHtml = `${i + 1} <span style="font-size:0.7rem;">(${pct}%)</span>`;
            }
            titleText = `Pregunta ${i + 1}: Respondida (${pct}% bien escrito)`;
        } else if (skipped[i]) {
            statusClass = "status-skipped";
            labelHtml = `${i + 1} <i class="fa-solid fa-forward small"></i>`;
            titleText = `Pregunta ${i + 1}: Saltada (Sin responder)`;
        }

        btn.className = `quiz-q-pill ${statusClass} ${i === state.quiz.currentIndex ? "current" : ""}`;
        btn.title = titleText;
        btn.innerHTML = labelHtml;
        btn.onclick = () => jumpToQuizQuestion(i);
        navBar.appendChild(btn);
    }
}

function onQuizInputChanged(val) {
    if (!state.quiz.drafts) state.quiz.drafts = [];
    state.quiz.drafts[state.quiz.currentIndex] = val;
}

function handleQuizTextareaKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        checkQuizAnswer();
    }
}

function jumpToQuizQuestion(targetIndex) {
    const total = state.quiz.questions.length || 0;
    if (targetIndex < 0 || targetIndex >= total) return;

    const inputEl = document.getElementById("quizAnswerInput");
    if (inputEl && state.quiz.drafts) {
        state.quiz.drafts[state.quiz.currentIndex] = inputEl.value;
    }

    const activeArea = document.getElementById("quizActiveQuestionArea");
    const summaryArea = document.getElementById("quizFinalSummaryArea");
    if (activeArea) activeArea.classList.remove("d-none");
    if (summaryArea) summaryArea.classList.add("d-none");

    state.quiz.currentIndex = targetIndex;
    renderQuizQuestion();
}

function renderQuizQuestion() {
    const idx = state.quiz.currentIndex;
    const q = state.quiz.questions[idx];
    state.quiz.currentCard = q;
    if (!q) return;

    recomputeQuizLiveTotals();
    renderQuizNavPills();

    const counter = document.getElementById("quizCounter");
    const promptEl = document.getElementById("quizQuestionPrompt");
    const inputEl = document.getElementById("quizAnswerInput");
    const fbBox = document.getElementById("quizFeedbackBox");
    const statusBadge = document.getElementById("quizQuestionStatusBadge");
    const prevBtn = document.getElementById("btnQuizPrev");

    if (counter) counter.innerText = `Pregunta ${idx + 1} de ${state.quiz.questions.length}`;
    if (promptEl) promptEl.innerText = q.spanish;
    if (prevBtn) prevBtn.disabled = (idx === 0);

    const existingAns = state.quiz.historyAnswers ? state.quiz.historyAnswers[idx] : null;
    const savedDraft = (state.quiz.drafts && typeof state.quiz.drafts[idx] === "string")
        ? state.quiz.drafts[idx]
        : (existingAns ? existingAns.user_answer : "");

    if (inputEl) {
        inputEl.value = savedDraft === "(Revelado)" || savedDraft === "(Sin responder)" ? "" : savedDraft;
        inputEl.focus();
    }

    if (statusBadge) {
        statusBadge.classList.remove("d-none", "bg-success-subtle", "text-success", "bg-warning-subtle", "text-warning-emphasis", "bg-secondary-subtle", "text-secondary");
        if (existingAns && existingAns.answered) {
            statusBadge.classList.add("bg-success-subtle", "text-success");
            statusBadge.innerText = `Respondida (${existingAns.written_pct}% bien escrito)`;
        } else if (state.quiz.skipped && state.quiz.skipped[idx]) {
            statusBadge.classList.add("bg-warning-subtle", "text-warning-emphasis");
            statusBadge.innerText = "Saltada • Pendiente por responder";
        } else {
            statusBadge.classList.add("bg-secondary-subtle", "text-secondary");
            statusBadge.innerText = "Sin responder";
        }
    }

    if (fbBox) {
        if (existingAns && existingAns.feedback_html) {
            fbBox.className = existingAns.feedback_class || "alert alert-info p-3 text-start rounded-3 mt-3 mb-0";
            fbBox.innerHTML = existingAns.feedback_html;
            fbBox.classList.remove("d-none");
        } else {
            fbBox.classList.add("d-none");
            fbBox.innerHTML = "";
        }
    }
}

function buildQuizFeedbackHtml(q, userRaw, evalResult) {
    const pct = evalResult.writtenPct;
    const badgeColor = pct === 100 ? "bg-success" : (pct >= 80 ? "bg-primary" : (pct >= 50 ? "bg-warning text-dark" : "bg-danger"));
    const barColor = pct === 100 ? "bg-success" : (pct >= 80 ? "bg-primary" : (pct >= 50 ? "bg-warning" : "bg-danger"));
    const headerIcon = pct === 100
        ? `<i class="fa-solid fa-circle-check text-success me-2"></i>¡Excelente! Escrito a la perfección`
        : (pct >= 80
            ? `<i class="fa-solid fa-wand-magic-sparkles text-primary me-2"></i>¡Muy bien! Solo pequeños detalles de escritura`
            : `<i class="fa-solid fa-triangle-exclamation text-danger me-2"></i>Revisa las diferencias entre tu respuesta y la correcta`);

    const safeFrAudio = (q.french || "").replace(/'/g, "\\'");

    return `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <div class="fw-bold fs-6 text-dark">${headerIcon}</div>
            <div class="d-flex align-items-center gap-2">
                <span class="badge ${badgeColor} fs-6 px-3 py-2 shadow-sm">
                    <i class="fa-solid fa-pen-nib me-1"></i>${pct}% Bien escrito
                </span>
                <button type="button" class="btn btn-sm btn-outline-dark rounded-pill px-3" onclick="playFrenchText('${safeFrAudio}', 'fr-CA')">
                    <i class="fa-solid fa-volume-high me-1"></i>Escuchar
                </button>
            </div>
        </div>

        <div class="progress mb-3" style="height: 8px;">
            <div class="progress-bar ${barColor}" role="progressbar" style="width: ${pct}%"></div>
        </div>

        <div class="quiz-diff-panel">
            <div class="row g-2 mb-2">
                <div class="col-md-6">
                    <div class="small fw-bold text-muted text-uppercase mb-1">
                        <i class="fa-solid fa-user-pen me-1"></i>Tu respuesta:
                    </div>
                    <div class="quiz-diff-line">${evalResult.userDiffHtml}</div>
                </div>
                <div class="col-md-6">
                    <div class="small fw-bold text-success text-uppercase mb-1">
                        <i class="fa-solid fa-check-circle me-1"></i>Respuesta correcta:
                    </div>
                    <div class="quiz-diff-line">${evalResult.targetDiffHtml}</div>
                </div>
            </div>

            <div class="mt-2 pt-2 border-top">
                <div class="small fw-bold text-muted text-uppercase mb-1">
                    <i class="fa-solid fa-code-compare me-1"></i>Diferencia palabra por palabra:
                </div>
                <div class="d-flex flex-wrap gap-1">${evalResult.wordDiffHtml}</div>
            </div>
        </div>

        <div class="mt-2 small text-muted d-flex flex-wrap align-items-center gap-2">
            ${q.phonetics ? `<span class="badge bg-light text-dark border font-monospace">${escapeQuizHtml(q.phonetics)}</span>` : ""}
            ${q.tip ? `<span><strong>💡 Judy:</strong> ${escapeQuizHtml(q.tip)}</span>` : ""}
        </div>
    `;
}

function checkQuizAnswer() {
    const idx = state.quiz.currentIndex;
    const q = state.quiz.currentCard;
    if (!q) return;

    const input = document.getElementById("quizAnswerInput");
    const userRaw = input ? input.value.trim() : "";
    if (state.quiz.drafts) state.quiz.drafts[idx] = userRaw;

    const evalResult = evaluateFrenchWriting(userRaw, q.french);
    const isCorrect = evalResult.isExact;
    const fbClass = isCorrect
        ? "alert alert-success p-3 text-start rounded-3 mt-3 mb-0"
        : (evalResult.writtenPct >= 80
            ? "alert alert-primary p-3 text-start rounded-3 mt-3 mb-0"
            : "alert alert-warning p-3 text-start rounded-3 mt-3 mb-0");
    const fbHtml = buildQuizFeedbackHtml(q, userRaw, evalResult);

    if (!state.quiz.historyAnswers) state.quiz.historyAnswers = [];
    if (state.quiz.skipped) state.quiz.skipped[idx] = false;

    state.quiz.historyAnswers[idx] = {
        answered: true,
        card_id: q.id || "",
        question_prompt: q.spanish,
        expected_answer: q.french,
        user_answer: userRaw || "(Vacío)",
        is_correct: isCorrect,
        written_pct: evalResult.writtenPct,
        eval_result: evalResult,
        feedback_class: fbClass,
        feedback_html: fbHtml
    };

    const fbBox = document.getElementById("quizFeedbackBox");
    if (fbBox) {
        fbBox.className = fbClass;
        fbBox.innerHTML = fbHtml;
        fbBox.classList.remove("d-none");
    }

    recomputeQuizLiveTotals();
    renderQuizNavPills();

    const statusBadge = document.getElementById("quizQuestionStatusBadge");
    if (statusBadge) {
        statusBadge.className = "badge bg-success-subtle text-success border";
        statusBadge.innerText = `Respondida (${evalResult.writtenPct}% bien escrito)`;
    }

    playFrenchText(q.french, "fr-CA");
}

function revealQuizAnswer() {
    const idx = state.quiz.currentIndex;
    const q = state.quiz.currentCard;
    if (!q) return;

    const input = document.getElementById("quizAnswerInput");
    const userRaw = input ? input.value.trim() : "";
    const evalResult = evaluateFrenchWriting(userRaw, q.french);
    const fbClass = "alert alert-info p-3 text-start rounded-3 mt-3 mb-0";
    const fbHtml = buildQuizFeedbackHtml(q, userRaw, evalResult);

    if (!state.quiz.historyAnswers) state.quiz.historyAnswers = [];
    if (!state.quiz.historyAnswers[idx] || !state.quiz.historyAnswers[idx].answered) {
        state.quiz.historyAnswers[idx] = {
            answered: true,
            card_id: q.id || "",
            question_prompt: q.spanish,
            expected_answer: q.french,
            user_answer: userRaw || "(Revelado)",
            is_correct: evalResult.isExact,
            written_pct: evalResult.writtenPct,
            eval_result: evalResult,
            feedback_class: fbClass,
            feedback_html: fbHtml
        };
    }

    const fbBox = document.getElementById("quizFeedbackBox");
    if (fbBox) {
        fbBox.className = fbClass;
        fbBox.innerHTML = fbHtml;
        fbBox.classList.remove("d-none");
    }

    recomputeQuizLiveTotals();
    renderQuizNavPills();
    playFrenchText(q.french, "fr-CA");
}

function prevQuizQuestion() {
    if (state.quiz.currentIndex > 0) {
        jumpToQuizQuestion(state.quiz.currentIndex - 1);
    }
}

function skipQuizQuestion() {
    const idx = state.quiz.currentIndex;
    const total = state.quiz.questions.length || 0;
    if (total === 0) return;

    const input = document.getElementById("quizAnswerInput");
    if (input && state.quiz.drafts) {
        state.quiz.drafts[idx] = input.value;
    }

    const existing = state.quiz.historyAnswers ? state.quiz.historyAnswers[idx] : null;
    if (!existing || !existing.answered) {
        if (!state.quiz.skipped) state.quiz.skipped = [];
        state.quiz.skipped[idx] = true;
    }

    // Move to the next question or wrap around to the next unanswered question
    if (idx < total - 1) {
        jumpToQuizQuestion(idx + 1);
    } else {
        goToNextUnansweredQuizQuestion();
    }
}

function goToNextUnansweredQuizQuestion() {
    const total = state.quiz.questions.length || 0;
    if (total === 0) return;
    const answers = state.quiz.historyAnswers || [];
    const startIdx = state.quiz.currentIndex;

    for (let offset = 1; offset <= total; offset++) {
        const candidate = (startIdx + offset) % total;
        const a = answers[candidate];
        if (!a || !a.answered) {
            jumpToQuizQuestion(candidate);
            return;
        }
    }
    showNotification("¡Todas las preguntas ya fueron respondidas! Puedes calificar el examen.", "success");
}

async function nextQuizQuestion() {
    const total = state.quiz.questions.length || 0;
    const idx = state.quiz.currentIndex;

    const input = document.getElementById("quizAnswerInput");
    if (input && state.quiz.drafts) {
        state.quiz.drafts[idx] = input.value;
    }

    if (idx < total - 1) {
        jumpToQuizQuestion(idx + 1);
        return;
    }

    // At the last question: check if there are unanswered questions
    const totals = recomputeQuizLiveTotals();
    if (totals.unansweredCount > 0) {
        showNotification(`Tienes ${totals.unansweredCount} pregunta(s) sin responder. Te llevamos a la siguiente pendiente (o pulsa "Calificar Examen" para terminar).`, "warning");
        goToNextUnansweredQuizQuestion();
    } else {
        await finishQuizExam();
    }
}

function getGradeBadgeForPercentage(pct) {
    if (pct >= 90) return { label: "Sobresaliente • Nivel TEF Sólido 🏆", color: "bg-success", text: "text-success" };
    if (pct >= 75) return { label: "Muy Bien • Buen Dominio Escrito 👍", color: "bg-primary", text: "text-primary" };
    if (pct >= 60) return { label: "Aprobado • En Progreso 📈", color: "bg-warning text-dark", text: "text-warning-emphasis" };
    return { label: "Necesita Repaso • Practica las diferencias 💪", color: "bg-danger", text: "text-danger" };
}

async function finishQuizExam() {
    const total = state.quiz.questions.length || 0;
    if (total === 0) return;

    const input = document.getElementById("quizAnswerInput");
    if (input && state.quiz.drafts) {
        state.quiz.drafts[state.quiz.currentIndex] = input.value;
    }

    // Auto-evaluate any question where the user typed a draft but forgot to press "Comprobar"
    for (let i = 0; i < total; i++) {
        const q = state.quiz.questions[i];
        let ans = state.quiz.historyAnswers[i];
        const draft = (state.quiz.drafts && state.quiz.drafts[i]) ? state.quiz.drafts[i].trim() : "";

        if ((!ans || !ans.answered) && draft.length > 0) {
            const evalResult = evaluateFrenchWriting(draft, q.french);
            state.quiz.historyAnswers[i] = {
                answered: true,
                card_id: q.id || "",
                question_prompt: q.spanish,
                expected_answer: q.french,
                user_answer: draft,
                is_correct: evalResult.isExact,
                written_pct: evalResult.writtenPct,
                eval_result: evalResult,
                feedback_class: "alert alert-info p-3 text-start rounded-3 mt-3 mb-0",
                feedback_html: buildQuizFeedbackHtml(q, draft, evalResult)
            };
        } else if (!ans || !ans.answered) {
            const evalResult = evaluateFrenchWriting("", q.french);
            state.quiz.historyAnswers[i] = {
                answered: false,
                card_id: q.id || "",
                question_prompt: q.spanish,
                expected_answer: q.french,
                user_answer: "(Sin responder)",
                is_correct: false,
                written_pct: 0,
                eval_result: evalResult
            };
        }
    }

    recomputeQuizLiveTotals();
    renderQuizNavPills();

    let totalWrittenSum = 0;
    let exactCount = 0;
    let partialCount = 0;
    let unansweredOrZeroCount = 0;

    const payloadAnswers = state.quiz.historyAnswers.map(a => {
        const pct = Number(a.written_pct || 0);
        totalWrittenSum += pct;
        if (pct === 100) exactCount++;
        else if (pct >= 50) partialCount++;
        else unansweredOrZeroCount++;

        return {
            card_id: a.card_id || "",
            question_prompt: a.question_prompt,
            expected_answer: a.expected_answer,
            user_answer: a.user_answer,
            is_correct: Boolean(a.is_correct),
            written_pct: pct
        };
    });

    const finalQualificationPct = Math.round(totalWrittenSum / total);
    const gradeInfo = getGradeBadgeForPercentage(finalQualificationPct);
    const scope = state.quiz.scope || "current";

    try {
        await fetch(`/api/quiz/save?profile=${encodeURIComponent(state.currentProfile)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                profile: state.currentProfile,
                scope: scope,
                total_questions: total,
                score: exactCount,
                accuracy: finalQualificationPct,
                answers: payloadAnswers
            })
        });
        showNotification(`¡Examen calificado y guardado para ${PROFILE_LABELS[state.currentProfile] || state.currentProfile}! Calificación final: ${finalQualificationPct}%`, "success");
        loadQuizHistory();
    } catch (e) {
        console.error("Error saving quiz to database:", e);
    }

    const activeArea = document.getElementById("quizActiveQuestionArea");
    const summaryArea = document.getElementById("quizFinalSummaryArea");
    if (activeArea) activeArea.classList.add("d-none");

    if (summaryArea) {
        const rowsHtml = state.quiz.historyAnswers.map((a, idx) => {
            const pct = Math.round(Number(a.written_pct || 0));
            const pctBadge = pct === 100 ? "bg-success" : (pct >= 80 ? "bg-primary" : (pct >= 50 ? "bg-warning text-dark" : "bg-danger"));
            const ev = a.eval_result || evaluateFrenchWriting(a.user_answer === "(Sin responder)" ? "" : a.user_answer, a.expected_answer);
            return `
                <div class="border rounded-3 p-3 mb-2 bg-light">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                        <div>
                            <span class="badge bg-dark me-1">#${idx + 1}</span>
                            <strong class="text-dark">${escapeQuizHtml(a.question_prompt)}</strong>
                        </div>
                        <span class="badge ${pctBadge} fs-6">${pct}% Bien escrito</span>
                    </div>
                    <div class="row g-2">
                        <div class="col-md-6">
                            <div class="small text-muted fw-bold">Tu respuesta:</div>
                            <div class="quiz-diff-line">${ev.userDiffHtml}</div>
                        </div>
                        <div class="col-md-6">
                            <div class="small text-success fw-bold">Respuesta correcta:</div>
                            <div class="quiz-diff-line">${ev.targetDiffHtml}</div>
                        </div>
                    </div>
                    <div class="mt-2 d-flex flex-wrap gap-1">${ev.wordDiffHtml}</div>
                </div>
            `;
        }).join("");

        summaryArea.innerHTML = `
            <div class="p-4 rounded-4 border bg-white shadow-sm mb-3 text-center">
                <div class="text-muted small fw-bold text-uppercase mb-1">CALIFICACIÓN FINAL DEL EXAMEN (0 A 100%)</div>
                <div class="display-3 fw-bold ${gradeInfo.text} my-1">${finalQualificationPct}%</div>
                <div class="mb-3">
                    <span class="badge ${gradeInfo.color} fs-6 px-3 py-2 rounded-pill">${gradeInfo.label}</span>
                </div>
                <div class="progress mx-auto mb-3" style="max-width: 480px; height: 12px;">
                    <div class="progress-bar ${finalQualificationPct >= 75 ? 'bg-success' : (finalQualificationPct >= 50 ? 'bg-warning' : 'bg-danger')}" role="progressbar" style="width: ${finalQualificationPct}%"></div>
                </div>
                <div class="d-flex justify-content-center flex-wrap gap-3 small">
                    <span class="badge bg-success-subtle text-success border px-3 py-2">✓ Exactas (100%): ${exactCount} / ${total}</span>
                    <span class="badge bg-warning-subtle text-warning-emphasis border px-3 py-2">~ Parciales (50–99%): ${partialCount}</span>
                    <span class="badge bg-danger-subtle text-danger border px-3 py-2">✗ Bajas o Sin responder: ${unansweredOrZeroCount}</span>
                </div>
                <div class="mt-3 d-flex justify-content-center gap-2">
                    <button class="btn btn-primary rounded-pill px-4 fw-bold" onclick="startNewQuiz()">
                        <i class="fa-solid fa-rotate me-1"></i>Nuevo Examen
                    </button>
                    <button class="btn btn-outline-secondary rounded-pill px-4" onclick="jumpToQuizQuestion(0)">
                        <i class="fa-solid fa-magnifying-glass me-1"></i>Volver a las Preguntas
                    </button>
                </div>
            </div>

            <h6 class="fw-bold text-dark mb-2"><i class="fa-solid fa-list-check text-primary me-2"></i>Desglose de Escritura y Diferencias por Pregunta</h6>
            ${rowsHtml}
        `;
        summaryArea.classList.remove("d-none");
    }
}

async function loadQuizHistory() {
    try {
        const res = await fetch(`/api/quiz/history?profile=${encodeURIComponent(state.currentProfile)}`);
        if (!res.ok) return;
        const data = await res.json();
        const tbody = document.getElementById("quizHistoryTableBody");
        if (!tbody) return;

        if (!data.history || data.history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No hay evaluaciones registradas aún en la base de datos.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.history.map(h => {
            const dateStr = new Date(h.created_at * 1000).toLocaleString();
            const badgeClass = h.accuracy >= 80 ? "bg-success" : (h.accuracy >= 60 ? "bg-warning text-dark" : "bg-danger");
            const scopeLabel = h.scope === "all" ? "Todos los cursos" : (h.scope === "current" ? "Curso Actual" : h.scope);
            return `
                <tr>
                    <td class="text-muted"><i class="fa-regular fa-calendar me-1"></i>${dateStr}</td>
                    <td><span class="badge bg-light text-dark border">${scopeLabel}</span></td>
                    <td>${h.total_questions}</td>
                    <td class="fw-bold">${h.score}</td>
                    <td><span class="badge ${badgeClass}">${h.accuracy}%</span></td>
                </tr>
            `;
        }).join("");
    } catch (e) {
        console.error("Error loading quiz history:", e);
    }
}

// --- Keyboard Shortcuts & YouTube Message Listener ---
function setupKeyboardShortcuts() {
    // Listen for YouTube IFrame API messages (currentTime & playerState)
    window.addEventListener("message", (event) => {
        if (!event.data || typeof event.data !== "string") return;
        try {
            const msg = JSON.parse(event.data);
            if (msg.event === "infoDelivery" && msg.info) {
                if (typeof msg.info.currentTime === "number") {
                    ytState.currentTime = msg.info.currentTime;
                    ytState.lastSyncTimestamp = Date.now();
                }
                if (typeof msg.info.playerState === "number") {
                    ytState.isPlaying = (msg.info.playerState === 1);
                    updatePlayPauseButtonUI();
                }
                syncVideoTimelineWithPlayer(false);
            } else if (msg.event === "onStateChange" && typeof msg.info === "number") {
                ytState.isPlaying = (msg.info === 1);
                ytState.lastSyncTimestamp = Date.now();
                updatePlayPauseButtonUI();
                syncVideoTimelineWithPlayer(false);
            }
        } catch (e) {}
    });

    // Pause auto-scroll briefly if user manually wheels/drags the phrases list
    const timelineList = document.getElementById("videoTimelineList");
    if (timelineList) {
        timelineList.addEventListener("wheel", () => {
            ytState.userScrollLockUntil = Date.now() + 3500;
        }, { passive: true });
        timelineList.addEventListener("touchmove", () => {
            ytState.userScrollLockUntil = Date.now() + 3500;
        }, { passive: true });
    }

    // Continuous 250ms sync timer for real-time phrase highlighting & auto-scroll
    if (!ytState.syncIntervalId) {
        ytState.syncIntervalId = setInterval(() => {
            syncVideoTimelineWithPlayer(false);
        }, 250);
    }

    // Keep keyboard focus on main document after clicking inside YouTube iframe or right menu
    window.addEventListener("blur", () => {
        reclaimFocusForVideoShortcuts();
    });

    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable) {
            if (e.key === "Escape") e.target.blur();
            return;
        }

        const videoSec = document.getElementById("tab-content-video");
        const studySec = document.getElementById("tab-content-study");
        const isVideoTabActive = videoSec && !videoSec.classList.contains("d-none");
        const isStudyTabActive = studySec && !studySec.classList.contains("d-none");

        if (isVideoTabActive) {
            if (e.code === "Backspace" || e.code === "Space" || e.key === "k" || e.key === "K") {
                e.preventDefault();
                e.stopImmediatePropagation();
                toggleVideoPlayPause();
            } else if (e.code === "ArrowLeft" || e.key === "j" || e.key === "J") {
                e.preventDefault();
                e.stopImmediatePropagation();
                seekVideoRelative(-5);
            } else if (e.code === "ArrowRight" || e.key === "l" || e.key === "L") {
                e.preventDefault();
                e.stopImmediatePropagation();
                seekVideoRelative(5);
            }
            return;
        }

        // Flashcard shortcuts ONLY execute when the Study / SRS tab is active
        if (!isStudyTabActive) return;

        if (e.code === "Space") {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (document.activeElement && document.activeElement.tagName === "BUTTON") {
                document.activeElement.blur();
            }
            flipCard();
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            e.stopImmediatePropagation();
            nextCard();
        } else if (e.code === "ArrowLeft") {
            e.preventDefault();
            e.stopImmediatePropagation();
            prevCard();
        } else if (e.key === "1") {
            rateCard(1);
        } else if (e.key === "2") {
            rateCard(2);
        } else if (e.key === "3") {
            rateCard(3);
        } else if (e.key === "4") {
            rateCard(4);
        } else if (e.key === "a" || e.key === "A" || e.key === "r" || e.key === "R") {
            playCurrentAudio("fr-CA");
        } else if (e.key === "v" || e.key === "V") {
            jumpToCurrentVideoTimestamp();
        }
    }, true);
}

// --- Export Functions ---
function exportDeck(format) {
    if (!state.currentDeckId) return;
    window.open(`/api/export/${state.currentDeckId}?format=${format}`, "_blank");
}

async function exportDeckToNotes() {
    if (!state.currentDeckId) return;
    try {
        const res = await fetch(`/api/export_to_notes/${state.currentDeckId}`, { method: "POST" });
        const data = await res.json();
        if (data.status === "ok") {
            showNotification(`¡Guardado exitosamente en ${data.file_path}!`, "success");
        } else {
            showNotification("Error: " + data.message, "danger");
        }
    } catch (e) {
        showNotification("Error al exportar: " + e.message, "danger");
    }
}

async function renderAnalyticsTab() {
    try {
        const profParam = encodeURIComponent(state.currentProfile);
        const [statsRes, libRes, historyRes] = await Promise.all([
            fetch(`/api/srs/stats?profile=${profParam}`),
            fetch(`/api/srs/library?profile=${profParam}`),
            fetch(`/api/quiz/history?limit=50&profile=${profParam}`)
        ]);

        const stats = await statsRes.json();
        const library = await libRes.json();
        const historyData = await historyRes.json();

        // High level KPI metrics
        const totalCards = stats.total_cards || library.length || 0;
        const masteredCards = stats.mastered || 0;
        const learningCards = (stats.learning || 0) + (stats.review || 0);
        const dueToday = stats.due_today || 0;

        let tefCount = 0;
        let complexCount = 0;
        library.forEach(c => {
            const isTef = c.is_tef_key || (c.tags && (c.tags.includes("tef_star") || c.tags.includes("tef_speaking") || c.tags.includes("examen_final")));
            const isCpx = c.is_complex || (c.tags && c.tags.includes("compleja"));
            if (isTef) tefCount++;
            if (isCpx) complexCount++;
        });

        const mTotal = document.getElementById("metricTotalCards");
        const mMastered = document.getElementById("metricMasteredCards");
        const mLearning = document.getElementById("metricLearningCards");
        const mTef = document.getElementById("metricTefCards");
        const mMasteredPct = document.getElementById("metricMasteredPct");
        const mDueToday = document.getElementById("metricDueToday");
        const mComplex = document.getElementById("metricComplexCards");

        if (mTotal) mTotal.innerText = String(totalCards);
        if (mMastered) mMastered.innerText = String(masteredCards);
        if (mLearning) mLearning.innerText = String(learningCards);
        if (mTef) mTef.innerText = String(tefCount);

        const masteredPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
        if (mMasteredPct) mMasteredPct.innerText = `${masteredPct}% de dominio a largo plazo`;
        if (mDueToday) mDueToday.innerText = `${dueToday} tarjetas pendientes hoy`;
        if (mComplex) mComplex.innerText = `${complexCount} estructuras complejas TEF`;

        // Progress bar per course
        const courseContainer = document.getElementById("courseProgressBars");
        if (courseContainer) {
            const byCourse = {};
            library.forEach(c => {
                const lesson = c.lesson_number || 1;
                if (!byCourse[lesson]) {
                    byCourse[lesson] = { total: 0, mastered: 0, review: 0, title: c.course_title || `Curso ${lesson}` };
                }
                byCourse[lesson].total++;
                if (c.srs && c.srs.state === "mastered") byCourse[lesson].mastered++;
                else if (c.srs && c.srs.repetitions > 0) byCourse[lesson].review++;
            });

            courseContainer.innerHTML = Object.keys(byCourse).sort((a,b) => Number(a)-Number(b)).map(lesson => {
                const info = byCourse[lesson];
                const pct = info.total > 0 ? Math.round(((info.mastered + info.review) / info.total) * 100) : 0;
                return `
                    <div>
                        <div class="d-flex justify-content-between align-items-center small mb-1">
                            <span class="fw-bold text-dark">Lección ${lesson}: ${info.title}</span>
                            <span class="text-muted">${info.mastered} dominadas • ${info.review} en estudio / ${info.total} (${pct}%)</span>
                        </div>
                        <div class="progress" style="height: 10px;">
                            <div class="progress-bar bg-primary" role="progressbar" style="width: ${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join("");
        }

        // Exam accuracy from SQLite
        const avgScoreEl = document.getElementById("analyticsAvgScore");
        const avgBarEl = document.getElementById("analyticsAvgBar");
        const histories = historyData.history || [];
        if (histories.length > 0) {
            const totalScore = histories.reduce((acc, h) => acc + (h.accuracy || 0), 0);
            const avg = Math.round(totalScore / histories.length);
            if (avgScoreEl) avgScoreEl.innerText = `${avg}%`;
            if (avgBarEl) {
                avgBarEl.style.width = `${avg}%`;
                avgBarEl.className = `progress-bar progress-bar-striped ${avg >= 75 ? "bg-success" : (avg >= 50 ? "bg-warning text-dark" : "bg-danger")}`;
            }
        } else {
            if (avgScoreEl) avgScoreEl.innerText = "--%";
            if (avgBarEl) avgBarEl.style.width = "0%";
        }
    } catch (e) {
        console.error("Error loading analytics:", e);
    }
}

// --- Notification Helpers ---
function showNotification(msg, type = "success") {
    const alertEl = document.getElementById("notificationAlert");
    const textEl = document.getElementById("notificationText");
    if (!alertEl || !textEl) return;

    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    textEl.innerText = msg;
    setTimeout(() => hideNotification(), 4000);
}

function hideNotification() {
    const alertEl = document.getElementById("notificationAlert");
    if (alertEl) alertEl.classList.add("d-none");
}

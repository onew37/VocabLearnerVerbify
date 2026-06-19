/* ============================================================
   Verbify — test-prep vocabulary learner (SSAT, ISEE, SAT & more)
   Vanilla JS. State persists in localStorage.
   ============================================================ */

/* WORDS and ROOTS are declared as globals in data.js — use them directly. */

/* ---------------- accounts (local, this-browser-only) ---------------- */
const ACCOUNTS_KEY = "lexicon.accounts.v1";
const SESSION_KEY  = "lexicon.session.v1";
let currentUser = null;            // lowercased username key of the logged-in account

const stateKey = () => "lexicon.state.v1::" + (currentUser || "_guest");

function loadAccounts() { try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {}; } catch { return {}; } }
function saveAccounts(a) { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
function getSession() { return localStorage.getItem(SESSION_KEY); }
function setSession(u) { if (u) localStorage.setItem(SESSION_KEY, u); else localStorage.removeItem(SESSION_KEY); }

/* Salted SHA-256 (falls back to a simple hash if SubtleCrypto is unavailable).
   NOTE: this is local-only obfuscation, not real server-grade security. */
async function hashPassword(pw, salt) {
  const text = salt + "::" + pw;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "x" + (h >>> 0).toString(16);
}
function randSalt() {
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint8Array(8); crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2);
}

/* Streak-freezer checkpoints: streak length at which you earn a freezer. */
const CHECKPOINTS = [3, 7, 14, 30, 50, 100];
const MAX_FREEZERS = 6;

/* ---------------- date helpers (local, day-granularity) ---------------- */
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
const today = () => dayKey(new Date());
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dayKey(dt);
};
const daysBetween = (a, b) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
};

/* ---------------- state ---------------- */
let state = null;

function defaultState() {
  return {
    onboarded: false,
    goal: 5,
    startLevel: 1,           // starting difficulty from the onboarding diagnostic (1–8)
    streak: 0,
    longest: 0,
    freezers: 0,
    earnedCheckpoints: [],   // checkpoint values already rewarded
    lastActiveDay: null,     // last day a review was completed
    history: {},             // dayKey -> "done" | "frozen"
    learnedCount: 0,         // total words ever studied (with repeats counted once via cursor)
    cursor: 0,               // (legacy) index into WORDS — superseded by difficulty-aware selection
    review: null,            // in-progress daily review/quiz snapshot (so it survives logout/close)
    dailySet: null,          // { date, words[] } — today's fixed set (rotates each day)
    seenWords: [],           // (legacy) superseded by wordStats membership
    lastWeeklyWeek: null,    // (legacy) week index of the last completed challenge
    weekWords: [],           // (legacy) words studied since the last challenge
    weeklyBadges: 0,         // count of completed mandatory tests
    presentedWords: [],      // every word ever introduced as "new" — never re-introduced (no repeats)
    lastTestDay: null,       // dayKey of the last completed mandatory test
    wordStats: {},           // word -> { box, due, seen, correct, wrong, last } (spaced repetition)
    quizHistory: [],         // [{ date, correct, total }] for the progress trend
    xp: 0,                   // lifetime experience points (uncapped)
    typeStats: {},           // questionType -> { c, s } accuracy by quiz format
    dailyActivity: {},       // dayKey -> words studied that day (heatmap intensity)
    masteryHistory: [],      // [{ date, mastered }] cumulative mastery curve
    records: { mostWordsDay: 0, fastestMs: null }, // personal bests
    bestMastered: 0,         // high-water mark — achievements never regress when a word is un-mastered
    bestSkillLevel: 0,       // high-water mark — achievements never regress when the streak breaks
    vacation: { active: false, start: null, until: null }, // pause the streak while away
    advent: { keys: 1, openedCount: 0, round: 0, log: [], stickers: [] }, // Discovery Calendar (starts with a welcome key)
    settings: { audio: true, voice: null, theme: "notebook", seasonal: true, testPeriodDays: 7, variants: { terminal: "green", aesthetic: "ocean", neon: "synthwave" } },
  };
}

/* Migrate older saved settings to the grouped-theme + variants model. */
function migrateSettings() {
  const s = state.settings = state.settings || {};
  s.variants = s.variants || {};
  if (s.terminalVariant) { s.variants.terminal = (s.terminalVariant === "light") ? "light" : "green"; delete s.terminalVariant; }
  if (s.theme === "ocean" || s.theme === "forest" || s.theme === "sakura") { s.variants.aesthetic = s.theme; s.theme = "aesthetic"; }
  if (s.theme === "parchment" || s.theme === "comic") s.theme = "notebook"; // removed themes
  s.variants.terminal = s.variants.terminal || "green";
  s.variants.aesthetic = s.variants.aesthetic || "ocean";
  s.variants.neon = s.variants.neon || "synthwave";
}

/* ---------------- THEMES ("Fun Mode") ---------------- */
const THEMES = [
  { id: "notebook",  name: "Notebook",  blurb: "Hand-drawn paper (default)" },
  { id: "midnight",  name: "Midnight",  blurb: "Cozy dark study desk" },
  { id: "terminal",  name: "Terminal",  blurb: "Code editor & retro CRT" },
  { id: "aesthetic", name: "Aesthetic", blurb: "Calm pastel vibes" },
  { id: "neon",      name: "Neon",      blurb: "Retro-future glow" },
  { id: "ascii",     name: "ASCII Art", blurb: "Colorful retro textmode" },
];
/* Hidden, unlisted themes — they appear automatically in-season (and via a secret trigger),
   never in the Fun Mode picker. */
const HIDDEN_THEMES = ["winterfest", "newyear"];
/* themes that offer style sub-options (first entry is the default) */
const THEME_VARIANTS = {
  terminal:  [ { id: "green", name: "Classic Green" }, { id: "light", name: "Light B/W" } ],
  aesthetic: [ { id: "ocean", name: "Ocean" }, { id: "forest", name: "Forest" }, { id: "sakura", name: "Sakura" } ],
  neon:      [ { id: "synthwave", name: "Synthwave" }, { id: "frutiger", name: "Frutiger Aero" }, { id: "vaporwave", name: "Vaporwave" } ],
};
function currentTheme() { return (state && state.settings && state.settings.theme) || "notebook"; }
/* Festive themes that quietly take over the default look during their season. */
function seasonalTheme() {
  const [y, m, d] = today().split("-").map(Number);
  if (m === 12 && d >= 18 && d <= 26) return "winterfest";       // Christmas week
  if ((m === 12 && d >= 29) || (m === 1 && d <= 2)) return "newyear"; // New Year
  return null;
}
function seasonalEnabled() { return !state || !state.settings || state.settings.seasonal !== false; }
/* The theme actually shown: a seasonal theme overrides ONLY the default notebook look. */
function effectiveTheme() {
  const base = currentTheme();
  if (base === "notebook" && seasonalEnabled()) { const s = seasonalTheme(); if (s) return s; }
  return base;
}
function currentVariant(theme) {
  const list = THEME_VARIANTS[theme];
  if (!list) return null;
  const v = state && state.settings && state.settings.variants && state.settings.variants[theme];
  return (v && list.some(x => x.id === v)) ? v : list[0].id;
}
function applyTheme(id) {
  const t = id || effectiveTheme();
  document.body.setAttribute("data-theme", t);
  const v = currentVariant(t);
  if (v) document.body.setAttribute("data-variant", v);
  else document.body.removeAttribute("data-variant");
  applySeasonalFX(t);
}
/* Small transient toast message. */
let _toastTimer = null;
function toast(msg) {
  let el = document.getElementById("vToast");
  if (!el) { el = document.createElement("div"); el.id = "vToast"; el.className = "v-toast"; document.body.appendChild(el); }
  el.innerHTML = msg;
  // force reflow so re-triggering restarts the transition
  void el.offsetWidth;
  el.classList.add("show");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

/* Drive the custom canvas particle effects that accompany the hidden seasonal themes. */
function applySeasonalFX(theme) {
  if (!window.FX) return;
  if (theme === "winterfest") FX.start("snow");
  else if (theme === "newyear") FX.start("fireworks");
  else FX.stop();
}

/* ---------------- AUDIO PRONUNCIATION (Web Speech API) ---------------- */
function audioOn() { return !state || !state.settings || state.settings.audio !== false; }
function getEnglishVoices() {
  try { return (speechSynthesis.getVoices() || []).filter(v => /^en/i.test(v.lang)); } catch (e) { return []; }
}
/* Prefer the highest-quality, most natural voices each platform offers. */
const NATURAL_VOICE = [
  /natural/i, /neural/i, /premium/i, /enhanced/i, /siri/i,
  /google us english/i, /google uk english female/i, /google/i,
  /samantha/i, /\bava\b/i, /allison/i, /\bnathan\b/i, /\bjoelle\b/i, /serena/i,
  /\bzoe\b/i, /\bevan\b/i, /daniel/i, /\bkaren\b/i, /\bmoira\b/i, /\btessa\b/i, /\bfiona\b/i
];
/* Voices that tend to sound robotic — avoid unless nothing else is available. */
const POOR_VOICE = /albert|zarvox|cellos|bells|bad news|bahh|boing|bubbles|deranged|hysterical|trinoids|whisper|wobble|jester|organ|superstar|espeak|pipe|good news/i;
function pickVoice() {
  const en = getEnglishVoices();
  if (!en.length) return null;
  const chosen = state && state.settings && state.settings.voice;
  if (chosen) { const m = en.find(v => v.name === chosen); if (m) return m; }
  const ok = en.filter(v => !POOR_VOICE.test(v.name));
  const pool = ok.length ? ok : en;
  for (const re of NATURAL_VOICE) { const m = pool.find(v => re.test(v.name)); if (m) return m; }
  return pool.find(v => /en[-_]US/i.test(v.lang)) || pool[0];
}
function speak(word) {
  if (!audioOn() || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
    u.rate = 0.95;   // natural pace
    u.pitch = 1.0;
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
/* Warm up the voice list (Chrome loads voices asynchronously). */
function warmVoices() {
  try {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => { if (typeof populateVoiceSelect === "function" && document.getElementById("setVoice")) populateVoiceSelect(); };
  } catch (e) { /* ignore */ }
}
function sayBtn(word) {
  return `<button class="say-btn" data-say="${escapeHtml(word)}" title="Hear pronunciation" aria-label="Hear ${escapeHtml(word)}">${ICON.speaker("0.95em")}</button>`;
}

/* A day counts as "vacation" (streak-protected) if it falls in the vacation span. */
function isVacationDay(dk) {
  const v = state.vacation;
  if (!v) return false;
  if (v.start && dk < v.start) return false;
  if (v.until) return dk <= v.until;   // bounded vacation covers start..until
  return !!v.active;                    // open-ended vacation covers while active
}

/* Save a resumable snapshot of the current review + quiz so nothing is lost
   on log out or tab close. Called after every step of the daily review. */
function snapshotReview() {
  if (!session || session.ephemeral) return; // practice/test sessions don't resume
  state.review = {
    date: today(),
    words: session.words.map(w => w.word),
    idx: session.idx,
    revealed: session.revealed,
    phase: session.phase,                 // "flash" | "quizIntro" | "quiz"
    weekly: !!session.weekly,             // true when this is a Weekly Challenge
    mode: session.mode,                   // "daily" | "weekly" — drives finishSession vs finishWeekly on resume
    quiz: quiz ? { questions: quiz.questions, idx: quiz.idx, correct: quiz.correct, answers: quiz.answers } : null,
  };
  save();
}
function clearReview() { state.review = null; save(); }

/* ============================================================
   SKILL LEVEL — derived from streak; tunes word difficulty
   ============================================================ */
const SKILL_TIERS = [
  { level: 1, name: "Novice",      min: 0   },
  { level: 2, name: "Apprentice",  min: 2   },
  { level: 3, name: "Adept",       min: 5   },
  { level: 4, name: "Proficient",  min: 10  },
  { level: 5, name: "Master",      min: 20  },
  { level: 6, name: "Grandmaster", min: 40  },
  { level: 7, name: "Sage",        min: 75  },
  { level: 8, name: "Luminary",    min: 150 },
];
function streakTier() {
  let t = SKILL_TIERS[0];
  for (const tier of SKILL_TIERS) if (state.streak >= tier.min) t = tier;
  return t;
}
/* Effective skill = the higher of streak-earned and the diagnostic starting level,
   so a user who already knows hard words starts on hard words. */
function skillTier() {
  const lvl = Math.max(streakTier().level, state.startLevel || 1);
  return SKILL_TIERS[lvl - 1];
}
function skillLevel() { return skillTier().level; }
function nextTier() {
  const cur = skillLevel();
  return SKILL_TIERS.find(t => t.level === cur + 1) || null;
}
function wordDifficulty(word) {
  return (typeof DIFFICULTY !== "undefined" && DIFFICULTY[word.toLowerCase()]) || 3;
}
/* Human-readable names for the 1–5 word difficulty scale. */
const DIFF_NAMES = ["", "Starter", "Easy", "Moderate", "Hard", "Elite"];
function diffName(d) { return DIFF_NAMES[Math.min(5, Math.max(1, d))] || "Moderate"; }
function diffRangeLabel(lo, hi) { return lo === hi ? diffName(lo) : diffName(lo) + "–" + diffName(hi); }
/* Difficulty window that scales with skill: low streak → easier words, high → harder.
   Clamped to the 1–5 difficulty range (tiers above Master keep the hardest window). */
function difficultyWindow(level) {
  const L = Math.min(5, Math.max(1, level));
  return { lo: Math.max(1, L - 1), hi: Math.min(5, L + 1) };
}

/* ---------------- XP & LIFETIME LEVEL (uncapped) ---------------- */
function levelFromXp(xp) {
  let lvl = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = 100 + (lvl - 1) * 20; }
  return { level: lvl, into: xp - acc, need, floor: acc };
}
function addXp(n) { state.xp = (state.xp || 0) + n; }
function totalReviews() { let s = 0; for (const w in (state.wordStats || {})) s += state.wordStats[w].seen; return s; }
function totalCorrect() { let c = 0; for (const w in (state.wordStats || {})) c += state.wordStats[w].correct; return c; }
function studyDays() { return Object.values(state.history || {}).filter(v => v === "done").length; }
function bestQuizPct() {
  let best = 0;
  (state.quizHistory || []).forEach(h => { if (h.total) best = Math.max(best, Math.round((h.correct / h.total) * 100)); });
  return best;
}
function eligiblePool(level) {
  const { lo, hi } = difficultyWindow(level);
  return WORDS.filter(w => { const d = wordDifficulty(w.word); return d >= lo && d <= hi; });
}

/* ---------------- SPACED REPETITION (Leitner) ---------------- */
const LEITNER_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };
function statOf(word) { return state.wordStats[word] || null; }
function wordAccuracy(word) {
  const s = statOf(word);
  if (!s || !s.seen) return null;
  return s.correct / s.seen;
}
function isMastered(word) {
  const s = statOf(word);
  return !!(s && s.box >= 4);
}
/* Record a quiz answer: reschedule the word, award XP, track accuracy by type. */
function recordAnswer(word, correct, type) {
  const s = state.wordStats[word] || { box: 0, due: null, seen: 0, correct: 0, wrong: 0, last: null };
  s.seen += 1;
  s.last = today();
  if (correct) { s.correct += 1; s.box = Math.min(5, (s.box || 0) + 1); }
  else { s.wrong += 1; s.box = 1; }
  s.due = addDays(today(), LEITNER_DAYS[s.box] || 1);
  state.wordStats[word] = s;
  state.bestMastered = Math.max(state.bestMastered || 0, masteredCount()); // lock in peak mastery
  addXp(correct ? 10 : 2);
  if (type) {
    const ts = state.typeStats[type] || { c: 0, s: 0 };
    ts.s += 1; if (correct) ts.c += 1;
    state.typeStats[type] = ts;
  }
}
/* Words whose review is due today (most overdue first), still in the dictionary. */
function dueWords() {
  const t = today();
  return Object.keys(state.wordStats || {})
    .filter(w => { const s = state.wordStats[w]; return s && s.due && daysBetween(s.due, t) >= 0 && WORDS.some(x => x.word === w); })
    .sort((a, b) => (state.wordStats[a].due < state.wordStats[b].due ? -1 : 1));
}
/* Words you struggle with most (low accuracy / reset to box 1), worst first. */
function trickyWords(limit) {
  return Object.keys(state.wordStats || {})
    .filter(w => { const s = state.wordStats[w]; return s && s.wrong > 0 && WORDS.some(x => x.word === w); })
    .map(w => ({ word: w, acc: wordAccuracy(w), s: state.wordStats[w] }))
    .sort((a, b) => (a.acc - b.acc) || (b.s.wrong - a.s.wrong))
    .slice(0, limit || 50)
    .map(o => o.word);
}

/* The set of words already introduced — used so daily/bonus words never repeat. */
function presentedSet() { return new Set(state.presentedWords || []); }
/* Mark words as introduced so they're never shown as "new" again. */
function markPresented(words) {
  const have = presentedSet();
  (words || []).forEach(w => { const k = w && w.word ? w.word : w; if (k) have.add(k); });
  state.presentedWords = Array.from(have);
}

/* Pick `n` FRESH new words for today — skill-tuned, and NEVER a word already
   introduced before (no repeats). Falls back gracefully as the pool shrinks. */
function pickDailyWords(n) {
  const level = skillLevel();
  const seen = presentedSet();
  const fresh = (list) => list.filter(w => !seen.has(w.word));
  const chosen = [], have = new Set();
  const add = (w) => { if (w && !have.has(w.word) && chosen.length < n) { have.add(w.word); chosen.push(w); } };

  // 1) fresh words at the current difficulty, then fresh words nearby.
  const pool = fresh(eligiblePool(level));
  shuffleRandom(pool.filter(w => wordDifficulty(w.word) === level)).forEach(add);
  shuffleRandom(pool.filter(w => wordDifficulty(w.word) !== level)).forEach(add);
  // 2) any fresh word in the whole dictionary.
  if (chosen.length < n) shuffleRandom(fresh(WORDS)).forEach(add);
  // 3) dictionary exhausted (rare): allow anything so the review still works.
  if (chosen.length < n) shuffleRandom(WORDS.slice()).forEach(add);
  return dedupWords(chosen.slice(0, n));
}

/* ============================================================
   MANDATORY TEST — a periodic, no-hints exam over the words you've learned.
   The period is configurable in Settings (default every 7 days).
   ============================================================ */
const TEST_MAX = 20; // cap on how many learned words appear in one test
function weekIndex(dk) { // (legacy helper, kept for migration baselines)
  const [y, m, d] = dk.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return Math.floor((days + 3) / 7);
}
function testPeriodDays() { return (state.settings && state.settings.testPeriodDays) || 7; }
function learnedPool() {
  // Words you've actually studied (presented), still in the dictionary.
  return (state.presentedWords || []).map(s => WORDS.find(w => w.word === s)).filter(Boolean);
}
/* Mandatory test is due when a full period has passed AND you've learned enough words. */
function testDue() {
  if (state.vacation && state.vacation.active) return false; // not while away
  if (learnedPool().length < 6) return false;
  if (state.lastTestDay == null) return false;
  return daysBetween(state.lastTestDay, today()) >= testPeriodDays();
}
/* Back-compat alias (older code referenced weeklyDue). */
function weeklyDue() { return testDue(); }

function load() {
  try {
    const raw = localStorage.getItem(stateKey());
    state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  } catch {
    state = defaultState();
  }
}
function save() { localStorage.setItem(stateKey(), JSON.stringify(state)); }

/* ============================================================
   STREAK LOGIC — apply any missed days, spending freezers.
   Called on load and after returning to the app.
   ============================================================ */
function reconcileStreak() {
  if (!state.lastActiveDay) return;
  const gap = daysBetween(state.lastActiveDay, today());
  if (gap <= 1) return; // 0 = same day, 1 = consecutive (today still open)

  // For each fully-missed day between last active and yesterday:
  //   vacation day  → protected (no break, no freezer spent)
  //   else freezer  → spend one
  //   else          → streak breaks
  let cur = addDays(state.lastActiveDay, 1);
  const yesterday = addDays(today(), -1);
  while (daysBetween(cur, yesterday) >= 0) {
    if (isVacationDay(cur)) {
      state.history[cur] = "vacation"; // paused — streak frozen, nothing spent
    } else if (state.freezers > 0) {
      state.freezers -= 1;
      state.history[cur] = "frozen";
    } else {
      state.streak = 0;
      state.lastActiveDay = null;
      save();
      return;
    }
    cur = addDays(cur, 1);
  }
  state.lastActiveDay = yesterday; // streak carried up to yesterday
  save();
}

/* Award freezers for any newly-passed checkpoints. */
function awardFreezers() {
  for (const cp of CHECKPOINTS) {
    if (state.streak >= cp && !state.earnedCheckpoints.includes(cp) && state.freezers < MAX_FREEZERS) {
      state.earnedCheckpoints.push(cp);
      state.freezers = Math.min(MAX_FREEZERS, state.freezers + 1);
    }
  }
}

/* Mark today's review complete and advance the streak. */
function completeToday() {
  const t = today();
  if (state.history[t] === "done") return; // already done

  // After reconcileStreak, lastActiveDay is yesterday (streak intact) or null (broken/new).
  const gap = state.lastActiveDay ? daysBetween(state.lastActiveDay, t) : null;
  if (gap === 1) state.streak += 1;          // consecutive day
  else if (gap === 0) state.streak = Math.max(state.streak, 1); // same-day edge case
  else state.streak = 1;                      // first day or streak was reset
  state.history[t] = "done";
  state.lastActiveDay = t;
  state.longest = Math.max(state.longest, state.streak);
  state.bestSkillLevel = Math.max(state.bestSkillLevel || 0, skillLevel()); // lock in peak skill tier
  awardFreezers();
  ensureAdvent().keys += 1; // earn a Discovery Calendar key for completing today's review
  save();
}

/* ============================================================
   VIEW ROUTING
   ============================================================ */
function show(viewName) {
  stopExamTimer(); // leaving any view cancels a running timed test
  stopSsatTimer(); // ...including the full SSAT test
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (window.Ascii) { const dc = document.getElementById("donutCanvas"); if (dc) Ascii.stop(dc); } // pause the ASCII animation when navigating away
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewName));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + viewName).classList.add("active");
  if (viewName === "home") renderHome();
  if (viewName === "dictionary") renderDictionary();
  if (viewName === "progress") renderProgress();
  if (viewName === "practice") renderPractice();
  if (viewName === "settings") renderSettings();
  if (viewName === "review") startReviewView();
}

/* ============================================================
   AUTHENTICATION  (local accounts)
   ============================================================ */
let authMode = "login";

function showAuth() {
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("onboarding").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
  authMode = Object.keys(loadAccounts()).length ? "login" : "signup"; // first-ever visit → sign up
  document.getElementById("authUser").value = "";
  document.getElementById("authPass").value = "";
  document.getElementById("authPass2").value = "";
  renderAuthMode();
  document.getElementById("authUser").focus();
}

function renderAuthMode() {
  const login = authMode === "login";
  document.querySelectorAll(".atoggle").forEach(b => b.classList.toggle("active", b.dataset.auth === authMode));
  document.getElementById("authTitle").textContent = login ? "Welcome back" : "Create your account";
  document.getElementById("authSubtitle").textContent = login
    ? "Log in to pick up your streak where you left off."
    : "Sign up to start your streak and save your progress.";
  document.getElementById("confirmField").classList.toggle("hidden", login);
  document.getElementById("authSubmit").textContent = login ? "Log in →" : "Create account →";
  document.getElementById("authError").textContent = "";
}

function wireAuth() {
  document.querySelectorAll(".atoggle").forEach(b =>
    b.addEventListener("click", () => { authMode = b.dataset.auth; renderAuthMode(); }));

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("authError");
    const u = document.getElementById("authUser").value.trim();
    const p = document.getElementById("authPass").value;
    const p2 = document.getElementById("authPass2").value;
    const key = u.toLowerCase();

    if (u.length < 3) return void (err.textContent = "Username must be at least 3 characters.");
    if (!/^[a-z0-9_]+$/i.test(u)) return void (err.textContent = "Use only letters, numbers, and underscores.");
    if (p.length < 4) return void (err.textContent = "Password must be at least 4 characters.");

    const accounts = loadAccounts();
    if (authMode === "signup") {
      if (accounts[key]) return void (err.textContent = "That username is taken — try logging in instead.");
      if (p !== p2) return void (err.textContent = "Passwords don't match.");
      const salt = randSalt();
      accounts[key] = { username: u, salt, hash: await hashPassword(p, salt), createdAt: Date.now() };
      saveAccounts(accounts);
      currentUser = key; setSession(key);
      enterApp();
    } else {
      const acct = accounts[key];
      if (!acct) return void (err.textContent = "No account with that username — want to create one?");
      if (await hashPassword(p, acct.salt) !== acct.hash) return void (err.textContent = "Incorrect password.");
      currentUser = key; setSession(key);
      enterApp();
    }
  });

  document.getElementById("acctBtn").addEventListener("click", logout);
}

function logout() {
  // Guard against accidental log-out so users stay signed in unless they mean it.
  const acct = loadAccounts()[currentUser];
  const who = acct ? "@" + acct.username : "this account";
  if (!window.confirm(`Log out of ${who}? Your progress is saved — you can log back in anytime.`)) return;
  stopExamTimer();             // cancel any running timed-exam interval
  session = null; quiz = null; match = null; // drop in-memory session so it can't bleed into the next account
  setSession(null);
  currentUser = null;
  state = null;
  showAuth();
}

function updateAcctUI() {
  const acct = loadAccounts()[currentUser];
  document.getElementById("acctName").textContent = "@" + (acct ? acct.username : "you");
}

/* Load the signed-in user's data and route to onboarding or home. */
function enterApp() {
  load();
  if (state.lastWeeklyWeek == null) state.lastWeeklyWeek = weekIndex(today()); // baseline (no back-dated weekly)
  // No-repeat ledger: seed from already-learned words so nothing already studied re-appears as "new".
  if (!Array.isArray(state.presentedWords)) state.presentedWords = Object.keys(state.wordStats || {});
  if (state.lastTestDay == null) state.lastTestDay = today(); // baseline — first test is one period out
  // Auto-resume a scheduled vacation once its return date has passed. Protect the
  // WHOLE time away (through yesterday) — the "back by" date is a soft estimate, so
  // overshooting it shouldn't silently burn freezers / break the streak.
  if (state.vacation && state.vacation.active && state.vacation.until && today() > state.vacation.until) {
    state.vacation.until = addDays(today(), -1);
    state.vacation.active = false;
  }
  // Heal any duplicate words left in stored sets by older versions.
  if (state.dailySet && Array.isArray(state.dailySet.words)) state.dailySet.words = Array.from(new Set(state.dailySet.words));
  if (Array.isArray(state.weekWords)) state.weekWords = Array.from(new Set(state.weekWords));
  if (state.review && Array.isArray(state.review.words)) state.review.words = Array.from(new Set(state.review.words));
  migrateSettings();
  reconcileStreak();
  awardFreezers();
  save();
  applyTheme();
  document.getElementById("auth").classList.add("hidden");
  updateAcctUI();
  showOnboardingOrApp();
}

/* ============================================================
   ONBOARDING
   ============================================================ */
let chosenGoal = 5;
let diagKnown = new Set();   // words the user marked as known in the diagnostic
let diagShown = [];          // the bands + words actually shown (for scoring)

/* Build the placement diagnostic: sample known/unknown words across difficulty bands. */
function renderDiagnostic() {
  diagKnown = new Set();
  const body = document.getElementById("diagBody");
  if (!body) return;
  const byBand = { beg: [], int: [], adv: [] };
  WORDS.forEach(w => {
    if (!DIFFICULTY[w.word.toLowerCase()]) return;       // only calibrated words
    const d = wordDifficulty(w.word);
    (d <= 2 ? byBand.beg : d === 3 ? byBand.int : byBand.adv).push(w);
  });
  const sample = (arr, n) => shuffleRandom(arr.slice()).slice(0, n);
  diagShown = [
    { key: "beg", name: "Beginner",     words: sample(byBand.beg, 8) },
    { key: "int", name: "Intermediate", words: sample(byBand.int, 8) },
    { key: "adv", name: "Advanced",     words: sample(byBand.adv, 8) },
  ];
  body.innerHTML = diagShown.map(g => `
    <div class="diag-group">
      <div class="diag-h">${g.name}</div>
      <div class="diag-chips">
        ${g.words.map(w => `<button type="button" class="diag-chip" data-word="${escapeHtml(w.word)}">${escapeHtml(w.word)}</button>`).join("")}
      </div>
    </div>`).join("");
  body.querySelectorAll(".diag-chip").forEach(ch => ch.addEventListener("click", () => {
    ch.classList.toggle("known");
    if (ch.classList.contains("known")) diagKnown.add(ch.dataset.word);
    else diagKnown.delete(ch.dataset.word);
  }));
}

/* Map diagnostic answers → a starting skill level (1–5). */
function diagnosticLevel() {
  const ratio = (band) => {
    const g = diagShown.find(x => x.key === band);
    if (!g || !g.words.length) return 0;
    return g.words.filter(w => diagKnown.has(w.word)).length / g.words.length;
  };
  const beg = ratio("beg"), int = ratio("int"), adv = ratio("adv");
  let lvl = 1;
  if (beg >= 0.5) lvl = 2;
  if (int >= 0.5) lvl = 3;
  if (adv >= 0.5) lvl = 4;
  if (adv >= 0.85) lvl = 5;
  return lvl;
}

function finishOnboarding(startLevel) {
  state.onboarded = true;
  state.goal = chosenGoal;
  state.startLevel = Math.max(1, startLevel || 1);
  save();
  document.getElementById("onboarding").classList.add("hidden");
  document.getElementById("diagnostic").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  show("home");
}

function setupOnboarding() {
  document.querySelectorAll("#goalOptions .goal-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#goalOptions .goal-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      chosenGoal = Number(chip.dataset.goal);
    });
  });
  // Step 1 (goal) → Step 2 (placement diagnostic).
  document.getElementById("startBtn").addEventListener("click", () => {
    state.goal = chosenGoal;
    document.getElementById("onboarding").classList.add("hidden");
    document.getElementById("diagnostic").classList.remove("hidden");
    renderDiagnostic();
  });
  const done = document.getElementById("diagDone");
  if (done) done.addEventListener("click", () => finishOnboarding(diagnosticLevel()));
  const skip = document.getElementById("diagSkip");
  if (skip) skip.addEventListener("click", () => finishOnboarding(1));
}

function showOnboardingOrApp() {
  const ob = document.getElementById("onboarding");
  const app = document.getElementById("app");
  if (state.onboarded) {
    ob.classList.add("hidden");
    app.classList.remove("hidden");
    show("home");
  } else {
    ob.classList.remove("hidden");
    app.classList.add("hidden");
    chosenGoal = 5; // reset goal picker default for each new account
    document.querySelectorAll("#goalOptions .goal-chip")
      .forEach(c => c.classList.toggle("selected", Number(c.dataset.goal) === 5));
  }
}

/* ============================================================
   HOME
   ============================================================ */
let calMonth = null; // {y, m}

function renderHome() {
  document.getElementById("homeStreak").textContent = state.streak;
  document.getElementById("homeLearned").textContent = state.learnedCount;
  document.getElementById("homeFreezers").textContent = state.freezers;
  document.getElementById("homeLongest").textContent = state.longest;
  document.getElementById("streakNum").textContent = state.streak;
  document.getElementById("freezerNum").textContent = state.freezers;
  document.getElementById("goalSelect").value = String(state.goal);

  renderSkillBanner();
  renderVacation();

  const doneToday = state.history[today()] === "done";
  const inProgress = state.review && state.review.date === today() && !doneToday;
  const weekly = weeklyDue() && !(inProgress && state.review.weekly);
  const status = document.getElementById("todayStatus");
  const btn = document.getElementById("startReviewBtn");
  if (inProgress && state.review.weekly) {
    status.className = "today-status weekly";
    status.innerHTML = `${ICON.trophy()} Your mandatory test is in progress — finish it to unlock today's words.`;
    btn.textContent = "Resume the test";
  } else if (weekly) {
    status.className = "today-status weekly";
    status.innerHTML = `${ICON.trophy()} Mandatory test time! A no-hints check over the words you've learned — required before today's words.`;
    btn.textContent = "Take the test →";
  } else if (doneToday) {
    status.className = "today-status done";
    status.innerHTML = `${ICON.check()} Today's ${state.goal} daily words are done. Learn more new words any time, or come back tomorrow to extend your streak!`;
    btn.textContent = "Practice more — new words →";
  } else if (inProgress) {
    status.className = "today-status pending";
    status.innerHTML = `You're partway through today's daily words — your progress is saved. Pick up where you left off.`;
    btn.textContent = "Resume daily words →";
  } else {
    status.className = "today-status pending";
    status.innerHTML = `${state.goal} fresh words are tuned to your skill and ready. Finish them to keep your ${ICON.flame()} streak going.`;
    btn.textContent = "Practice Daily Words →";
  }

  if (!calMonth) { const n = new Date(); calMonth = { y: n.getFullYear(), m: n.getMonth() }; }
  renderCalendar();
  renderAdvent();
}

function renderSkillBanner() {
  const el = document.getElementById("skillBanner");
  if (!el) return;
  const tier = skillTier();
  const nt = nextTier();
  const dots = SKILL_TIERS.map(t => `<span class="lvl-dot${t.level <= tier.level ? " on" : ""}"></span>`).join("");
  const win = difficultyWindow(tier.level);
  const lv = levelFromXp(state.xp || 0);
  const lvPct = Math.round((lv.into / lv.need) * 100);
  const tierPct = nt ? Math.max(0, Math.min(100, Math.round(((state.streak - tier.min) / (nt.min - tier.min)) * 100))) : 100;
  const nextNote = nt
    ? `${nt.min - state.streak}-day streak to <b>${nt.name}</b>`
    : `Top tier — Luminary!`;
  el.innerHTML = `
    <div class="skill-row">
      <span class="skill-name">${tier.name}</span>
      <span class="skill-dots">${dots}</span>
      <span class="skill-lvl" title="The longer your streak, the harder the words you're served.">Skill ${tier.level}/8</span>
    </div>
    <div class="tier-bar slim"><div class="tier-fill" style="width:${tierPct}%"></div></div>
    <div class="skill-sub">${nextNote} &nbsp;•&nbsp; serving <b>${diffRangeLabel(win.lo, win.hi)}</b> words &nbsp;•&nbsp; <b>Lv ${lv.level}</b> · ${lv.into}/${lv.need} XP${state.weeklyBadges ? ` &nbsp;•&nbsp; ${ICON.trophy("0.95em")} ${state.weeklyBadges}` : ""}</div>
    <div class="xp-bar slim"><div class="xp-fill" style="width:${lvPct}%"></div></div>`;
}

/* ---------------- VACATION MODE (pause the streak while away) ---------------- */
function prettyDate(dk) {
  if (!dk) return "";
  const [y, m, d] = dk.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("default", { month: "short", day: "numeric" });
}
function startVacation(until) {
  state.vacation = { active: true, start: today(), until: until || null };
  afterVacationChange();
}
function endVacation() {
  if (!state.vacation) state.vacation = { active: false, start: null, until: null };
  state.vacation.active = false;
  // Lock protection to the days actually missed (start..yesterday) so ending the
  // vacation is durable: future days count again, and the missed days stay safe
  // even after reconcileStreak re-derives them. Fixes the dead `active` flag.
  if (state.vacation.start) state.vacation.until = addDays(today(), -1);
  afterVacationChange();
}
function afterVacationChange() {
  save();
  ["vacationRow", "settingsVacationRow"].forEach(id => { if (document.getElementById(id)) renderVacationInto(id); });
  if (document.querySelector("#view-home.active")) renderHome();
}
function renderVacation() { renderVacationInto("vacationRow"); }
function renderVacationInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const v = state.vacation || { active: false };
  if (v.active) {
    el.innerHTML = `
      <div class="vacation-banner on">
        <div class="vac-text">${ICON.vacation()} <b>Vacation mode on</b> — your ${state.streak}${ICON.flame("0.95em")} streak is protected${v.until ? ` until ${prettyDate(v.until)}` : " while you're away"}. Study anytime if you want; missed days won't count.</div>
        <button class="btn-ghost sm vac-end">I'm back — resume</button>
      </div>`;
    el.querySelector(".vac-end").addEventListener("click", endVacation);
  } else {
    el.innerHTML = `
      <div class="vacation-banner">
        <div class="vac-text">${ICON.vacation()} Going away and can't study? Pause your streak so a break won't reset it.</div>
        <div class="vac-controls">
          <label class="vac-until">back by <input type="date" class="vac-until-input" min="${today()}" /></label>
          <button class="btn-ghost sm vac-start">Pause streak</button>
        </div>
      </div>`;
    el.querySelector(".vac-start").addEventListener("click", () => startVacation(el.querySelector(".vac-until-input").value));
  }
}

function renderCalendar() {
  const { y, m } = calMonth;
  const title = new Date(y, m, 1).toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("calTitle").textContent = title;
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const t = today();
  const giftDays = new Set((state.advent && Array.isArray(state.advent.log) ? state.advent.log : []).map(e => e.date));

  for (let i = 0; i < firstDow; i++) {
    const c = document.createElement("div");
    c.className = "cal-cell empty";
    grid.appendChild(c);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(y, m, d));
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.textContent = d;
    const h = state.history[key];
    if (h === "done") cell.classList.add("done");
    else if (h === "frozen") { cell.classList.add("frozen"); cell.innerHTML = ICON.snow("0.95em"); cell.title = `${key}: streak freezer used`; }
    else if (h === "vacation") { cell.classList.add("vacation"); cell.innerHTML = ICON.vacation("0.95em"); cell.title = `${key}: vacation (streak paused)`; }
    if (giftDays.has(key)) { cell.classList.add("has-gift"); cell.title = (cell.title ? cell.title + " · " : key + ": ") + "opened a Discovery door"; }
    if (key === t) cell.classList.add("today");
    grid.appendChild(cell);
  }
}

/* ============================================================
   DISCOVERY CALENDAR — advent-style unlockable rewards
   Earn a "key" each day you finish your review, then open a door
   for a surprise: bonus XP, word lore, a quote, or a collectible sticker.
   ============================================================ */
const ADVENT_SIZE = 24;
const ADVENT_FACTS = [
  "“Salary” comes from the Latin salarium — money Roman soldiers received to buy salt.",
  "“Quarantine” comes from Italian quaranta giorni — the 40 days ships once waited at port.",
  "The root “bene” (good) powers benefit, benevolent, and benign.",
  "“Sarcasm” comes from the Greek sarkazein, literally “to tear flesh.”",
  "A “clue” once meant a ball of thread — like the one Theseus used to escape the labyrinth.",
  "“Muscle” comes from the Latin musculus, “little mouse,” for the way muscles ripple.",
  "The prefix “mal-” (bad) hides inside malice, malady, and malfunction.",
  "“Disaster” literally means “bad star” (dis- + astrum).",
  "“Nice” once meant “foolish,” from the Latin nescius, “ignorant.”",
  "The root “loqu/loc” (to speak) gives us eloquent, loquacious, and elocution.",
  "“Companion” comes from Latin com- + panis: someone you share bread with.",
  "“Robot” comes from the Czech robota, meaning “forced labor.”",
];
const ADVENT_QUOTES = [
  "A word after a word after a word is power. — Margaret Atwood",
  "The limits of my language mean the limits of my world. — Wittgenstein",
  "Words are the most powerful drug used by mankind. — Rudyard Kipling",
  "Learning is a treasure that follows its owner everywhere.",
  "One word a day stacks into a vocabulary for life.",
  "Consistency beats intensity — keep that streak alive.",
  "Every expert was once a beginner.",
  "Vocabulary is the architecture of thought.",
  "Small daily wins compound into staggering results.",
  "The more you know, the more clearly you can say it.",
];
const ADVENT_STICKERS = ["star", "trophy", "gem", "crown", "flame", "bulb", "brain", "sparkles", "book", "target", "link", "clock"];

function ensureAdvent() {
  if (!state.advent || typeof state.advent !== "object") state.advent = { keys: 0, openedCount: 0, round: 0, log: [], stickers: [] };
  const a = state.advent;
  if (typeof a.keys !== "number" || a.keys < 0) a.keys = 0;
  if (typeof a.openedCount !== "number" || a.openedCount < 0) a.openedCount = 0;
  if (typeof a.round !== "number" || a.round < 0) a.round = 0;
  if (!Array.isArray(a.log)) a.log = [];
  if (!Array.isArray(a.stickers)) a.stickers = [];
  if (a.openedCount > ADVENT_SIZE) a.openedCount = ADVENT_SIZE; // guard stale data
  return a;
}
/* Reward is a deterministic function of the global door index, so it never changes once seen. */
function adventReward(globalIdx) {
  const order = ["xp", "fact", "sticker", "quote"];
  const type = order[globalIdx % order.length];
  const rot = Math.floor(globalIdx / order.length);
  if (type === "xp")    return { type: "xp", amount: (globalIdx % 8 === 0) ? 100 : 50 };
  if (type === "fact")  return { type: "fact", text: ADVENT_FACTS[rot % ADVENT_FACTS.length] };
  if (type === "quote") return { type: "quote", text: ADVENT_QUOTES[rot % ADVENT_QUOTES.length] };
  return { type: "sticker", icon: ADVENT_STICKERS[rot % ADVENT_STICKERS.length] };
}
function adventIcon(r, size) {
  if (r.type === "xp")      return ICON.star(size);
  if (r.type === "fact")    return ICON.bulb(size);
  if (r.type === "quote")   return ICON.sparkles(size);
  if (r.type === "sticker") return (ICON[r.icon] || ICON.gem)(size);
  return ICON.gem(size);
}
function adventRewardText(r) {
  if (r.type === "xp")      return `+${r.amount} bonus XP!`;
  if (r.type === "fact")    return r.text;
  if (r.type === "quote")   return r.text;
  if (r.type === "sticker") return "New sticker for your collection!";
  return "";
}
function openAdventTile(i) {
  const a = ensureAdvent();
  if (i !== a.openedCount || a.keys <= 0) return; // only the next door, and only with a key
  const globalIdx = a.round * ADVENT_SIZE + i;
  const reward = adventReward(globalIdx);
  a.keys -= 1;
  a.openedCount += 1;
  a.log.push({ date: today(), type: reward.type });
  if (reward.type === "xp") addXp(reward.amount);
  if (reward.type === "sticker" && a.stickers.indexOf(reward.icon) < 0) a.stickers.push(reward.icon);
  let roundDone = false;
  if (a.openedCount >= ADVENT_SIZE) { a.round += 1; a.openedCount = 0; roundDone = true; } // endless: new round
  save();
  renderSkillBanner(); // XP may have changed the level bar
  renderAdvent({ reward, roundDone });
}
function nextFreezerCheckpoint() {
  for (const cp of CHECKPOINTS) { if (!state.earnedCheckpoints.includes(cp) && cp > state.streak) return cp; }
  return null;
}
function renderAdvent(reveal) {
  const el = document.getElementById("adventBody");
  if (!el) return;
  const a = ensureAdvent();

  let banner = "";
  if (reveal && reveal.reward) {
    const r = reveal.reward;
    banner = `<div class="advent-reveal t-${r.type}">
        <span class="ar-ic">${adventIcon(r, "1.5em")}</span>
        <span class="ar-text"><b>Unlocked!</b> ${adventRewardText(r)}${reveal.roundDone ? ` <span class="muted">— Round ${a.round} complete; a fresh collection begins!</span>` : ""}</span>
      </div>`;
  }

  let tiles = "";
  for (let i = 0; i < ADVENT_SIZE; i++) {
    const globalIdx = a.round * ADVENT_SIZE + i;
    if (i < a.openedCount) {
      const r = adventReward(globalIdx);
      const justOpened = reveal && reveal.reward && !reveal.roundDone && i === a.openedCount - 1;
      tiles += `<div class="advent-tile open t-${r.type}${justOpened ? " just-opened" : ""}" title="${adventRewardText(r).replace(/"/g, "&quot;")}">${adventIcon(r, "1.2em")}</div>`;
    } else if (i === a.openedCount && a.keys > 0) {
      tiles += `<button class="advent-tile can-open" data-advent="${i}" aria-label="Open door ${globalIdx + 1}"><span class="at-open">open</span></button>`;
    } else {
      tiles += `<div class="advent-tile sealed" aria-hidden="true"><span class="at-num">${globalIdx + 1}</span></div>`;
    }
  }

  const nf = nextFreezerCheckpoint();
  el.innerHTML = `
    <div class="advent-head">
      <span class="advent-keys">${ICON.sparkles("1em")} <b>${a.keys}</b> key${a.keys === 1 ? "" : "s"}</span>
      <span class="muted small">Round ${a.round + 1} · ${a.openedCount}/${ADVENT_SIZE} opened</span>
    </div>
    ${banner}
    <div class="advent-grid">${tiles}</div>
    <p class="advent-hint muted small">${a.keys > 0
      ? "You've got a key — tap the glowing door to unlock a surprise!"
      : "Finish a daily review to earn a key, then open the next door."}</p>
    ${a.stickers.length ? `<div class="advent-collection"><span class="muted small">Sticker collection (${a.stickers.length}/${ADVENT_STICKERS.length})</span><div class="advent-stickers">${a.stickers.map(s => `<span class="adv-sticker" title="${s}">${(ICON[s] || ICON.gem)("1.25em")}</span>`).join("")}</div></div>` : ""}
    <p class="advent-freezer muted small">${nf
      ? `${ICON.snow("0.95em")} Next streak freezer at a <b>${nf}-day</b> streak.`
      : `${ICON.snow("0.95em")} All freezer checkpoints earned — nice!`}</p>`;
  el.querySelectorAll("[data-advent]").forEach(b => b.addEventListener("click", () => openAdventTile(Number(b.dataset.advent))));
}

/* ============================================================
   DAILY REVIEW — flashcards then quiz
   ============================================================ */
let session = null;

/* Today's words: a fresh, skill-tuned set each calendar day, but stable within
   the day (so reloads/resume show the same list). */
/* Remove duplicate / missing words from a list of word objects. */
function dedupWords(arr) {
  const seen = new Set(), out = [];
  for (const w of arr) { if (w && !seen.has(w.word)) { seen.add(w.word); out.push(w); } }
  return out;
}

function getTodayWords() {
  const t = today();
  const n = state.goal;
  const ds = state.dailySet;
  if (ds && ds.date === t && Array.isArray(ds.words) && ds.words.length) {
    const locked = state.history[t] === "done" || !!state.review; // can't change mid-/post-review
    if (ds.words.length === n || locked) {
      // Reuse today's set — but defensively de-duplicate a stale/buggy stored set
      // and top it back up to the goal so no word ever repeats in a review.
      let ws = dedupWords(ds.words.map(s => WORDS.find(w => w.word === s)).filter(Boolean));
      if (ws.length) {
        if (ws.length < n) {
          const have = new Set(ws.map(w => w.word));
          for (const w of pickDailyWords(n)) { if (ws.length >= n) break; if (!have.has(w.word)) { have.add(w.word); ws.push(w); } }
        }
        const cleaned = ws.map(w => w.word);
        if (cleaned.join("|") !== ds.words.join("|")) { // persist the repaired set
          state.dailySet = { date: t, words: cleaned, skill: (ds.skill != null ? ds.skill : skillLevel()) };
          save();
        }
        return ws;
      }
    }
    // Goal changed before starting today's review → repick below.
  }
  const chosen = pickDailyWords(n);
  state.dailySet = { date: t, words: chosen.map(w => w.word), skill: skillLevel() };
  save();
  return chosen;
}

function buildSession() {
  return { words: getTodayWords(), idx: 0, revealed: false, phase: "flash", weekly: false, mode: "daily" };
}

/* Build the mandatory test from MOST of the words you've learned (no streak impact, NO HINTS). */
function buildWeeklySession() {
  const pool = dedupWords(learnedPool());
  const picked = shuffleRandom(pool.slice()).slice(0, Math.min(TEST_MAX, pool.length));
  return { words: picked, idx: 0, revealed: false, phase: "weeklyIntro", weekly: true, mode: "test", noHints: true };
}

function startReviewView() {
  const r = state.review;
  const resumable = r && r.date === today() && (r.weekly || state.history[today()] !== "done")
    && Array.isArray(r.words) && r.words.length;

  if (resumable) {
    const rWords = dedupWords(r.words.map(s => WORDS.find(w => w.word === s)).filter(Boolean));
    session = {
      words: rWords,
      idx: Math.min(r.idx || 0, Math.max(0, rWords.length - 1)), // clamp: dedup may have shrunk the list below idx
      revealed: !!r.revealed,
      phase: r.phase || "flash",
      weekly: !!r.weekly,
      mode: r.mode || (r.weekly ? "weekly" : "daily"), // restore mode so a resumed Weekly Challenge stays streak-neutral
    };
    if (session.words.length) {
      if (session.phase === "quiz" && r.quiz) {
        quiz = { questions: r.quiz.questions, idx: r.quiz.idx || 0, correct: r.quiz.correct || 0,
                 answers: r.quiz.answers || [], choicesOpen: false, hintOpen: false };
        renderQuizQuestion();
        // If the user closed the app on the feedback screen (answered but hadn't pressed Next),
        // restore the locked/feedback state instead of re-asking — avoids double-counting the answer.
        if (quiz.answers.length > quiz.idx) {
          const last = quiz.answers[quiz.answers.length - 1];
          const wasRight = !!(last && last.right);
          lockAndShowFeedback(wasRight ? quiz.questions[quiz.idx].correct : null, wasRight);
        }
      } else if (session.phase === "quizIntro") {
        startQuizIntro();
      } else if (session.phase === "weeklyIntro") {
        startWeeklyIntro();
      } else {
        session.phase = "flash";
        renderFlashcard();
      }
      return;
    }
  }

  // Mandatory periodic test takes priority over the daily review.
  if (testDue()) {
    session = buildWeeklySession();
    quiz = null;
    if (!session.words.length) { // safety: nothing to test → reset the timer and fall through
      state.lastTestDay = today(); save();
    } else {
      snapshotReview();
      startWeeklyIntro();
      return;
    }
  }

  // Today's streak review is already done → "review again" gives a FRESH set of words
  // (a streak-neutral bonus round), not the same locked daily set.
  if (state.history[today()] === "done") { extraRound = 0; startExtra(); return; }

  // Fresh daily review.
  session = buildSession();
  quiz = null;
  snapshotReview();
  renderFlashcard();
}

function renderFlashcard() {
  const stage = document.getElementById("reviewStage");
  const w = session.words[session.idx];
  const total = session.words.length;
  const pct = Math.round((session.idx / total) * 100);

  stage.innerHTML = `
    <div class="review-wrap">
      <div class="review-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-label">Card ${session.idx + 1} / ${total}</div>
      </div>
      <div class="flashcard" id="flashcard">
        <div class="fc-topline"><span class="fc-pos">${w.pos}</span>${diffBadge(w.word)}</div>
        <div class="fc-wordrow"><span class="fc-word">${w.word}</span>${sayBtn(w.word)}</div>
        ${session.revealed ? renderReveal(w) : `<div class="tap-hint">Think of the meaning… then reveal.</div>`}
        <div class="fc-actions">
          ${session.revealed
            ? `<button class="btn-primary" id="nextCard">${session.idx + 1 === total ? "Start quiz →" : "Next word →"}</button>`
            : `<button class="btn-primary full" id="revealBtn">Reveal meaning</button>`}
        </div>
      </div>
    </div>`;

  if (session.revealed) {
    document.getElementById("nextCard").addEventListener("click", () => {
      if (session.idx + 1 === total) { session.phase = "quizIntro"; snapshotReview(); startQuizIntro(); }
      else { session.idx += 1; session.revealed = false; snapshotReview(); renderFlashcard(); }
    });
  } else {
    document.getElementById("revealBtn").addEventListener("click", () => {
      session.revealed = true;
      // Once you've seen a word's meaning, it's "met" — never reintroduce it as a new daily word.
      if (session && (session.mode === "daily" || session.mode === "extra")) { markPresented([w.word]); save(); }
      snapshotReview(); renderFlashcard();
    });
  }
}

function renderReveal(w) {
  const rootPills = w.roots.map(rk => {
    const r = ROOTS[rk];
    if (!r) return "";
    return `<div class="root-pill"><span class="origin">${r.origin}</span><br><b>${r.root}</b> — ${r.meaning}</div>`;
  }).join("");
  const syns = w.synonyms.map(s => `<span class="syn-chip">${s}</span>`).join("");
  return `
    <div class="fc-reveal">
      <div class="fc-block"><h4>Meaning</h4><div class="fc-def">${w.definition}</div></div>
      <div class="fc-block"><h4>Synonyms</h4><div class="syn-chips">${syns}</div></div>
      <div class="fc-block"><h4>Example</h4><div class="fc-example">"${w.example}"</div></div>
      <div class="fc-block"><h4>Word formation &amp; roots</h4>
        <div class="root-row">${rootPills}</div>
        <div class="formation">${w.formation}</div>
      </div>
    </div>`;
}

/* ---------------- QUIZ ---------------- */
function startQuizIntro() {
  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card quiz-intro">
        <div class="qicon">${ICON.target("56px")}</div>
        <h2>Synonym Challenge</h2>
        <p>Exam-style practice — the same "closest in meaning" format used on the SSAT, ISEE, SAT and more. The choices won't always match the synonyms you saw, so read carefully. Browse meanings or grab a hint if you get stuck.</p>
        <button class="btn-primary big" id="beginQuiz">Begin quiz →</button>
      </div>
    </div>`;
  document.getElementById("beginQuiz").addEventListener("click", startQuiz);
}

function diffBadge(word) {
  const d = wordDifficulty(word);
  const pips = [1, 2, 3, 4, 5].map(i => `<span class="dpip d${i}${i <= d ? " on" : ""}"></span>`).join("");
  return `<span class="diff-badge" title="Word difficulty: ${diffName(d)} (${d} of 5)"><span class="dpips">${pips}</span><span class="diff-label">${diffName(d)}</span></span>`;
}

/* Mandatory test intro — a no-hints exam over the words you've learned. */
function startWeeklyIntro() {
  const stage = document.getElementById("reviewStage");
  const count = session.words.length;
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card quiz-intro weekly-intro">
        <div class="qicon">${ICON.trophy("56px")}</div>
        <h2>Mandatory Test ${ICON.bolt("0.9em")}</h2>
        <p>Time to prove it! ${count} question${count === 1 ? "" : "s"} drawn from the words you've learned so far — and this time <b>no hints and no browsing</b> are allowed. It won't affect your streak, but you must clear it to unlock today's words. You set the test interval in Settings.</p>
        <button class="btn-primary big" id="beginQuiz">Start the test →</button>
      </div>
    </div>`;
  document.getElementById("beginQuiz").addEventListener("click", startQuiz);
}

/* ---------------- QUESTION BUILDERS (multiple types) ---------------- */
const ALL_SYN = [];
function synPool() {
  if (!ALL_SYN.length) WORDS.forEach(w => w.synonyms.forEach(s => ALL_SYN.push({ syn: s.toLowerCase(), owner: w.word })));
  return ALL_SYN;
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function clozeSentence(w) {
  const ex = w.example || "";
  if (!ex) return null;
  const re = new RegExp("\\b" + escapeRegex(w.word) + "\\b", "i");
  return re.test(ex) ? ex.replace(re, "_____") : null;
}
/* 4 word-options for cloze / definition→word questions.
   Distractors are drawn from the SAME day's reviewed words first, so every
   option is a word the learner studied today — they can't just pick the only
   familiar one. Near-synonyms are excluded so there's exactly one right answer. */
function wordOptions(w) {
  const ownSyn = new Set(w.synonyms.map(s => s.toLowerCase()).concat([w.word.toLowerCase()]));
  const notNear = (x) => {
    if (ownSyn.has(x.word.toLowerCase())) return false;
    for (const s of x.synonyms) if (ownSyn.has(s.toLowerCase())) return false; // shares a synonym → too close
    return true;
  };
  const distr = [], used = new Set([w.word]);
  const take = (list) => { for (const x of list) { if (distr.length >= 3) break; if (!used.has(x.word)) { used.add(x.word); distr.push(x.word); } } };
  // 1) other words from today's set
  const sessionPool = (session && Array.isArray(session.words) ? session.words : []).filter(x => x.word !== w.word && notNear(x));
  take(shuffleRandom(sessionPool.slice()));
  // 2) only if today's set is too small, top up from the dictionary (difficulty-matched)
  if (distr.length < 3) {
    const d0 = wordDifficulty(w.word);
    const dict = shuffleRandom(WORDS.filter(x => x.word !== w.word && notNear(x)));
    take(dict.filter(x => Math.abs(wordDifficulty(x.word) - d0) <= 1));
    take(dict);
  }
  return shuffleRandom([w.word].concat(distr)).map(cap);
}
function buildSynonymQ(w) {
  const lc = (s) => s.toLowerCase();
  const ownSyn = new Set(w.synonyms.map(lc).concat([lc(w.word)])); // own synonyms + the word itself
  // True-random correct synonym + order, so the same word doesn't always show the
  // identical answer in the identical A/B/C/D slot (which lets learners memorize position).
  const correct = cap(w.synonyms[Math.floor(Math.random() * w.synonyms.length)]);
  const d0 = wordDifficulty(w.word);
  // Words whose meaning overlaps w (share a synonym, or one lists the other) — their
  // synonyms would be defensible answers, so they must NOT be distractors.
  const nearOwners = new Set();
  WORDS.forEach(ow => {
    if (ow.word === w.word) return;
    if (ownSyn.has(lc(ow.word))) { nearOwners.add(ow.word); return; }
    for (const s of ow.synonyms) if (ownSyn.has(lc(s))) { nearOwners.add(ow.word); break; }
  });
  const base = synPool().filter(o => o.owner !== w.word && !ownSyn.has(o.syn) && !nearOwners.has(o.owner));
  const near = base.filter(o => Math.abs(wordDifficulty(o.owner) - d0) <= 1);
  const distractors = [], used = new Set([correct.toLowerCase()]);
  const take = (pool) => { for (const o of shuffleRandom(pool.slice())) { if (distractors.length >= 3) break; if (!used.has(o.syn)) { used.add(o.syn); distractors.push(cap(o.syn)); } } };
  take(near); if (distractors.length < 3) take(base);
  return { type: "synonym", word: w.word, prompt: w.word, correct, options: shuffleRandom([correct, ...distractors]) };
}
function pickType() {
  // Weighted: synonym is the core exam type; recall (typing) is rarer.
  const bag = ["synonym", "synonym", "synonym", "cloze", "cloze", "defToWord", "recall"];
  return bag[Math.floor(Math.random() * bag.length)];
}
function buildQuizQuestions() {
  // The graded review/test (daily, weekly, extra, due, practice, exam) is SYNONYMS ONLY —
  // it's the clean, reliable SSAT-style format. Only the low-stakes "casual" Quick Quiz
  // mixes in the other question types for variety.
  const variety = session && session.mode === "casual";
  const small = !session || !Array.isArray(session.words) || session.words.length < 4;
  return session.words.map(w => {
    let type = variety ? pickType() : "synonym";
    if (small && (type === "cloze" || type === "defToWord")) type = "synonym"; // too few same-set distractors to be fair
    if (type === "cloze" && !clozeSentence(w)) type = "synonym";
    if (type === "synonym") return buildSynonymQ(w);
    if (type === "cloze")   return { type: "cloze",     word: w.word, prompt: clozeSentence(w), correct: cap(w.word), options: wordOptions(w) };
    if (type === "defToWord") return { type: "defToWord", word: w.word, prompt: w.definition,     correct: cap(w.word), options: wordOptions(w) };
    if (type === "recall")  return { type: "recall",    word: w.word, prompt: w.definition,     correct: cap(w.word) };
    return buildSynonymQ(w);
  });
}

/* deterministic pseudo-random so a session is stable across re-renders */
function pseudoRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function seededPick(seedStr) { return pseudoRandom(seedStr + "pick"); }
function shuffle(arr, seed) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom(seed + i) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* Fisher–Yates shuffle (truly random — used to mix question order each session). */
function shuffleRandom(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let quiz = null;
function startQuiz() {
  // Mix up the order so the quiz doesn't follow the flashcard order.
  const questions = shuffleRandom(buildQuizQuestions());
  quiz = { questions, idx: 0, correct: 0, answers: [], choicesOpen: false, hintOpen: false, startMs: Date.now(), noHints: !!(session && session.noHints) };
  if (session) session.phase = "quiz";
  snapshotReview();
  renderQuizQuestion();
}

const QUIZ_LABELS = {
  synonym:   "Select the word most nearly the same in meaning as:",
  cloze:     "Choose the word that best completes the sentence:",
  defToWord: "Which word matches this definition?",
  recall:    "Type the word that matches this definition:",
};
const QUIZ_SUBS = {
  synonym:   "Choose the closest synonym",
  cloze:     "Fill in the blank",
  defToWord: "Pick the matching word",
  recall:    "Active recall — spelling counts!",
};

function renderQuizQuestion() {
  const stage = document.getElementById("reviewStage");
  const q = quiz.questions[quiz.idx];
  const letters = ["A", "B", "C", "D"];
  const total = quiz.questions.length;

  // Stem differs by type: a big single word for synonym, otherwise readable text.
  const stemHtml = q.type === "synonym"
    ? `<div class="quiz-stem">${q.prompt}</div>`
    : (q.type === "cloze"
        ? `<div class="quiz-stem-text">${q.prompt}</div>`
        : `<div class="quiz-stem-text">“${q.prompt}”</div>`);

  const choicesTool = (q.type === "recall" || quiz.noHints) ? "" :
    `<button class="tool-btn" id="toggleChoices">${ICON.book()} Browse choice meanings</button>`;

  const answerArea = q.type === "recall"
    ? `<form id="recallForm" class="recall-wrap">
         <input id="recallInput" class="recall-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type the word…" />
         <button type="submit" class="btn-primary" id="recallSubmit">Check</button>
       </form>`
    : `<div class="quiz-options" id="quizOptions">
         ${q.options.map((opt, i) => `
           <button class="quiz-opt" data-opt="${escapeHtml(opt)}">
             <span class="opt-letter">${letters[i]}</span><span>${opt}</span>
           </button>`).join("")}
       </div>`;

  stage.innerHTML = `
    <div class="review-wrap">
      <div class="review-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((quiz.idx / total) * 100)}%"></div></div>
        <div class="progress-label">Question ${quiz.idx + 1} / ${total}</div>
        ${quiz.timed ? `<div class="exam-timer" id="examTimer">${ICON.clock("0.95em")} <span id="examTimerText">--:--</span></div>` : ""}
      </div>
      <div class="quiz-card">
        <div class="quiz-prompt-label">${QUIZ_LABELS[q.type] || "Choose the best answer:"}</div>
        ${stemHtml}
        <div class="quiz-sub">${QUIZ_SUBS[q.type] || ""}</div>
        <div class="quiz-tools">
          ${choicesTool}
          ${(q.type === "recall" || quiz.noHints) ? "" /* recall roots would spell the word; tests allow no hints */
            : `<button class="tool-btn" id="hintBtn">${ICON.bulb()} Hint: word roots</button>`}
        </div>
        ${quiz.noHints ? `<p class="no-hints-note">${ICON.bolt("0.85em")} Test mode — no hints or browsing.</p>` : ""}
        <div id="hintWrap"></div>
        <div id="choiceMeanings"></div>
        ${answerArea}
        <div id="quizFeedback" aria-live="polite"></div>
        <div class="quiz-footer">
          <span class="quiz-count">Score: ${quiz.correct} / ${quiz.idx}</span>
          <span></span>
        </div>
      </div>
    </div>`;

  const hintBtn = document.getElementById("hintBtn");
  if (hintBtn) {
    hintBtn.addEventListener("click", () => {
      quiz.hintOpen = !quiz.hintOpen;
      hintBtn.classList.toggle("active", quiz.hintOpen);
      renderHint();
    });
    hintBtn.classList.toggle("active", quiz.hintOpen);
    renderHint();
  }

  const choicesBtn = document.getElementById("toggleChoices");
  if (choicesBtn) {
    choicesBtn.addEventListener("click", () => {
      quiz.choicesOpen = !quiz.choicesOpen;
      choicesBtn.classList.toggle("active", quiz.choicesOpen);
      renderChoiceMeanings();
    });
    choicesBtn.classList.toggle("active", quiz.choicesOpen);
    renderChoiceMeanings();
  }

  if (q.type === "recall") {
    const form = document.getElementById("recallForm");
    form.addEventListener("submit", (e) => { e.preventDefault(); answerQuiz(document.getElementById("recallInput").value); });
    document.getElementById("recallInput").focus();
  } else {
    document.querySelectorAll(".quiz-opt").forEach(btn => {
      btn.addEventListener("click", () => answerQuiz(btn.dataset.opt));
    });
  }
  if (quiz.timed) updateTimerDisplay();
}

/* Browse helper: define each answer choice (synonyms for synonym questions,
   the candidate words for word-choice questions). */
function renderChoiceMeanings() {
  const wrap = document.getElementById("choiceMeanings");
  if (!wrap) return;
  if (!quiz.choicesOpen) { wrap.innerHTML = ""; return; }
  const q = quiz.questions[quiz.idx];
  if (!q.options) { wrap.innerHTML = ""; return; }
  const items = q.options.map(opt => {
    let def;
    if (q.type === "synonym") def = SYN_DEFS[opt.toLowerCase()] || "(meaning unavailable)";
    else { const wo = WORDS.find(x => x.word.toLowerCase() === opt.toLowerCase()); def = wo ? wo.definition : "(meaning unavailable)"; }
    return `<div class="mini-dict-item"><b>${opt}</b> — ${def}</div>`;
  }).join("");
  wrap.innerHTML = `<div class="mini-dict"><h5>What each choice means</h5>${items}</div>`;
}

/* Hint: show the asked word's roots and their meanings — NOT its definition. */
function renderHint() {
  const wrap = document.getElementById("hintWrap");
  if (!quiz.hintOpen) { wrap.innerHTML = ""; return; }
  const w = WORDS.find(x => x.word === quiz.questions[quiz.idx].word);
  const pills = w.roots.map(rk => {
    const r = ROOTS[rk];
    return r ? `<div class="root-pill"><span class="origin">${r.origin}</span><br><b>${r.root}</b> — ${r.meaning}</div>` : "";
  }).join("");
  const body = pills
    ? `<div class="root-row">${pills}</div>`
    : `<p class="hint-origin">${w.formation}</p>`;
  wrap.innerHTML = `<div class="hint-box">
      <h5>Roots of “${w.word}”</h5>
      ${body}
      <p class="hint-tip">Use the word's parts to reason out the meaning.</p>
    </div>`;
}

function answerQuiz(picked) {
  const q = quiz.questions[quiz.idx];
  // Ignore an empty recall submission (accidental Enter) — don't burn the question.
  if (q.type === "recall" && !(picked || "").trim()) { const inp = document.getElementById("recallInput"); if (inp) inp.focus(); return; }
  const isRight = (picked || "").trim().toLowerCase() === q.correct.toLowerCase();
  if (isRight) quiz.correct += 1;
  quiz.answers.push({ word: q.word, right: isRight });
  recordAnswer(q.word, isRight, q.type);   // spaced-repetition + XP + type accuracy
  snapshotReview();
  lockAndShowFeedback(picked, isRight);
}

/* Lock the answered question into its feedback state and wire up the Next button.
   Split out of answerQuiz so a resumed feedback-screen can restore this state
   WITHOUT re-recording the answer (no double-counting). */
function lockAndShowFeedback(picked, isRight) {
  const q = quiz.questions[quiz.idx];
  if (q.type === "recall") {
    const inp = document.getElementById("recallInput");
    if (inp) { inp.disabled = true; inp.classList.add(isRight ? "correct" : "wrong"); if (!isRight && picked != null) inp.value = picked; }
    const sb = document.getElementById("recallSubmit"); if (sb) sb.disabled = true;
  } else {
    document.querySelectorAll(".quiz-opt").forEach(btn => {
      btn.classList.add("locked");
      const val = btn.dataset.opt.toLowerCase();
      if (val === q.correct.toLowerCase()) btn.classList.add("correct");
      else if (picked != null && val === (picked || "").toLowerCase()) btn.classList.add("wrong");
      btn.replaceWith(btn.cloneNode(true)); // strip listeners
    });
  }

  const fb = document.getElementById("quizFeedback");
  const wObj = WORDS.find(w => w.word === q.word);
  // Show the word's definition either way — green on correct, as requested.
  fb.className = "quiz-feedback " + (isRight ? "ok" : "no");
  fb.innerHTML = isRight
    ? `${ICON.check()} Correct! <b>${cap(q.word)}</b> means: ${wObj.definition}`
    : `${ICON.cross()} The best answer is <b>${q.correct}</b>. <b>${cap(q.word)}</b> means: ${wObj.definition}`;

  // add a next button
  const footer = document.querySelector(".quiz-footer");
  footer.innerHTML = `<span class="quiz-count">Score: ${quiz.correct} / ${quiz.idx + 1}</span>
    <button class="btn-primary" id="nextQ">${quiz.idx + 1 === quiz.questions.length ? "See results →" : "Next →"}</button>`;
  document.getElementById("nextQ").addEventListener("click", () => {
    if (quiz.idx + 1 === quiz.questions.length) {
      const mode = (session && session.mode) || (session && session.weekly ? "test" : "daily");
      if (mode === "weekly" || mode === "test") finishWeekly();
      else if (mode === "daily") finishSession();
      else if (mode === "extra") finishExtra();   // streak-neutral bonus round
      else finishTest(mode);   // due, casual, exam, practice
    } else { quiz.idx += 1; quiz.choicesOpen = false; quiz.hintOpen = false; snapshotReview(); renderQuizQuestion(); if (quiz.timed) updateTimerDisplay(); }
  });
}

/* ---------------- session completion ---------------- */
function finishSession() {
  const alreadyDoneToday = state.history[today()] === "done";

  // Only advance learning progress + streak the first completion of the day.
  if (!alreadyDoneToday) {
    state.learnedCount += session.words.length;
    markPresented(session.words); // today's words are learned — never re-introduce them
    // Record this quiz for the progress trend (keep the last 60).
    state.quizHistory = (state.quizHistory || []).concat([{ date: today(), correct: quiz.correct, total: quiz.questions.length }]).slice(-60);
    completeToday();
    // XP: completion bonus + streak bonus.
    addXp(25 + state.streak);
    // Personal records + activity heatmap + mastery curve.
    state.dailyActivity = state.dailyActivity || {};
    state.dailyActivity[today()] = (state.dailyActivity[today()] || 0) + session.words.length;
    state.records = state.records || { mostWordsDay: 0, fastestMs: null };
    state.records.mostWordsDay = Math.max(state.records.mostWordsDay || 0, state.dailyActivity[today()]);
    if (quiz.startMs) { const ms = Date.now() - quiz.startMs; if (!state.records.fastestMs || ms < state.records.fastestMs) state.records.fastestMs = ms; }
    state.masteryHistory = (state.masteryHistory || []).filter(h => h.date !== today())
      .concat([{ date: today(), mastered: masteredCount() }]).slice(-120);
  }
  clearReview(); // the review is finished — nothing left to resume

  const total = quiz.questions.length;
  const score = quiz.correct;
  const pct = Math.round((score / total) * 100);
  const circ = 2 * Math.PI * 54;
  const offset = circ * (1 - score / total);

  const rows = quiz.answers.map(a =>
    `<div class="res-word-row"><span class="rw-word">${a.word}</span><span class="rw-mark">${a.right ? ICON.check() : ICON.cross()}</span></div>`
  ).join("");

  let msg = "Keep practicing!";
  if (pct === 100) msg = `Perfect score! ${ICON.sparkles()}`;
  else if (pct >= 80) msg = "Excellent work!";
  else if (pct >= 60) msg = "Nicely done.";

  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="#b8453a" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${score}/${total}</div>
        </div>
        <h2>${msg}</h2>
        <p class="res-sub">${alreadyDoneToday
            ? "Practice session complete — your streak was already secured today."
            : `Day ${state.streak} streak secured ${ICON.flame()} &nbsp;•&nbsp; +${session.words.length} words learned`}</p>
        <div class="res-words"><h4>Today's words</h4>${rows}</div>
        <button class="btn-primary big full" id="extraBtn">Keep going — review more words →</button>
        <p class="res-extra-note">Bonus rounds get harder and count toward your progress, but never risk your streak.</p>
        <button class="btn-ghost full" id="backHome">Back to home</button>
      </div>
    </div>`;
  document.getElementById("backHome").addEventListener("click", () => show("home"));
  document.getElementById("extraBtn").addEventListener("click", () => { extraRound = 0; startExtra(); });

  // refresh badges
  document.getElementById("streakNum").textContent = state.streak;
  document.getElementById("freezerNum").textContent = state.freezers;
}

/* ---------------- BONUS "KEEP GOING" ROUNDS (streak-neutral, escalating) ---------------- */
let extraRound = 0;
function pickExtraWords(n) {
  const seen = presentedSet(); // never repeat an already-introduced word
  const lvl = Math.min(8, skillLevel() + extraRound); // each bonus round steps the difficulty up
  const win = difficultyWindow(lvl);
  const inWindow = WORDS.filter(w => { const d = wordDifficulty(w.word); return d >= win.lo && d <= win.hi; });
  const fresh = inWindow.filter(w => !seen.has(w.word));
  const chosen = [], have = new Set();
  const add = (w) => { if (w && !have.has(w.word) && chosen.length < n) { have.add(w.word); chosen.push(w); } };
  shuffleRandom(fresh.slice()).forEach(add);
  if (chosen.length < n) shuffleRandom(WORDS.filter(w => !seen.has(w.word))).forEach(add); // any fresh word
  if (chosen.length < n) shuffleRandom(WORDS.slice()).forEach(add);                         // exhausted: allow repeats
  return dedupWords(chosen.slice(0, n));
}
function startExtra() {
  extraRound += 1;
  const words = pickExtraWords(Math.max(5, state.goal));
  if (!words.length) { show("home"); return; }
  session = { words, idx: 0, revealed: false, phase: "flash", weekly: false, mode: "extra", ephemeral: true };
  quiz = null;
  enterReviewPane("review");
  renderFlashcard();
}
function finishExtra() {
  stopExamTimer();
  const total = quiz.questions.length, score = quiz.correct;
  // Full progress credit — but no streak/skill change (those are daily-only).
  state.learnedCount += session.words.length;
  state.dailyActivity = state.dailyActivity || {};
  state.dailyActivity[today()] = (state.dailyActivity[today()] || 0) + session.words.length;
  state.records = state.records || { mostWordsDay: 0, fastestMs: null };
  state.records.mostWordsDay = Math.max(state.records.mostWordsDay || 0, state.dailyActivity[today()]);
  state.masteryHistory = (state.masteryHistory || []).filter(h => h.date !== today())
    .concat([{ date: today(), mastered: masteredCount() }]).slice(-120);
  markPresented(session.words); // these new words won't be introduced again
  addXp(15 + score * 2);
  save();

  const circ = 2 * Math.PI * 54, offset = circ * (1 - (total ? score / total : 0));
  const rows = quiz.answers.map(a =>
    `<div class="res-word-row"><span class="rw-word">${a.word}</span><span class="rw-mark">${a.right ? ICON.check() : ICON.cross()}</span></div>`
  ).join("");
  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="#2fa58f" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${score}/${total}</div>
        </div>
        <h2>Bonus round ${extraRound} done! ${score === total ? ICON.sparkles() : ""}</h2>
        <p class="res-sub">+${session.words.length} words toward your progress — and the next round is harder. Streak untouched ${ICON.flame()}.</p>
        <div class="res-words"><h4>Bonus words</h4>${rows}</div>
        <button class="btn-primary big full" id="extraMore">Another round (harder) →</button>
        <button class="btn-ghost full" id="backHome">Back to home</button>
      </div>
    </div>`;
  document.getElementById("extraMore").addEventListener("click", startExtra);
  document.getElementById("backHome").addEventListener("click", () => { extraRound = 0; show("home"); });
  session = null; quiz = null;
}

/* Mandatory test completion — no streak/skill impact; resets the test timer. */
function finishWeekly() {
  state.lastTestDay = today();
  state.lastWeeklyWeek = weekIndex(today());
  state.weekWords = [];
  state.weeklyBadges = (state.weeklyBadges || 0) + 1;
  addXp(40); // bonus — no streak/skill impact
  clearReview();
  save();

  const total = quiz.questions.length;
  const score = quiz.correct;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const circ = 2 * Math.PI * 54;
  const offset = circ * (1 - (total ? score / total : 0));
  const rows = quiz.answers.map(a =>
    `<div class="res-word-row"><span class="rw-word">${a.word}</span><span class="rw-mark">${a.right ? ICON.check() : ICON.cross()}</span></div>`
  ).join("");

  let msg = `Test passed! ${ICON.sparkles()}`;
  if (pct === 100) msg = `Flawless test! ${ICON.sparkles()}`;
  else if (pct >= 80) msg = `Great score! ${ICON.sparkles()}`;

  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card weekly-results">
        <div class="weekly-trophy">${ICON.trophy("60px")}</div>
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="#3a8a4f" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${score}/${total}</div>
        </div>
        <h2>${msg}</h2>
        <p class="res-sub">Mandatory test #${state.weeklyBadges} cleared — your streak is untouched. Next test in ${testPeriodDays()} days. Now go learn today's words!</p>
        <div class="res-words"><h4>Tested words</h4>${rows}</div>
        <button class="btn-primary big full" id="toReview">Practice daily words →</button>
        <button class="btn-ghost full" id="backHome" style="margin-top:10px;">Back to home</button>
      </div>
    </div>`;
  document.getElementById("toReview").addEventListener("click", startReviewView);
  document.getElementById("backHome").addEventListener("click", () => show("home"));
}

/* ---------------- PRACTICE HUB MODES (no streak impact) ---------------- */
let examInterval = null;
function stopExamTimer() { if (examInterval) { clearInterval(examInterval); examInterval = null; } }
function updateTimerDisplay() {
  const el = document.getElementById("examTimer"), txt = document.getElementById("examTimerText");
  if (!el || !txt || !quiz) return;
  const s = Math.max(0, quiz.timeLeft | 0), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, "0");
  txt.textContent = `${m}:${ss}`;
  el.classList.toggle("low", s <= 10);
}
function startExamTimer(seconds) {
  stopExamTimer();
  quiz.timed = true; quiz.timeLeft = seconds;
  updateTimerDisplay();
  examInterval = setInterval(() => {
    quiz.timeLeft -= 1;
    updateTimerDisplay();
    if (quiz.timeLeft <= 0) { stopExamTimer(); finishTest("exam"); }
  }, 1000);
}

/* Switch to the quiz/review pane WITHOUT rebuilding the daily session. */
function enterReviewPane(activeTab) {
  if (window.Ascii) { const dc = document.getElementById("donutCanvas"); if (dc) Ascii.stop(dc); } // pause ASCII anim if leaving Progress
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === activeTab));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-review").classList.add("active");
}
function newQuiz() {
  return { questions: shuffleRandom(buildQuizQuestions()), idx: 0, correct: 0, answers: [], choicesOpen: false, hintOpen: false, startMs: Date.now() };
}

function startPractice() { // tricky words, launched from Progress
  const words = trickyWords(10).map(s => WORDS.find(x => x.word === s)).filter(Boolean);
  if (!words.length) return;
  session = { words, idx: 0, mode: "practice", ephemeral: true };
  quiz = newQuiz();
  enterReviewPane("progress");
  renderQuizQuestion();
}
function startDue() {
  const words = dueWords().slice(0, 25).map(s => WORDS.find(x => x.word === s)).filter(Boolean);
  if (!words.length) return;
  session = { words, idx: 0, mode: "due", ephemeral: true };
  quiz = newQuiz();
  enterReviewPane("practice");
  renderQuizQuestion();
}
function startCasual() {
  const learned = Object.keys(state.wordStats || {}).map(s => WORDS.find(x => x.word === s)).filter(Boolean);
  const pool = learned.length >= 8 ? learned : WORDS.slice();
  const words = shuffleRandom(pool.slice()).slice(0, Math.max(6, state.goal));
  session = { words, idx: 0, mode: "casual", ephemeral: true };
  quiz = newQuiz();
  enterReviewPane("practice");
  renderQuizQuestion();
}
function examWords(n) {
  const learned = Object.keys(state.wordStats || {}).map(s => WORDS.find(x => x.word === s)).filter(Boolean);
  let pool = shuffleRandom(learned.slice());
  if (pool.length < n) pool = pool.concat(shuffleRandom(eligiblePool(skillLevel()).filter(w => !pool.includes(w))));
  if (pool.length < n) pool = pool.concat(shuffleRandom(WORDS.slice()));
  const seen = new Set(), out = [];
  for (const w of pool) { if (out.length >= n) break; if (!seen.has(w.word)) { seen.add(w.word); out.push(w); } }
  return out;
}
function startExam() {
  const n = 10;
  const words = examWords(n);
  if (!words.length) return;
  session = { words, idx: 0, mode: "exam", ephemeral: true };
  quiz = newQuiz();
  enterReviewPane("practice");
  startExamTimer(n * 15); // sets quiz.timed before render so the timer shows
  renderQuizQuestion();
}

/* ============================================================
   FULL SSAT VERBAL TEST — exam-realistic, long, timed, scored.
   60 questions / 30 min (30 synonyms + 30 analogies), 5 choices each,
   no hints, no feedback until the end, SSAT −1/4 wrong-answer penalty.
   ============================================================ */
const SSAT_SYN = 30, SSAT_ANALOGY = 30, SSAT_TOTAL = SSAT_SYN + SSAT_ANALOGY, SSAT_MINUTES = 30;
const SSAT_LETTERS = ["A", "B", "C", "D", "E"];
let ssat = null, ssatInterval = null;

/* 5 difficulty-matched distractor synonyms (excluding the answer's own synonyms). */
function ssatDistractors(ownerWord, ownSyns, correctLc, count) {
  const used = new Set([correctLc]);
  const own = new Set((ownSyns || []).map(s => s.toLowerCase()));
  const out = [];
  for (const o of shuffleRandom(synPool().slice())) {
    if (out.length >= count) break;
    if (o.owner === ownerWord) continue;
    if (own.has(o.syn) || used.has(o.syn)) continue;
    used.add(o.syn); out.push(cap(o.syn));
  }
  return out;
}
function ssatSynonymQ(w) {
  const correct = cap(w.synonyms[Math.floor(Math.random() * w.synonyms.length)]);
  const options = shuffleRandom([correct].concat(ssatDistractors(w.word, w.synonyms, correct.toLowerCase(), 4)));
  return { section: "Synonyms", word: w.word, stem: w.word.toUpperCase(), correct, options };
}
/* Fallback analogy (synonym relationship) when the curated bank isn't available. */
function ssatAnalogyQ(stemW, ansW) {
  const stemSyn = cap(stemW.synonyms[Math.floor(Math.random() * stemW.synonyms.length)]);
  const correct = cap(ansW.synonyms[Math.floor(Math.random() * ansW.synonyms.length)]);
  const options = shuffleRandom([correct].concat(ssatDistractors(ansW.word, ansW.synonyms, correct.toLowerCase(), 4)));
  return {
    section: "Analogies", word: ansW.word, rel: "synonym",
    stem: `${stemW.word.toUpperCase()} : ${stemSyn.toLowerCase()} :: ${ansW.word.toUpperCase()} : ?`,
    correct, options,
  };
}
/* Curated analogy from the diverse bank (antonym, degree, part:whole, cause:effect, …). */
function ssatAnalogyFromBank(it) {
  const correct = cap(it.d);
  const options = shuffleRandom([correct].concat((it.distractors || []).slice(0, 4).map(cap)));
  return {
    section: "Analogies", word: it.c, rel: it.rel,
    stem: `${it.a.toUpperCase()} : ${it.b.toLowerCase()} :: ${it.c.toUpperCase()} : ?`,
    stemWords: [it.a, it.b, it.c],
    correct, options,
  };
}
/* Quick meaning lookup for the analogies helper (glossary → synonym defs → headwords). */
function wordMeaning(word) {
  if (!word) return null;
  const k = String(word).toLowerCase();
  if (window.ANALOGY_DEFS && window.ANALOGY_DEFS[k]) return window.ANALOGY_DEFS[k];
  if (typeof SYN_DEFS !== "undefined" && SYN_DEFS[k]) return SYN_DEFS[k];
  const wo = WORDS.find(x => x.word.toLowerCase() === k);
  return wo ? wo.definition : null;
}
function buildSsatQuestions() {
  const pool = shuffleRandom(WORDS.filter(w => w.synonyms && w.synonyms.length >= 1));
  // Bias toward harder words for a realistic challenge.
  pool.sort((a, b) => (wordDifficulty(b.word) - wordDifficulty(a.word)) || (Math.random() - 0.5));
  const synN = Math.min(SSAT_SYN, Math.max(1, Math.floor(pool.length / 3)));
  const synQs = pool.slice(0, synN).map(ssatSynonymQ);

  // Analogies: prefer the diverse curated bank; fall back to synonym-relationship analogies.
  const anaQs = [];
  const bank = window.ANALOGIES;
  if (Array.isArray(bank) && bank.length >= SSAT_ANALOGY) {
    shuffleRandom(bank.slice()).slice(0, SSAT_ANALOGY).forEach(it => anaQs.push(ssatAnalogyFromBank(it)));
  } else {
    const rest = shuffleRandom(pool.slice(synN));
    for (let i = 0; i + 1 < rest.length && anaQs.length < SSAT_ANALOGY; i += 2) anaQs.push(ssatAnalogyQ(rest[i], rest[i + 1]));
  }
  return synQs.concat(anaQs); // synonyms first, then analogies (as on the real test)
}
function stopSsatTimer() { if (ssatInterval) { clearInterval(ssatInterval); ssatInterval = null; } }
function updateSsatTimer() {
  const el = document.getElementById("ssatTimer"); if (!el || !ssat) return;
  const s = Math.max(0, ssat.timeLeft | 0), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, "0");
  el.textContent = `${m}:${ss}`;
  const box = document.getElementById("ssatTimerBox"); if (box) box.classList.toggle("low", s <= 60);
}
function startSsatTimer() {
  stopSsatTimer();
  updateSsatTimer();
  ssatInterval = setInterval(() => { ssat.timeLeft -= 1; updateSsatTimer(); if (ssat.timeLeft <= 0) { stopSsatTimer(); finishSsat(true); } }, 1000);
}
function startSsatTest() {
  const questions = buildSsatQuestions();
  if (questions.length < 4) return;
  ssat = { questions, idx: 0, answers: new Array(questions.length).fill(null), startMs: Date.now(), timeLeft: SSAT_MINUTES * 60 };
  session = null; quiz = null;
  enterReviewPane("practice");
  renderSsatQuestion();
  startSsatTimer();
}
function ssatChoose(i) {
  const q = ssat.questions[ssat.idx];
  ssat.answers[ssat.idx] = q.options[i];
  if (ssat.idx < ssat.questions.length - 1) ssat.idx++; // auto-advance like a bubble sheet
  renderSsatQuestion();
}
function ssatGo(delta) {
  ssat.idx = Math.max(0, Math.min(ssat.questions.length - 1, ssat.idx + delta));
  renderSsatQuestion();
}
function ssatSubmit() {
  const blanks = ssat.answers.filter(a => a === null).length;
  if (blanks > 0 && !window.confirm(`You have ${blanks} unanswered question${blanks > 1 ? "s" : ""}. They count as 0 (no penalty). Submit the test now?`)) return;
  finishSsat(false);
}
function renderSsatQuestion() {
  const stage = document.getElementById("reviewStage");
  const q = ssat.questions[ssat.idx], n = ssat.questions.length;
  const chosen = ssat.answers[ssat.idx];
  const answered = ssat.answers.filter(a => a !== null).length;
  const last = ssat.idx === n - 1;
  stage.innerHTML = `
    <div class="review-wrap ssat-wrap">
      <div class="ssat-top">
        <div class="ssat-meta"><b>${q.section}</b> · Question ${ssat.idx + 1} of ${n}</div>
        <div class="exam-timer ssat-timer-box" id="ssatTimerBox">${ICON.clock("0.95em")} <span id="ssatTimer">--:--</span></div>
      </div>
      <div class="progress-bar slim"><div class="progress-fill" style="width:${Math.round((ssat.idx / n) * 100)}%"></div></div>
      <div class="quiz-card ssat-q">
        <div class="quiz-prompt-label">${q.section === "Synonyms" ? "Select the word most nearly the same in meaning as:" : "Complete the analogy — pick the word that finishes the pattern:"}</div>
        <div class="ssat-stem ${q.section === "Synonyms" ? "syn" : "ana"}">${q.stem}</div>
        <div class="quiz-options ssat-options">
          ${q.options.map((opt, i) => `<button class="quiz-opt ssat-opt${chosen === opt ? " selected" : ""}" data-i="${i}"><span class="opt-letter">${SSAT_LETTERS[i]}</span><span>${opt}</span></button>`).join("")}
        </div>
        <div class="ssat-nav">
          <button class="btn-ghost sm" id="ssatPrev" ${ssat.idx === 0 ? "disabled" : ""}>← Previous</button>
          <button class="btn-ghost sm" id="ssatNext">${last ? "" : (chosen === null ? "Skip →" : "Next →")}</button>
          <button class="btn-primary sm" id="ssatSubmit">Submit (${answered}/${n})</button>
        </div>
      </div>
      <p class="muted small ssat-foot">Exam conditions: no hints, no feedback until you finish. Wrong answers cost ¼ point; skips are free.</p>
    </div>`;
  if (last) { const nx = document.getElementById("ssatNext"); if (nx) nx.style.visibility = "hidden"; }
  updateSsatTimer();
  stage.querySelectorAll(".ssat-opt").forEach(b => b.addEventListener("click", () => ssatChoose(Number(b.dataset.i))));
  document.getElementById("ssatPrev").addEventListener("click", () => ssatGo(-1));
  const next = document.getElementById("ssatNext"); if (next) next.addEventListener("click", () => ssatGo(1));
  document.getElementById("ssatSubmit").addEventListener("click", ssatSubmit);
}
function finishSsat(timeUp) {
  stopSsatTimer();
  const qs = ssat.questions;
  let correct = 0, wrong = 0, blank = 0, synC = 0, synT = 0, anaC = 0, anaT = 0;
  const review = [];
  qs.forEach((q, i) => {
    const a = ssat.answers[i], isSyn = q.section === "Synonyms";
    if (isSyn) synT++; else anaT++;
    let mark;
    if (a === null) { blank++; mark = "blank"; }
    else if (a.toLowerCase() === q.correct.toLowerCase()) { correct++; if (isSyn) synC++; else anaC++; mark = "right"; }
    else { wrong++; mark = "wrong"; }
    review.push({ q, a, mark });
  });
  const raw = Math.max(0, correct - wrong * 0.25);
  const pct = Math.round((correct / qs.length) * 100);
  const scaled = 440 + Math.round((correct / qs.length) * 270); // rough SSAT-style estimate (440–710)
  const circ = 2 * Math.PI * 54, offset = circ * (1 - correct / qs.length);
  addXp(50); // flat completion reward (a diagnostic — does not change your SRS/learned words)
  save();

  const sectionBar = (label, c, t) => {
    const p = t ? Math.round((c / t) * 100) : 0;
    return `<div class="diff-bar-row"><span class="diff-bar-label2">${label}</span><div class="diff-bar"><div class="diff-bar-fill" style="width:${p}%"></div></div><span class="diff-bar-num">${c}/${t} · ${p}%</span></div>`;
  };
  const reviewRows = review.map((r, i) => `
    <div class="ssat-rev ${r.mark}">
      <span class="srv-n">${i + 1}</span>
      <span class="srv-stem">${r.q.stem}</span>
      <span class="srv-ans">${r.mark === "right" ? ICON.check() : r.mark === "wrong"
        ? `${ICON.cross()} you: <b>${r.a}</b> · ans: <b>${r.q.correct}</b>`
        : `<span class="muted">skipped · ans: <b>${r.q.correct}</b></span>`}</span>
    </div>`).join("");

  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="#b8453a" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${pct}%</div>
        </div>
        <h2>SSAT Verbal — ${timeUp ? "time's up!" : "complete!"}</h2>
        <p class="res-sub">Raw score <b>${raw % 1 ? raw.toFixed(2) : raw}</b> / ${qs.length} &nbsp;•&nbsp; ${correct} right · ${wrong} wrong · ${blank} blank</p>
        <div class="ssat-scaled"><span class="ssat-scaled-num">~${scaled}</span><span class="muted small">estimated scaled score (440–710) · rough guide only</span></div>
        <div class="ssat-sections">${sectionBar("Synonyms", synC, synT)}${sectionBar("Analogies", anaC, anaT)}</div>
        <details class="ssat-review-wrap"><summary>Review all ${qs.length} questions</summary><div class="ssat-review">${reviewRows}</div></details>
        <button class="btn-primary big full" id="ssatRetake">Take another full test →</button>
        <button class="btn-ghost full" id="ssatBack">Back to practice</button>
      </div>
    </div>`;
  document.getElementById("ssatRetake").addEventListener("click", startSsatTest);
  document.getElementById("ssatBack").addEventListener("click", () => { ssat = null; show("practice"); });
}

/* ---------------- ANALOGIES PRACTICE (casual, with feedback) ---------------- */
let apq = null;
const AP_SIZE = 12;
function startAnalogyPractice() {
  const bank = window.ANALOGIES;
  if (!Array.isArray(bank) || bank.length < 4) return;
  const qs = shuffleRandom(bank.slice()).slice(0, AP_SIZE).map(ssatAnalogyFromBank);
  apq = { questions: qs, idx: 0, correct: 0, answers: [], locked: false };
  session = { mode: "analogy", ephemeral: true }; quiz = null;
  enterReviewPane("practice");
  renderAnalogyQ();
}
function renderAnalogyQ() {
  const stage = document.getElementById("reviewStage");
  const q = apq.questions[apq.idx], n = apq.questions.length;
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="review-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((apq.idx / n) * 100)}%"></div></div>
        <div class="progress-label">Analogy ${apq.idx + 1} / ${n}</div>
      </div>
      <div class="quiz-card">
        <div class="quiz-prompt-label">Complete the analogy — pick the word that finishes the pattern:</div>
        <div class="ssat-stem ana">${q.stem}</div>
        <div class="quiz-options ssat-options" id="apOptions">
          ${q.options.map((opt, i) => `<button class="quiz-opt ssat-opt" data-i="${i}"><span class="opt-letter">${SSAT_LETTERS[i]}</span><span>${opt}</span></button>`).join("")}
        </div>
        <div class="quiz-tools">
          <button class="tool-btn" id="apMeaningsBtn">${ICON.book()} Word meanings</button>
        </div>
        <div id="apMeanings" class="ap-meanings" style="display:none;"></div>
        <div class="quiz-feedback" id="apFeedback" style="display:none;"></div>
        <div class="quiz-footer" id="apFooter"></div>
      </div>
    </div>`;
  apq.locked = false;
  stage.querySelectorAll(".ssat-opt").forEach(b => b.addEventListener("click", () => analogyAnswer(Number(b.dataset.i))));
  const mb = document.getElementById("apMeaningsBtn");
  if (mb) mb.addEventListener("click", () => {
    const panel = document.getElementById("apMeanings");
    if (panel.style.display !== "none") { panel.style.display = "none"; mb.classList.remove("active"); return; }
    // Show meanings of every word in play (stem + choices) — definitions only, never the relationship.
    const words = [];
    (q.stemWords || []).forEach(w => words.push(w));
    q.options.forEach(o => words.push(o));
    const seen = {}, rows = [];
    words.forEach(w => {
      const k = w.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      const m = wordMeaning(w);
      rows.push(`<div class="apm-row"><span class="apm-w">${cap(w)}</span><span class="apm-d">${m || "—"}</span></div>`);
    });
    panel.innerHTML = `<p class="apm-note">${ICON.bulb("0.9em")} What the words mean — you still work out the relationship.</p>${rows.join("")}`;
    panel.style.display = ""; mb.classList.add("active");
  });
}
function analogyAnswer(i) {
  if (apq.locked) return;
  apq.locked = true;
  const q = apq.questions[apq.idx];
  const picked = q.options[i];
  const right = picked.toLowerCase() === q.correct.toLowerCase();
  if (right) { apq.correct += 1; addXp(8); }
  apq.answers.push({ stem: q.stem, right, rel: q.rel });
  document.querySelectorAll("#apOptions .ssat-opt").forEach(b => {
    const t = q.options[Number(b.dataset.i)];
    if (t.toLowerCase() === q.correct.toLowerCase()) b.classList.add("correct");
    else if (Number(b.dataset.i) === i) b.classList.add("wrong");
    b.disabled = true;
  });
  const fb = document.getElementById("apFeedback");
  fb.style.display = ""; fb.className = "quiz-feedback " + (right ? "ok" : "no");
  fb.innerHTML = right
    ? `${ICON.check()} Correct — this is a <b>${q.rel}</b> relationship.`
    : `${ICON.cross()} The answer is <b>${q.correct}</b> — a <b>${q.rel}</b> relationship.`;
  document.getElementById("apFooter").innerHTML =
    `<span class="quiz-count">Score: ${apq.correct} / ${apq.idx + 1}</span>
     <button class="btn-primary" id="apNext">${apq.idx + 1 === apq.questions.length ? "See results →" : "Next →"}</button>`;
  document.getElementById("apNext").addEventListener("click", () => {
    if (apq.idx + 1 === apq.questions.length) finishAnalogyPractice();
    else { apq.idx += 1; renderAnalogyQ(); }
  });
}
function finishAnalogyPractice() {
  const total = apq.questions.length, score = apq.correct;
  const circ = 2 * Math.PI * 54, offset = circ * (1 - score / total);
  state.analogiesPracticed = (state.analogiesPracticed || 0) + total;
  addXp(12); save();
  const rows = apq.answers.map(a => `<div class="res-word-row"><span class="rw-word">${a.stem.replace(" : ?", "")}</span><span class="rw-mark">${a.right ? ICON.check() : ICON.cross()}</span></div>`).join("");
  let msg = "Nice analogizing!";
  if (score === total) msg = `Flawless! ${ICON.sparkles()}`;
  else if (score / total >= 0.8) msg = "Sharp pattern-spotting!";
  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="#36608c" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${score}/${total}</div>
        </div>
        <h2>${msg}</h2>
        <p class="res-sub">Analogies train the relationships behind words — a core SSAT verbal skill.</p>
        <div class="res-words"><h4>Analogies</h4>${rows}</div>
        <button class="btn-primary big full" id="apRetake">More analogies →</button>
        <button class="btn-ghost full" id="apBack">Back to practice</button>
      </div>
    </div>`;
  document.getElementById("apRetake").addEventListener("click", startAnalogyPractice);
  document.getElementById("apBack").addEventListener("click", () => { apq = null; show("practice"); });
  session = null;
}

/* Generic results screen for any non-streak test mode. */
function finishTest(mode) {
  stopExamTimer();
  const total = quiz.questions.length, score = quiz.correct;
  const circ = 2 * Math.PI * 54, offset = circ * (1 - (total ? score / total : 0));
  const rows = quiz.answers.map(a =>
    `<div class="res-word-row"><span class="rw-word">${a.word}</span><span class="rw-mark">${a.right ? ICON.check() : ICON.cross()}</span></div>`
  ).join("");
  const elapsed = quiz.startMs ? Math.round((Date.now() - quiz.startMs) / 1000) : null;
  const meta = {
    due:      { h: "Review complete!", sub: "These words are rescheduled for the perfect time to see them again.", back: "practice", color: "#36608c", head: "Reviewed words" },
    casual:   { h: "Nice practice!",   sub: "No pressure, just good reps — your spacing is updated.",            back: "practice", color: "#2fa58f", head: "Words" },
    exam:     { h: "Test finished!",   sub: `You scored ${score}/${total}${elapsed != null ? " in " + elapsed + "s" : ""}. This is just practice — your streak is safe.`, back: "practice", color: "#b8453a", head: "Section words" },
    practice: { h: "Practice done!",   sub: "Your tricky words are now scheduled smarter.",                     back: "progress", color: "#36608c", head: "Practiced words" },
  }[mode] || { h: "Done!", sub: "", back: "practice", color: "#b8453a", head: "Words" };
  let h = meta.h;
  if (total && score === total) h = `Flawless! ${ICON.sparkles()}`;
  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="results-ring">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r="54" fill="none" stroke="#d8cfba" stroke-width="9"/>
            <circle cx="65" cy="65" r="54" fill="none" stroke="${meta.color}" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 65 65)"/>
          </svg>
          <div class="results-score">${score}/${total}</div>
        </div>
        <h2>${h}</h2>
        <p class="res-sub">${meta.sub}</p>
        <div class="res-words"><h4>${meta.head}</h4>${rows}</div>
        <button class="btn-primary big full" id="backBtn">Back</button>
      </div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", () => show(meta.back));
  session = null; quiz = null;
}

/* ---------------- MATCH-UP (casual matching game) ---------------- */
let match = null;
function startMatch() {
  const learned = Object.keys(state.wordStats || {}).map(s => WORDS.find(x => x.word === s)).filter(Boolean);
  const pool = learned.length >= 8 ? learned : WORDS.slice();
  const words = shuffleRandom(pool.slice()).slice(0, 6);
  const chosen = new Set(words.map(w => w.word));
  // Decoy meanings: extra definitions with no matching word, so you can't just
  // memorize the day's set and solve by elimination — you must know the meanings.
  const decoys = shuffleRandom(WORDS.filter(w => !chosen.has(w.word))).slice(0, 3);
  session = { mode: "match", ephemeral: true };
  match = { words, defs: shuffleRandom(words.concat(decoys)), selected: null, matched: {}, errors: 0 };
  enterReviewPane("practice");
  renderMatch();
}
function renderMatch() {
  const stage = document.getElementById("reviewStage");
  const done = Object.keys(match.matched).length, n = match.words.length;
  const left = match.words.map(w =>
    `<button class="match-item match-word${match.matched[w.word] ? " done" : ""}${match.selected === w.word ? " sel" : ""}" data-w="${w.word}" ${match.matched[w.word] ? "disabled" : ""}>${w.word}</button>`).join("");
  const right = match.defs.map(w =>
    `<button class="match-item match-def${match.matched[w.word] ? " done" : ""}" data-d="${w.word}" ${match.matched[w.word] ? "disabled" : ""}>${w.definition}</button>`).join("");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="review-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((done / n) * 100)}%"></div></div>
        <div class="progress-label">Matched ${done} / ${n}</div>
      </div>
      <div class="quiz-card">
        <div class="quiz-prompt-label">Tap a word, then its meaning</div>
        <div class="match-grid"><div class="match-col">${left}</div><div class="match-col">${right}</div></div>
        <div id="matchMsg" class="match-msg"></div>
      </div>
    </div>`;
  stage.querySelectorAll(".match-word").forEach(b => b.addEventListener("click", () => { match.selected = b.dataset.w; renderMatch(); }));
  stage.querySelectorAll(".match-def").forEach(b => b.addEventListener("click", () => matchDef(b.dataset.d, b)));
}
function matchDef(word, btn) {
  const msg = document.getElementById("matchMsg");
  if (!match.selected) { if (msg) msg.textContent = "Pick a word on the left first."; return; }
  if (word === match.selected) {
    match.matched[word] = true;
    recordAnswer(word, true); addXp(8);
    match.selected = null;
    if (Object.keys(match.matched).length === match.words.length) { finishMatch(); return; }
    renderMatch();
  } else {
    match.errors += 1;
    recordAnswer(match.selected, false);
    if (btn) { btn.classList.add("wrong"); setTimeout(() => btn.classList.remove("wrong"), 450); }
    if (msg) msg.textContent = "Not a match — try again!";
    match.selected = null;
    document.querySelectorAll(".match-word.sel").forEach(b => b.classList.remove("sel"));
  }
}
function finishMatch() {
  save();
  const n = match.words.length;
  const stage = document.getElementById("reviewStage");
  stage.innerHTML = `
    <div class="review-wrap">
      <div class="quiz-card results-card">
        <div class="weekly-trophy">${ICON.link("56px")}</div>
        <h2>${match.errors === 0 ? `Perfect match! ${ICON.sparkles()}` : "All matched!"}</h2>
        <p class="res-sub">You matched all ${n} words${match.errors ? ` with ${match.errors} slip-up${match.errors > 1 ? "s" : ""}` : " flawlessly"}. Spacing updated.</p>
        <button class="btn-primary big full" id="backBtn">Back to practice</button>
      </div>
    </div>`;
  document.getElementById("backBtn").addEventListener("click", () => show("practice"));
  session = null; match = null;
}

/* ---------------- PRACTICE HUB ---------------- */
function renderPractice() {
  const body = document.getElementById("practiceBody");
  if (!body) return;
  const due = dueWords().length;
  const cards = [
    { icon: ICON.refresh("30px"), title: "Review Due", color: "blue", desc: due ? `${due} word${due > 1 ? "s" : ""} ready for spaced-repetition review — the Anki way to remember forever.` : "Nothing due right now. Keep studying and words will return here when it's time.", btn: due ? `Review ${due} now` : "All caught up", act: "startDue", disabled: !due },
    { icon: ICON.link("30px"), title: "Match-Up", color: "teal", desc: "Casually match words to their meanings. Quick, low-stakes recall.", btn: "Play Match-Up", act: "startMatch", disabled: false },
    { icon: ICON.bolt("30px"), title: "Quick Quiz", color: "gold", desc: "A relaxed, untimed mix — synonyms, fill-in-the-blank and type-the-word. No streak pressure.", btn: "Start quick quiz", act: "startCasual", disabled: false },
    { icon: ICON.link("30px"), title: "Analogies", color: "teal", desc: "Upper-Level SSAT analogies across many relationship types — antonyms, degree, part:whole, cause:effect and more. With feedback.", btn: "Practice analogies", act: "startAnalogyPractice", disabled: !(Array.isArray(window.ANALOGIES) && window.ANALOGIES.length) },
    { icon: ICON.clock("30px"), title: "Timed Exam", color: "red", desc: "A quick simulation: 10 questions against the clock (SSAT / ISEE / SAT style).", btn: "Begin timed test", act: "startExam", disabled: false },
  ];
  body.innerHTML = `
    <h2 class="progress-h">Practice</h2>
    <p class="muted" style="margin-bottom:16px;">Extra ways to train — none of these touch your daily streak.</p>
    <div class="practice-grid">
      ${cards.map(c => `
        <div class="card practice-card pc-${c.color}">
          <div class="pc-icon">${c.icon}</div>
          <h3>${c.title}</h3>
          <p class="muted">${c.desc}</p>
          <button class="btn-primary full${c.disabled ? " is-disabled" : ""}" data-act="${c.act}" ${c.disabled ? "disabled" : ""}>${c.btn}</button>
        </div>`).join("")}
    </div>

    <div class="card ssat-card">
      <div class="ssat-card-row">
        <div class="pc-icon ssat-badge">${ICON.trophy("32px")}</div>
        <div class="ssat-card-text">
          <h3>Full SSAT Verbal Test ${ICON.bolt("0.9em")}</h3>
          <p class="muted">The real thing: <b>${SSAT_TOTAL} questions in ${SSAT_MINUTES} minutes</b> — ${SSAT_SYN} synonyms + ${SSAT_ANALOGY} analogies, five choices each. Exam conditions: a running clock, no hints or browsing, no feedback until you finish, and the SSAT's <b>−¼-point penalty</b> for wrong answers (skipping is free). Get a scored report at the end.</p>
          <button class="btn-primary" data-act="startSsatTest">Start full test →</button>
        </div>
      </div>
    </div>`;
  const fns = { startDue, startMatch, startCasual, startExam, startSsatTest, startAnalogyPractice };
  body.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => { const f = fns[b.dataset.act]; if (f) f(); }));
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const body = document.getElementById("settingsBody");
  if (!body) return;
  const acct = loadAccounts()[currentUser];
  body.innerHTML = `
    <h2 class="progress-h">Settings</h2>

    <div class="card prog-card">
      <h3>Account</h3>
      <p class="muted">Signed in as <b>@${acct ? acct.username : "you"}</b></p>
      <form id="pwForm" class="set-form">
        <label>Current password<input type="password" id="pwOld" autocomplete="current-password" /></label>
        <label>New password<input type="password" id="pwNew" autocomplete="new-password" /></label>
        <label>Confirm new password<input type="password" id="pwNew2" autocomplete="new-password" /></label>
        <div class="auth-error" id="pwMsg"></div>
        <button class="btn-ghost sm" type="submit">Change password</button>
      </form>
    </div>

    <div class="card prog-card">
      <h3>Fun Mode ${ICON.sparkles("0.9em")}</h3>
      <p class="muted small">Transform the whole app's look. Tap to preview instantly.</p>
      <div class="theme-grid">
        ${THEMES.map(t => `<button class="theme-chip th-${t.id}${currentTheme() === t.id ? " active" : ""}" data-theme-id="${t.id}">
            <span class="theme-swatch"></span>
            <span class="theme-name">${t.name}</span>
            <span class="theme-blurb">${t.blurb}</span>
          </button>`).join("")}
      </div>
      ${THEME_VARIANTS[currentTheme()] ? `
        <div class="term-variants">
          <span class="muted small">Style:</span>
          ${THEME_VARIANTS[currentTheme()].map(v => `<button class="term-chip tv-${v.id}${currentVariant(currentTheme()) === v.id ? " active" : ""}" data-variant-id="${v.id}">${v.name}</button>`).join("")}
        </div>` : ""}
      <label class="set-row toggle-row" style="margin-top:12px;"><span>Seasonal themes ${ICON.snow("1em")} <span class="muted small">— auto-festive near Christmas &amp; New Year</span></span>
        <input type="checkbox" id="setSeasonal" ${seasonalEnabled() ? "checked" : ""} /></label>
    </div>

    <div class="card prog-card">
      <h3>Daily goal</h3>
      <div class="set-row"><span class="muted">New words per day</span>
        <select id="setGoal">${[3, 5, 10, 15, 20].map(g => `<option value="${g}" ${state.goal === g ? "selected" : ""}>${g} words</option>`).join("")}</select>
      </div>
    </div>

    <div class="card prog-card">
      <h3>Mandatory test ${ICON.trophy("0.9em")}</h3>
      <div class="set-row"><span class="muted">Test me on learned words every</span>
        <select id="setTestPeriod">${[3, 5, 7, 10, 14, 30].map(d => `<option value="${d}" ${testPeriodDays() === d ? "selected" : ""}>${d} days</option>`).join("")}</select>
      </div>
      <p class="muted small">A no-hints exam over most of the words you've learned. You must pass it to unlock new daily words.</p>
    </div>

    <div class="card prog-card">
      <h3>Audio</h3>
      <label class="set-row toggle-row"><span>Pronunciation sound ${ICON.speaker("1em")}</span>
        <input type="checkbox" id="setAudio" ${audioOn() ? "checked" : ""} /></label>
      <div class="set-row"><span class="muted">Voice</span>
        <select id="setVoice"><option value="">Auto (best available)</option></select>
      </div>
      <p class="muted small">Tap the speaker beside any word to hear it. If a voice sounds robotic, pick another here.</p>
      <button class="btn-ghost sm" id="testAudio">Test sound</button>
    </div>

    <div class="card prog-card">
      <h3>Vacation</h3>
      <div id="settingsVacationRow" class="vacation-row"></div>
    </div>

    <div class="card prog-card danger-card">
      <h3>Danger zone</h3>
      <p class="muted small">Reset wipes this account's streak, words, XP and stats. This can't be undone.</p>
      <button class="btn-ghost sm danger" id="resetBtn">Reset all progress</button>
    </div>

    <p class="muted small" style="text-align:center;margin-top:6px;">Verbify · smart vocabulary for the SSAT, ISEE, SAT &amp; more</p>`;

  document.getElementById("setGoal").addEventListener("change", e => { state.goal = Number(e.target.value); save(); });
  document.getElementById("setTestPeriod").addEventListener("change", e => { state.settings = state.settings || {}; state.settings.testPeriodDays = Number(e.target.value); save(); });
  document.getElementById("setAudio").addEventListener("change", e => { state.settings = state.settings || {}; state.settings.audio = e.target.checked; save(); });
  document.getElementById("setSeasonal").addEventListener("change", e => { state.settings = state.settings || {}; state.settings.seasonal = e.target.checked; save(); applyTheme(); });
  document.getElementById("testAudio").addEventListener("click", () => speak("Verbify makes vocabulary stick."));
  document.getElementById("resetBtn").addEventListener("click", resetProgress);
  document.getElementById("pwForm").addEventListener("submit", changePassword);
  document.querySelectorAll(".theme-chip").forEach(b => b.addEventListener("click", () => {
    state.settings = state.settings || {};
    state.settings.theme = b.dataset.themeId;
    save();
    applyTheme();
    renderSettings(); // re-render so Terminal's style sub-options show/hide
  }));
  document.querySelectorAll(".term-chip").forEach(b => b.addEventListener("click", () => {
    state.settings = state.settings || {};
    state.settings.variants = state.settings.variants || {};
    state.settings.variants[currentTheme()] = b.dataset.variantId;
    save();
    applyTheme();
    document.querySelectorAll(".term-chip").forEach(c => c.classList.toggle("active", c === b));
  }));
  populateVoiceSelect();
  document.getElementById("setVoice").addEventListener("change", e => {
    state.settings = state.settings || {};
    state.settings.voice = e.target.value || null;
    save();
    speak("Verbify");
  });
  renderVacationInto("settingsVacationRow");
}

function populateVoiceSelect() {
  const sel = document.getElementById("setVoice");
  if (!sel) return;
  const chosen = (state.settings && state.settings.voice) || "";
  const en = getEnglishVoices();
  sel.innerHTML = `<option value="">Auto (best available)</option>` +
    en.map(v => `<option value="${escapeHtml(v.name)}" ${v.name === chosen ? "selected" : ""}>${escapeHtml(v.name)}${/en[-_]GB/i.test(v.lang) ? " (UK)" : /en[-_]AU/i.test(v.lang) ? " (AU)" : ""}</option>`).join("");
}

async function changePassword(e) {
  e.preventDefault();
  const msg = document.getElementById("pwMsg");
  msg.className = "auth-error";
  const oldp = document.getElementById("pwOld").value, np = document.getElementById("pwNew").value, np2 = document.getElementById("pwNew2").value;
  const accounts = loadAccounts(), acct = accounts[currentUser];
  if (!acct) { msg.textContent = "No account found."; return; }
  if (await hashPassword(oldp, acct.salt) !== acct.hash) { msg.textContent = "Current password is incorrect."; return; }
  if (np.length < 4) { msg.textContent = "New password must be at least 4 characters."; return; }
  if (np !== np2) { msg.textContent = "New passwords don't match."; return; }
  const salt = randSalt();
  acct.salt = salt; acct.hash = await hashPassword(np, salt);
  accounts[currentUser] = acct; saveAccounts(accounts);
  msg.className = "auth-error ok"; msg.textContent = "Password updated.";
  document.getElementById("pwForm").reset();
}

function resetProgress() {
  if (!window.confirm("Reset ALL progress for this account? This cannot be undone.")) return;
  const keepGoal = state.goal;
  const keepSettings = state.settings; // appearance/audio are preferences, not "progress"
  state = defaultState();
  state.onboarded = true;
  state.goal = keepGoal;
  state.settings = keepSettings;
  state.lastWeeklyWeek = weekIndex(today());
  save();
  applyTheme();   // keep the DOM theme in sync with the preserved settings
  show("home");
}

/* ============================================================
   PROGRESS + ACHIEVEMENTS
   ============================================================ */
function masteredCount() { return Object.keys(state.wordStats || {}).filter(w => isMastered(w)).length; }
function seenCount() { return Object.keys(state.wordStats || {}).length; }
function overallAccuracy() {
  let c = 0, s = 0;
  for (const w in (state.wordStats || {})) { c += state.wordStats[w].correct; s += state.wordStats[w].seen; }
  return s ? Math.round((c / s) * 100) : null;
}
/* Tiered achievements: each has Bronze/Silver/Gold thresholds + points. */
const TIER_NAMES = ["Bronze", "Silver", "Gold"];
const TIER_PTS = [10, 25, 50];
const ACHIEVEMENTS = [
  { icon: ICON.book(),     name: "Word Collector", unit: "learned",   metric: () => state.learnedCount,                tiers: [50, 150, 300] },
  { icon: ICON.brain(),    name: "Memory Master",  unit: "mastered",  metric: () => Math.max(state.bestMastered || 0, masteredCount()),   tiers: [25, 100, 250] },
  { icon: ICON.flame(),    name: "Streak Keeper",  unit: "day streak",metric: () => state.longest,                     tiers: [7, 30, 100] },
  { icon: ICON.star(),     name: "Ascendant",      unit: "level",     metric: () => levelFromXp(state.xp || 0).level,  tiers: [5, 15, 30] },
  { icon: ICON.gem(),      name: "XP Hoarder",     unit: "XP",        metric: () => state.xp || 0,                     tiers: [1000, 5000, 20000] },
  { icon: ICON.trophy(),   name: "Weekly Warrior", unit: "weeklies",  metric: () => state.weeklyBadges || 0,           tiers: [4, 12, 26] },
  { icon: ICON.crown(),    name: "Skill Climber",  unit: "tier",      metric: () => Math.max(state.bestSkillLevel || 0, skillLevel()),    tiers: [3, 5, 8] },
  { icon: ICON.target(),   name: "Sharpshooter",   unit: "best quiz%",metric: () => bestQuizPct(),                     tiers: [80, 90, 100] },
  { icon: ICON.calendar(), name: "Dedicated",      unit: "study days",metric: () => studyDays(),                       tiers: [10, 30, 75] },
  { icon: ICON.bolt(),     name: "Marathoner",     unit: "reviews",   metric: () => totalReviews(),                    tiers: [100, 500, 2000] },
  { icon: ICON.sparkles(), name: "Perfectionist",  unit: "100% quizzes", metric: () => (state.quizHistory || []).filter(h => h.total && h.correct === h.total).length, tiers: [1, 5, 20] },
  { icon: ICON.check(),    name: "Accuracy Ace",   unit: "% accuracy",metric: () => overallAccuracy() || 0,            tiers: [70, 85, 95] },
  { icon: ICON.gem(),      name: "Vocab Vault",    unit: "words met",  metric: () => (state.presentedWords || []).length, tiers: [100, 500, 1500] },
  { icon: ICON.link(),     name: "Analogist",      unit: "analogies", metric: () => state.analogiesPracticed || 0,     tiers: [12, 60, 200] },
  { icon: ICON.calendar(), name: "Door Opener",    unit: "doors",     metric: () => { const a = state.advent; return a ? (a.round || 0) * ADVENT_SIZE + (a.openedCount || 0) : 0; }, tiers: [5, 24, 72] },
  { icon: ICON.star(),     name: "Sticker Hunter", unit: "stickers",  metric: () => (state.advent && state.advent.stickers ? state.advent.stickers.length : 0), tiers: [3, 8, 12] },
  { icon: ICON.snow(),     name: "Frost Guard",    unit: "checkpoints",metric: () => (state.earnedCheckpoints || []).length, tiers: [1, 3, 6] },
];
function achState(a) {
  const v = a.metric();
  let reached = 0;
  for (let i = 0; i < a.tiers.length; i++) if (v >= a.tiers[i]) reached = i + 1;
  const pts = TIER_PTS.slice(0, reached).reduce((s, x) => s + x, 0);
  return { v, reached, pts, next: reached < a.tiers.length ? a.tiers[reached] : null };
}
function achievementPoints() { return ACHIEVEMENTS.reduce((s, a) => s + achState(a).pts, 0); }

function dowOf(dk) { const [y, m, d] = dk.split("-").map(Number); return new Date(y, m - 1, d).getDay(); }
function hmClass(dk) {
  if (daysBetween(today(), dk) > 0) return "hm-future";
  if (state.history[dk] === "frozen") return "hm-frozen";
  const c = (state.dailyActivity && state.dailyActivity[dk]) || (state.history[dk] === "done" ? 1 : 0);
  if (!c) return "hm0";
  if (c < 3) return "hm1"; if (c < 6) return "hm2"; if (c < 10) return "hm3"; return "hm4";
}

function renderProgress() {
  const body = document.getElementById("progressBody");
  if (!body) return;

  // --- Lifetime level + XP ---
  const lv = levelFromXp(state.xp || 0);
  const lvPct = Math.round((lv.into / lv.need) * 100);

  // --- Skill tier + next-tier progress ---
  const tier = skillTier(), nt = nextTier();
  const tierPct = nt ? Math.max(0, Math.min(100, Math.round(((state.streak - tier.min) / (nt.min - tier.min)) * 100))) : 100;
  const tierDots = SKILL_TIERS.map(t => `<span class="lvl-dot${t.level <= tier.level ? " on" : ""}"></span>`).join("");

  // --- Lifetime stats ---
  const acc = overallAccuracy();
  const stats = [
    { num: state.learnedCount, label: "Words learned" },
    { num: masteredCount(), label: `Mastered ${ICON.brain("0.95em")}` },
    { num: acc == null ? "—" : acc + "%", label: "Accuracy" },
    { num: totalReviews(), label: "Total reviews" },
    { num: studyDays(), label: "Study days" },
    { num: achievementPoints(), label: "Achievement pts" },
  ];

  // --- Personal records ---
  const rec = state.records || {};
  const records = [
    { n: state.longest || 0, l: `Longest streak ${ICON.flame("0.9em")}` },
    { n: bestQuizPct() + "%", l: "Best quiz" },
    { n: rec.mostWordsDay || 0, l: "Most words / day" },
    { n: rec.fastestMs ? Math.round(rec.fastestMs / 1000) + "s" : "—", l: "Fastest quiz" },
  ];

  // --- Review forecast (next 7 days) ---
  const statWords = Object.keys(state.wordStats || {}).filter(w => state.wordStats[w].due && WORDS.some(x => x.word === w));
  const fc = [];
  for (let i = 0; i < 7; i++) {
    const dk = addDays(today(), i);
    const count = statWords.filter(w => { const s = state.wordStats[w]; return i === 0 ? daysBetween(s.due, dk) >= 0 : s.due === dk; }).length;
    fc.push({ dk, i, count });
  }
  const fcMax = Math.max(1, ...fc.map(f => f.count));
  const dn = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const fcHtml = fc.map(f => {
    const h = 6 + Math.round((f.count / fcMax) * 46);
    return `<div class="fc-col"><div class="fc-num">${f.count}</div><div class="fc-bar" style="height:${h}px" title="${f.count} due"></div><div class="fc-lbl">${f.i === 0 ? "Now" : dn[dowOf(f.dk)]}</div></div>`;
  }).join("");

  // --- Activity heatmap (last ~18 weeks) ---
  let start = addDays(today(), -(18 * 7 - 1));
  start = addDays(start, -dowOf(start)); // align column start to Sunday
  const cells = [];
  let dk = start, guard = 0;
  while (guard < 400) {
    cells.push(dk);
    if (daysBetween(today(), dk) >= 0 && dowOf(dk) === 6) { /* keep going */ }
    if (daysBetween(dk, today()) <= 0 && dowOf(dk) === 6) break; // stop at end of current week
    dk = addDays(dk, 1); guard++;
  }
  const heatHtml = cells.map(d => `<span class="hm ${hmClass(d)}" title="${d}: ${(state.dailyActivity && state.dailyActivity[d]) || (state.history[d] === "done" ? "studied" : state.history[d] === "frozen" ? "freezer" : 0)}"></span>`).join("");

  // --- Mastery by difficulty ---
  const diffBars = [1, 2, 3, 4, 5].map(d => {
    const totalAt = WORDS.filter(w => wordDifficulty(w.word) === d).length;
    const seenAt = Object.keys(state.wordStats || {}).filter(w => wordDifficulty(w) === d).length;
    const masteredAt = Object.keys(state.wordStats || {}).filter(w => wordDifficulty(w) === d && isMastered(w)).length;
    const pct = totalAt ? Math.round((seenAt / totalAt) * 100) : 0;
    return `<div class="diff-bar-row"><span class="diff-bar-label" title="Difficulty ${d}/5">${diffName(d)}</span><div class="diff-bar"><div class="diff-bar-fill" style="width:${pct}%"></div></div><span class="diff-bar-num">${seenAt}/${totalAt} · ${masteredAt}${ICON.brain("0.85em")}</span></div>`;
  }).join("");

  // --- Accuracy by question type ---
  const typeMeta = [["synonym", "Synonym"], ["cloze", "Fill-in-blank"], ["defToWord", "Def → word"], ["recall", "Type recall"]];
  const typeHtml = typeMeta.map(([k, name]) => {
    const ts = state.typeStats[k]; const pct = ts && ts.s ? Math.round((ts.c / ts.s) * 100) : null;
    return `<div class="diff-bar-row"><span class="diff-bar-label2">${name}</span><div class="diff-bar"><div class="diff-bar-fill" style="width:${pct || 0}%"></div></div><span class="diff-bar-num">${pct == null ? "—" : pct + "% (" + ts.c + "/" + ts.s + ")"}</span></div>`;
  }).join("");

  // --- Strength by root family ---
  const rootAgg = {};
  for (const w in (state.wordStats || {})) {
    const wo = WORDS.find(x => x.word === w); if (!wo) continue;
    (wo.roots || []).forEach(rk => { if (!ROOTS[rk]) return; const a = rootAgg[rk] || { c: 0, s: 0 }; a.c += state.wordStats[w].correct; a.s += state.wordStats[w].seen; rootAgg[rk] = a; });
  }
  const topRoots = Object.keys(rootAgg).filter(rk => rootAgg[rk].s >= 2).sort((a, b) => rootAgg[b].s - rootAgg[a].s).slice(0, 8);
  const rootHtml = topRoots.length
    ? topRoots.map(rk => { const a = rootAgg[rk]; const pct = Math.round((a.c / a.s) * 100); return `<div class="diff-bar-row"><span class="diff-bar-label2"><b>${ROOTS[rk].root}</b> <span class="muted">${ROOTS[rk].meaning}</span></span><div class="diff-bar"><div class="diff-bar-fill" style="width:${pct}%"></div></div><span class="diff-bar-num">${pct}%</span></div>`; }).join("")
    : `<p class="muted">Study more words to reveal your strongest roots.</p>`;

  // --- Mastery over time (curve) + recent accuracy ---
  const mh = state.masteryHistory || [];
  let curveHtml;
  if (mh.length >= 2) {
    const maxM = Math.max(1, ...mh.map(p => p.mastered)); const W = 320, H = 56, n = mh.length;
    const pts = mh.map((p, i) => `${(i / (n - 1) * W).toFixed(1)},${(H - (p.mastered / maxM) * (H - 6) - 3).toFixed(1)}`).join(" ");
    curveHtml = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="curve"><polyline points="${pts}" fill="none" stroke="#3a8a4f" stroke-width="3"/></svg>`;
  } else curveHtml = `<span class="muted">Your mastery curve will grow as you study.</span>`;
  const recent = (state.quizHistory || []).slice(-14);
  const trend = recent.length
    ? recent.map(h => { const p = h.total ? h.correct / h.total : 0; return `<span class="spark" style="height:${6 + Math.round(p * 34)}px" title="${h.correct}/${h.total} on ${h.date}"></span>`; }).join("")
    : `<span class="muted">Complete a quiz to start your trend.</span>`;

  // --- Tricky words ---
  const tricky = trickyWords(12);
  const trickyHtml = tricky.length
    ? `<div class="tricky-list">${tricky.map(w => { const a = wordAccuracy(w); const pct = a == null ? "" : Math.round(a * 100) + "%"; return `<div class="tricky-item"><span class="rw-word">${w}</span><span class="muted">${pct}</span></div>`; }).join("")}</div>
       <button class="btn-primary" id="practiceBtn">Practice these (${Math.min(10, tricky.length)}) →</button>`
    : `<p class="muted">No tricky words yet — miss a few in quizzes and they'll appear here for targeted practice.</p>`;

  // --- Achievements (tiered) ---
  const achHtml = ACHIEVEMENTS.map(a => {
    const st = achState(a);
    const label = st.reached > 0 ? TIER_NAMES[st.reached - 1] : "Locked";
    const sub = st.next != null ? `${st.v}/${st.next} ${a.unit}` : `MAX · ${st.v} ${a.unit}`;
    return `<div class="ach ${st.reached ? "earned t" + st.reached : "locked"}" title="${a.name}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-title">${a.name}</div>
        <div class="ach-tier">${label}</div>
        <div class="ach-desc">${sub}</div>
      </div>`;
  }).join("");

  body.innerHTML = `
    <h2 class="progress-h">Your Progress</h2>

    <div class="card prog-hero">
      <pre id="donutCanvas" class="donut-canvas" aria-hidden="true"></pre>
      <div class="prog-hero-text">
        <div class="prog-hero-kicker"><span>Verbify in motion</span><button class="hero-shuffle" id="asciiShuffle" title="Shuffle the animation" aria-label="Shuffle the animation">${ICON.refresh("1em")}</button></div>
        <div class="prog-hero-big">Lv ${lv.level}</div>
        <div class="prog-hero-sub">${state.xp || 0} XP &nbsp;•&nbsp; ${masteredCount()} mastered ${ICON.brain("0.9em")} &nbsp;•&nbsp; ${state.streak}-day streak ${ICON.flame("0.9em")}</div>
        <div class="xp-bar slim" style="margin-top:10px;max-width:280px;"><div class="xp-fill" style="width:${lvPct}%"></div></div>
      </div>
    </div>

    <div class="card level-card">
      <div class="level-top">
        <div class="level-big">Lv ${lv.level}</div>
        <div class="level-meta">
          <div class="level-name">Lifetime Level</div>
          <div class="level-xp">${state.xp || 0} XP total · ${lv.into}/${lv.need} to Lv ${lv.level + 1}</div>
        </div>
      </div>
      <div class="xp-bar"><div class="xp-fill" style="width:${lvPct}%"></div></div>
    </div>

    <div class="card prog-card">
      <h3>Skill tier: <span class="skill-name">${tier.name}</span></h3>
      <div class="skill-dots" style="margin:6px 0;">${tierDots}</div>
      ${nt ? `<div class="tier-bar"><div class="tier-fill" style="width:${tierPct}%"></div></div>
              <p class="muted small">${nt.min - state.streak > 0 ? (nt.min - state.streak) + "-day streak to reach " + nt.name : "Ready to reach " + nt.name + "!"} · now serving <b>${diffRangeLabel(difficultyWindow(tier.level).lo, difficultyWindow(tier.level).hi)}</b> words</p>`
            : `<p class="muted small">Top tier reached — Luminary! Serving <b>Elite</b> words.</p>`}
      <p class="muted small" style="margin-top:8px;">Difficulty scale: ${[1,2,3,4,5].map(d => `<span class="diff-key d${d}">${diffName(d)}</span>`).join(" ")}</p>
    </div>

    <div class="prog-stats six">
      ${stats.map(s => `<div class="stat"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>`).join("")}
    </div>

    <div class="card prog-card">
      <h3>Personal records</h3>
      <div class="rec-grid">${records.map(r => `<div class="rec"><div class="rec-num">${r.n}</div><div class="rec-label">${r.l}</div></div>`).join("")}</div>
    </div>

    <div class="card prog-card">
      <h3>Review forecast</h3>
      <p class="muted small">Words scheduled to come back, by day.</p>
      <div class="fc-chart">${fcHtml}</div>
    </div>

    <div class="card prog-card">
      <h3>Activity</h3>
      <div class="heatmap">${heatHtml}</div>
      <div class="hm-legend"><span class="muted small">Less</span><span class="hm hm0"></span><span class="hm hm1"></span><span class="hm hm2"></span><span class="hm hm3"></span><span class="hm hm4"></span><span class="muted small">More</span></div>
    </div>

    <div class="card prog-card">
      <h3>Mastery over time</h3>
      <div class="curve-wrap">${curveHtml}</div>
      <h3 style="margin-top:14px;">Recent quiz accuracy</h3>
      <div class="spark-row">${trend}</div>
    </div>

    <div class="card prog-card">
      <h3>Mastery by difficulty</h3>
      ${diffBars}
    </div>

    <div class="card prog-card">
      <h3>Accuracy by question type</h3>
      ${typeHtml}
    </div>

    <div class="card prog-card">
      <h3>Strongest roots</h3>
      ${rootHtml}
    </div>

    <div class="card prog-card">
      <h3>Words you struggle with</h3>
      ${trickyHtml}
    </div>

    <div class="card prog-card">
      <h3>Achievements <span class="muted small">(${achievementPoints()} pts)</span></h3>
      <div class="ach-grid">${achHtml}</div>
    </div>`;

  const pb = document.getElementById("practiceBtn");
  if (pb) pb.addEventListener("click", startPractice);

  // Spin up a RANDOM ASCII animation (black & white, theme ink). Taller canvas gives
  // the word-character pairs room to spread out.
  if (window.Ascii) {
    const ADIM = { width: 46, height: 28 };
    const dc = document.getElementById("donutCanvas");
    if (dc) Ascii.random(dc, ADIM);
    const shuffle = document.getElementById("asciiShuffle");
    if (shuffle && dc) shuffle.addEventListener("click", () => {
      const cur = dc.__asciiState && dc.__asciiState.name;
      const names = Ascii.names || [];
      let name = cur;
      for (let i = 0; i < 8 && (name === cur) && names.length > 1; i++) name = names[Math.floor(Math.random() * names.length)];
      Ascii.start(dc, name || "donut", ADIM);
      toast(`${ICON.refresh("0.95em")} ${name}`);
    });
  }
}

/* ============================================================
   DICTIONARY
   ============================================================ */
let dictMode = "words";
function renderDictionary() {
  const q = document.getElementById("dictSearch").value.trim().toLowerCase();
  const body = document.getElementById("dictBody");

  // Live database totals — track progress at a glance (words, analogies, roots).
  const statsEl = document.getElementById("dictStats");
  if (statsEl) {
    const nWords = WORDS.length;
    const nAna = (window.ANALOGIES || []).length;
    const rseen = new Set();
    Object.values(ROOTS).forEach(r => rseen.add(r.root + "|" + r.meaning));
    statsEl.innerHTML =
      `<span class="dstat"><b>${nWords.toLocaleString()}</b> words</span>` +
      `<span class="dstat"><b>${nAna.toLocaleString()}</b> analogies</span>` +
      `<span class="dstat"><b>${rseen.size.toLocaleString()}</b> roots &amp; affixes</span>`;
  }

  // Encourage root study — the highest-leverage way to grow vocabulary.
  const rootsCta = dictMode === "words"
    ? `<div class="roots-cta">
         <div class="rc-text">${ICON.link("1.3em")} <b>Learn the roots — unlock hundreds of words.</b> Most of these words are built from a handful of Greek &amp; Latin roots. Master a root and you can decode words you've never seen on a test.</div>
         <button class="btn-primary sm" id="gotoRoots">Explore roots →</button>
       </div>`
    : `<div class="roots-cta">
         <div class="rc-text">${ICON.bulb("1.3em")} <b>Roots are your vocabulary superpower.</b> Each root below appears in many words — study a few each day and watch your word count snowball.</div>
       </div>`;

  if (dictMode === "words") {
    const list = WORDS
      .filter(w =>
        !q || w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q) ||
        w.synonyms.some(s => s.toLowerCase().includes(q)) ||
        w.roots.some(rk => (ROOTS[rk] && (ROOTS[rk].root.includes(q) || ROOTS[rk].meaning.includes(q)))))
      .sort((a, b) => a.word.localeCompare(b.word));
    body.innerHTML = rootsCta + `<div class="dict-count">${list.length} word${list.length === 1 ? "" : "s"}</div>` +
      list.map(w => {
        const roots = w.roots.map(rk => ROOTS[rk] ? `<span class="de-root-tag">${ROOTS[rk].root} — ${ROOTS[rk].meaning}</span>` : "").join("");
        const st = statOf(w.word);
        let progress = "";
        if (st) {
          const boxPips = [1, 2, 3, 4, 5].map(i => `<span class="dpip${i <= st.box ? " on" : ""}"></span>`).join("");
          const a = st.seen ? Math.round((st.correct / st.seen) * 100) : 0;
          progress = `<div class="de-line de-progress"><span class="de-key">Your progress</span>
            <span class="de-box" title="Memory box ${st.box}/5">${boxPips}</span>
            ${a}% (${st.correct}/${st.seen}) · ${isMastered(w.word) ? "mastered " + ICON.brain("0.9em") : "next review " + st.due}</div>`;
        }
        return `<div class="dict-entry">
          <div class="de-top"><span class="de-word">${w.word}</span>${sayBtn(w.word)}<span class="de-pos">${w.pos}</span><span class="de-diff">${diffBadge(w.word)}</span></div>
          <div class="de-def">${w.definition}</div>
          <div class="de-meta">
            <div class="de-line"><span class="de-key">Synonyms</span>${w.synonyms.join(", ")}</div>
            <div class="de-line"><span class="de-key">Example</span><em>"${w.example}"</em></div>
            <div class="de-line"><span class="de-key">Roots</span><div class="de-roots-inline">${roots}</div></div>
            <div class="de-line"><span class="de-key">Formation</span>${w.formation}</div>
            ${progress}
          </div>
        </div>`;
      }).join("");
  } else {
    // unique roots (some keys map to same display root, e.g. greg/greg2)
    const seen = new Set();
    const list = Object.values(ROOTS).filter(r => {
      const k = r.root + "|" + r.meaning;
      if (seen.has(k)) return false; seen.add(k); return true;
    }).filter(r =>
      !q || r.root.includes(q) || r.meaning.toLowerCase().includes(q) ||
      r.origin.toLowerCase().includes(q) || (r.examples || []).some(e => e.toLowerCase().includes(q)))
      .sort((a, b) => a.root.localeCompare(b.root));
    body.innerHTML = rootsCta + `<div class="dict-count">${list.length} root${list.length === 1 ? "" : "s"} &amp; affixes</div>` +
      list.map(r => `<div class="root-entry">
        <div class="re-top"><span class="re-root">${r.root}</span><span class="re-origin">${r.origin}</span></div>
        <div class="re-meaning">${r.meaning}</div>
        <div class="re-examples">${(r.examples || []).map(e => `<span class="re-ex">${e}</span>`).join("")}</div>
      </div>`).join("");
  }

  const gotoRoots = document.getElementById("gotoRoots");
  if (gotoRoots) gotoRoots.addEventListener("click", () => {
    dictMode = "roots";
    document.querySelectorAll(".dtoggle").forEach(x => x.classList.toggle("active", x.dataset.dict === "roots"));
    renderDictionary();
  });
}

/* ============================================================
   HELPERS + WIRING
   ============================================================ */
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function wire() {
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => show(t.dataset.view)));

  // Secret trigger: tap the logo to peek at the hidden seasonal themes (festive particle FX included).
  let secretIdx = 0;
  const secretCycle = [null, "winterfest", "newyear"];
  const logo = document.querySelector(".topbar .logo-mark");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.title = "✨";
    logo.addEventListener("click", () => {
      secretIdx = (secretIdx + 1) % secretCycle.length;
      const themeName = secretCycle[secretIdx];
      if (themeName) {
        applyTheme(themeName);
        toast(themeName === "winterfest"
          ? `${ICON.snow("1em")} Secret: <b>Winterfest</b>`
          : `${ICON.sparkles("1em")} Secret: <b>New Year</b>`);
      } else { applyTheme(); toast("Back to your theme"); }
    });
  }
  // Soft spotlight that follows the cursor (interactive ambient glow).
  const glow = document.createElement("div");
  glow.id = "cursorGlow";
  document.body.appendChild(glow);
  let gx = 0, gy = 0, gQueued = false;
  window.addEventListener("mousemove", (e) => {
    gx = e.clientX; gy = e.clientY;
    glow.classList.add("on");
    if (!gQueued) {
      gQueued = true;
      requestAnimationFrame(() => { glow.style.left = gx + "px"; glow.style.top = gy + "px"; gQueued = false; });
    }
  });
  window.addEventListener("mouseleave", () => glow.classList.remove("on"));

  document.getElementById("startReviewBtn").addEventListener("click", () => show("review"));
  document.getElementById("goalSelect").addEventListener("change", (e) => {
    state.goal = Number(e.target.value); save(); renderHome();
  });
  document.getElementById("calPrev").addEventListener("click", () => { calMonth.m--; if (calMonth.m < 0) { calMonth.m = 11; calMonth.y--; } renderCalendar(); });
  document.getElementById("calNext").addEventListener("click", () => { calMonth.m++; if (calMonth.m > 11) { calMonth.m = 0; calMonth.y++; } renderCalendar(); });

  document.querySelectorAll(".dtoggle").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".dtoggle").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    dictMode = b.dataset.dict;
    renderDictionary();
  }));
  document.getElementById("dictSearch").addEventListener("input", renderDictionary);

  // Audio: any element with data-say speaks its word (works across all views).
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-say]");
    if (b) { e.preventDefault(); speak(b.getAttribute("data-say")); }
  });
  // Settings gear in the top bar.
  const gear = document.getElementById("settingsBtn");
  if (gear) gear.addEventListener("click", () => show("settings"));

  // Keyboard navigation for the review/quiz pane (accessibility + speed).
  document.addEventListener("keydown", (e) => {
    if (!document.querySelector("#view-review.active")) return;
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    // 1-4 to pick a quiz option (before answering)
    if (!typing && ["1", "2", "3", "4"].includes(e.key)) {
      const opts = document.querySelectorAll(".quiz-opt:not(.locked)");
      const i = Number(e.key) - 1;
      if (opts[i]) { e.preventDefault(); opts[i].click(); }
      return;
    }
    // Enter advances: next question / begin / reveal / next card / continue
    if (e.key === "Enter" && !typing) {
      const btn = document.getElementById("nextQ") || document.getElementById("beginQuiz")
        || document.getElementById("nextCard") || document.getElementById("revealBtn");
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
    // Space flips/advances a flashcard
    if (e.key === " " && !typing) {
      const b = document.getElementById("revealBtn") || document.getElementById("nextCard");
      if (b) { e.preventDefault(); b.click(); }
    }
  });
}

/* ============================================================
   BOOT
   ============================================================ */
setupOnboarding();   // attach goal-picker + start listeners once
wire();              // attach app (tabs, calendar, dictionary) listeners once
wireAuth();          // attach auth + logout listeners once
if (window.fillIcons) fillIcons(); // render data-icon spans in the static markup
warmVoices();        // start loading speech voices
applyTheme("notebook"); // default look until a logged-in user's theme loads

(function boot() {
  const sess = getSession();
  const accounts = loadAccounts();
  if (sess && accounts[sess]) {
    currentUser = sess;
    enterApp();
  } else {
    setSession(null);
    currentUser = null;
    showAuth();
  }
})();

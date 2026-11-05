# Hybrid Multilingual System — Phase Report

**Supported languages:** `en` English · `hi` Hindi · `or` Odia · `bn` Bengali
**Architecture:** prebuilt, human-reviewed UI strings + a multilingual AI pipeline for dynamic text.

---

## Phase 1 — Audit of what already existed

Both capabilities were partly present. The work below extends them; it does not
replace them.

### CenAGRI AI (`frontend/`)

| Area | Found | Decision |
|---|---|---|
| Translations | `src/i18n/locales/{en,hi,bn,or,ta,te,mr,gu,kn,ml,pa,as,ur}.ts` — one flat dictionary per language, not i18next namespaces | **Kept.** 466 English keys, 436 in hi/or/bn, lazy `import()` per language with an in-memory cache and English fallback. Keyed by the English master list, so a typo fails the TypeScript build. |
| Language switch | `src/i18n/LanguageContext.tsx` + `LanguageSwitcher.tsx` | Extended (see Phase 3), not duplicated. |
| Persistence | localStorage only | Was device-only. Fixed — now saved to the account. |
| Capability matrix | None | Added. This was the real gap. |
| Provider code mapping | None | Added (`od-IN` now lives in one place). |

### CenAGRI AI (`backend/`)

| Area | Found | Decision |
|---|---|---|
| `advisory.py` | Single LLM call, language passed as a display name | **Left as-is.** It still works and is not part of the chat path. |
| Multilingual pipeline | Absent | Bridged to the assistant service (Phase 4). |
| Translation providers | Absent | Added (Phase 5). |

### Multi Model AI Assistant (separate repo)

| Module | Found | Reused? |
|---|---|---|
| `core/language_detector.py` | Script + function-word scoring, romanized Hindi, code-mix understanding, confidence | **Yes — untouched.** |
| `core/multilingual_model.py` | Language-aware prompt/answer matching | **Yes — untouched.** |
| `core/pipeline.py` | detect → intent → context → retrieve → generate → validate, with the response language pinned | **Yes — untouched.** |
| `core/agriculture/embeddings.py` | BGE-M3 for KB, MiniLM legacy, dimension check | **Yes — untouched.** |
| `api/routes/chat.py` | `POST /api/chat`, `POST /api/conversations` | **Yes — called as-is.** |
| `api/schemas/chat.py` | `ChatRequest` already carries `detected_language`, `response_language`, `context` | **Yes — matches the requested shape.** |

**Nothing was re-implemented.** CenAGRI owns no language detection and no
multilingual model; both stay in the assistant, which is the single source.

---

## Phase 2 — Capability matrix and provider codes

**Created**

- `frontend/src/i18n/capabilities.ts` — one row per language for `ui`, `chat`,
  `translation`, `stt`, `tts`, `ocr`, `retrieval`; `SUPPORTED_LANGUAGE_CODES`,
  `supportsAi`, `isFullySupported`, `missingCapabilities`; and `PROVIDER_CODES`
  with `toProviderCode` / `fromProviderCode`.
- `backend/app/core/languages.py` — the same table server-side, plus
  `normalize()` (accepts `hi`, `HI`, `hi-IN`, `bn_IN`, `od-IN` → `or`),
  `to_provider()` and `matrix()`.

**Rules enforced**

- A feature is offered only if the matrix says so. Voice and OCR are `false`
  for every language until a provider is wired and tested per language — chat
  support is never used as evidence for voice support.
- `od-IN` appears in exactly one dictionary per side. No route, prompt, cache
  key or React component builds a provider tag.
- Out-of-range languages are listed but honest: "AI only · menu in English".

---

## Phase 3 — Prebuilt UI localization + account preference

**Modified**

- `frontend/src/i18n/LanguageContext.tsx` — restores the account's saved
  language after the profile loads; `setLang` now saves it.
- `frontend/src/pages/farmer/LanguagePage.tsx` — renders the shared selector
  and shows capability badges instead of a second, contradicting list.

**Created**

- `frontend/src/i18n/preference.ts` — the only module that writes the
  preference (`loadPreferredLanguage`, `savePreferredLanguage`,
  `initialLanguage`, `writeLocalLanguage`).
- `frontend/src/i18n/LanguageSelector.tsx` — `LanguageSelector`,
  `LanguagePills`, `AiLanguageBadge`.
- `database/supabase/schema.sql` — `preferred_language text` with a CHECK on
  `('en','hi','or','bn')`, added idempotently, plus a guarded constraint.

**Resolution order**

1. `profiles.preferred_language` — follows the user across devices.
2. `localStorage` — avoids an English flash before the profile loads.
3. Browser detection — **only** when no choice has ever been saved.

A saved choice is never overwritten by browser detection on login, and a
missing column degrades to the device choice instead of erroring.

---

## Phase 4 — AI multilingual chat bridge

**Created**

- `backend/app/services/ai_bridge.py` — `create_conversation`, `ask`,
  `ask_blocking` (thread-offloaded, so a long answer cannot stall the dashboard
  endpoints), `health`. Typed errors: `AssistantUnavailable` → 503,
  `AssistantRejected` → 502.
- `backend/app/api/v1/ai.py` — `POST /ai/chat`, `POST /ai/translate`,
  `GET /ai/languages`, `GET /ai/health`, with Pydantic request/response models
  and a per-request `request_id`.
- `frontend/src/lib/aiChat.ts` — `askAssistant`, `translateContent`,
  `languageMatrix`, `AiUnavailable`.

**Behaviour that matters**

- The question is forwarded **exactly as typed**. Nothing translates it to
  English first, so local crop names and units survive.
- `account_type` is read from the verified session + profile row. A value in
  the request body is ignored, so a caller cannot pose as another account type.
- `language_honoured` reports a mismatch instead of shipping an answer in the
  wrong language silently.
- The routes are mounted only when session verification is configured, so they
  cannot exist in an open state.

---

## Phase 5 — Translation provider abstraction

**Created**

- `backend/app/services/translate.py` — provider registry, Sarvam adapter,
  SHA-256 cache (6 h TTL, 2 000 entries), per-user throttle (20/min) in the
  route, timeouts from settings.
- Config: `TRANSLATE_PROVIDER`, `TRANSLATE_API_KEY`, `TRANSLATE_TIMEOUT_SECONDS`
  (server-side only; the key never reaches React).

**Failure policy:** an unconfigured or failing provider returns `ok: false` and
the **original** text. It never echoes the input and calls it a translation.

---

## Tests

### Backend — `backend/tests/test_multilingual_ai.py`

| Result | Check |
|---|---|
| pass | `hi`, `HI`, `hi-IN`, `bn_IN` normalise correctly |
| pass | `od-IN` and `or-IN` → `or` (provider spelling) |
| pass | unknown/empty/`fr` fall back to `en` |
| pass | every supported language maps for every provider |
| pass | voice is not claimed from chat support |
| pass | matrix has one row per language |
| pass | no provider configured → `ok: false` + original text |
| pass | provider set without a key is not used |
| pass | provider exception → soft failure, original text |
| pass | successful translation is cached (provider charged once) |
| pass | bridge raises a typed error when unconfigured |

**Full suite: 97 passed, 0 failed** (no regressions).

### Frontend

| Result | Check |
|---|---|
| pass | Switch to Odia → `document.documentElement.lang = "or"` |
| pass | Reload → still `or` |
| pass | Navigate to `/crops` → still `or` |
| pass | Capability badges render: "Interface + AI", "AI only · menu in English" |
| pass | `tsc -b` — 0 errors; production build succeeds |
| not run | Automated missing-key coverage lint (see limitations) |
| not run | Mobile layout for hi/or/bn at 390 px (manually fine, not asserted) |

---

## Remaining limitations

1. **AI chat needs the assistant running.** `AI_ASSISTANT_URL` is empty by
   default, so `/ai/chat` returns 503 with a clear message. Set it to the
   assistant's address and `AI_ASSISTANT_KEY` to the shared key.
2. **The assistant has no service-key check yet.** The bridge sends
   `X-Service-Key`, but the assistant currently accepts anonymous calls. That
   check must be added on the assistant side before it is exposed publicly.
3. **Translation is off until configured.** `TRANSLATE_PROVIDER` is empty, so
   `/ai/translate` honestly reports `ok: false`. Sarvam is the only adapter
   wired; Bhashini/Google/Azure need adapters plus a quality check first.
4. **Voice is not implemented.** The matrix reports `stt`/`tts` as `false` for
   every language; no provider has been tested for Odia TTS.
5. **The four-language dictionary is one file per language, not per namespace.**
   The requested `common/farmer/buyer/...` split would be a reorganisation of
   an already-working 466-key dictionary. Lazy loading, English fallback and
   build-time key checking already hold; splitting it further is a refactor
   with no user-visible gain and was left out of scope.
6. **Languages beyond en/hi/or/bn** have no reviewed dictionary. They are
   offered for AI answers only, explicitly labelled.
7. **RAG evaluation (BGE-M3 vs the legacy model) was not re-run here.** The
   assistant already defaults to BGE-M3 with a dimension check for the KB; a
   retrieval benchmark needs the assistant's corpus and was not duplicated.

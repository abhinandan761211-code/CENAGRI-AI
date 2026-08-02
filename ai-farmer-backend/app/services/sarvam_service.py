import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

import requests


class SarvamAIService:
    def __init__(self) -> None:
        self.sarvam_api_key = os.getenv("SARVAM_API_KEY") or os.getenv("OPENAI_API_KEY")
        self._session = requests.Session()
        self._translation_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_max_items = int(os.getenv("TRANSLATION_CACHE_MAX_ITEMS", "1000"))
        self._batch_workers = max(2, int(os.getenv("TRANSLATION_BATCH_WORKERS", "6")))

    @staticmethod
    def _cache_key(*, text: str, target_language: str, source_language: str) -> str:
        return f"{source_language.lower()}::{target_language.lower()}::{text}"

    def _cache_get(self, key: str) -> Optional[Dict[str, Any]]:
        return self._translation_cache.get(key)

    def _cache_set(self, key: str, value: Dict[str, Any]) -> None:
        self._translation_cache[key] = value
        # Keep memory bounded using FIFO-style trim.
        if len(self._translation_cache) > self._cache_max_items:
            over = len(self._translation_cache) - self._cache_max_items
            for old_key in list(self._translation_cache.keys())[:over]:
                self._translation_cache.pop(old_key, None)

    @property
    def available(self) -> bool:
        return bool(self.sarvam_api_key)

    def _clean_text(self, text: str) -> str:
        cleaned = (text or "").strip()
        if "</think>" in cleaned:
            cleaned = cleaned.split("</think>", 1)[1].strip()
        if cleaned.startswith("<think>"):
            cleaned = cleaned.replace("<think>", "", 1).strip()
        return cleaned

    def _google_translate_text(
        self,
        *,
        text: str,
        target_language: str,
        source_language: str = "auto",
    ) -> Dict[str, Any]:
        try:
            response = self._session.get(
                "https://translate.googleapis.com/translate_a/single",
                params={
                    "client": "gtx",
                    "sl": source_language or "auto",
                    "tl": target_language,
                    "dt": "t",
                    "q": text,
                },
                timeout=15,
            )
            if response.status_code != 200:
                return {"ok": False, "translated_text": text, "source": "google_fallback"}

            data = response.json()
            translated = ""
            if isinstance(data, list) and data and isinstance(data[0], list):
                translated = "".join(
                    str(item[0])
                    for item in data[0]
                    if isinstance(item, list) and item and item[0] is not None
                ).strip()

            return {
                "ok": bool(translated),
                "translated_text": translated or text,
                "source": "google_fallback",
            }
        except Exception:
            return {"ok": False, "translated_text": text, "source": "google_fallback"}

    def generate_text(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 450,
    ) -> Dict[str, Any]:
        if not self.available:
            return {"ok": False, "source": "unavailable", "text": ""}

        try:
            payload = {
                "model": "sarvam-m",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            headers = {
                "Authorization": f"Bearer {self.sarvam_api_key}",
                "api-subscription-key": self.sarvam_api_key,
                "Content-Type": "application/json",
            }
            response = self._session.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=20,
            )
            if response.status_code != 200:
                return {"ok": False, "source": "sarvam", "text": ""}

            data = response.json()
            choices = data.get("choices", [])
            content = ""
            if choices:
                content = choices[0].get("message", {}).get("content", "")
            return {"ok": bool(content), "source": "sarvam", "text": self._clean_text(content)}
        except Exception:
            return {"ok": False, "source": "sarvam", "text": ""}

    def parse_market_search_query(self, query: str) -> Dict[str, str]:
        fallback = self._heuristic_market_parse(query)
        if not query.strip():
            return fallback

        prompt = (
            "Parse this mandi search query and return strict JSON with keys: "
            "commodity, state, market, intent. Use empty string if unknown.\n"
            f"Query: {query}"
        )
        result = self.generate_text(
            system_prompt="You are a strict JSON extraction assistant.",
            user_prompt=prompt,
            temperature=0.1,
            max_tokens=180,
        )
        if not result.get("ok"):
            return fallback

        text = result.get("text", "")
        parsed = self._extract_json(text)
        if not parsed:
            return fallback

        return {
            "commodity": str(parsed.get("commodity", "") or "").strip(),
            "state": str(parsed.get("state", "") or "").strip(),
            "market": str(parsed.get("market", "") or "").strip(),
            "intent": str(parsed.get("intent", "") or "search").strip() or "search",
        }

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(text)
        except Exception:
            pass

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None

    def _heuristic_market_parse(self, query: str) -> Dict[str, str]:
        q = (query or "").lower()
        states = [
            "maharashtra",
            "gujarat",
            "rajasthan",
            "madhya pradesh",
            "punjab",
            "haryana",
            "uttar pradesh",
            "karnataka",
            "tamil nadu",
            "bihar",
            "west bengal",
            "odisha",
            "andhra pradesh",
            "telangana",
            "kerala",
            "delhi",
        ]
        commodities = [
            "wheat",
            "rice",
            "tomato",
            "potato",
            "onion",
            "cotton",
            "soybean",
            "maize",
            "mustard",
            "tur",
            "chana",
        ]

        matched_state = next((s for s in states if s in q), "")
        matched_commodity = next((c for c in commodities if c in q), "")
        intent = "best_price" if any(k in q for k in ["best", "highest", "max", "top"]) else "search"

        return {
            "commodity": matched_commodity,
            "state": matched_state,
            "market": "",
            "intent": intent,
        }

    def suggest_price_thresholds(
        self,
        crop: str,
        market: str,
        days: int,
        current_price: Optional[float],
        language: str,
    ) -> Dict[str, Any]:
        price = current_price or 2000.0
        base = {
            "buy_below": round(price * 0.94, 2),
            "sell_above": round(price * 1.08, 2),
            "stop_loss": round(price * 0.9, 2),
        }

        prompt = (
            f"Crop: {crop}\nMarket: {market}\nWindow: {days} days\n"
            f"Current price: {price}\n"
            "Suggest buy_below, sell_above, stop_loss and a short reason in JSON."
        )
        ai = self.generate_text(
            system_prompt="You are an agri trading risk assistant. Return short actionable output.",
            user_prompt=prompt,
            temperature=0.2,
            max_tokens=220,
        )

        if ai.get("ok"):
            parsed = self._extract_json(ai.get("text", ""))
            if parsed:
                return {
                    "thresholds": {
                        "buy_below": float(parsed.get("buy_below", base["buy_below"])),
                        "sell_above": float(parsed.get("sell_above", base["sell_above"])),
                        "stop_loss": float(parsed.get("stop_loss", base["stop_loss"])),
                    },
                    "reason": str(parsed.get("reason", "AI-based threshold recommendation.")),
                    "source": ai.get("source", "sarvam"),
                    "language": language,
                }

        default_reason = (
            "Use phased buy near support and partial booking near resistance."
            if language != "hi"
            else "सपोर्ट के पास चरणबद्ध खरीद और रेजिस्टेंस के पास आंशिक मुनाफावसूली करें।"
        )
        return {
            "thresholds": base,
            "reason": default_reason,
            "source": "rules_fallback",
            "language": language,
        }

    def translate_text(
        self,
        *,
        text: str,
        target_language: str,
        source_language: str = "auto",
    ) -> Dict[str, Any]:
        content = (text or "").strip()
        cache_key = self._cache_key(
            text=content,
            target_language=target_language,
            source_language=source_language,
        )
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        if not content:
            result = {"ok": True, "translated_text": "", "source": "empty"}
            self._cache_set(cache_key, result)
            return result

        if target_language.lower() == "en" and source_language.lower() == "en":
            result = {"ok": True, "translated_text": content, "source": "same_language"}
            self._cache_set(cache_key, result)
            return result

        # Keep short code-like strings and pure numbers unchanged.
        if re.fullmatch(r"[\d\s₹$€£%.,:+\-_/()]+", content):
            result = {"ok": True, "translated_text": content, "source": "pass_through"}
            self._cache_set(cache_key, result)
            return result

        prompt = (
            "Translate the text for a farming web app UI.\n"
            f"Source language: {source_language}\n"
            f"Target language: {target_language}\n"
            "Rules:\n"
            "1) Return only translated text, no extra notes.\n"
            "2) Keep numbers, units, emojis, URLs and currency symbols unchanged.\n"
            "3) Keep concise UI tone for labels/buttons.\n"
            f"Text: {content}"
        )

        ai = self.generate_text(
            system_prompt="You are a high-accuracy multilingual NLP translator.",
            user_prompt=prompt,
            temperature=0.0,
            max_tokens=max(120, min(600, len(content) * 3)),
        )

        if ai.get("ok") and ai.get("text"):
            translated = str(ai.get("text", "")).strip()
            # If AI returns identical text for non-English target, try deterministic fallback.
            if translated and (translated != content or target_language.lower() == "en"):
                return {
                    "ok": True,
                    "translated_text": translated,
                    "source": ai.get("source", "sarvam"),
                }

        fallback = self._google_translate_text(
            text=content,
            target_language=target_language,
            source_language=source_language,
        )
        if fallback.get("ok"):
            self._cache_set(cache_key, fallback)
            return fallback

        result = {"ok": False, "translated_text": content, "source": "fallback"}
        self._cache_set(cache_key, result)
        return result

    def translate_batch(
        self,
        *,
        texts: List[str],
        target_language: str,
        source_language: str = "auto",
    ) -> Dict[str, Any]:
        translated_items: List[str] = ["" for _ in texts]
        used_sarvam = False

        # Deduplicate repeated text chunks in UI payloads.
        unique_index_map: Dict[str, List[int]] = {}
        for idx, item in enumerate(texts):
            unique_index_map.setdefault(item, []).append(idx)

        def _translate_one(item: str) -> Dict[str, Any]:
            return self.translate_text(
                text=item,
                target_language=target_language,
                source_language=source_language,
            )

        if len(unique_index_map) <= 1:
            for item, indices in unique_index_map.items():
                result = _translate_one(item)
                for index in indices:
                    translated_items[index] = result.get("translated_text", item)
                if result.get("source") == "sarvam":
                    used_sarvam = True
        else:
            with ThreadPoolExecutor(max_workers=min(self._batch_workers, len(unique_index_map))) as pool:
                future_map = {
                    pool.submit(_translate_one, item): item
                    for item in unique_index_map.keys()
                }
                for future in as_completed(future_map):
                    item = future_map[future]
                    try:
                        result = future.result()
                    except Exception:
                        result = {"ok": False, "translated_text": item, "source": "fallback"}

                    for index in unique_index_map[item]:
                        translated_items[index] = result.get("translated_text", item)
                    if result.get("source") == "sarvam":
                        used_sarvam = True

        return {
            "translations": translated_items,
            "source": "sarvam" if used_sarvam else "fallback",
            "count": len(translated_items),
            "target_language": target_language,
        }


_service: Optional[SarvamAIService] = None


def get_sarvam_service() -> SarvamAIService:
    global _service
    if _service is None:
        _service = SarvamAIService()
    return _service

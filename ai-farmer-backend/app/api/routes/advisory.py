from fastapi import APIRouter, Query, HTTPException
import os
import json
import re
import time
import uuid
from typing import Optional
import google.genai as genai
from apify_client import ApifyClient
import requests
from dotenv import load_dotenv
from app.services.farming_intent_analyzer import analyze_farming_input, FarmingIntentAnalyzer
from app.services.sarvam_service import get_sarvam_service

load_dotenv()

router = APIRouter()

ADVISORY_CHAT_MEMORY = {}
ADVISORY_MEMORY_MAX_CONVERSATIONS = 500
ADVISORY_MEMORY_MAX_TURNS = 8
ADVISORY_MEMORY_TTL_SECONDS = 60 * 60 * 6


def _normalize_conversation_id(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return str(uuid.uuid4())
    return re.sub(r"[^a-zA-Z0-9_-]", "", raw)[:64] or str(uuid.uuid4())


def _prune_chat_memory() -> None:
    now = time.time()
    expired_keys = [
        key for key, payload in ADVISORY_CHAT_MEMORY.items()
        if now - float(payload.get("updated_at", 0)) > ADVISORY_MEMORY_TTL_SECONDS
    ]
    for key in expired_keys:
        ADVISORY_CHAT_MEMORY.pop(key, None)

    if len(ADVISORY_CHAT_MEMORY) <= ADVISORY_MEMORY_MAX_CONVERSATIONS:
        return

    oldest = sorted(
        ADVISORY_CHAT_MEMORY.items(),
        key=lambda item: float(item[1].get("updated_at", 0)),
    )
    overflow = len(ADVISORY_CHAT_MEMORY) - ADVISORY_MEMORY_MAX_CONVERSATIONS
    for key, _ in oldest[:overflow]:
        ADVISORY_CHAT_MEMORY.pop(key, None)


def _get_conversation_turns(conversation_id: str):
    payload = ADVISORY_CHAT_MEMORY.get(conversation_id)
    if not payload:
        return []
    turns = payload.get("turns")
    return turns if isinstance(turns, list) else []


def _build_recent_chat_context(conversation_id: str) -> str:
    turns = _get_conversation_turns(conversation_id)
    if not turns:
        return ""

    window = turns[-4:]
    lines = []
    for turn in window:
        user_text = str(turn.get("user", "")).strip()
        bot_text = str(turn.get("bot", "")).strip()
        if user_text:
            lines.append(f"Farmer: {user_text}")
        if bot_text:
            lines.append(f"Advisor: {bot_text[:280]}")
    return "\n".join(lines)


def _update_chat_memory(conversation_id: str, user_text: str, bot_text: str) -> None:
    _prune_chat_memory()
    existing_turns = _get_conversation_turns(conversation_id)
    next_turns = [
        *existing_turns,
        {
            "user": str(user_text or "").strip(),
            "bot": str(bot_text or "").strip(),
            "ts": int(time.time()),
        },
    ][-ADVISORY_MEMORY_MAX_TURNS:]
    ADVISORY_CHAT_MEMORY[conversation_id] = {
        "turns": next_turns,
        "updated_at": time.time(),
    }


def _is_short_follow_up_query(q: str) -> bool:
    cleaned = str(q or "").strip().lower()
    if not cleaned:
        return False
    follow_up_markers = {
        "aur", "aur batao", "next", "phir", "then", "ok", "theek", "hmm",
        "kya karu", "kya kare", "what next", "continue", "detail",
    }
    if cleaned in follow_up_markers:
        return True

    tokens = cleaned.split()
    if len(tokens) <= 6 and any(token in cleaned for token in ["aur", "next", "then", "detail", "batao", "explain"]):
        return True

    return False


def sanitize_model_output(text: str) -> str:
    """Remove provider-specific thinking tags from user-facing output."""
    cleaned = text.strip()
    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>", 1)[1].strip()
    if cleaned.startswith("<think>"):
        cleaned = cleaned.replace("<think>", "", 1).strip()
    return cleaned

# Configure Gemini API (Free alternative to RapidAPI)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
API_AVAILABLE = bool(GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here")

# Configure Apify API (Fallback for web scraping)
APIFY_API_KEY = os.getenv("APIFY_API_KEY")
APIFY_AVAILABLE = bool(APIFY_API_KEY)

# Configure Sarvam API (Additional multilingual AI fallback)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY") or os.getenv("OPENAI_API_KEY")
SARVAM_AVAILABLE = bool(SARVAM_API_KEY)

# Language configurations
LANGUAGE_PROMPTS = {
    'en': {
        'system': 'You are an expert agricultural advisor. Provide helpful, accurate farming advice in English.',
        'error': 'I apologize, but I encountered an error. Please try again.'
    },
    'hi': {
        'system': 'आप एक विशेषज्ञ कृषि सलाहकार हैं। हिंदी में सहायक और सटीक कृषि सलाह प्रदान करें।',
        'error': 'क्षमा करें, मुझे एक त्रुटि हुई। कृपया पुनः प्रयास करें।'
    },
    'mr': {
        'system': 'तुम्ही एक तज्ञ कृषी सल्लागार आहात. मराठीत मदतनीस आणि अचूक शेती सल्ला द्या.',
        'error': 'क्षमस्व, मला एक त्रुटी आली. कृपया पुन्हा प्रयत्न करा.'
    },
    'gu': {
        'system': 'તમે એક નિષ્ણાત કૃષિ સલાહકાર છો. ગુજરાતીમાં મદદરૂપ અને ચોક્કસ ખેતી સલાહ આપો.',
        'error': 'માફ કરશો, મને એક ભૂલ આવી. કૃપા કરીને ફરી પ્રયાસ કરો.'
    },
    'ta': {
        'system': 'நீங்கள் ஒரு நிபுணர் விவசாய ஆலோசகர். தமிழில் உதவியாகவும் துல்லியமாகவும் விவசாய ஆலோசனை வழங்குங்கள்.',
        'error': 'மன்னிக்கவும், எனக்கு ஒரு பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.'
    },
    'te': {
        'system': 'మీరు ఒక నిపుణ వ్యవసాయ సలహాదారు. తెలుగులో సహాయకరమైన మరియు ఖచ్చితమైన వ్యవసాయ సలహా అందించండి.',
        'error': 'క్షమించండి, నాకు ఒక లోపం వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి.'
    },
    'kn': {
        'system': 'ನೀವು ಒಬ್ಬ ನಿಪುಣ ಕೃಷಿ ಸಲಹೆಗಾರ. ಕನ್ನಡದಲ್ಲಿ ಸಹಾಯಕ ಮತ್ತು ನಿಖರವಾದ ಕೃಷಿ ಸಲಹೆ ನೀಡಿ.',
        'error': 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಒಂದು ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'
    },
    'ml': {
        'system': 'നിങ്ങൾ ഒരു വിദഗ്ധ കൃഷി ഉപദേശകനാണ്. മലയാളത്തിൽ സഹായകരവും കൃത്യവുമായ കൃഷി ഉപദേശം നൽകുക.',
        'error': 'ക്ഷമിക്കണം, എനിക്ക് ഒരു പിശക് സംഭവിച്ചു. ദയവായി വീണ്ടും ശ്രമിക്കുക.'
    },
    'pa': {
        'system': 'ਤੁਸੀਂ ਇੱਕ ਮਾਹਿਰ ਖੇਤੀਬਾੜੀ ਸਲਾਹਕਾਰ ਹੋ। ਪੰਜਾਬੀ ਵਿੱਚ ਮਦਦਗਾਰ ਅਤੇ ਸਹੀ ਖੇਤੀਬਾੜੀ ਸਲਾਹ ਦਿਓ।',
        'error': 'ਮਾਫ਼ ਕਰਨਾ, ਮੈਨੂੰ ਇੱਕ ਗਲਤੀ ਹੋਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।'
    },
    'bn': {
        'system': 'আপনি একজন বিশেষজ্ঞ কৃষি পরামর্শদাতা। বাংলায় সহায়ক এবং সঠিক কৃষি পরামর্শ প্রদান করুন।',
        'error': 'দুঃখিত, আমার একটি ত্রুটি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
    }
}

# Broad language labels used by advisory endpoint and frontend picker.
LANGUAGE_LABELS = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi",
    "gu": "Gujarati",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "bn": "Bengali",
    "ur": "Urdu",
    "as": "Assamese",
    "or": "Odia",
    "ne": "Nepali",
    "sd": "Sindhi",
    "sa": "Sanskrit",
    "kok": "Konkani",
    "mai": "Maithili",
    "sat": "Santali",
    "mni": "Manipuri",
    "bho": "Bhojpuri",
    "doi": "Dogri",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ar": "Arabic",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-cn": "Chinese (Simplified)",
}

LANGUAGE_ALIASES = {
    "english": "en",
    "hindi": "hi",
    "marathi": "mr",
    "gujarati": "gu",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "punjabi": "pa",
    "bengali": "bn",
    "bangla": "bn",
    "odia": "or",
    "oriya": "or",
    "assamese": "as",
    "nepali": "ne",
    "urdu": "ur",
    "chinese": "zh-cn",
    "zh": "zh-cn",
    "zh_cn": "zh-cn",
    "zh-CN": "zh-cn",
}


def _normalize_language_code(raw_language: Optional[str]) -> str:
    code = str(raw_language or "en").strip().lower()
    if not code:
        return "en"
    if code in LANGUAGE_LABELS:
        return code
    if code in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[code]
    return "en"


def _detect_language_from_text(text: str) -> str:
    sample = (text or "").strip()
    if not sample:
        return "en"

    # Script-based fast detection for common Indian and global scripts.
    if any("\u0900" <= ch <= "\u097f" for ch in sample):
        return "hi"
    if any("\u0980" <= ch <= "\u09ff" for ch in sample):
        return "bn"
    if any("\u0a80" <= ch <= "\u0aff" for ch in sample):
        return "gu"
    if any("\u0b00" <= ch <= "\u0b7f" for ch in sample):
        return "or"
    if any("\u0b80" <= ch <= "\u0bff" for ch in sample):
        return "ta"
    if any("\u0c00" <= ch <= "\u0c7f" for ch in sample):
        return "te"
    if any("\u0c80" <= ch <= "\u0cff" for ch in sample):
        return "kn"
    if any("\u0d00" <= ch <= "\u0d7f" for ch in sample):
        return "ml"
    if any("\u0a00" <= ch <= "\u0a7f" for ch in sample):
        return "pa"
    if any("\u0600" <= ch <= "\u06ff" for ch in sample):
        return "ur"
    if any("\u3040" <= ch <= "\u30ff" for ch in sample):
        return "ja"
    if any("\uac00" <= ch <= "\ud7af" for ch in sample):
        return "ko"
    if any("\u4e00" <= ch <= "\u9fff" for ch in sample):
        return "zh-cn"

    # Roman-Hindi / Hinglish detection for users typing Hindi in Latin script.
    sample_lower = sample.lower()
    hinglish_markers = {
        "kheti", "kisan", "mitti", "domat", "doamat", "beej", "buvai", "ropai",
        "paani", "sinchai", "barish", "mausam", "kit", "keet", "rog", "dawai",
        "khad", "fasal", "mandi", "bhav", "gehu", "gehun", "dhaan", "makka",
        "kaun", "kaise", "kya", "kyu", "kab", "kitna", "karen", "kare", "bataye",
    }
    tokens = [token for token in re.split(r"[^a-z]+", sample_lower) if token]
    if tokens:
        marker_hits = sum(1 for token in tokens if token in hinglish_markers)
        # Require at least 2 markers to avoid false positives.
        if marker_hits >= 2:
            return "hi"

    return "en"


def _get_system_prompt_for_language(language: str) -> str:
    if language in LANGUAGE_PROMPTS:
        return LANGUAGE_PROMPTS[language]["system"]

    lang_name = LANGUAGE_LABELS.get(language, language)
    return (
        "You are an expert agricultural advisor. "
        f"Respond clearly, practically, and strictly in {lang_name} ({language})."
    )


def _is_mostly_ascii_english(text: str) -> bool:
    content = (text or "").strip()
    if not content:
        return False
    letters = [ch for ch in content if ch.isalpha()]
    if not letters:
        return False
    ascii_letters = sum(1 for ch in letters if ord(ch) < 128)
    return (ascii_letters / max(1, len(letters))) >= 0.90


def _ensure_response_language(text: str, *, target_language: str, source_hint: str = "auto") -> str:
    if not text:
        return text
    if target_language == "en":
        return text

    # If the text is already non-ASCII heavy, assume it's already localized.
    if not _is_mostly_ascii_english(text):
        return text

    try:
        sarvam_service = get_sarvam_service()
        translated = sarvam_service.translate_text(
            text=text,
            target_language=target_language,
            source_language=source_hint or "auto",
        )
        if translated.get("ok"):
            return translated.get("translated_text", text)
    except Exception:
        pass

    return text


def _detect_crop_name(question: str, language: str = "en") -> str:
    q = (question or "").lower()
    crop_alias = {
        "धान": "धान",
        "rice": "धान",
        "paddy": "धान",
        "गेहूं": "गेहूं",
        "wheat": "गेहूं",
        "मक्का": "मक्का",
        "maize": "मक्का",
        "corn": "मक्का",
        "आलू": "आलू",
        "potato": "आलू",
        "टमाटर": "टमाटर",
        "tomato": "टमाटर",
        "प्याज": "प्याज",
        "onion": "प्याज",
    }
    for key, value in crop_alias.items():
        if key in q:
            if language == "hi":
                return value
            return key
    return "your crop" if language != "hi" else "आपकी फसल"


def _is_profit_crop_selection_query(q: str) -> bool:
    profit_markers = [
        "ज्यादा फायदा", "ज्यादा लाभ", "कौन सी फसल", "कौनसा फसल", "kaun sa", "kon fasal",
        "best crop", "most profitable", "high profit", "fayda", "labh", "profit",
    ]
    soil_markers = ["दोमट", "domat", "doamat", "loamy", "mitti", "soil"]
    has_profit_intent = any(marker in q for marker in profit_markers)
    has_soil_context = any(marker in q for marker in soil_markers)
    return has_profit_intent and has_soil_context


def _is_greeting_or_smalltalk(q: str) -> bool:
    cleaned = (q or "").strip().lower()
    normalized = re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", cleaned)).strip()

    greeting_markers = [
        "hello", "hi", "hey", "namaste", "namaskar", "ram ram", "good morning", "good evening",
        "हेलो", "नमस्ते", "नमस्कार", "राम राम", "kaise ho", "कैसे हो",
        "hii", "hiii", "helo", "hlw", "ap kaise ho", "aap kaise ho",
    ]

    name_query_markers = [
        "what is your name", "your name", "who are you", "aapka naam", "apka naam", "tumhara naam",
        "kya name", "kya naam", "name kya", "naam kya", "aap ka name", "apka kya name",
    ]

    if normalized in greeting_markers or cleaned in greeting_markers:
        return True

    if any(marker in normalized for marker in name_query_markers):
        return True

    # Handles short mixed greetings like "hii apka kya name hi".
    if any(token in normalized for token in ["hi", "hello", "hii", "namaste"]) and any(
        token in normalized for token in ["name", "naam", "apka", "aapka"]
    ):
        return True

    return False


def _build_profit_crop_recommendation(question: str, language: str = "en") -> str:
    q = (question or "").lower()
    is_bihar = any(marker in q for marker in ["बिहार", "bihar"])

    if language != "hi":
        region = "Bihar" if is_bihar else "your region"
        return f"""
🌾 **Problem:** {question}

✅ **Best crop options for loamy soil ({region}):**
1. **Maize (Kharif/Rabi):** strong demand in feed and starch markets; good returns with irrigation.
2. **Wheat (Rabi):** stable yield and predictable mandi demand.
3. **Mustard (Rabi):** lower cost, good margin in oilseed season.
4. **Potato (Rabi):** high profit potential where storage/market access exists.
5. **Vegetables (tomato, cauliflower, brinjal):** highest margin but require active pest and market management.

💡 **Practical recommendation:**
- For safer income: Maize + Wheat/Mustard rotation.
- For higher profit: keep 20-30% area in vegetables near mandi access.

🎯 **Outcome:**
This crop mix balances stable income with better profit potential on loamy soil.
"""

    region_hi = "बिहार" if is_bihar else "आपके क्षेत्र"
    return f"""
🌾 **समस्या:** {question}

✅ **दोमट मिट्टी ({region_hi}) में ज्यादा फायदा देने वाली फसलें:**
1. **मक्का (खरीफ/रबी):** मांग अच्छी रहती है, उत्पादन भी अच्छा आता है।
2. **गेहूं (रबी):** स्थिर उपज और मंडी में भरोसेमंद बिक्री।
3. **सरसों (रबी):** लागत कम, तेलहन सीजन में अच्छा मार्जिन।
4. **आलू (रबी):** भंडारण/बाजार सुविधा हो तो ज्यादा लाभ।
5. **सब्जियां (टमाटर, फूलगोभी, बैंगन):** सबसे ज्यादा मुनाफा, लेकिन देखभाल और बाजार टाइमिंग जरूरी।

💡 **आपके सवाल का सीधा जवाब:**
- सुरक्षित कमाई के लिए: **मक्का + गेहूं/सरसों** सबसे बेहतर कॉम्बिनेशन।
- ज्यादा मुनाफे के लिए: कुल जमीन का **20-30% हिस्सा सब्जियों** में रखें।

🎯 **परिणाम:**
इस प्लान से दोमट मिट्टी में जोखिम कम रहेगा और कुल लाभ बढ़ेगा।
"""


def _build_contextual_fallback(
    question: str,
    intent_data: dict,
    language: str = "en",
    recent_chat_context: str = "",
) -> str:
    q = (question or "").lower()
    crop_name = _detect_crop_name(question, language)
    intent_name = intent_data.get("hindi_name", "कृषि मार्गदर्शन") if language == "hi" else intent_data.get("name", "general farming guidance")

    name_query_markers = ["name", "naam", "aapka naam", "apka naam", "your name", "who are you"]
    is_name_query = any(marker in q for marker in name_query_markers)

    if _is_short_follow_up_query(q) and recent_chat_context:
        context_text = recent_chat_context.lower()
        if any(marker in context_text for marker in ["peeli", "पीली", "yellow", "leaf", "patti", "पत्ती"]):
            if language != "hi":
                return (
                    "Based on our last discussion about yellowing leaves, use this 5-day action plan:\n"
                    "1. Give light irrigation, do not flood the field.\n"
                    "2. Foliar spray: 2% urea + recommended micronutrient mix (zinc if deficient).\n"
                    "3. Check root-zone drainage and remove standing water.\n"
                    "4. Inspect for pest/disease spots on 20 random plants and treat targeted issue only.\n"
                    "5. Recheck leaf color after 4-5 days and share photos if no improvement.\n\n"
                    "If you share crop stage and district, I can give exact dose per acre."
                )
            return (
                "पिछली बात (पत्तियां पीली होना) के आधार पर 5 दिन का प्लान अपनाएं:\n"
                "1. हल्की सिंचाई करें, खेत में पानी न भरने दें।\n"
                "2. पत्तों पर 2% यूरिया + जरूरत अनुसार सूक्ष्म पोषक (जिंक) का स्प्रे करें।\n"
                "3. जड़ क्षेत्र का जलनिकास ठीक रखें।\n"
                "4. 20 पौधों पर कीट/रोग लक्षण जांचें और केवल लक्षित नियंत्रण करें।\n"
                "5. 4-5 दिन बाद पत्तियों का रंग दोबारा देखें; सुधार न हो तो फोटो भेजें।\n\n"
                "फसल की स्टेज और जिला बताने पर मैं प्रति एकड़ सटीक मात्रा बता दूंगा।"
            )

        if language != "hi":
            return (
                "Sure, continuing from your previous question. Share crop stage + location and I will provide a precise next-step plan.\n"
                "For now, follow: moisture check, balanced nutrition, weekly pest scan, and weather-based field scheduling."
            )
        return (
            "ठीक है, आपकी पिछली बात को आगे बढ़ाते हैं। फसल की स्टेज और जिला बताएं, मैं सटीक अगला प्लान दूंगा।\n"
            "फिलहाल नमी जांच, संतुलित पोषण, साप्ताहिक कीट जांच और मौसम-आधारित कार्य योजना रखें।"
        )

    if _is_greeting_or_smalltalk(q):
        if is_name_query:
            if language != "hi":
                return (
                    "Hi! My name is CenAgri AI Assistant. I am your farming chatbot. "
                    "You can ask me anything about crops, pests, fertilizers, irrigation, mandi prices, and weather planning."
                )
            return (
                "नमस्ते! मेरा नाम CenAgri AI Assistant है। मैं आपका खेती सहायक चैटबॉट हूँ। "
                "आप मुझसे फसल, कीट/रोग, खाद, सिंचाई, मंडी भाव और मौसम योजना पर सवाल पूछ सकते हैं।"
            )

        if language != "hi":
            return (
                "Hi! I am your farming assistant. I can help with crop planning, fertilizer dose, pest/disease control, "
                "irrigation timing, mandi price decisions, and weather risk planning.\n\n"
                "Tell me these 3 details to get a precise answer:\n"
                "1. Crop name\n"
                "2. Growth stage (sowing/vegetative/flowering/harvest)\n"
                "3. Location or district\n\n"
                "You can ask naturally, for example: 'My wheat leaves are yellow, what should I do?'"
            )
        return (
            "नमस्ते! मैं आपका खेती सहायक हूँ। मैं फसल प्लानिंग, खाद मात्रा, कीट/रोग नियंत्रण, सिंचाई समय, मंडी भाव और मौसम जोखिम में मदद कर सकता हूँ।\n\n"
            "सटीक सलाह के लिए ये 3 बातें बताएं:\n"
            "1. फसल का नाम\n"
            "2. फसल की स्टेज (बुवाई/वृद्धि/फूल/कटाई)\n"
            "3. आपका जिला/लोकेशन\n\n"
            "आप सीधे ऐसे भी पूछ सकते हैं: 'गेहूं की पत्तियां पीली हो रही हैं, क्या करें?'"
        )

    if _is_profit_crop_selection_query(q):
        return _build_profit_crop_recommendation(question, language)

    if any(k in q for k in ["कैसे", "kaise", "kheti", "खेती", "बुवाई", "रोपाई"]):
        if language != "hi":
            return f"""
For your question '{question}', here is a practical {crop_name} cultivation plan:

1. Prepare field with good tilth, drainage, and moisture balance.
2. Choose locally suitable, certified variety based on weather.
3. Do seed treatment before sowing/transplanting.
4. Apply fertilizers in stages: basal + top dressing as crop grows.
5. Follow irrigation interval based on soil and weather; avoid waterlogging.
6. Monitor pest/disease every 7-10 days and control early.
7. Harvest at proper maturity and dry produce before storage.

If you share district + sowing date, I can make this a week-by-week schedule.
"""
        return f"""
'{question}' के लिए {crop_name} की यह practical खेती योजना अपनाएं:

1. खेत की तैयारी करें: मिट्टी भुरभुरी और जल निकास/नमी संतुलित रखें।
2. स्थानीय मौसम के अनुसार अच्छी और प्रमाणित किस्म चुनें।
3. बीज उपचार करके ही बुवाई/रोपाई करें।
4. चरण अनुसार खाद दें: बेसल + बढ़वार स्टेज पर टॉप ड्रेसिंग।
5. सिंचाई अंतराल मिट्टी और मौसम के हिसाब से रखें, पानी भराव से बचें।
6. 7-10 दिन पर कीट/रोग निगरानी करें और शुरुआती नियंत्रण करें।
7. सही पकाव पर कटाई करें और फसल को सूखा कर सुरक्षित भंडारण करें।

अगर आप जिला और बुवाई तारीख बताएंगे तो मैं इसे हफ्तावार प्लान में दे दूँगा।
"""

    if any(k in q for k in ["कमजोर", "kamzor", "पीला", "yellow", "वृद्धि", "growth"]):
        if language != "hi":
            return f"""
Your crop recovery plan for '{question}':

    1. Check soil moisture and pH first.
    2. Use balanced nutrition with micronutrients (zinc/sulfur) as needed.
    3. Give light irrigation near root zone and prevent water stagnation.
    4. If pest/disease symptoms appear, apply targeted control quickly.
    5. Reassess crop growth after 5-7 days.

If symptoms persist after 7 days, share a photo and I will help with a specific diagnosis.
    """
        return f"""
'{question}' के लिए फसल रिकवरी प्लान:

1. मिट्टी नमी और pH की जांच करें।
2. संतुलित पोषण दें: नाइट्रोजन + सूक्ष्म पोषक (जिंक/सल्फर) जरूरत अनुसार।
3. जड़ क्षेत्र में हल्की सिंचाई दें, जलभराव न होने दें।
4. रोग/कीट लक्षण दिखें तो तुरंत लक्षित नियंत्रण अपनाएं।
5. 5-7 दिन बाद पौध वृद्धि की दोबारा समीक्षा करें।

अगर 7 दिन में सुधार न दिखे तो फोटो भेजें, मैं symptom-based दवा/कदम बताऊँगा।
"""

    if language != "hi":
        return (
            f"I can help with this under {intent_name}. To give a precise answer, please share: "
            "crop name, current stage, and your location.\n\n"
            "Meanwhile, start with this simple plan:\n"
            "1. Check soil moisture and irrigation status.\n"
            "2. Use balanced nutrition and avoid overuse of one fertilizer.\n"
            "3. Monitor pest/disease signs every week.\n"
            "4. Match field operations with local weather forecast.\n"
            "5. Cross-check final spray/fertilizer decision with local KVK guidance."
        )

    return (
        f"मैं {intent_name} में आपकी मदद कर सकता हूँ। सटीक सलाह के लिए कृपया फसल, वर्तमान स्टेज और जिला बताएं।\n\n"
        "तब तक यह बेसिक प्लान अपनाएं:\n"
        "1. मिट्टी की नमी और सिंचाई स्थिति जांचें।\n"
        "2. संतुलित पोषण दें, एक ही खाद का अधिक प्रयोग न करें।\n"
        "3. हर सप्ताह कीट/रोग की निगरानी करें।\n"
        "4. मौसम पूर्वानुमान देखकर खेत कार्य तय करें।\n"
        "5. अंतिम दवा/खाद निर्णय स्थानीय KVK सलाह से मिलाकर लें।"
    )

def get_apify_farming_advice(question: str, language: str = 'en') -> Optional[str]:
    """
    Fallback function to get farming advice using Apify web scraping
    """
    if not APIFY_AVAILABLE:
        return None

    try:
        client = ApifyClient(APIFY_API_KEY)

        # Use Google Search Scraper to find farming advice
        search_query = f"farming advice {question}"

        run_input = {
            "searchTerms": [search_query],
            "maxPagesPerQuery": 2,
            "resultsPerPage": 10,
            "languageCode": "en" if language == 'en' else "",
            "mobileResults": False,
        }

        run = client.actor("apidojo/google-search-scraper").call(run_input=run_input)

        # Get results
        results = []
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            if 'organicResults' in item:
                for result in item['organicResults'][:5]:  # Top 5 results
                    title = result.get('title', '')
                    description = result.get('description', '')
                    url = result.get('url', '')
                    results.append(f"**{title}**\n{description}\nSource: {url}")
            elif 'results' in item:
                for result in item['results'][:5]:
                    title = result.get('title', '')
                    description = result.get('description', '')
                    url = result.get('url', '')
                    results.append(f"**{title}**\n{description}\nSource: {url}")

        if results:
            advice = "\n\n".join(results[:3])  # Top 3 results
            return f"Based on reliable agricultural sources:\n\n{advice}"
        else:
            # Fallback to basic advice if no web results
            basic_advice = {
                "tomato": "For tomatoes: Choose sunny location, well-drained soil pH 6.0-6.8, plant 2-3 feet apart, water consistently, fertilize with balanced NPK, watch for blight and hornworms.",
                "wheat": "For wheat: Plant in well-drained soil, optimal pH 6.0-7.0, sow 1-2 inches deep, fertilize with nitrogen, control weeds, harvest when grains are hard.",
                "rice": "For rice: Requires flooded fields or adequate water, plant in rows 6-8 inches apart, fertilize with nitrogen and phosphorus, control pests like stem borers.",
                "cotton": "For cotton: Plant in warm soil above 60°F, space 30-36 inches apart, fertilize with nitrogen, irrigate regularly, control boll weevils and aphids.",
                "potato": "For potatoes: Plant seed potatoes in loose, well-drained soil, hill up soil around plants, fertilize with potassium-rich fertilizer, harvest when vines die back."
            }
            
            # Extract crop name from question
            question_lower = question.lower()
            for crop, advice in basic_advice.items():
                if crop in question_lower:
                    return f"Basic farming advice for {crop}:\n\n{advice}\n\nNote: This is general guidance. Consult local agricultural extension services for region-specific advice."
            
            return "General farming advice: Ensure proper soil preparation, adequate irrigation, balanced fertilization, pest management, and follow local agricultural best practices. Consult your local agricultural extension office for specific crop recommendations."

    except Exception as e:
        print(f"Apify error: {str(e)}")
        return None

def get_sarvam_farming_advice(question: str, language: str = 'en') -> Optional[str]:
    """
    Additional AI fallback function using Sarvam chat completions for farming advice
    """
    if not SARVAM_AVAILABLE:
        print("Sarvam not available - no API key")
        return None

    try:
        # Get language-specific prompts
        lang_config = LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS['en'])

        print(f"Trying Sarvam for question: {question[:50]}...")
        payload = {
            "model": "sarvam-m",
            "messages": [
                {"role": "system", "content": lang_config['system']},
                {
                    "role": "user",
                    "content": (
                        f"Question: {question}\n\n"
                        "Please provide detailed, practical advice based on modern farming practices, "
                        "local conditions, and sustainable methods."
                    ),
                },
            ],
            "temperature": 0.3,
            "max_tokens": 500,
        }
        headers = {
            "Authorization": f"Bearer {SARVAM_API_KEY}",
            "api-subscription-key": SARVAM_API_KEY,
            "Content-Type": "application/json",
        }

        response = requests.post(
            "https://api.sarvam.ai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=25,
        )
        if response.status_code != 200:
            print(f"Sarvam error {response.status_code}: {response.text[:300]}")
            return None

        data = response.json()
        choices = data.get("choices", [])
        if choices and choices[0].get("message", {}).get("content"):
            advice = sanitize_model_output(choices[0]["message"]["content"])
            print(f"Sarvam success: got {len(advice)} characters")
            return advice
        else:
            print("Sarvam returned no content")
            return None

    except Exception as e:
        print(f"Sarvam error: {str(e)}")
        return None

@router.post("/ask")
def get_farming_advice(
    question: str = Query(..., description="The farming question to ask"),
    context: str = Query("", description="Additional context about the farm/crops"),
    language: str = Query("en", description="Language for response"),
    profile: Optional[str] = Query(None, description="Farmer profile JSON for intent analysis"),
    conversation_id: Optional[str] = Query(None, description="Optional chat session ID for conversational continuity"),
):
    """
    Smart AI-powered farming advice with intent detection and rule-based solutions.
    
    Full Logic: Input → Intent Detection → Rule-Based or AI → Formatted Response
    """
    
    if not question or not question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        resolved_conversation_id = _normalize_conversation_id(conversation_id)
        recent_chat_context = _build_recent_chat_context(resolved_conversation_id)

        requested_language = _normalize_language_code(language)
        detected_question_language = _detect_language_from_text(question)
        # Respect explicit UI language selection; do not override English with detected Hinglish.
        response_language = requested_language

        # Step 1: Parse farmer profile if provided
        farmer_profile = {}
        if profile:
            try:
                farmer_profile = json.loads(profile)
            except:
                pass

        # Step 2: Analyze intent using our farmer intent analyzer
        analysis_result = analyze_farming_input(question, farmer_profile)
        intent_data = analysis_result["intent"]
        
        advisory_text = ""
        source = "rule_based"

        # Step 3: Use strong rule-based responses for highly specific operational intents,
        # but prefer AI for broad farmer/crop guidance questions.
        force_ai_intents = {"general_farming", "crop_cultivation", "yield_improvement", "soil_management"}
        should_prefer_ai_for_follow_up = bool(recent_chat_context) and _is_short_follow_up_query(question)
        use_rule_based_first = (
            analysis_result["rule_based_solution"] is not None
            and intent_data.get("intent") not in force_ai_intents
            and intent_data.get("confidence", 0) >= 0.30
            and not should_prefer_ai_for_follow_up
        )

        if use_rule_based_first:
            rule_solution = analysis_result["rule_based_solution"]
            hindi_name = rule_solution.get("hindi", "समाधान")
            english_name = rule_solution.get("name", "Solution")
            solutions = rule_solution.get("common_solutions", [])
            timing = rule_solution.get("timing", "")
            
            # Format response in requested language
            if response_language == "hi":
                solutions_text = "\n".join(solutions)
                advisory_text = f"""
🌾 **समस्या:** {question}

✅ **समाधान ({hindi_name}):**
{solutions_text}

⏰ **समय सूचना:** {timing}

🎯 **परिणाम:** 
सही तरीके से इन कदमों को अपनाने से आपकी फसल सुरक्षित और स्वस्थ रहेगी।
"""
            else:
                solutions_text = "\n".join([f"{idx + 1}. {step}" for idx, step in enumerate(solutions)])
                advisory_text = f"""
🌾 **Problem:** {question}

✅ **Solution ({english_name}):**
{solutions_text}

⏰ **Timing:** {timing or 'Follow crop-stage based timing and local advisory.'}

🎯 **Outcome:**
Following these steps helps keep your crop healthy and productive.
"""
            source = "rule_based"

        # Step 4: For broad queries or weak matches, use AI with enhanced context.
        else:
            # Build enhanced prompt with intent information
            enhanced_context = analysis_result["enhanced_context"]
            
            system_prompt = _get_system_prompt_for_language(response_language)
            prompt = f"""{system_prompt}

{enhanced_context}

Recent chat context:
{recent_chat_context or 'No prior conversation context.'}

Farmer's Question: {question}

Additional Context: {context}

Respond strictly in language code: {response_language}.
Style rules:
- Converse naturally like a friendly farming chatbot (not a rigid template).
- For greetings/simple chat, greet briefly and ask 2-3 clarifying farm details.
- Give practical steps only when needed; use short bullets or short paragraphs.
- Avoid forcing headings unless user explicitly asks for a structured report.
- Keep advice specific to Indian farming conditions.

If user asks cultivation/how-to questions, cover seed/variety hint, land prep, irrigation, fertilizer, pest-risk, and harvest timing where relevant.
"""

            # Try AI APIs in order
            AI_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if AI_KEY:
                try:
                    client = genai.Client(api_key=AI_KEY)
                    response = client.models.generate_content(
                        model='gemini-2.0-flash-exp',
                        contents=prompt
                    )
                    if response and response.text:
                        advisory_text = response.text.strip()
                        source = "gemini_ai"
                except Exception as e:
                    print(f"Gemini error: {str(e)}")
                    advisory_text = None

            # Fallback to improved contextual default if AI fails
            if not advisory_text:
                advisory_text = _build_contextual_fallback(
                    question,
                    intent_data,
                    response_language,
                    recent_chat_context=recent_chat_context,
                )
                source = "default_fallback"

        advisory_text = _ensure_response_language(
            advisory_text,
            target_language=response_language,
            source_hint="en",
        )

        _update_chat_memory(
            conversation_id=resolved_conversation_id,
            user_text=question,
            bot_text=advisory_text,
        )

        raw_follow_ups = analysis_result.get("follow_up_questions", [])
        follow_up_questions = []
        for item in raw_follow_ups:
            if isinstance(item, dict):
                if response_language == "hi":
                    follow_up_questions.append(item.get("hindi") or item.get("english") or "")
                else:
                    follow_up_questions.append(item.get("english") or item.get("hindi") or "")
            elif isinstance(item, str):
                follow_up_questions.append(item)
        follow_up_questions = [q for q in follow_up_questions if q]

        intent_label = (
            intent_data.get("hindi_name", "सामान्य कृषि मार्गदर्शन")
            if response_language == "hi"
            else intent_data.get("intent", "general_farming").replace("_", " ").title()
        )

        return {
            "success": True,
            "advisory": advisory_text,
            "intent": intent_data["intent"],
            "intent_label": intent_label,
            "intent_hindi": intent_data.get("hindi_name", "unknown"),
            "confidence": round(intent_data.get("confidence", 0), 2),
            "language": response_language,
            "requested_language": requested_language,
            "detected_question_language": detected_question_language,
            "source": source,
            "conversation_id": resolved_conversation_id,
            "follow_up_questions": follow_up_questions,
            "metadata": {
                "question": question,
                "detected_keywords": intent_data.get("keywords_found", []),
                "used_recent_context": bool(recent_chat_context),
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()

        safe_language = _normalize_language_code(language)
        detected_question_language = _detect_language_from_text(question)
        response_language = safe_language

        try:
            resolved_conversation_id = _normalize_conversation_id(conversation_id)
            emergency_text = _build_contextual_fallback(
                question=question,
                intent_data={"name": "general farming guidance", "hindi_name": "सामान्य कृषि मार्गदर्शन"},
                language=response_language,
                recent_chat_context="",
            )
            emergency_text = _ensure_response_language(
                emergency_text,
                target_language=response_language,
                source_hint="en",
            )
        except Exception:
            emergency_text = (
                "क्षमा करें, तकनीकी समस्या के कारण अभी संक्षिप्त सलाह दी जा रही है। "
                "कृपया फसल, मिट्टी, सिंचाई और मौसम की जानकारी के साथ फिर से पूछें।"
                if response_language == "hi"
                else "Sorry, there was a technical issue. Please ask again with crop, soil, irrigation, and weather details."
            )

        # Return a safe response instead of raising 500 to keep chat usable.
        return {
            "success": True,
            "advisory": emergency_text,
            "intent": "general_farming",
            "intent_label": "सामान्य कृषि मार्गदर्शन" if response_language == "hi" else "General Farming Guidance",
            "intent_hindi": "सामान्य कृषि मार्गदर्शन",
            "confidence": 0.0,
            "language": response_language,
            "requested_language": safe_language,
            "detected_question_language": detected_question_language,
            "source": "emergency_fallback",
            "conversation_id": resolved_conversation_id,
            "follow_up_questions": [],
            "metadata": {
                "question": question,
                "error": str(e),
            },
        }


@router.get("/models")
def list_available_models():
    """
    Debug endpoint to check Gemini API configuration
    """
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY not set"}

    try:
        # Test basic API connectivity
        client = genai.Client(api_key=GEMINI_API_KEY)
        return {"status": "Gemini API configured successfully", "model": "gemini-2.0-flash-exp"}
    except Exception as e:
        return {"error": str(e)}

@router.get("/market-insights")
def get_market_insights(
    crop_type: str = Query(..., description="Type of crop"),
    language: str = Query("en", description="Language for response")
):
    """
    Get market insights for a specific crop
    """
    if not (API_AVAILABLE or SARVAM_AVAILABLE or APIFY_AVAILABLE):
        raise HTTPException(
            status_code=500,
            detail="AI services not configured. Set GEMINI_API_KEY, SARVAM_API_KEY, or APIFY_API_KEY in environment variables.",
        )

    try:
        lang_config = LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS['en'])

        prompt = f"{lang_config['system']}\n\n"
        prompt += f"Provide market insights and trends for {crop_type} crop.\n"
        prompt += "Include information about:\n"
        prompt += "- Current market demand\n"
        prompt += "- Price trends\n"
        prompt += "- Best time to sell\n"
        prompt += "- Market opportunities\n"
        prompt += "- Risk factors\n\n"
        prompt += "Please provide practical, actionable insights."

        if API_AVAILABLE:
            client = genai.Client(api_key=GEMINI_API_KEY)
            response = client.models.generate_content(
                model='gemini-2.0-flash-exp',
                contents=prompt
            )

            if response and response.text:
                insights = response.text.strip()
                return {
                    "success": True,
                    "insights": insights,
                    "crop_type": crop_type,
                    "language": language,
                    "source": "gemini"
                }

        sarvam_query = f"Provide market insights and trends for {crop_type} crop. Include current market demand, price trends, best time to sell, market opportunities, and risk factors."
        sarvam_insights = get_sarvam_farming_advice(sarvam_query, language)
        if sarvam_insights:
            return {
                "success": True,
                "insights": sarvam_insights,
                "crop_type": crop_type,
                "language": language,
                "source": "sarvam_fallback"
            }

        apify_query = f"{crop_type} crop market trends price analysis farming"
        apify_insights = get_apify_farming_advice(apify_query, language)
        if apify_insights:
            return {
                "success": True,
                "insights": apify_insights,
                "crop_type": crop_type,
                "language": language,
                "source": "apify_fallback"
            }

        return {
            "success": False,
            "error": f"{lang_config['error']} (No response from AI services)",
            "crop_type": crop_type,
            "language": language
        }

    except Exception as e:
        error_str = str(e).lower()
        if "429" in error_str or "resource_exhausted" in error_str or "quota" in error_str:
            # Quota exceeded, try Sarvam fallback first
            sarvam_query = f"Provide market insights and trends for {crop_type} crop. Include current market demand, price trends, best time to sell, market opportunities, and risk factors."
            sarvam_insights = get_sarvam_farming_advice(sarvam_query, language)
            if sarvam_insights:
                return {
                    "success": True,
                    "insights": sarvam_insights,
                    "crop_type": crop_type,
                    "language": language,
                    "source": "sarvam_fallback"
                }
            else:
                # Try Apify fallback if Sarvam fails
                apify_query = f"{crop_type} crop market trends price analysis farming"
                apify_insights = get_apify_farming_advice(apify_query, language)
                if apify_insights:
                    return {
                        "success": True,
                        "insights": apify_insights,
                        "crop_type": crop_type,
                        "language": language,
                        "source": "apify_fallback"
                    }

        lang_config = LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS['en'])
        return {
            "success": False,
            "error": f"{lang_config['error']} (Technical error: {str(e)})",
            "crop_type": crop_type,
            "language": language
        }

@router.get("/test-rapidapi")
def test_rapidapi_connection():
    """
    Test Gemini API, Sarvam, and Apify connection and configuration
    """
    return {
        "gemini_api_key_configured": bool(GEMINI_API_KEY),
        "sarvam_api_key_configured": bool(SARVAM_API_KEY),
        "apify_api_key_configured": bool(APIFY_API_KEY),
        "any_ai_service_available": bool(API_AVAILABLE or SARVAM_AVAILABLE or APIFY_AVAILABLE),
        "api_available": API_AVAILABLE,
        "sarvam_available": SARVAM_AVAILABLE,
        "apify_available": APIFY_AVAILABLE,
        "instructions": "Multiple AI services configured for farming advice. Priority: Gemini → Sarvam → Apify web scraping → Static fallback."
    }

@router.get("/supported-languages")
def get_supported_languages():
    """
    Get list of supported languages for farming advice
    """
    return {
        "success": True,
        "language_labels": LANGUAGE_LABELS,
        "supported_languages": {
            code: config['system'][:50] + "..."  # Short description
            for code, config in LANGUAGE_PROMPTS.items()
        },
        "total_languages": len(LANGUAGE_LABELS)
    }
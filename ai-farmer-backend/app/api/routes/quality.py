from fastapi import APIRouter, Query, UploadFile, File, HTTPException
from PIL import Image
import io
import json
import os
import re
import numpy as np
import google.genai as genai
from google.genai import types as genai_types
from typing import List, Dict, Optional
from app.services.disease_detector_service import get_disease_detector_service
from app.services.sarvam_service import get_sarvam_service

router = APIRouter()

SUPPORTED_CROPS = [
    'general',
    'wheat',
    'rice',
    'corn',
    'cotton',
    'sugarcane',
    'soybean',
    'pulses',
    'vegetables',
    'fruits',
]

DEFAULT_DISEASE_METADATA_PATH = '/Users/abhinandankumar/Downloads/indian-crops-leaf-disease-metadata (1).json'
DEFAULT_DISEASE_DATASET_ROOT = '/Users/abhinandankumar/Downloads/indian-crops-leaf-disease'

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_AVAILABLE = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'your_gemini_api_key_here')
SARVAM_AVAILABLE = get_sarvam_service().available
QUALITY_AI_AVAILABLE = bool(GEMINI_AVAILABLE or SARVAM_AVAILABLE)

LANGUAGE_NAME = {
    'en': 'English',
    'hi': 'Hindi',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'ta': 'Tamil',
    'te': 'Telugu',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'pa': 'Punjabi',
    'bn': 'Bengali',
}

KNOWN_CROP_KEYWORDS = [
    'wheat', 'rice', 'corn', 'maize', 'cotton', 'sugarcane', 'soybean', 'pulses',
    'tomato', 'potato', 'onion', 'banana', 'apple', 'grape', 'mango', 'chili',
    'pepper', 'cabbage', 'cauliflower', 'carrot', 'cucumber', 'okra', 'brinjal',
    'leaf', 'spinach', 'lettuce', 'fruit', 'vegetable', 'grain'
]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def grade_from_score(score: float) -> str:
    if score >= 85:
        return 'A'
    if score >= 70:
        return 'B'
    if score >= 55:
        return 'C'
    return 'D'


def _advisor_from_recommendations(recommendations: List[str]) -> str:
    clean = [str(item).strip() for item in (recommendations or []) if str(item).strip()]
    if not clean:
        return 'Crop ko alag karke saf storage me rakhein aur daily visual check karein.'
    return clean[0]


def _nirdeshak_steps(recommendations: List[str], max_steps: int = 4) -> List[str]:
    clean = [str(item).strip() for item in (recommendations or []) if str(item).strip()]
    if clean:
        return clean[:max_steps]
    return [
        'Fasal lot ko healthy aur damaged lots me turant sort karein.',
        'Storage area ko dry aur ventilated rakhein.',
        'Har 24 ghante visual quality re-check karein.',
    ]


def _extract_json(text: str) -> Optional[Dict[str, object]]:
    if not text:
        return None

    cleaned = text.strip()

    fenced = re.search(r'```json\s*(\{.*?\})\s*```', cleaned, flags=re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    else:
        plain_fenced = re.search(r'```\s*(\{.*?\})\s*```', cleaned, flags=re.DOTALL)
        if plain_fenced:
            cleaned = plain_fenced.group(1)
        else:
            start = cleaned.find('{')
            end = cleaned.rfind('}')
            if start != -1 and end != -1 and end > start:
                cleaned = cleaned[start:end + 1]

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        return None
    except Exception:
        return None


def _clean_model_text(text: str) -> str:
    cleaned = (text or '').strip()
    if '</think>' in cleaned:
        cleaned = cleaned.split('</think>', 1)[1].strip()
    if cleaned.startswith('<think>'):
        cleaned = cleaned.replace('<think>', '', 1).strip()
    return cleaned


def _pretty_label(raw: str) -> str:
    text = (raw or '').strip().replace('_', ' ')
    if not text:
        return 'Unknown crop/produce'
    return ' '.join(part.capitalize() for part in text.split())


def _is_unknown_label(label: str) -> bool:
    low = (label or '').lower().strip()
    return low in {'', 'unknown', 'unknown crop', 'unknown crop/produce', 'not sure', 'uncertain'}


def _infer_detected_label(crop_type: str, filename: str, metrics: Dict[str, float], mean_rgb: Dict[str, float]) -> Dict[str, object]:
    if crop_type != 'general':
        return {
            'detected_crop_label': _pretty_label(crop_type),
            'detected_crop_confidence': 78.0,
        }

    fname = (filename or '').lower()
    for key in KNOWN_CROP_KEYWORDS:
        if key in fname:
            return {
                'detected_crop_label': _pretty_label(key),
                'detected_crop_confidence': 74.0,
            }

    g_ratio = float(metrics.get('green_ratio', 0.0))
    r_mean = float(mean_rgb.get('r', 0.0))
    g_mean = float(mean_rgb.get('g', 0.0))
    b_mean = float(mean_rgb.get('b', 0.0))
    brightness = float(metrics.get('brightness', 0.0))

    if g_ratio > 0.45 or (g_mean > r_mean + 12 and g_mean > b_mean + 12):
        return {
            'detected_crop_label': 'Leafy Vegetable',
            'detected_crop_confidence': 58.0,
        }

    if r_mean > g_mean + 16 and r_mean > b_mean + 20:
        return {
            'detected_crop_label': 'Red Produce (Tomato/Chili)',
            'detected_crop_confidence': 52.0,
        }

    if r_mean > 140 and g_mean > 120 and b_mean < 110:
        return {
            'detected_crop_label': 'Ripe Fruit/Vegetable',
            'detected_crop_confidence': 49.0,
        }

    if brightness < 55:
        return {
            'detected_crop_label': 'Low-light Crop Image',
            'detected_crop_confidence': 38.0,
        }

    return {
        'detected_crop_label': 'Unknown crop/produce',
        'detected_crop_confidence': 35.0,
    }


def _build_ai_result_from_free_text(text: str) -> Optional[Dict[str, object]]:
    cleaned = _clean_model_text(text)
    if not cleaned:
        return None

    score_match = re.search(r'\b(\d{1,3})(?:\s*/\s*100|\s*%)\b', cleaned)
    quality_score = 70.0
    if score_match:
        try:
            quality_score = clamp(float(score_match.group(1)), 0, 100)
        except Exception:
            quality_score = 70.0

    lines = [ln.strip('-*• ').strip() for ln in cleaned.splitlines() if ln.strip()]
    issues: List[str] = []
    recommendations: List[str] = []

    for ln in lines:
        low = ln.lower()
        if any(k in low for k in ['issue', 'problem', 'risk', 'defect', 'disease', 'damage', 'fungus', 'pest']):
            issues.append(ln)
        if any(k in low for k in ['recommend', 'advice', 'suggest', 'apply', 'use', 'improve', 'monitor']):
            recommendations.append(ln)

    if not issues:
        issues = ['AI analysis detected minor quality concerns that need manual inspection.']
    if not recommendations:
        recommendations = ['Use sorting, proper storage, and regular visual checks before market dispatch.']

    detected_crop_label = 'Unknown crop/produce'
    crop_keywords = [
        'wheat', 'rice', 'corn', 'maize', 'cotton', 'sugarcane', 'soybean',
        'tomato', 'potato', 'onion', 'banana', 'apple', 'grape', 'chili',
        'vegetable', 'fruit', 'pulses', 'leaf', 'grain'
    ]
    low_cleaned = cleaned.lower()
    for key in crop_keywords:
        if key in low_cleaned:
            detected_crop_label = key.capitalize()
            break

    confidence_pct = 72.0
    confidence_match = re.search(r'confidence[^\d]*(\d{1,3})\s*%?', low_cleaned)
    if confidence_match:
        try:
            confidence_pct = clamp(float(confidence_match.group(1)), 0, 100)
        except Exception:
            confidence_pct = 72.0

    return {
        'quality_score': round(quality_score, 1),
        'quality_grade': grade_from_score(quality_score),
        'detected_issues': issues[:5],
        'recommendations': recommendations[:6],
        'solving_advisor': _advisor_from_recommendations(recommendations[:6]),
        'nirdeshak': _nirdeshak_steps(recommendations[:6]),
        'quality_analysis': cleaned[:900],
        'confidence': 'medium',
        'detected_crop_label': detected_crop_label,
        'detected_crop_confidence': round(confidence_pct, 1),
    }


def _normalize_ai_result(ai_data: Dict[str, object]) -> Optional[Dict[str, object]]:
    try:
        raw_score = ai_data.get('quality_score', 0)
        quality_score = clamp(float(str(raw_score)), 0, 100)

        issues = ai_data.get('detected_issues') or []
        recommendations = ai_data.get('recommendations') or []

        if not isinstance(issues, list):
            issues = [str(issues)]
        if not isinstance(recommendations, list):
            recommendations = [str(recommendations)]

        issues = [str(item).strip() for item in issues if str(item).strip()][:5]
        recommendations = [str(item).strip() for item in recommendations if str(item).strip()][:6]
        solving_advisor = str(ai_data.get('solving_advisor', '')).strip() or _advisor_from_recommendations(recommendations)

        raw_nirdeshak = ai_data.get('nirdeshak') or ai_data.get('guidance_steps') or []
        if not isinstance(raw_nirdeshak, list):
            raw_nirdeshak = [str(raw_nirdeshak)] if str(raw_nirdeshak).strip() else []
        nirdeshak = [str(item).strip() for item in raw_nirdeshak if str(item).strip()][:4]
        if not nirdeshak:
            nirdeshak = _nirdeshak_steps(recommendations)

        quality_analysis = str(ai_data.get('quality_analysis', '')).strip()
        if not quality_analysis:
            quality_analysis = 'AI analysis generated successfully.'

        confidence = str(ai_data.get('confidence', 'medium')).lower().strip()
        if confidence not in {'low', 'medium', 'high'}:
            confidence = 'medium'

        detected_crop_label = _pretty_label(str(ai_data.get('detected_crop_label', '')).strip())
        if not detected_crop_label:
            detected_crop_label = 'Unknown crop/produce'

        raw_crop_confidence = ai_data.get('detected_crop_confidence')
        if raw_crop_confidence is None:
            default_map = {'low': 45.0, 'medium': 70.0, 'high': 88.0}
            detected_crop_confidence = default_map.get(confidence, 70.0)
        else:
            detected_crop_confidence = clamp(float(str(raw_crop_confidence)), 0, 100)

        return {
            'quality_score': round(quality_score, 1),
            'quality_grade': grade_from_score(quality_score),
            'detected_issues': issues or ['No major issues detected by AI model.'],
            'recommendations': recommendations or ['Continue standard monitoring and quality checks.'],
            'solving_advisor': solving_advisor,
            'nirdeshak': nirdeshak,
            'quality_analysis': quality_analysis,
            'confidence': confidence,
            'detected_crop_label': detected_crop_label,
            'detected_crop_confidence': round(detected_crop_confidence, 1),
        }
    except Exception:
        return None


def _ask_detected_label_ai(image_bytes: bytes, mime_type: str, crop_type: str, language: str) -> Optional[Dict[str, object]]:
    if not GEMINI_AVAILABLE:
        return None

    target_language = LANGUAGE_NAME.get(language, 'English')
    prompt = f"""
You are an agricultural vision assistant.
Identify what is most likely visible in this image.

Response language: {target_language}
Crop hint provided by user: {crop_type}

Return ONLY JSON with this schema:
{{
  "detected_crop_label": "most likely crop/produce/object in image",
  "detected_crop_confidence": number (0-100)
}}
""".strip()

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        model_candidates = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro']

        for model_name in model_candidates:
            response = None
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[prompt, image_part],
                    config={'response_mime_type': 'application/json'},
                )
            except Exception:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[prompt, image_part],
                    )
                except Exception:
                    response = None

            if response is None:
                continue

            parsed = _extract_json(_clean_model_text(getattr(response, 'text', '')))
            if not parsed:
                continue

            label = _pretty_label(str(parsed.get('detected_crop_label', '')).strip())
            if _is_unknown_label(label):
                continue

            raw_conf = parsed.get('detected_crop_confidence', 70)
            conf = clamp(float(str(raw_conf)), 0, 100)
            return {
                'detected_crop_label': label,
                'detected_crop_confidence': round(conf, 1),
            }
        return None
    except Exception:
        return None


def _ask_quality_ai_sarvam(prompt: str) -> Optional[Dict[str, object]]:
    service = get_sarvam_service()
    if not service.available:
        return None

    sarvam_prompt = f"""
{prompt}

Important:
- Return strict JSON only
- Include practical advice fields for farmers.

Required JSON schema:
{{
  "detected_crop_label": "name of crop/produce/object in image",
  "detected_crop_confidence": number (0-100),
  "quality_score": number (0-100),
  "detected_issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "solving_advisor": "single most important immediate action",
  "nirdeshak": ["step1", "step2", "step3"],
  "quality_analysis": "short practical analysis",
  "confidence": "low|medium|high"
}}
""".strip()

    result = service.generate_text(
        system_prompt='You are an expert agricultural quality analyst for Indian farmers. Return strict JSON only.',
        user_prompt=sarvam_prompt,
        temperature=0.2,
        max_tokens=420,
    )
    if not result.get('ok'):
        return None

    cleaned = _clean_model_text(str(result.get('text', '')))
    parsed = _extract_json(cleaned)
    if parsed:
        normalized = _normalize_ai_result(parsed)
        if normalized:
            return normalized

    return _build_ai_result_from_free_text(cleaned)


def _ask_quality_ai_image(prompt: str, image_bytes: bytes, mime_type: str = 'image/jpeg') -> Optional[Dict[str, object]]:
    if not GEMINI_AVAILABLE:
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        strict_prompt = (
            f"{prompt}\n\n"
            "Important: Return ONLY a valid JSON object matching the schema. "
            "Do not include markdown, code fences, or extra explanation."
        )

        model_candidates = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
        ]

        first_text = ''
        image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

        for model_name in model_candidates:
            response = None
            contents = [strict_prompt, image_part]
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config={'response_mime_type': 'application/json'},
                )
            except Exception:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                    )
                except Exception:
                    response = None

            if response is not None:
                first_text = _clean_model_text(getattr(response, 'text', ''))
                if first_text:
                    break

        parsed = _extract_json(first_text)
        if parsed:
            normalized = _normalize_ai_result(parsed)
            if normalized:
                return normalized

        if first_text:
            repair_prompt = f"""
Convert the following crop-quality vision analysis text into STRICT JSON only.

Return exactly this schema:
{{
  "detected_crop_label": "name of crop/produce/object in image",
    "detected_crop_confidence": number (0-100),
  "quality_score": number (0-100),
  "detected_issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "quality_analysis": "short practical analysis",
  "confidence": "low|medium|high"
}}

Text to convert:
{first_text}
""".strip()

            for model_name in model_candidates:
                repair_response = None
                try:
                    repair_response = client.models.generate_content(
                        model=model_name,
                        contents=repair_prompt,
                        config={'response_mime_type': 'application/json'},
                    )
                except Exception:
                    try:
                        repair_response = client.models.generate_content(
                            model=model_name,
                            contents=repair_prompt,
                        )
                    except Exception:
                        repair_response = None

                if repair_response is None:
                    continue

                repaired_text = _clean_model_text(getattr(repair_response, 'text', ''))
                repaired = _extract_json(repaired_text)
                if repaired:
                    normalized = _normalize_ai_result(repaired)
                    if normalized:
                        return normalized

        free_text_result = _build_ai_result_from_free_text(first_text)
        if free_text_result:
            return free_text_result

        return None
    except Exception:
        return None


def _ask_quality_ai(prompt: str) -> Optional[Dict[str, object]]:
    if not GEMINI_AVAILABLE:
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        strict_prompt = (
            f"{prompt}\n\n"
            "Important: Return ONLY a valid JSON object matching the schema. "
            "Do not include markdown, code fences, or extra explanation."
        )

        model_candidates = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
        ]

        first_text = ''
        for model_name in model_candidates:
            response = None
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=strict_prompt,
                    config={'response_mime_type': 'application/json'},
                )
            except Exception:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=strict_prompt,
                    )
                except Exception:
                    response = None

            if response is not None:
                first_text = _clean_model_text(getattr(response, 'text', ''))
                if first_text:
                    break

        parsed = _extract_json(first_text)
        if parsed:
            normalized = _normalize_ai_result(parsed)
            if normalized:
                return normalized

        if first_text:
            repair_prompt = f"""
Convert the following crop-quality analysis text into STRICT JSON only.

Return exactly this schema:
{{
  "quality_score": number (0-100),
  "detected_issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "quality_analysis": "short practical analysis",
  "confidence": "low|medium|high"
}}

Text to convert:
{first_text}
""".strip()

            for model_name in model_candidates:
                repair_response = None
                try:
                    repair_response = client.models.generate_content(
                        model=model_name,
                        contents=repair_prompt,
                        config={'response_mime_type': 'application/json'},
                    )
                except Exception:
                    try:
                        repair_response = client.models.generate_content(
                            model=model_name,
                            contents=repair_prompt,
                        )
                    except Exception:
                        repair_response = None

                if repair_response is None:
                    continue

                repaired_text = _clean_model_text(getattr(repair_response, 'text', ''))
                repaired = _extract_json(repaired_text)
                if repaired:
                    normalized = _normalize_ai_result(repaired)
                    if normalized:
                        return normalized

        free_text_result = _build_ai_result_from_free_text(first_text)
        if free_text_result:
            return free_text_result

        return None
    except Exception:
        return None


def summarize_image_metrics(metrics: Dict[str, float], crop_type: str) -> Dict[str, object]:
    brightness = metrics['brightness']
    contrast = metrics['contrast']
    sharpness = metrics['sharpness']
    green_ratio = metrics['green_ratio']

    score = 50.0
    issues: List[str] = []
    recommendations: List[str] = []

    if brightness < 70:
        score -= 10
        issues.append('Image appears dark and crop may be underexposed or unhealthy.')
        recommendations.append('Take image in natural daylight for better evaluation.')
    elif brightness > 200:
        score -= 6
        issues.append('Image is over-bright, fine crop details may be lost.')
        recommendations.append('Avoid direct harsh sunlight while capturing crop images.')
    else:
        score += 8

    if contrast < 25:
        score -= 8
        issues.append('Low contrast suggests dull texture or unclear crop condition.')
        recommendations.append('Check moisture, fungal presence, and image clarity.')
    else:
        score += 7

    if sharpness < 60:
        score -= 8
        issues.append('Image sharpness is low; visible damage may be hidden.')
        recommendations.append('Upload a focused close-up image of affected area.')
    else:
        score += 9

    if crop_type in ['vegetables', 'fruits', 'general']:
        if green_ratio < 0.12:
            score -= 7
            issues.append('Low healthy color ratio detected for produce sample.')
            recommendations.append('Inspect for ripening imbalance, dehydration, or disease spots.')
        else:
            score += 5
    else:
        if green_ratio < 0.08:
            score -= 5
            issues.append('Leaf/crop color ratio appears below expected range.')
            recommendations.append('Check nitrogen status and pest stress in field.')
        else:
            score += 4

    final_score = clamp(score, 0, 100)
    grade = grade_from_score(final_score)

    if not issues:
        issues.append('No major visual quality issue detected in uploaded image.')
    if not recommendations:
        recommendations.append('Continue current crop management and periodic monitoring.')

    summary = (
        f'Quality score {round(final_score, 1)}/100 (Grade {grade}). '
        f'Brightness {round(brightness, 1)}, contrast {round(contrast, 1)}, '
        f'sharpness {round(sharpness, 1)}.'
    )

    return {
        'quality_score': round(final_score, 1),
        'quality_grade': grade,
        'detected_issues': issues,
        'recommendations': recommendations,
        'solving_advisor': _advisor_from_recommendations(recommendations),
        'nirdeshak': _nirdeshak_steps(recommendations),
        'quality_analysis': summary,
        'confidence': 'medium',
        'detected_crop_label': crop_type.capitalize() if crop_type != 'general' else 'Unknown crop/produce',
        'detected_crop_confidence': 60.0 if crop_type != 'general' else 40.0,
    }


def summarize_text(description: str, crop_type: str) -> Dict[str, object]:
    text = description.lower()

    positive_terms = ['fresh', 'uniform', 'clean', 'healthy', 'green', 'firm', 'good']
    warning_terms = ['spot', 'rot', 'fungus', 'mold', 'yellow', 'wilt', 'damage', 'pest', 'hole']

    pos_hits = sum(1 for term in positive_terms if term in text)
    warn_hits = sum(1 for term in warning_terms if term in text)

    score = clamp(65 + pos_hits * 5 - warn_hits * 8, 5, 95)
    grade = grade_from_score(score)

    issues: List[str] = []
    recommendations: List[str] = []

    if warn_hits > 0:
        issues.append('Potential stress or defect indicators found in crop description.')
        recommendations.append('Segregate affected lot and inspect physically before sale/storage.')
    else:
        issues.append('No explicit defect keywords found in the provided description.')

    if 'yellow' in text or 'wilt' in text:
        recommendations.append('Check irrigation consistency and nutrient balance, especially nitrogen.')
    if 'spot' in text or 'fungus' in text or 'mold' in text:
        recommendations.append('Use preventive fungicide protocol and improve ventilation/storage dryness.')
    if 'pest' in text or 'hole' in text:
        recommendations.append('Inspect for pest infestation and apply integrated pest management.')

    if not recommendations:
        recommendations.append('Continue quality sorting and maintain clean storage practices.')

    analysis = (
        f'Text-based quality score {round(score, 1)}/100 (Grade {grade}) for {crop_type}. '
        f'Positive indicators: {pos_hits}, risk indicators: {warn_hits}.'
    )

    return {
        'quality_score': round(score, 1),
        'quality_grade': grade,
        'detected_issues': issues,
        'recommendations': recommendations,
        'solving_advisor': _advisor_from_recommendations(recommendations),
        'nirdeshak': _nirdeshak_steps(recommendations),
        'quality_analysis': analysis,
        'confidence': 'medium',
    }


@router.get('/supported-crops')
def get_supported_crops():
    return {
        'success': True,
        'supported_crops': SUPPORTED_CROPS,
    }


@router.get('/disease-model-health')
def disease_model_health():
    service = get_disease_detector_service()
    return {
        'success': True,
        'data': service.model_health(),
    }


@router.post('/train-disease-model')
def train_disease_model(
    metadata_path: str = Query(DEFAULT_DISEASE_METADATA_PATH, description='Path to metadata JSON'),
    dataset_root: str = Query(DEFAULT_DISEASE_DATASET_ROOT, description='Dataset root containing dataset_catalog.csv and images'),
    epochs: int = Query(3, ge=1, le=30),
    batch_size: int = Query(32, ge=8, le=128),
):
    service = get_disease_detector_service()
    try:
        result = service.train_model(
            metadata_path=metadata_path,
            dataset_root=dataset_root,
            epochs=epochs,
            batch_size=batch_size,
        )
        return {
            'success': True,
            'message': 'Disease CNN model trained successfully',
            'data': result,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Disease model training failed: {str(exc)}')


@router.post('/analyze-image')
async def analyze_image_quality(
    file: UploadFile = File(...),
    crop_type: str = Query('general', description='Crop type'),
    language: str = Query('en', description='Response language'),
):
    try:
        if crop_type not in SUPPORTED_CROPS:
            crop_type = 'general'

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail='Empty file uploaded')

        image = Image.open(io.BytesIO(content)).convert('RGB')
        img_arr = np.array(image)

        gray = np.dot(img_arr[..., :3], [0.2989, 0.587, 0.114])
        brightness = float(np.mean(gray))
        contrast = float(np.std(gray))

        # Lightweight sharpness proxy using neighboring pixel differences.
        sharpness = float(np.mean(np.abs(np.diff(gray, axis=0))) + np.mean(np.abs(np.diff(gray, axis=1))))

        r = img_arr[..., 0].astype(np.float32)
        g = img_arr[..., 1].astype(np.float32)
        b = img_arr[..., 2].astype(np.float32)
        green_mask = (g > r * 1.08) & (g > b * 1.05)
        green_ratio = float(np.mean(green_mask))
        mean_rgb = {
            'r': float(np.mean(r)),
            'g': float(np.mean(g)),
            'b': float(np.mean(b)),
        }

        metrics = {
            'brightness': brightness,
            'contrast': contrast,
            'sharpness': sharpness,
            'green_ratio': green_ratio,
        }

        heuristic_summary = summarize_image_metrics(metrics, crop_type)

        target_language = LANGUAGE_NAME.get(language, 'English')
        ai_prompt = f"""
You are an expert agricultural quality analyst.
Analyze crop quality using these computed visual metrics and return JSON only.

Language for response: {target_language}
Crop type: {crop_type}
Image metrics:
- brightness: {round(brightness, 3)}
- contrast: {round(contrast, 3)}
- sharpness: {round(sharpness, 3)}
- green_ratio: {round(green_ratio, 3)}

Return strictly this JSON schema:
{{
    "detected_crop_label": "name of crop/produce/object in image",
    "detected_crop_confidence": number (0-100),
  "quality_score": number (0-100),
  "detected_issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "quality_analysis": "short practical analysis",
  "confidence": "low|medium|high"
}}

Keep issues and recommendations short, practical, and farmer-friendly.
""".strip()

        sarvam_summary = _ask_quality_ai_sarvam(ai_prompt)

        gemini_summary = _ask_quality_ai_image(
            ai_prompt,
            content,
            file.content_type or 'image/jpeg',
        )

        ai_summary = sarvam_summary or gemini_summary

        ai_label = None
        if not sarvam_summary:
            ai_label = _ask_detected_label_ai(
                content,
                file.content_type or 'image/jpeg',
                crop_type,
                language,
            )

        summary = ai_summary or heuristic_summary
        source = 'sarvam_ai' if sarvam_summary else 'gemini_ai' if gemini_summary else 'heuristic_fallback'

        disease_result = None
        disease_service = get_disease_detector_service()
        if disease_service.available:
            try:
                pred = disease_service.predict(content)
                if float(pred.get('confidence_pct', 0)) >= 40:
                    disease_result = pred
            except Exception:
                disease_result = None

        fallback_label = _infer_detected_label(crop_type, file.filename or '', metrics, mean_rgb)

        detected_label = summary.get('detected_crop_label', '')
        detected_conf = summary.get('detected_crop_confidence', 0)

        if ai_label and not _is_unknown_label(str(ai_label.get('detected_crop_label', ''))):
            detected_label = ai_label.get('detected_crop_label', detected_label)
            detected_conf = ai_label.get('detected_crop_confidence', detected_conf)

        if _is_unknown_label(str(detected_label)):
            detected_label = fallback_label.get('detected_crop_label', 'Unknown crop/produce')
            detected_conf = fallback_label.get('detected_crop_confidence', 35.0)

        if disease_result:
            disease_crop = str(disease_result.get('crop', '')).strip()
            if disease_crop and not _is_unknown_label(disease_crop):
                detected_label = _pretty_label(disease_crop)
                try:
                    detected_conf_num = float(str(detected_conf))
                except Exception:
                    detected_conf_num = 0.0
                disease_conf_num = float(str(disease_result.get('confidence_pct', 0)))
                detected_conf = max(detected_conf_num, disease_conf_num)

            disease_name = str(disease_result.get('disease', '')).strip()
            treatment = disease_result.get('treatment_suggestions', []) or []
            existing_issues = summary.get('detected_issues', [])
            if not isinstance(existing_issues, list):
                existing_issues = [str(existing_issues)]

            existing_recommendations = summary.get('recommendations', [])
            if not isinstance(existing_recommendations, list):
                existing_recommendations = [str(existing_recommendations)]

            if disease_name:
                summary['detected_issues'] = [f'Possible disease detected: {disease_name}'] + existing_issues

            if isinstance(treatment, list) and treatment:
                summary['recommendations'] = [str(item) for item in treatment] + existing_recommendations

        summary['solving_advisor'] = str(summary.get('solving_advisor', '')).strip() or _advisor_from_recommendations(summary.get('recommendations', []))
        raw_steps = summary.get('nirdeshak') or []
        if not isinstance(raw_steps, list):
            raw_steps = [str(raw_steps)] if str(raw_steps).strip() else []
        summary['nirdeshak'] = [str(item).strip() for item in raw_steps if str(item).strip()][:4] or _nirdeshak_steps(summary.get('recommendations', []))

        summary['detected_crop_label'] = _pretty_label(str(detected_label))
        summary['detected_crop_confidence'] = round(clamp(float(str(detected_conf)), 0, 100), 1)

        return {
            'success': True,
            'mode': 'image',
            'crop_type': crop_type,
            'language': language,
            'metrics': {k: round(v, 3) for k, v in metrics.items()},
            'mean_rgb': {k: round(v, 1) for k, v in mean_rgb.items()},
            'analysis_source': source,
            'disease_detection_source': 'cnn_model' if disease_result else 'ai_or_heuristic',
            'detected_disease': disease_result.get('disease') if disease_result else None,
            'disease_confidence': disease_result.get('confidence_pct') if disease_result else None,
            'treatment_suggestions': disease_result.get('treatment_suggestions', []) if disease_result else summary.get('recommendations', []),
            'ai_enabled': QUALITY_AI_AVAILABLE,
            **summary,
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            'success': False,
            'error': f'Image analysis failed: {str(e)}',
            'language': language,
        }


@router.post('/analyze-text')
def analyze_text_quality(
    crop_type: str = Query('general', description='Crop type'),
    description: str = Query(..., description='Text description of crop condition'),
    language: str = Query('en', description='Response language'),
):
    if not description.strip():
        raise HTTPException(status_code=400, detail='Description is required')

    if crop_type not in SUPPORTED_CROPS:
        crop_type = 'general'

    heuristic_summary = summarize_text(description, crop_type)

    target_language = LANGUAGE_NAME.get(language, 'English')
    ai_prompt = f"""
You are an expert agricultural quality analyst.
Evaluate this crop description and return JSON only.

Language for response: {target_language}
Crop type: {crop_type}
Description: {description}

Return strictly this JSON schema:
{{
  "quality_score": number (0-100),
  "detected_issues": ["issue1", "issue2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "quality_analysis": "short practical analysis",
  "confidence": "low|medium|high"
}}
""".strip()

    sarvam_summary = _ask_quality_ai_sarvam(ai_prompt)
    gemini_summary = _ask_quality_ai(ai_prompt)
    summary = sarvam_summary or gemini_summary or heuristic_summary
    summary['solving_advisor'] = str(summary.get('solving_advisor', '')).strip() or _advisor_from_recommendations(summary.get('recommendations', []))
    raw_steps = summary.get('nirdeshak') or []
    if not isinstance(raw_steps, list):
        raw_steps = [str(raw_steps)] if str(raw_steps).strip() else []
    summary['nirdeshak'] = [str(item).strip() for item in raw_steps if str(item).strip()][:4] or _nirdeshak_steps(summary.get('recommendations', []))
    source = 'sarvam_ai' if sarvam_summary else 'gemini_ai' if gemini_summary else 'heuristic_fallback'

    return {
        'success': True,
        'mode': 'text',
        'crop_type': crop_type,
        'language': language,
        'analysis_source': source,
        'ai_enabled': QUALITY_AI_AVAILABLE,
        **summary,
    }

"""
Farming Intent Analyzer - Detects farmer problems and provides smart solutions
Full AI Logic: Input → Intent → Data Collect → Process → Answer
"""

import re
from typing import Dict, List, Any, Optional


GENERAL_FARMING_KEYWORDS = [
    "farmer", "kisan", "किसान", "farming", "खेती", "agriculture", "कृषि",
    "crop", "फसल", "beej", "बीज", "buvai", "बुवाई", "ropai", "रोपाई",
    "harvest", "कटाई", "mandi", "मंडी", "soil", "मिट्टी", "water", "पानी",
    "fertilizer", "खाद", "pesticide", "कीटनाशक", "disease", "रोग", "pest", "कीट",
    "rice", "धान", "wheat", "गेहूं", "maize", "मक्का", "potato", "आलू",
    "tomato", "टमाटर", "onion", "प्याज", "mustard", "सरसों", "soybean", "सोयाबीन"
]

# Intent Detection Keywords (Hindi + English)
INTENT_KEYWORDS = {
    "pest": {
        "keywords": ["कीड़ा", "कीट", "कीड़ी", "जूँ", "सूंडी", "इल्ली", "pest", "insect", "bug", "worm", "larva", "keet", "kida", "kidaa", "sundi"],
        "intent": "pest_management",
        "icon": "🐛",
        "hindi_name": "कीट प्रबंधन"
    },
    "disease": {
        "keywords": ["रोग", "फफूंद", "बीमारी", "infection", "fungal", "disease", "blight", "rust", "scab", "bimari", "rog", "daag"],
        "intent": "disease_control",
        "icon": "🦠",
        "hindi_name": "रोग नियंत्रण"
    },
    "water": {
        "keywords": ["पानी", "सिंचाई", "नमी", "सूखा", "जल", "irrigation", "water", "drought", "moisture", "wet", "paani", "sinchai", "sichai", "sukha"],
        "intent": "irrigation",
        "icon": "💧",
        "hindi_name": "सिंचाई प्रबंधन"
    },
    "fertilizer": {
        "keywords": ["खाद", "उर्वरक", "पोषक", "NPK", "नाइट्रोजन", "phosphorus", "potassium", "fertilizer", "nutrient", "compost", "khad", "urvarak", "poshak"],
        "intent": "nutrient_management",
        "icon": "🌱",
        "hindi_name": "पोषक तत्व प्रबंधन"
    },
    "price": {
        "keywords": ["दाम", "भाव", "बाजार", "कीमत", "मंडी", "price", "market", "sell", "cost", "rate", "daam", "bhav", "mandi bhav", "bikri"],
        "intent": "market_price",
        "icon": "💰",
        "hindi_name": "बाजार भाव"
    },
    "weather": {
        "keywords": ["मौसम", "बारिश", "तापमान", "ठंड", "गर्मी", "wind", "weather", "rain", "temperature", "frost", "hail", "mausam", "barish", "garmi", "thand"],
        "intent": "weather_advisory",
        "icon": "🌧️",
        "hindi_name": "मौसम सलाह"
    },
    "yields": {
        "keywords": ["उपज", "पैदावार", "बढ़ाना", "सुधारना", "production", "yield", "increase", "improve", "grow"],
        "intent": "yield_improvement",
        "icon": "📈",
        "hindi_name": "उपज बृद्धि"
    },
    "soil": {
        "keywords": ["मिट्टी", "जमीन", "भूमि", "दोमट", "बलुई", "soil", "earth", "loamy", "clay", "sandy", "pH", "mitti", "jameen", "zamin"],
        "intent": "soil_management",
        "icon": "🏜️",
        "hindi_name": "मिट्टी प्रबंधन"
    },
    "cultivation": {
        "keywords": [
            "खेती", "बुवाई", "रोपाई", "बीज", "किस्म", "कैसे करें", "कैसे करे", "कैसे लगाएं",
            "cultivation", "farming", "sowing", "seed", "variety", "how to grow", "how to cultivate",
            "धान", "rice", "गेहूं", "wheat", "मक्का", "maize", "corn", "आलू", "potato"
        ],
        "intent": "crop_cultivation",
        "icon": "🌾",
        "hindi_name": "फसल खेती मार्गदर्शन"
    },
}

# Rule-Based Solutions Database
RULE_BASED_SOLUTIONS = {
    "pest_management": {
        "hindi": "कीट प्रबंधन",
        "icon": "🐛",
        "common_solutions": [
            "✅ नीम का तेल छिड़काव (3-5% solution)",
            "✅ पीले स्टिकी ट्रैप्स लगाएं",
            "✅ प्रभावित पत्तियों को हटाएं",
            "✅ जैविक कीटनाशक (Bacillus thuringiensis) का उपयोग करें",
            "✅ यदि गंभीर हो तो रासायनिक कीटनाशक का सही किस्म इस्तेमाल करें"
        ],
        "timing": "सुबह 5-7 AM या शाम 5-7 PM में स्प्रे करें"
    },
    "disease_control": {
        "hindi": "रोग नियंत्रण",
        "icon": "🦠",
        "common_solutions": [
            "✅ संक्रमित पौधों को तुरंत हटाएं",
            "✅ ट्राइकोडर्मा का उपयोग करें (जैविक नियंत्रण)",
            "✅ बोर्डो मिश्रण (1%) 7-10 दिन के अंतराल पर स्प्रे करें",
            "✅ संक्रमण फैलने से पहले क्षेत्र को अलग करें",
            "✅ अगली फसल में रोग-रोधी किस्मों का उपयोग करें"
        ],
        "timing": "बीज उपचार और नियमित निरीक्षण जरूरी है"
    },
    "irrigation": {
        "hindi": "सिंचाई प्रबंधन",
        "icon": "💧",
        "common_solutions": [
            "✅ मिट्टी की नमी जांचें (फिंगर टेस्ट या नमी मापी से)",
            "✅ गर्मी में 7-10 दिन के अंतराल पर सिंचाई करें",
            "✅ सर्दी में 15-20 दिन के अंतराल पर सिंचाई करें",
            "✅ ड्रिप सिंचाई सबसे कुशल है (50% पानी बचाता है)",
            "✅ शाम को सिंचाई करें (वाष्पीकरण कम होता है)"
        ],
        "timing": "मिट्टी के प्रकार और मौसम पर निर्भर करता है"
    },
    "nutrient_management": {
        "hindi": "पोषक तत्व प्रबंधन",
        "icon": "🌱",
        "common_solutions": [
            "✅ मिट्टी परीक्षण करवाएं (NPK स्तर जानने के लिए)",
            "✅ गाय का गोबर या कम्पोस्ट 5 टन/एकड़ डालें",
            "✅ यूरिया: पहली दो किश्तें (बुवाई के 30 और 60 दिन बाद)",
            "✅ DAP/SSP: बुवाई के समय डालें",
            "✅ माइक्रो पोषक तत्वों के लिए जिंक सल्फेट प्रयोग करें"
        ],
        "timing": "फसल के विभिन्न चरणों में अलग-अलग"
    },
    "market_price": {
        "hindi": "बाजार भाव",
        "icon": "💰",
        "common_solutions": [
            "✅ मंडी के भाव रोज़ चेक करें (AGMARK website पर)",
            "✅ सही समय पर बेचें - जब भाव अच्छा हो",
            "✅ थोक क्रेता से सीधे संपर्क करने पर अधिक दाम मिले",
            "✅ फसल तुरंत न बेचें, सही भाव का इंतज़ार करें",
            "✅ MSP (न्यूनतम समर्थन मूल्य) से कम न बेचें"
        ],
        "timing": "कटाई के बाद का सही समय है"
    },
    "crop_cultivation": {
        "hindi": "फसल खेती मार्गदर्शन",
        "icon": "🌾",
        "common_solutions": [
            "✅ अपनी मिट्टी और मौसम के अनुसार किस्म चुनें",
            "✅ बीज उपचार करके ही बुवाई/रोपाई करें",
            "✅ समय पर सिंचाई और निंदाई-गुड़ाई करें",
            "✅ चरण अनुसार खाद दें (बेसल + टॉप ड्रेसिंग)",
            "✅ कीट-रोग की साप्ताहिक निगरानी करें"
        ],
        "timing": "स्थानीय मौसम और फसल कैलेंडर के अनुसार करें"
    }
}

CROP_CULTIVATION_GUIDES = {
    "rice": {
        "hindi": "धान की खेती",
        "aliases": ["rice", "धान", "paddy"],
        "steps": [
            "1. खेत की अच्छी जुताई करके पानी रोकने लायक समतलीकरण करें।",
            "2. 20-30 दिन की नर्सरी तैयार करें और स्वस्थ पौधों की रोपाई 20x10 cm दूरी पर करें।",
            "3. बुवाई/रोपाई के समय बेसल खाद दें, फिर 25-30 और 45-50 दिन पर नाइट्रोजन टॉप ड्रेसिंग करें।",
            "4. खेत में हल्की नमी बनाए रखें; लगातार गहरा पानी न रखें, जरूरत अनुसार सिंचाई करें।",
            "5. तना छेदक/झुलसा रोग की निगरानी करें और जरूरत पर अनुशंसित जैविक/रासायनिक नियंत्रण करें।"
        ],
        "timing": "धान रोपाई का अच्छा समय आपके राज्य के मानसून की शुरुआत के साथ होता है"
    },
    "wheat": {
        "hindi": "गेहूं की खेती",
        "aliases": ["wheat", "गेहूं", "gehu"],
        "steps": [
            "1. अच्छी जुताई करके भुरभुरी मिट्टी तैयार करें और प्रमाणित बीज लें।",
            "2. समय पर बुवाई करें और लाइन से बीज डालें ताकि पौध संख्या सही रहे।",
            "3. बुवाई के समय बेसल खाद दें, पहली सिंचाई क्राउन रूट स्टेज पर करें।",
            "4. खरपतवार नियंत्रण 25-30 दिन में करें और रोग-कीट की निगरानी रखें।",
            "5. दाना भराव और पकने के चरण में सिंचाई प्रबंधन सही रखें और समय पर कटाई करें।"
        ],
        "timing": "गेहूं की बुवाई सामान्यतः अक्टूबर-नवंबर में सर्वोत्तम रहती है"
    }
}

# Dynamic Questions Database based on Intent
DYNAMIC_QUESTIONS = {
    "pest_management": [
        {
            "key": "affected_crop",
            "hindi": "किस फसल में कीड़ा है?",
            "english": "Which crop is affected by pest?",
            "examples": "जैसे: गेहूं, मक्का, सोयाबीन, आलू"
        },
        {
            "key": "affected_area",
            "hindi": "कितने प्रतिशत पत्तियां प्रभावित हैं?",
            "english": "What % of leaves are affected?",
            "examples": "जैसे: 10%, 30%, 50%"
        },
        {
            "key": "pest_type",
            "hindi": "कीड़े की क्या शकल है?",
            "english": "What does the pest look like?",
            "examples": "जैसे: हरा, काला, सूंडी, जूँ"
        }
    ],
    "disease_control": [
        {
            "key": "disease_symptom",
            "hindi": "पत्तियों पर क्या दिख रहा है?",
            "english": "What symptoms do you see?",
            "examples": "जैसे: भूरे धब्बे, सफेद पाउडर, सड़न"
        },
        {
            "key": "disease_spread",
            "hindi": "क्या यह पूरे खेत में फैल गया?",
            "english": "Is it spreading?",
            "examples": "जैसे: हाँ, नहीं, कुछ हिस्से में"
        }
    ],
    "irrigation": [
        {
            "key": "soil_type",
            "hindi": "आपकी मिट्टी किस प्रकार की है?",
            "english": "What type is your soil?",
            "examples": "जैसे: दोमट, बलुई, चिकनी, लवणीय"
        },
        {
            "key": "current_moisture",
            "hindi": "मिट्टी में नमी कितनी है?",
            "english": "How moist is the soil?",
            "examples": "जैसे: सूखी, गीली, सामान्य"
        }
    ],
    "general_farming": [
        {
            "key": "crop_name",
            "hindi": "आप कौन सी फसल के बारे में सलाह चाहते हैं?",
            "english": "Which crop do you need guidance for?",
            "examples": "जैसे: धान, गेहूं, मक्का, सब्ज़ी"
        },
        {
            "key": "farm_stage",
            "hindi": "फसल अभी किस स्टेज में है?",
            "english": "What stage is the crop in?",
            "examples": "जैसे: बुवाई, बढ़वार, फूल, कटाई"
        }
    ],
    "crop_cultivation": [
        {
            "key": "crop_name",
            "hindi": "आप कौन सी फसल उगाना चाहते हैं?",
            "english": "Which crop do you want to cultivate?",
            "examples": "जैसे: धान, गेहूं, मक्का, आलू"
        },
        {
            "key": "land_size",
            "hindi": "कितनी जमीन में खेती करनी है?",
            "english": "How much land do you have?",
            "examples": "जैसे: 1 एकड़, 3 एकड़"
        }
    ]
}

class FarmingIntentAnalyzer:
    """Analyzes farmer's input and generates intelligent responses"""

    @staticmethod
    def detect_intent(message: str) -> Dict[str, Any]:
        """
        Detect the primary intent from farmer's message
        
        Returns:
        {
            'intent': 'pest_management',
            'confidence': 0.95,
            'icon': '🐛',
            'hindi_name': 'कीट प्रबंधन',
            'keywords_found': ['कीड़ा', 'पत्तियां']
        }
        """
        message_lower = message.lower()
        intent_scores = {}

        # Score each intent based on keyword matches
        for intent_group, intent_data in INTENT_KEYWORDS.items():
            matches = [kw for kw in intent_data["keywords"] if kw in message_lower]
            if matches:
                intent_scores[intent_group] = {
                    "score": len(matches),  # Number of keyword matches
                    "data": intent_data,
                    "keywords_found": matches
                }

        # Return the highest scoring intent
        if not intent_scores:
            generic_matches = [kw for kw in GENERAL_FARMING_KEYWORDS if kw in message_lower]
            if generic_matches:
                return {
                    "intent": "general_farming",
                    "confidence": min(len(generic_matches) / 5, 0.75),
                    "icon": "🌾",
                    "hindi_name": "सामान्य कृषि मार्गदर्शन",
                    "keywords_found": generic_matches[:5]
                }
            return {
                "intent": "general_farming",
                "confidence": 0,
                "icon": "🌾",
                "hindi_name": "सामान्य कृषि सवाल",
                "keywords_found": []
            }

        best_intent = max(intent_scores.items(), key=lambda x: x[1]["score"])
        intent_group = best_intent[0]
        intent_data = best_intent[1]["data"]

        return {
            "intent": intent_data["intent"],
            "intent_group": intent_group,
            "confidence": min(len(best_intent[1]["keywords_found"]) / 3, 1.0),  # Max 1.0
            "icon": intent_data["icon"],
            "hindi_name": intent_data["hindi_name"],
            "keywords_found": best_intent[1]["keywords_found"]
        }

    @staticmethod
    def extract_crop_name(message: str) -> Optional[str]:
        message_lower = message.lower()
        for crop_key, crop_data in CROP_CULTIVATION_GUIDES.items():
            for alias in crop_data.get("aliases", []):
                if alias in message_lower:
                    return crop_key
        return None

    @staticmethod
    def get_crop_cultivation_solution(message: str) -> Optional[Dict[str, Any]]:
        crop_key = FarmingIntentAnalyzer.extract_crop_name(message)
        if not crop_key:
            return None

        crop = CROP_CULTIVATION_GUIDES[crop_key]
        return {
            "hindi": crop["hindi"],
            "icon": "🌾",
            "common_solutions": crop["steps"],
            "timing": crop["timing"],
        }

    @staticmethod
    def get_rule_based_solution(intent: str, message: str = "") -> Optional[Dict[str, Any]]:
        """Get rule-based solution if available for the detected intent"""
        if intent == "crop_cultivation":
            crop_specific = FarmingIntentAnalyzer.get_crop_cultivation_solution(message)
            if crop_specific:
                return crop_specific

        for key in RULE_BASED_SOLUTIONS:
            if key in intent or intent in key:
                return RULE_BASED_SOLUTIONS[key]
        return None

    @staticmethod
    def get_follow_up_questions(intent: str) -> List[Dict[str, str]]:
        """Get smart follow-up questions based on intent"""
        for intent_type, questions in DYNAMIC_QUESTIONS.items():
            if intent_type in intent or intent in intent_type:
                return questions
        return []

    @staticmethod
    def format_response(
        problem: str,
        solution: str,
        intent_data: Dict[str, Any]
    ) -> str:
        """
        Format the response in the exact template user specified:
        
        🌾 समस्या: ...
        ✅ समाधान:
        1.
        2.
        ...
        🎯 परिणाम: ...
        """
        icon = intent_data.get("icon", "🌾")
        hindi_name = intent_data.get("hindi_name", "समस्या")

        formatted = f"""
{icon} **समस्या:** {problem}

✅ **समाधान:**
{solution}

🎯 **परिणाम:** 
सही समय पर सही कदम उठाने से आपकी फसल सुरक्षित रहेगी।

💡 **अगला कदम:** 
आजकल के मौसम में इन सुझावों को अमल में लाएं।
"""
        return formatted.strip()

    @staticmethod
    def build_smart_context(
        profile: Dict[str, str],
        detected_intent: Dict[str, Any]
    ) -> str:
        """Build enhanced context for LLM using farmer profile and intent"""
        lines = [
            f"किसान की जानकारी:",
            f"- खेती का प्रकार: {profile.get('farmingType', 'N/A')}",
            f"- किसान स्तर: {profile.get('farmLevel', 'N/A')}",
            f"- मुख्य लक्ष्य: {profile.get('mainGoal', 'N/A')}",
            f"- राज्य: {profile.get('state', 'N/A')}",
            f"- मुख्य समस्या: {profile.get('mainProblem', 'N/A')}",
            "",
            f"वर्तमान प्रश्न:",
            f"- समस्या का प्रकार: {detected_intent.get('hindi_name', 'unknown')}",
            f"- पहचान किए गए कीवर्ड: {', '.join(detected_intent.get('keywords_found', []))}",
            f"- आत्मविश्वास स्तर: {int(detected_intent.get('confidence', 0) * 100)}%",
        ]
        return '\n'.join(lines)


def analyze_farming_input(
    message: str,
    farmer_profile: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Complete analysis pipeline:
    Input → Intent Detection → Get Solutions → Prepare Context
    """
    
    analyzer = FarmingIntentAnalyzer()
    
    # Step 1: Detect Intent
    intent_data = analyzer.detect_intent(message)
    
    # Step 2: Get Rule-Based Solution (if available)
    rule_solution = analyzer.get_rule_based_solution(intent_data["intent"], message)
    
    # Step 3: Get Follow-up Questions
    follow_up_questions = analyzer.get_follow_up_questions(intent_data["intent"])
    
    # Step 4: Build Enhanced Context for LLM
    enhanced_context = ""
    if farmer_profile:
        enhanced_context = analyzer.build_smart_context(farmer_profile, intent_data)
    
    broad_query_intents = {"general_farming", "crop_cultivation", "yield_improvement", "soil_management"}

    return {
        "intent": intent_data,
        "rule_based_solution": rule_solution,
        "follow_up_questions": follow_up_questions,
        "enhanced_context": enhanced_context,
        "should_use_ai": (rule_solution is None) or (intent_data.get("intent") in broad_query_intents),
    }

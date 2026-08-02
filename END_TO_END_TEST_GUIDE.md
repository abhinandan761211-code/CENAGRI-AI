# 🌾 End-to-End Testing Guide - Farming AI Assistant

## Overview
This guide walks through testing the complete Farming AI Assistant with intent detection, rule-based solutions, and AI fallback.

---

## 🚀 Setup & Prerequisites

### Backend Requirements
- ✅ `farming_intent_analyzer.py` - Intent detection service
- ✅ `advisory.py` - Enhanced `/advisory/ask` endpoint
- ✅ Gemini API key configured in `.env`

### Frontend Requirements  
- ✅ `FarmingAdvisor.js` - Updated to pass profile to backend
- ✅ `api.js` - Enhanced `getFarmingAdvisory()` with profile parameter
- ✅ `FarmingAdvisor.css` - Styled intent metadata and follow-up questions

### Environment Variables
```bash
# Backend
GEMINI_API_KEY=your_gemini_key
SARVAM_API_KEY=your_sarvam_key  # Optional fallback
APIFY_API_KEY=your_apify_key    # Optional fallback

# Frontend
REACT_APP_API_BASE_URL=http://localhost:8000/api
```

---

## 🧪 Test Scenarios

### Test 1: Rule-Based Solution (Pest Problem)
**Objective**: Verify instant pest management solution without AI call

**Steps**:
1. Open FarmingAdvisor page
2. Complete onboarding:
   - Farming Type: फसल खेती 🌾
   - Farm Level: छोटा किसान
   - Main Goal: रोग/कीट नियंत्रण
   - State: बिहार
   - Main Problem: कीट/रोग

3. Ask question: **"मेरे गेहूं में कीड़े लग गए हैं, क्या करूँ?"**

**Expected Results** ✅:
- Response appears **instantly** (< 1 second)
- Intent badge shows: 🐛 कीट प्रबंधन
- Source badge shows: ⚡ तुरंत समाधान (rule-based)
- Confidence: ~95-100%
- Response includes numbered steps (1-4)
- Follow-up questions appear below

**Response Format**:
```
🌾 समस्या: आपके गेहूं में कीड़ों की समस्या है

✅ समाधान (कीट प्रबंधन):
1. कीड़ों की पहचान करें (थ्रिप्स, शूट फ्लाई आदि)
2. जैविक विधि: नीम का तेल स्प्रे करें
3. ज़रूरत पड़ने पर रासायनिक कीटनाशक का उपयोग करें
4. नियमित निरीक्षण जारी रखें

⏰ समय सूचना: सुबह या शाम को छिड़काव करें

🎯 परिणाम:
सही समय पर कदम उठाने से गेहूं की फसल सुरक्षित रहेगी।
```

---

### Test 2: AI Fallback (Complex Question)
**Objective**: Verify AI fallback when no rule match, with enhanced context

**Steps**:
1. Stay in FarmingAdvisor with same profile
2. Ask question: **"मेरी मिट्टी खारी है और गेहूं की पुरानी किस्म लगी है। इस साल क्या बदलाव करूँ?"**

**Expected Results** ✅:
- Response takes 2-5 seconds (AI processing)
- Intent badge shows: 📈 उपज में सुधार (or similar)
- Source badge shows: 🤖 AI सलाह
- Confidence: 70-85% (typical for AI)
- Response is personalized to:
  - State: बिहार
  - Farm level: छोटा किसान
  - Problem: खारी मिट्टी
- Follow-up questions are contextually relevant

**Expected Follow-up Questions**:
- "खारी मिट्टी में कौन सी फसल सबसे अच्छी रहेगी?"
- "गेहूं की high-yield किस्में कौन सी हैं?"
- "जैविक खाद से मिट्टी में सुधार कैसे करूँ?"

---

### Test 3: Disease Management Solution
**Objective**: Test disease control rule-based solution

**Steps**:
1. Ask question: **"गेहूं में पत्ती धब्बा रोग हो गया है, उपचार बताओ"**

**Expected Results** ✅:
- Intent: 🦠 रोग नियंत्रण
- Source: ⚡ तुरंत समाधान
- Steps include fungicide application timing
- Follow-up questions about disease prevention

---

### Test 4: Irrigation Advisory
**Objective**: Test water/irrigation rule-based solution

**Steps**:
1. Ask question: **"गर्मी में धान को कितना पानी दूँ? कब-कब सिंचाई करूँ?"**

**Expected Results** ✅:
- Intent: 💧 सिंचाई प्रबंधन
- Source: ⚡ तुरंत समाधान
- Steps include schedule and water depth
- Timing advice per season

---

### Test 5: Market Price Query
**Objective**: Test market price advisory

**Steps**:
1. Ask question: **"इस बार गेहूं का भाव क्या रहेगा? MSP पर बेच सकते हैं?"**

**Expected Results** ✅:
- Intent: 💰 बाजार भाव
- Source: ⚡ तुरंत समाधान (or AI if needs real-time data)
- Information about MSP and market trends
- Follow-up about selling strategy

---

### Test 6: Follow-up Questions
**Objective**: Verify follow-up question interaction

**Steps**:
1. Receive advisory with follow-up questions
2. Click on suggested follow-up question button
3. Observe request sent with context

**Expected Results** ✅:
- Input field populates with clicked question
- Profile context preserved
- New response maintains conversation context
- New follow-up questions generated

---

### Test 7: Language Switching
**Objective**: Test multiple language support

**Steps**:
1. Change language from dropdown (Hindi → English)
2. Ask question in English: **"My wheat has brown spots on leaves. What should I do?"**
3. Change back to Hindi

**Expected Results** ✅:
- Intent detection works in English
- Response comes back in English
- All badges and formatting work with English text
- Profile questions adapt to selected language

---

### Test 8: Profile-Based Personalization
**Objective**: Verify profile context enhances AI responses

**Setup**:
- Profile A: बड़ा किसान, मुख्य लक्ष्य: उपज बढ़ाना, State: पंजाब
- Profile B: छोटा किसान, मुख्य लक्ष्य: लागत कम करना, State: बिहार

**Steps**:
1. Save two different profiles
2. Ask same question: **"अगली फसल के लिए बीज की सलाह दो"**
3. Compare AI responses

**Expected Results** ✅:
- Profile A gets high-yield variety recommendations
- Profile B gets cost-effective variety recommendations
- Both responses include state-specific advice
- Personalization is visible in wording

---

## 🔍 Response Validation Checklist

For each response, verify:

- [ ] **Advisory text present** - Non-empty response text
- [ ] **Intent detected** - Intent badge shows problem type
- [ ] **Hindi name shown** - कीट प्रबंधन, रोग नियंत्रण, etc.
- [ ] **Source badge present** - ⚡ or 🤖 icon visible
- [ ] **Confidence score** - Shows 0-100% (if rule-based)
- [ ] **Formatted properly** - Numbered steps, emoji bullets
- [ ] **Follow-up questions** - Minimum 2-3 suggestions
- [ ] **Mobile responsive** - Works on phone/tablet sizes
- [ ] **No console errors** - Check browser dev tools
- [ ] **No API errors** - Check backend logs

---

## 📊 Backend Validation

### Check Intent Detection
```bash
curl -X POST "http://localhost:8000/api/advisory/ask" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "मेरे गेहूं में कीड़े लगे हैं",
    "context": "",
    "language": "hi",
    "profile": "{\"farmingType\": \"फसल\", \"state\": \"बिहार\"}"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "advisory": "🌾 समस्या: ...",
  "intent": "pest_management",
  "intent_hindi": "कीट प्रबंधन",
  "confidence": 0.95,
  "source": "rule_based",
  "follow_up_questions": ["...", "...", "..."],
  "metadata": {
    "question": "मेरे गेहूं में कीड़े लगे हैं",
    "detected_keywords": ["कीड़े", "गेहूं"]
  }
}
```

---

## 🐛 Debugging Tips

### If Response is Slow
- Check backend is running: `ps aux | grep python`
- Check Gemini API quotas/rate limits
- Monitor network tab in browser DevTools

### If Intent Not Detected
- Check keyword matching in `farming_intent_analyzer.py`
- Verify question contains relevant Hindi/English keywords
- Check console logs for parsing errors

### If Follow-up Questions Missing
- Verify `DYNAMIC_QUESTIONS` dict has questions for detected intent
- Check response includes `follow_up_questions` array
- Frontend should iterate and render buttons

### If Profile Not Used
- Verify `profile` parameter passed to API
- Check backend's `json.loads(profile)` succeeds
- Verify enhanced context built correctly

---

## 📈 Performance Benchmarks

**Target Metrics**:
- Rule-based response: < 500ms
- AI response: 2-5 seconds
- Follow-up questions render: < 200ms
- Total page load: < 3 seconds

---

## ✅ Final Checklist

Before declaring complete:

- [ ] All 8 test scenarios pass
- [ ] No console errors in browser DevTools
- [ ] No errors in backend logs
- [ ] Profile correctly passed to backend
- [ ] Intent metadata displayed accurately
- [ ] Follow-up questions are relevant
- [ ] Mobile responsive (test on 375px width)
- [ ] Language switching works
- [ ] Backend returns correct response format
- [ ] CSS styling is polished and clean

---

## 🚀 Ready for Production When:

✅ All test scenarios pass
✅ No runtime errors
✅ Response times within target
✅ Mobile experience verified
✅ Edge cases handled (empty input, long text, special chars)
✅ Accessibility checked (keyboard nav, screen readers)

---

## 📞 Support & Troubleshooting

For issues:
1. Check backend logs: `tail -f logs/advisory.log`
2. Browser console: F12 → Console tab
3. Network tab: Check API request/response
4. Verify `.env` variables set correctly
5. Clear browser cache and rebuild frontend

---

**Document Created**: $(date)
**Last Updated**: $(date)
**Testing Status**: 🟢 READY TO TEST

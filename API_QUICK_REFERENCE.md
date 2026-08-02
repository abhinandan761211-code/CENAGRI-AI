# API Quick Reference Guide

## Base URL
```
http://localhost:8000
```

## Authentication
All requests require authentication headers (if implemented):
```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

---

## Quality Detection APIs

### Analyze Crop Quality from Image
**POST** `/quality/analyze-image`

```bash
curl -X POST "http://localhost:8000/quality/analyze-image?crop_type=wheat&language=hi" \
  -F "file=@crop_image.jpg"
```

**Query Parameters:**
- `crop_type` (string, default: "general") - Type of crop
- `language` (string, default: "en") - Response language

**Response:**
```json
{
  "success": true,
  "quality_analysis": "विस्तृत गुणवत्ता विश्लेषण...",
  "crop_type": "wheat",
  "language": "hi"
}
```

### Analyze Crop Quality from Text
**POST** `/quality/analyze-text`

```bash
curl -X POST "http://localhost:8000/quality/analyze-text?crop_type=wheat&description=yellow%20spots&language=en"
```

**Query Parameters:**
- `crop_type` (string, required)
- `description` (string, required)
- `language` (string, default: "en")

---

## Price Prediction APIs

### Get Price Prediction
**POST** `/market-price/predict`

```bash
curl -X POST "http://localhost:8000/market-price/predict?crop_name=wheat&quantity=100&season=current&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required) - e.g., "wheat", "rice", "cotton"
- `quantity` (number, required) - Quantity in quintals
- `season` (string, default: "current") - e.g., "kharif", "rabi"
- `language` (string, default: "en")

**Response:**
```json
{
  "success": true,
  "price_prediction": "₹3500-3800 प्रति क्विंटल...",
  "crop": "wheat",
  "quantity": 100,
  "language": "hi"
}
```

### Get Historical Price Trends
**GET** `/market-price/historical`

```bash
curl "http://localhost:8000/market-price/historical?crop_name=wheat&language=en"
```

**Query Parameters:**
- `crop_name` (string, required)
- `language` (string, default: "en")

### Get Current Market Rates
**GET** `/market-price/market-rates`

```bash
curl "http://localhost:8000/market-price/market-rates?crop_name=wheat&region=Punjab&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required)
- `region` (string, default: "all") - e.g., "Punjab", "Maharashtra", "all"
- `language` (string, default: "en")

---

## Crop Analysis APIs

### Get Comprehensive Crop Analysis
**GET** `/prediction/crop-analysis`

```bash
curl "http://localhost:8000/prediction/crop-analysis?crop_name=wheat&region=Punjab&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required)
- `region` (string, default: "general")
- `current_conditions` (string, optional) - e.g., "rainy", "drought"
- `language` (string, default: "en")

**Response:**
```json
{
  "success": true,
  "crop_analysis": "विस्तृत फसल विश्लेषण...",
  "crop": "wheat",
  "region": "Punjab",
  "language": "hi"
}
```

### Predict Crop Yield
**POST** `/prediction/yield-prediction`

```bash
curl -X POST "http://localhost:8000/prediction/yield-prediction?crop_name=wheat&area_hectares=5&region=Punjab&language=en"
```

**Query Parameters:**
- `crop_name` (string, required)
- `area_hectares` (number, required)
- `region` (string, default: "general")
- `weather_conditions` (string, optional)
- `language` (string, default: "en")

### Detect Disease Risk
**GET** `/prediction/disease-detection`

```bash
curl "http://localhost:8000/prediction/disease-detection?crop_name=wheat&region=Punjab&season=rabi&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required)
- `region` (string, default: "general")
- `season` (string, default: "current") - e.g., "kharif", "rabi", "zaid"
- `language` (string, default: "en")

---

## Farming Advisory APIs

### Ask Farming Question (Chat)
**POST** `/advisory/ask`

```bash
curl -X POST "http://localhost:8000/advisory/ask?question=मेरे%20पौधों%20पर%20पीली%20धब्बे%20हैं&context=गेहूं%2C%205%20हेक्टेयर&language=hi"
```

**Query Parameters:**
- `question` (string, required) - Farmer's question
- `context` (string, optional) - Additional context
- `language` (string, default: "en")

**Response:**
```json
{
  "success": true,
  "advisory": "विस्तृत सलाह और समाधान...",
  "question": "मेरे पौधों पर पीली धब्बे हैं",
  "language": "hi"
}
```

### Get Market Insights
**GET** `/advisory/market-insights`

```bash
curl "http://localhost:8000/advisory/market-insights?crop_type=wheat&language=en"
```

**Query Parameters:**
- `crop_type` (string, required)
- `language` (string, default: "en")

### Get Farming Tips
**POST** `/advisory/farming-tips`

```bash
curl -X POST "http://localhost:8000/advisory/farming-tips?crop_name=wheat&topic=irrigation&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required)
- `topic` (string, default: "general") - e.g., "irrigation", "fertilizer", "pest", "disease", "harvest"
- `language` (string, default: "en")

### Get Seasonal Guide
**POST** `/advisory/seasonal-guide`

```bash
curl -X POST "http://localhost:8000/advisory/seasonal-guide?crop_name=wheat&season=rabi&language=hi"
```

**Query Parameters:**
- `crop_name` (string, required)
- `season` (string, required) - "kharif", "rabi", "zaid"
- `language` (string, default: "en")

### Get Supported Languages
**GET** `/advisory/language-support`

```bash
curl "http://localhost:8000/advisory/language-support"
```

**Response:**
```json
{
  "success": true,
  "supported_languages": {
    "en": "English",
    "hi": "हिंदी",
    "mr": "मराठी",
    "gu": "ગુજરાતી",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "kn": "ಕನ್ನಡ",
    "ml": "മലയാളം",
    "pa": "ਪੰਜਾਬੀ",
    "bn": "বাংলা"
  },
  "total": 10
}
```

---

## JavaScript Examples

### React Component Example
```javascript
import { getFarmingAdvisory, analyzeQualityFromImage } from './services/api';
import { useState } from 'react';

export function FarmingAdvisor() {
  const [question, setQuestion] = useState('');
  const [advice, setAdvice] = useState('');
  const [language, setLanguage] = useState('en');

  const handleAsk = async () => {
    try {
      const result = await getFarmingAdvisory(question, '', language);
      if (result.success) {
        setAdvice(result.advisory);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">Farming Advisor</h2>
      
      <div className="mb-4">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="en">English</option>
          <option value="hi">हिंदी</option>
          <option value="mr">मराठी</option>
          <option value="gu">ગુજરાતી</option>
          <option value="ta">தமிழ்</option>
          <option value="te">తెలుగు</option>
          <option value="kn">ಕನ್ನಡ</option>
          <option value="ml">മലയാളം</option>
          <option value="pa">ਪੰਜਾਬੀ</option>
          <option value="bn">বাংলা</option>
        </select>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask your farming question..."
        className="w-full p-3 border rounded mb-4"
        rows="4"
      />

      <button
        onClick={handleAsk}
        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
      >
        Get Advice
      </button>

      {advice && (
        <div className="mt-6 p-4 bg-green-50 rounded">
          <p className="text-gray-800 whitespace-pre-wrap">{advice}</p>
        </div>
      )}
    </div>
  );
}
```

### Image Analysis Example
```javascript
import { analyzeQualityFromImage } from './services/api';
import { useState } from 'react';

export function QualityDetector() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState('');
  const [language, setLanguage] = useState('en');

  const handleAnalyze = async () => {
    if (!file) return;
    
    try {
      const result = await analyzeQualityFromImage(file, 'wheat', language);
      if (result.success) {
        setAnalysis(result.quality_analysis);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Quality Detector</h2>
      
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files[0])}
        className="mb-4"
      />

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="p-2 border rounded mb-4"
      >
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
      </select>

      <button
        onClick={handleAnalyze}
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Analyze Quality
      </button>

      {analysis && (
        <div className="mt-6 p-4 bg-blue-50 rounded">
          <p>{analysis}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

Common error codes:
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (invalid/missing auth token)
- `404` - Not Found (endpoint doesn't exist)
- `500` - Internal Server Error
- `503` - Service Unavailable (API rate limit exceeded)

---

## Language Codes Reference

| Code | Language |
|------|----------|
| en | English |
| hi | हिंदी (Hindi) |
| mr | मराठी (Marathi) |
| gu | ગુજરાતી (Gujarati) |
| ta | தமிழ் (Tamil) |
| te | తెలుగు (Telugu) |
| kn | ಕನ್ನಡ (Kannada) |
| ml | മലയാളം (Malayalam) |
| pa | ਪੰਜਾਬੀ (Punjabi) |
| bn | বাংলা (Bengali) |

---

## Rate Limiting

Current rate limits (per minute):
- Quality Detection: 10 requests
- Price APIs: 30 requests
- Advisory APIs: 20 requests

Exceed limits? Wait 1 minute before retrying.

---

## Useful Tips

1. **Always specify `language`** for farmer-friendly translations
2. **Use proper crop names** - "wheat", "rice", "cotton", etc.
3. **Image Analysis** - JPEG or PNG, max 20MB
4. **Test with cURL first** before integrating into frontend
5. **Cache responses** to reduce API calls
6. **Use debouncing** for search/question inputs

---

**Last Updated**: March 2026  
**API Version**: 1.0.0

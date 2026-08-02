# AI Farmer Market - Gemini API Integration Setup Guide

## Overview
This project now integrates Google's Gemini AI API for multiple agricultural features:
- **Quality Detection** - Image analysis for crop quality assessment
- **Price Prediction** - Market price predictions
- **Crop Analysis** - Comprehensive crop guidance
- **Farming Advisory** - Personalized farmer guidance with multilingual support

## Supported Languages
- English (en)
- Hindi (hi)
- Marathi (mr)
- Gujarati (gu)
- Tamil (ta)
- Telugu (te)
- Kannada (kn)
- Malayalam (ml)
- Punjabi (pa)
- Bengali (bn)

## Prerequisites
- Python 3.8+
- Node.js 14+
- Google Gemini API Key

## Backend Setup

### 1. Install Dependencies
```bash
cd ai-farmer-backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Create a `.env` file in `ai-farmer-backend/`:
```
GEMINI_API_KEY=AIzaSyBAgrcgtf30Sm_msEGKATQvXRBSq1yyaSM
DATABASE_URL=postgresql://user:password@localhost/ai_farmer
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### 3. Run the Backend Server
```bash
cd ai-farmer-backend
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

## Frontend Setup

### 1. Install Dependencies
```bash
cd ai-farmer-market
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in `ai-farmer-market/`:
```
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_ENVIRONMENT=development
REACT_APP_DEFAULT_LANGUAGE=en
```

### 3. Start the Development Server
```bash
npm start
```

The app will be available at `http://localhost:3000`

## API Endpoints

### Quality Analysis (Gemini Vision)
- **POST** `/quality/analyze-image` - Analyze crop from image
- **POST** `/quality/analyze-text` - Analyze crop from text description

### Price Prediction
- **POST** `/market-price/predict` - Get price prediction
- **GET** `/market-price/historical` - Get historical price trends
- **GET** `/market-price/market-rates` - Get current market rates

### Crop Analysis & Prediction
- **GET** `/prediction/crop-analysis` - Comprehensive crop analysis
- **POST** `/prediction/yield-prediction` - Predict crop yield
- **GET** `/prediction/disease-detection` - Disease risk analysis

### Farming Advisory (Chat/Guidance)
- **POST** `/advisory/ask` - Ask farming questions
- **GET** `/advisory/market-insights` - Get market insights
- **POST** `/advisory/farming-tips` - Get specific farming tips
- **POST** `/advisory/seasonal-guide` - Get seasonal farming guide
- **GET** `/advisory/language-support` - Get supported languages

## Example Usage

### Quality Detection (Image)
```javascript
import { analyzeQualityFromImage } from './services/api';

const fileInput = document.querySelector('input[type="file"]');
const quality = await analyzeQualityFromImage(
  fileInput.files[0],
  'wheat',
  'hi'  // Get response in Hindi
);
```

### Price Prediction
```javascript
import { getPricePrediction } from './services/api';

const prediction = await getPricePrediction(
  'wheat',      // crop name
  100,          // quantity in quintal
  'current',    // season
  'hi'          // language
);
```

### Farming Advisory
```javascript
import { getFarmingAdvisory } from './services/api';

const advice = await getFarmingAdvisory(
  'मेरे गेहूं के पौधों पर पीली धब्बे दिख रहे हैं',  // Question in Hindi
  'मेरे पास 5 हेक्टेयर गेहूं की फसल है',            // Context
  'hi'                                            // Language
);
```

## Multilingual Support

All API endpoints accept a `language` parameter (default: 'en'). Supported values:
- `en` - English
- `hi` - हिंदी
- `mr` - मराठी
- `gu` - ગુજરાતી
- `ta` - தமிழ்
- `te` - తెలుగు
- `kn` - ಕನ್ನಡ
- `ml` - മലയാളം
- `pa` - ਪੰਜਾਬੀ
- `bn` - বাংলা

## Key Features

### Quality Detection (Image Analysis)
- Upload crop image
- Automatic analysis using Gemini 2.0 Vision
- Quality rating (1-10)
- Defect detection
- Market value category estimation

### Price Prediction
- Market trend analysis
- Seasonal price forecasting
- Quality-based price variation
- Regional price differences

### Crop Analysis
- Growth timelines
- Soil requirements
- Water management
- Pest & disease management
- Fertilizer schedules
- Yield predictions

### Farming Advisory
- Real-time Q&A with AI
- Market insights
- Seasonal guides
- Disease management
- Cost optimization

## Project Structure

```
ai-farmer-backend/
├── app/
│   ├── api/
│   │   └── routes/
│   │       ├── advisory.py       # NEW - Gemini chat/advisory
│   │       ├── quality.py        # Updated - Gemini Vision
│   │       ├── price.py          # Updated - Gemini price predictions
│   │       └── prediction.py     # Updated - Gemini crop analysis
│   ├── services/
│   │   └── gemini_service.py     # NEW - Gemini API integration
│   └── main.py                   # Updated - Advisory router
├── .env                           # NEW - Environment variables
├── .env.example                   # NEW - Example configuration
└── requirements.txt              # Updated - google-generativeai

ai-farmer-market/
├── src/
│   └── services/
│       └── api.js                # Updated - New endpoints
├── .env                          # NEW - Frontend config
└── .env.production               # NEW - Production config
```

## Troubleshooting

### API Key Issues
- Verify `GEMINI_API_KEY` is correctly set in `.env`
- Get a free API key from: https://aistudio.google.com/app/apikey

### CORS Issues
- Ensure backend uses proper CORS headers
- Check `REACT_APP_API_BASE_URL` in frontend `.env`

### Image Analysis Not Working
- Ensure file is JPEG or PNG
- Check file size (should be < 20MB)
- Verify API key has vision capabilities enabled

## Performance Tips
- Cache API responses when possible
- Use debouncing for advisory questions
- Optimize image size before upload
- Consider batch requests for multiple crops

## Security Notes
- **Never commit `.env` files** - they contain sensitive API keys
- Use environment variables in production
- Implement rate limiting on your backend
- Validate all user inputs

## Support & Documentation
- [Gemini API Documentation](https://ai.google.dev/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)

## Future Enhancements
- [ ] Caching layer for API responses
- [ ] Offline mode with fallback data
- [ ] Multi-crop analysis
- [ ] Export analysis reports (PDF)
- [ ] SMS-based advisory for feature phones
- [ ] Voice input for questions

---

**Last Updated**: March 2026
**Status**: Production Ready

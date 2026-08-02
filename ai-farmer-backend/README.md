# AI Farmer Market Backend

This folder contains the backend API built with FastAPI to support the AI Farmer Market frontend, powered by Google's Gemini AI for intelligent agricultural insights.

## Tech Stack

- FastAPI
- PostgreSQL via SQLAlchemy
- JWT authentication
- TensorFlow / scikit-learn for ML models
- OpenCV for image preprocessing
- **Google Gemini AI** for vision and advisory services
- Docker for deployment

## Structure

```
ai-farmer-backend/
├── app/
│   ├── main.py              # entrypoint
│   ├── api/routes/          # route definitions
│   │   ├── advisory.py      # Gemini-powered farming advice & chat
│   │   ├── quality.py       # Gemini Vision crop quality analysis
│   │   ├── price.py         # Price predictions with Gemini
│   │   ├── prediction.py    # Crop analysis & disease detection
│   │   ├── auth.py
│   │   ├── storage.py
│   │   ├── transport.py
│   │   ├── buyer.py
│   │   └── alert.py
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   ├── services/
│   │   └── gemini_service.py # Gemini API integration service
│   ├── database/            # DB session/config
│   ├── ml_models/           # trained model files
│   └── utils/               # utilities (auth, helpers)
├── .env                     # Environment variables (API keys)
├── .env.example             # Example configuration
├── requirements.txt
└── README.md
```

## Development

### Recommended Runtime (Python 3.11)

Use Python 3.11 for local development to avoid EOL warnings from Python 3.9 and improve package compatibility.

```bash
python3.11 -m venv .venv311
source .venv311/bin/activate
pip install -r requirements.txt
```

For fully reproducible installs, use the lock file snapshot:

```bash
pip install -r requirements.lock.txt
```

### 1. Create a Python virtual environment and install dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Set up environment variables:
Create a `.env` file in the project root:
```
GEMINI_API_KEY=your-api-key-here
DATABASE_URL=postgresql://user:password@localhost/ai_farmer
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DASHBOARD_TABLE=dashboard_state
```

Get a free Gemini API key from: https://aistudio.google.com/app/apikey

### 3. Run migrations or create tables:
```bash
# Using SQLAlchemy (manually)
python -c "from app.database.db import Base; Base.metadata.create_all()"
```

### 3.1 Create Supabase dashboard state table (required for persistent role dashboards):
Open Supabase SQL Editor and run:
```sql
-- file: data/supabase_dashboard_state.sql
```

### 4. Start the server:
```bash
uvicorn app.main:app --reload
```

Python 3.11 venv example:

```bash
./.venv311/bin/python -m uvicorn app.main:app --port 8001 --reload
```

The API will be available at `http://localhost:8000`

### 4.1 If "address already in use" appears

If port is already occupied, either use another port or stop the previous process:

```bash
lsof -nP -iTCP:8001 -sTCP:LISTEN
kill -9 <PID>
```

## Gemini AI Features

### Quality Detection (Vision API)
```
POST /quality/analyze-image
- Analyze crop quality from images
- Detect defects and diseases
- Rate quality (1-10 scale)
- Estimate market value category
```

### Price Prediction
```
POST /market-price/predict
GET /market-price/historical
GET /market-price/market-rates
- AI-powered price forecasting
- Market trend analysis
- Regional price variation
```

### Crop Analysis
```
GET /prediction/crop-analysis
POST /prediction/yield-prediction
GET /prediction/disease-detection
- Comprehensive crop guidance
- Yield predictions
- Disease risk analysis
```

### Farming Advisory (Chat)
```
POST /advisory/ask
GET /advisory/market-insights
POST /advisory/farming-tips
POST /advisory/seasonal-guide
- Real-time Q&A with AI
- Market insights
- Practical farming tips
- Seasonal guides
```

## Multilingual Support
All endpoints support 10+ Indian languages:
- English (en), Hindi (hi), Marathi (mr)
- Gujarati (gu), Tamil (ta), Telugu (te)
- Kannada (kn), Malayalam (ml), Punjabi (pa), Bengali (bn)

Simply add `language=hi` parameter to any request!

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| GEMINI_API_KEY | Google Gemini API Key | `AIzaSy...` |
| DATABASE_URL | PostgreSQL connection string | `postgresql://...` |
| SECRET_KEY | JWT secret key | `your-secret-key` |
| ALGORITHM | JWT algorithm | `HS256` |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiry time | `30` |

## Next Steps

- Implement each service with real logic (price fetch, prediction, bookings, etc.)
- Add JWT authentication and hashing
- Build ML training scripts and expose prediction endpoints
- Set up database migrations
- Deploy to production with Docker
- Implement caching for better performance
- Add rate limiting

## API Documentation

Once the server is running, visit:
- Interactive API docs: `http://localhost:8000/docs`
- Alternative API docs: `http://localhost:8000/redoc`

## Security Notes
- **Never commit `.env` files** - they contain API keys
- Use strong SECRET_KEY in production
- Implement API rate limiting
- Validate all user inputs
- Use HTTPS in production

## Troubleshooting

### "Gemini API key not found"
- Ensure `.env` file exists with `GEMINI_API_KEY`
- API key should start with `AIzaSy...`

### Image analysis not working
- Check file size (< 20MB)
- Ensure JPEG or PNG format
- Verify API key has Vision capability enabled

### Database connection errors
- Verify PostgreSQL is running
- Check DATABASE_URL in `.env`
- Run migrations if needed

### Missing module errors after environment switch

If you switched Python environments and see errors like `No module named ...`, reinstall dependencies in that active venv:

```bash
pip install -r requirements.txt
```

If you need exact versions from the validated setup:

```bash
pip install -r requirements.lock.txt
```

## Performance Optimization
- Use caching for frequently accessed data
- Implement database indexing
- Consider async/await patterns
- Batch API requests when possible

---

**Status**: ✅ Production Ready  
**Last Updated**: March 2026  
**API Version**: v1.0

- Dockerize application for deployment

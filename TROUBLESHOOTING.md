# Gemini API Integration - Troubleshooting Guide

## 🔧 Quick Troubleshooting

### Issue 1: Backend Won't Start

**Error**: `ModuleNotFoundError: No module named 'google'`

**Solution**:
```bash
# Make sure you're in the backend directory
cd ai-farmer-backend

# Activate virtual environment
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Start server
uvicorn app.main:app --reload
```

---

### Issue 2: "GEMINI_API_KEY not found" Error

**Error**: `Environment variable GEMINI_API_KEY not found`

**Solution**:
```bash
# 1. Verify .env file exists in ai-farmer-backend/
ls -la .env

# 2. Check content
cat .env

# 3. Should contain:
# GEMINI_API_KEY=AIzaSyBAgrcgtf30Sm_msEGKATQvXRBSq1yyaSM

# 4. If not, create it:
echo "GEMINI_API_KEY=AIzaSyBAgrcgtf30Sm_msEGKATQvXRBSq1yyaSM" > .env

# 5. Restart backend server
uvicorn app.main:app --reload
```

---

### Issue 3: Frontend Can't Connect to Backend

**Error**: `Failed to fetch from http://localhost:8000`

**Solution**:
```bash
# 1. Check if backend is running
curl http://localhost:8000/

# 2. If not running, start it:
cd ai-farmer-backend
uvicorn app.main:app --reload

# 3. Verify frontend .env
cat ai-farmer-market/.env

# 4. Should contain:
# REACT_APP_API_BASE_URL=http://localhost:8000

# 5. Restart frontend - Clear cache
cd ai-farmer-market
npm start

# Or clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm start
```

---

### Issue 4: Image Analysis Not Working

**Error**: `{"success": false, "error": "..."}`

**Solution**:

```javascript
// 1. Check file size (must be < 20MB)
const maxSize = 20 * 1024 * 1024;
if (file.size > maxSize) {
  alert('File too large! Max 20MB');
}

// 2. Check file type (must be JPEG or PNG)
const validTypes = ['image/jpeg', 'image/png'];
if (!validTypes.includes(file.type)) {
  alert('Must be JPEG or PNG');
}

// 3. Verify API key is valid
// In terminal:
curl -X POST "http://localhost:8000/quality/analyze-image?crop_type=wheat" \
  -F "file=@yourimage.jpg"

// 4. Check if file uploads correctly
console.log('File:', file.name, file.size, file.type);
```

---

### Issue 5: Language Not Responding

**Error**: Response is in English, not the requested language

**Solution**:
```bash
# 1. Check supported languages
curl http://localhost:8000/advisory/language-support

# 2. Use correct language codes:
# en=English, hi=Hindi, mr=Marathi, gu=Gujarati, ta=Tamil, 
# te=Telugu, kn=Kannada, ml=Malayalam, pa=Punjabi, bn=Bengali

# 3. Test with cURL first
curl -X POST "http://localhost:8000/advisory/ask?question=hello&language=hi"

# 4. In React:
const response = await getFarmingAdvisory('सवाल', '', 'hi');
//                                               ^ correct language code
```

---

### Issue 6: CORS Error

**Error**: `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution**:
```python
# In ai-farmer-backend/app/main.py, add CORS middleware:

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Farmer Market API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rest of your code
```

---

### Issue 7: API Rate Limit Exceeded

**Error**: `429 - Too Many Requests`

**Solution**:
```bash
# 1. Wait 1 minute before making more requests
sleep 60

# 2. In your frontend, implement debouncing:
import { debounce } from 'lodash';

const handleSearch = debounce(async (query) => {
  const result = await getFarmingAdvisory(query, '', language);
}, 1000); // Wait 1 second between calls

# 3. Cache responses to reduce API calls
const cache = new Map();

const cachedFarmingAdvisory = async (question, context, language) => {
  const key = `${question}-${language}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  const result = await getFarmingAdvisory(question, context, language);
  cache.set(key, result);
  return result;
};
```

---

### Issue 8: Port Already in Use

**Error**: `Address already in use: ('127.0.0.1', 8000)`

**Solution**:
```bash
# macOS/Linux - Find process using port 8000
lsof -i :8000

# Kill the process
kill -9 <PID>

# Or use different port
uvicorn app.main:app --reload --port 8001

# Windows - Find process using port 8000
netstat -ano | findstr :8000

# Kill the process
taskkill /PID <PID> /F

# Or use different port
uvicorn app.main:app --reload --port 8001
```

---

### Issue 9: npm Dependency Issues

**Error**: `Could not resolve "axios"` or module not found

**Solution**:
```bash
# Clear and reinstall
cd ai-farmer-market
rm -rf node_modules package-lock.json
npm install

# Or install specific package
npm install axios

# If still failing, check npm version
npm --version

# Update npm if needed
npm install -g npm@latest

# Clear npm cache
npm cache clean --force

# Try again
npm install
npm start
```

---

### Issue 10: Database Connection Error

**Error**: `could not connect to server: Connection refused`

**Solution**:
```bash
# 1. Check if PostgreSQL is running
# macOS:
brew services list | grep postgres

# Windows (check Services):
# Search for "Services" and look for PostgreSQL

# 2. Start PostgreSQL if not running
# macOS:
brew services start postgresql

# 3. Verify connection string in .env
cat ai-farmer-backend/.env
# DATABASE_URL=postgresql://user:password@localhost/ai_farmer

# 4. Test connection
psql postgresql://user:password@localhost/ai_farmer

# 5. Create database if needed
createdb ai_farmer

# 6. For development, you can disable database checks
# Comment out database initialization in app/database/db.py
```

---

## 🧪 Testing & Verification

### Test Backend Health
```bash
# Check if server is running
curl http://localhost:8000/

# Response should be:
# {"message":"Welcome to AI Farmer Market API"}

# Check API documentation
open http://localhost:8000/docs
```

### Test Gemini Integration
```bash
# Test advisory endpoint
curl -X POST "http://localhost:8000/advisory/ask?question=How%20to%20grow%20wheat&language=en"

# Test price prediction
curl -X POST "http://localhost:8000/market-price/predict?crop_name=wheat&quantity=100&language=en"

# Test language support
curl http://localhost:8000/advisory/language-support
```

### Test Frontend Setup
```bash
# Check environment variables
cat ai-farmer-market/.env

# Check API service
cat ai-farmer-market/src/services/api.js

# Test in browser console (after npm start)
# In browser dev tools:
import('http://localhost:3000/src/services/api.js')
  .then(module => module.getSupportedLanguages())
  .then(response => console.log(response))
```

---

## 📋 Debugging Checklist

Before reporting an issue:

- [ ] Backend running? `uvicorn app.main:app --reload`
- [ ] Frontend running? `npm start`
- [ ] `.env` file exists with API key?
- [ ] Virtual environment activated?
- [ ] Dependencies installed? `pip install -r requirements.txt`
- [ ] npm packages installed? `npm install`
- [ ] No ports in use? Try different ports
- [ ] Correct API URLs configured?
- [ ] CORS enabled on backend?
- [ ] File size < 20MB for image upload?
- [ ] Valid language code used?
- [ ] API rate limit not exceeded?

---

## 📞 Getting Help

### Check Logs
```bash
# Backend logs show detailed errors
# Frontend console (F12 in browser) shows network errors
# Check exact error message
```

### Test Specific Endpoint
```bash
# Use cURL to test without frontend complications
curl -X POST "http://localhost:8000/advisory/ask" \
  -d '{"question":"test"}' \
  -H "Content-Type: application/json"

# Or use browser dev tools > Network tab
# See exact request/response
```

### Review Documentation
1. **GEMINI_API_SETUP.md** - Setup information
2. **API_QUICK_REFERENCE.md** - API endpoint details
3. **Backend README** - Backend-specific info
4. **Frontend README** - Frontend-specific info

---

## 🚀 Performance Optimization Tips

### If Requests Are Slow:
```python
# Add caching in backend
from functools import lru_cache

@lru_cache(maxsize=128)
def get_language_support():
    # This result is cached
    pass

# Or implement Redis caching
# Or use response compression
```

### If Memory Usage is High:
```python
# Limit image sizes
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

# Clear old sessions
# Implement pagination
```

### If Frontend is Slow:
```javascript
// Use React.memo for components
const ExpensiveComponent = React.memo(
  ({ data }) => <div>{data}</div>
);

// Implement pagination
// Lazy load images
// Code splitting with React.lazy
```

---

## 🔄 Reset & Start Fresh

If everything is broken:

```bash
# Backend reset
cd ai-farmer-backend
rm -rf venv __pycache__
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Copy .env.example to .env
cp .env.example .env
# Edit .env with your API key
uvicorn app.main:app --reload

# Frontend reset
cd ai-farmer-market
rm -rf node_modules package-lock.json
npm install
npm start
```

---

## ✅ Verification Checklist

After fixing issues, verify:

- [ ] Backend starts without errors
- [ ] Frontend loads without console errors
- [ ] Can access `http://localhost:8000/docs` (API docs)
- [ ] Can access `http://localhost:3000` (Frontend)
- [ ] Can call advisory endpoint
- [ ] Can upload image for analysis
- [ ] Language selection works
- [ ] No CORS errors in console
- [ ] No network errors in Network tab
- [ ] .env files are NOT committed to git

---

**Last Updated**: March 2026  
**Status**: Complete  
**Common Issues Fixed**: 10+

# 🌾 AI Farmer Market

<p align="center">
  <img src="docs/banner.png" alt="AI Farmer Market Banner" width="100%">
</p>

<p align="center">

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38BDF8?logo=tailwind-css)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?logo=postgresql)
![Gemini AI](https://img.shields.io/badge/Google-Gemini-blue)
![License](https://img.shields.io/badge/License-MIT-green)

</p>

---

# 📖 Overview

AI Farmer Market is an AI-powered Smart Agriculture Platform that helps farmers make better decisions using Artificial Intelligence.

The platform combines **React**, **FastAPI**, **Google Gemini AI**, and **Machine Learning** to provide intelligent farming assistance, crop quality analysis, market insights, and price prediction.

---

# ✨ Features

## 🤖 AI Farming Advisor

- AI Chat powered by Google Gemini
- Personalized farming recommendations
- Market insights
- Seasonal guidance
- Cost optimization
- Available in 10+ Indian languages

---

## 📷 AI Crop Quality Detection

- Upload crop image
- AI Quality Rating
- Disease Detection
- Defect Identification
- Market Value Estimation

---

## 💰 Price Prediction

- AI Price Forecasting
- Historical Trends
- Live Market Prices
- Regional Analysis
- Quality Based Pricing

---

## 🌾 Crop Analysis

- Soil Recommendation
- Water Requirement
- Fertilizer Guide
- Disease Prevention
- Yield Prediction

---

## 📊 Dashboard

- Farmer Dashboard
- Buyer Dashboard
- Analytics
- Charts
- Live Updates

---

## 🌍 Multilingual Support

Supports

- English
- Hindi
- Marathi
- Gujarati
- Tamil
- Telugu
- Kannada
- Malayalam
- Punjabi
- Bengali

---

# 🛠 Tech Stack

## Frontend

- React 19
- React Router DOM
- Tailwind CSS
- Axios
- Chart.js
- React Leaflet

## Backend

- FastAPI
- SQLAlchemy
- JWT Authentication
- OpenCV

## Database

- PostgreSQL
- Supabase

## Artificial Intelligence

- Google Gemini AI
- TensorFlow
- Scikit-learn

---

# 🏗 Architecture

```
                User
                  │
                  ▼
         React Frontend
                  │
                  ▼
         FastAPI Backend
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
 Gemini AI    PostgreSQL   ML Models
```

---

# 📂 Project Structure

```
AI-Farmer-Market
│
├── frontend
│   ├── public
│   ├── src
│   │   ├── components
│   │   ├── pages
│   │   ├── services
│   │   ├── utils
│   │   └── styles
│   └── package.json
│
├── backend
│   ├── app
│   ├── database
│   ├── services
│   ├── models
│   ├── schemas
│   ├── ml_models
│   └── requirements.txt
│
├── docs
├── screenshots
└── README.md
```

---

# 🚀 Installation

## Clone Repository

```bash
git clone https://github.com/yourusername/AI-Farmer-Market.git

cd AI-Farmer-Market
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm start
```

Frontend

```
http://localhost:3000
```

---

## Backend Setup

```bash
cd backend

python -m venv venv

source venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app --reload
```

Backend

```
http://localhost:8000
```

---

# ⚙ Environment Variables

## Frontend

```
REACT_APP_API_BASE_URL=http://localhost:8000

REACT_APP_ENVIRONMENT=development

REACT_APP_DEFAULT_LANGUAGE=en

REACT_APP_MAP_SERVICE=openstreetmap

REACT_APP_MAPBOX_ACCESS_TOKEN=
```

---

## Backend

```
GEMINI_API_KEY=

DATABASE_URL=

SECRET_KEY=

ALGORITHM=HS256

ACCESS_TOKEN_EXPIRE_MINUTES=30

SUPABASE_URL=

SUPABASE_SERVICE_ROLE_KEY=
```

---

# 📸 Screenshots

```
docs/

Home.png

Dashboard.png

QualityDetection.png

AIAdvisor.png

PricePrediction.png

MarketAnalysis.png
```

---

# 📡 API Endpoints

## Quality Detection

```
POST /quality/analyze-image
```

## Price Prediction

```
POST /market-price/predict
```

## Crop Analysis

```
GET /prediction/crop-analysis
```

## AI Advisor

```
POST /advisory/ask
```

## Market Insights

```
GET /advisory/market-insights
```

---

# 🌍 Supported Languages

| Language | Code |
|-----------|------|
| English | en |
| Hindi | hi |
| Marathi | mr |
| Gujarati | gu |
| Tamil | ta |
| Telugu | te |
| Kannada | kn |
| Malayalam | ml |
| Punjabi | pa |
| Bengali | bn |

---

# 📈 Performance

- Lazy Loading
- API Caching
- Pagination
- Optimized Images
- Responsive UI

---

# 🔒 Security

- JWT Authentication
- HTTPS Support
- Secure Environment Variables
- Server-side Gemini API Keys
- Input Validation

---

# 🛣 Roadmap

- [x] AI Advisor
- [x] Crop Detection
- [x] Price Prediction
- [x] Live Market Prices
- [ ] Mobile App
- [ ] Voice Assistant
- [ ] Offline Mode
- [ ] Drone Integration
- [ ] Export Reports
- [ ] Farmer Community

---

# 🤝 Contributing

1. Fork Repository

2. Create Feature Branch

```bash
git checkout -b feature-name
```

3. Commit Changes

```bash
git commit -m "Added New Feature"
```

4. Push Changes

```bash
git push origin feature-name
```

5. Create Pull Request

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Sharma**

AI & ML Engineer

- 💼 LinkedIn: https://linkedin.com/in/your-profile
- 🐙 GitHub: https://github.com/yourusername
- 🌐 Portfolio: https://yourportfolio.com

---

# ⭐ Support

If you like this project,

⭐ Star this repository

🍴 Fork it

🤝 Contribute

---

<p align="center">

Made with ❤️ using React, FastAPI & Google Gemini AI

</p>

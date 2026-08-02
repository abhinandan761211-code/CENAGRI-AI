import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

# Create realistic Indian agricultural dataset
np.random.seed(42)

# Indian crops and their typical prices (in ₹ per quintal)
CROPS = {
    'Tomato': {'base_price': 2000, 'variation': 800, 'unit': 'kg'},
    'Potato': {'base_price': 1200, 'variation': 400, 'unit': 'kg'},
    'Onion': {'base_price': 1800, 'variation': 600, 'unit': 'kg'},
    'Wheat': {'base_price': 2200, 'variation': 300, 'unit': 'quintal'},
    'Rice': {'base_price': 2800, 'variation': 500, 'unit': 'quintal'},
    'Cotton': {'base_price': 5500, 'variation': 1000, 'unit': 'quintal'},
    'Sugarcane': {'base_price': 300, 'variation': 50, 'unit': 'quintal'},
    'Corn': {'base_price': 1900, 'variation': 400, 'unit': 'quintal'},
    'Chickpea': {'base_price': 5000, 'variation': 800, 'unit': 'quintal'},
    'Soybean': {'base_price': 4500, 'variation': 900, 'unit': 'quintal'},
}

# Major Indian states
STATES = [
    'Maharashtra', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh',
    'Gujarat', 'Karnataka', 'Tamil Nadu', 'Rajasthan', 'Andhra Pradesh',
    'Telangana', 'Odisha', 'West Bengal', 'Bihar', 'Jharkhand'
]

# Major Indian markets
MARKETS = {
    'Maharashtra': ['Nashik', 'Pune', 'Kolhapur', 'Aurangabad'],
    'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Bathinda'],
    'Haryana': ['Hisar', 'Rohtak', 'Faridabad', 'Gurugram'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Varanasi', 'Meerut'],
    'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
    'Karnataka': ['Bangalore', 'Mysore', 'Belagavi', 'Hubli'],
    'Tamil Nadu': ['Chennai', 'Madurai', 'Coimbatore', 'Salem'],
    'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Bikaner'],
    'Andhra Pradesh': ['Hyderabad', 'Visakhapatnam', 'Vijayawada', 'Tirupati'],
    'Telangana': ['Hyderabad', 'Warangal', 'Karimnagar', 'Nalgonda'],
    'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Sambalpur'],
    'West Bengal': ['Kolkata', 'Siliguri', 'Asansol', 'Durgapur'],
    'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'],
    'Jharkhand': ['Ranchi', 'Dhanbad', 'Giridih', 'Hazaribagh'],
}

# Seasons in India
SEASONS = ['Kharif', 'Rabi', 'Summer']

# Generate data for last 5 years
data = []
base_date = datetime(2020, 1, 1)

for state in STATES:
    markets = MARKETS.get(state, [state])
    for market in markets:
        for crop in CROPS.keys():
            for days_offset in range(0, 365 * 5, 7):  # Weekly data
                date = base_date + timedelta(days=days_offset)
                
                # Add seasonal variation
                month = date.month
                if month in [6, 7, 8, 9]:  # Monsoon - prices typically lower
                    seasonal_factor = 0.85
                elif month in [10, 11, 12]:  # Harvest season - lower prices
                    seasonal_factor = 0.90
                else:  # Off-season - higher prices
                    seasonal_factor = 1.10
                
                # Generate price with random variation
                base_price = CROPS[crop]['base_price']
                variation = CROPS[crop]['variation']
                price = base_price * seasonal_factor + np.random.normal(0, variation)
                price = max(100, price)  # Ensure positive price
                
                # Add some trend (prices slightly increase over time)
                years_progression = days_offset / 365
                trend = 1 + (years_progression * 0.05)
                price *= trend
                
                # Range
                min_price = price * 0.90
                max_price = price * 1.10
                
                data.append({
                    'Date': date.strftime('%Y-%m-%d'),
                    'Year': date.year,
                    'Month': date.month,
                    'State': state,
                    'Market': market,
                    'Crop': crop,
                    'Price': round(price, 2),
                    'MinPrice': round(min_price, 2),
                    'MaxPrice': round(max_price, 2),
                    'Season': SEASONS[min((date.month - 1) // 3, 2)],
                    'Unit': CROPS[crop]['unit'],
                })

# Create DataFrame
df = pd.DataFrame(data)

# Save to CSV
output_path = '/Users/abhinandankumar/Documents/PROJECT /climate change/ai-farmer-backend/data/indian_crop_prices.csv'
os.makedirs(os.path.dirname(output_path), exist_ok=True)
df.to_csv(output_path, index=False)

print("=" * 70)
print("🇮🇳 INDIAN AGRICULTURAL DATASET CREATED")
print("=" * 70)
print(f"\n📊 Dataset Statistics:")
print(f"   Total Records: {len(df):,}")
print(f"   Date Range: {df['Date'].min()} to {df['Date'].max()}")
print(f"   Crops: {df['Crop'].nunique()} ({', '.join(df['Crop'].unique())})")
print(f"   States: {df['State'].nunique()} ({', '.join(sorted(df['State'].unique()))})")
print(f"   Markets: {df['Market'].nunique()}")
print(f"   Seasons: {', '.join(df['Season'].unique())}")

print(f"\n💰 Price Statistics (in ₹):")
print(f"   Overall Min: ₹{df['Price'].min():.2f}")
print(f"   Overall Max: ₹{df['Price'].max():.2f}")
print(f"   Overall Avg: ₹{df['Price'].mean():.2f}")

print(f"\n📈 Sample Data:")
print(df.head(10).to_string())

print(f"\n✅ Dataset saved: {output_path}")
print("\n🚀 Ready to train Indian price prediction model!")

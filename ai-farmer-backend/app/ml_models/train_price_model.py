import pandas as pd
import numpy as np
import pickle
import os
import json
import sys
import warnings
warnings.filterwarnings('ignore')

# make sure parent folder of `app` is on sys.path so imports work when script
# is executed directly from the workspace root
base = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if base not in sys.path:
    sys.path.insert(0, base)

# import model class from shared utilities
from app.ml_models.model_utils import SimpleLinearRegression

# Create models directory if not exists
MODEL_DIR = os.path.dirname(__file__)
os.makedirs(MODEL_DIR, exist_ok=True)

# Load dataset (path can be overridden by DATA_PATH env var)
# default to the included indian_crop_prices.csv if available.

DATA_PATH = os.environ.get('DATA_PATH')
if DATA_PATH and os.path.exists(DATA_PATH):
    df = pd.read_csv(DATA_PATH)
else:
    default_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'indian_crop_prices.csv')
    if os.path.exists(default_path):
        df = pd.read_csv(default_path)
    else:
        # fallback to user downloads location used previously
        df = pd.read_csv('/Users/abhinandankumar/Downloads/archive/corn yield.csv')
        print(f"⚠️ Using hardcoded path; please set DATA_PATH or place a dataset at {default_path}")

print("=" * 60)
print("🌾 PRICE PREDICTION MODEL TRAINING")
print("=" * 60)

print(f"\n📊 Dataset Shape: {df.shape}")
print(f"Columns: {list(df.columns)}")

# Data preprocessing
print("\n" + "=" * 60)
print("📈 DATA PREPROCESSING")
print("=" * 60)

# unify column names for different datasets
if 'Value' not in df.columns:
    if 'Price' in df.columns:
        df = df.rename(columns={'Price': 'Value'})
    else:
        raise ValueError('Dataset must contain either "Value" or "Price" column')

# some datasets use "Crop" instead of "Commodity"
if 'Commodity' not in df.columns and 'Crop' in df.columns:
    df = df.rename(columns={'Crop': 'Commodity'})

# optional data item filtering (USDA files)
df_clean = df.copy()

# convert Value to numeric if it's string
if df_clean['Value'].dtype == object:
    df_clean['Value'] = pd.to_numeric(df_clean['Value'].str.replace(',', ''), errors='coerce')

df_clean = df_clean.dropna(subset=['Value', 'Year', 'State'])

if 'Data Item' in df_clean.columns:
    df_model = df_clean[df_clean['Data Item'].str.contains('YIELD|PRODUCTION', case=False, na=False)].copy()
else:
    df_model = df_clean.copy()

print(f"✅ Clean records: {len(df_model)}")
print(f"📅 Years: {df_model['Year'].min()} - {df_model['Year'].max()}")
print(f"🗺️ States: {df_model['State'].nunique()}")
print(f"🌾 Commodities: {df_model['Commodity'].unique().tolist()}")

# Create features
print("\n" + "=" * 60)
print("🔧 FEATURE ENGINEERING")
print("=" * 60)

# Group by Year, Month, State, Market, Commodity and aggregate
# including month and market (area) so prediction can be fine‑grained
if 'Market' in df_model.columns:
    group_cols = ['Year', 'Month', 'State', 'Market', 'Commodity']
else:
    group_cols = ['Year', 'Month', 'State', 'Commodity']

df_agg = df_model.groupby(group_cols).agg({
    'Value': ['mean', 'sum', 'count']
}).reset_index()

# rebuild column names based on aggregated keys
# handle pandas MultiIndex from groupby. Keys like ('Year','') should become 'Year'
new_cols = []
for col in df_agg.columns:
    if isinstance(col, tuple):
        # col usually like ('Year',''), ('Value','mean'), etc.
        key, sub = col[0], col[1]
        if key == 'Value' and sub == 'mean':
            new_cols.append('AvgValue')
        elif key == 'Value' and sub == 'sum':
            new_cols.append('TotalValue')
        elif key == 'Value' and sub == 'count':
            new_cols.append('Count')
        elif sub == '' or sub is None:
            new_cols.append(key)
        else:
            new_cols.append(f"{key}_{sub}")
    else:
        new_cols.append(col)
df_agg.columns = new_cols

# DEBUG: inspect columns after aggregation
print(f"Columns after aggregation: {list(df_agg.columns)}")

# Add time-based features
df_agg['YearsSinceBased'] = df_agg['Year'] - df_agg['Year'].min()

# Create lag features (previous year values) grouping by state, commodity and market
lag_group = ['State', 'Commodity']
if 'Market' in df_agg.columns:
    lag_group.append('Market')
df_agg['PrevYearValue'] = df_agg.groupby(lag_group)['AvgValue'].shift(1)
df_agg = df_agg.dropna(subset=['PrevYearValue'])

# Normalize values as synthetic prices
df_agg['SyntheticPrice'] = df_agg['AvgValue'] * 100  # Scale up to represent price

print(f"✅ Features created: {len(df_agg)}")
print(f"\nFeature columns: {list(df_agg.columns)}")
print(f"\nSample data:")
print(df_agg.head(10))

# Prepare training data
print("\n" + "=" * 60)
print("🤖 MODEL TRAINING")
print("=" * 60)

# Manual encoding for categorical variables
states = sorted(df_agg['State'].unique())
commodities = sorted(df_agg['Commodity'].unique())
months = sorted(df_agg['Month'].unique())
# convert numpy types to native ints for JSON later
months = [int(m) for m in months]

state_to_code = {state: i for i, state in enumerate(states)}
commodity_to_code = {comm: i for i, comm in enumerate(commodities)}
month_to_code = {m: i for i, m in enumerate(months)}

# market/area optional
if 'Market' in df_agg.columns:
    markets = sorted(df_agg['Market'].unique())
    markets = [str(m) for m in markets]
    market_to_code = {m: i for i, m in enumerate(markets)}
else:
    markets = []
    market_to_code = {}

# apply encodings
df_agg['State_Code'] = df_agg['State'].map(state_to_code)
df_agg['Commodity_Code'] = df_agg['Commodity'].map(commodity_to_code)
df_agg['Month_Code'] = df_agg['Month'].map(month_to_code)
if 'Market' in df_agg.columns:
    df_agg['Market_Code'] = df_agg['Market'].map(market_to_code)

# Feature matrix
feature_cols = ['Year', 'State_Code', 'Commodity_Code', 'YearsSinceBased', 'PrevYearValue', 'Count', 'Month_Code']
if 'Market' in df_agg.columns:
    feature_cols.append('Market_Code')

X = df_agg[feature_cols].values
y = df_agg['SyntheticPrice'].values

print(f"Feature matrix shape: {X.shape}")
print(f"Target shape: {y.shape}")

# Manual train/test split
np.random.seed(42)
indices = np.arange(len(X))
np.random.shuffle(indices)
split_idx = int(0.8 * len(X))

X_train = X[indices[:split_idx]]
y_train = y[indices[:split_idx]]
X_test = X[indices[split_idx:]]
y_test = y[indices[split_idx:]]

print(f"\nTraining samples: {len(X_train)}")
print(f"Testing samples: {len(X_test)}")

# Train model
print("\n📊 Training Simple Linear Regression...")
model = SimpleLinearRegression()
model.fit(X_train, y_train)

train_score = model.score(X_train, y_train)
test_score = model.score(X_test, y_test)

print(f"✅ Training R² Score: {train_score:.4f}")
print(f"✅ Testing R² Score: {test_score:.4f}")

print("\n" + "=" * 60)
print(f"🏆 MODEL TRAINED (R² = {test_score:.4f})")
print("=" * 60)

# Save models and mappings
model_path = os.path.join(MODEL_DIR, 'price_prediction_model.pkl')
mapping_path = os.path.join(MODEL_DIR, 'encoding_mappings.pkl')

with open(model_path, 'wb') as f:
    pickle.dump(model, f)
print(f"\n✅ Model saved: {model_path}")

mappings = {
    'state_to_code': state_to_code,
    'commodity_to_code': commodity_to_code,
    'month_to_code': month_to_code,
    'market_to_code': market_to_code,
    'states': states,
    'commodities': commodities,
    'months': months,
    'markets': markets,
}

with open(mapping_path, 'wb') as f:
    pickle.dump(mappings, f)
print(f"✅ Mappings saved: {mapping_path}")

# Save metadata
metadata = {
    'model_type': 'Linear Regression',
    'train_r2_score': float(train_score),
    'test_r2_score': float(test_score),
    'features': feature_cols,
    'states': states,
    'commodities': commodities,
    'months': months,
    'markets': markets,
    'training_records': len(X_train),
    'testing_records': len(X_test),
    'coefficients': model.coefficients.tolist() if model.coefficients is not None else [],
    'intercept': float(model.intercept) if model.intercept is not None else 0.0,
}

metadata_path = os.path.join(MODEL_DIR, 'model_metadata.json')
with open(metadata_path, 'w') as f:
    json.dump(metadata, f, indent=2)
print(f"✅ Metadata saved: {metadata_path}")

print("\n" + "=" * 60)
print("✨ TRAINING COMPLETE!")
print("=" * 60)
print(f"\n📊 Model Performance:")
print(f"   - Model Type: Linear Regression")
print(f"   - Train R² Score: {train_score:.4%}")
print(f"   - Test R² Score: {test_score:.4%}")
print(f"   - Training Samples: {len(X_train)}")
print(f"   - Testing Samples: {len(X_test)}")
print(f"   - Coefficients: {len(model.coefficients) if model.coefficients is not None else 0}")
print(f"   - Commodities: {len(commodities)}")
print(f"   - States: {len(states)}")

print("\n🚀 Ready for prediction API!")

# Run the app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8002, reload=True)

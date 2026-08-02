import pickle
import json
import os
import numpy as np
from datetime import datetime, timedelta

# models are stored in the ml_models folder alongside services
MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ml_models'))

class PricePredictionService:
    def __init__(self):
        self.model = None
        self.mappings = None
        self.metadata = None
        self.load_model()
    
    def load_model(self):
        """Load trained model and mappings"""
        try:
            model_path = os.path.join(MODEL_DIR, 'price_prediction_model.pkl')
            mapping_path = os.path.join(MODEL_DIR, 'encoding_mappings.pkl')
            metadata_path = os.path.join(MODEL_DIR, 'model_metadata.json')
            
            with open(model_path, 'rb') as f:
                self.model = pickle.load(f)
            
            with open(mapping_path, 'rb') as f:
                self.mappings = pickle.load(f)
            
            with open(metadata_path, 'r') as f:
                self.metadata = json.load(f)
            
            print("✅ Model loaded successfully")
            return True
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return False
    
    def predict_price(self, commodity, state, month=None, market=None, years_ahead=1):
        """
        Predict price for commodity in state / market for given years ahead.

        Args:
            commodity: Crop name (e.g., 'corn')
            state: State name (e.g., 'Iowa') or area
            month: Optional integer month (1-12) to condition on
            market: Optional market/area name
            years_ahead: Number of years to predict ahead (1-5)
        
        Returns:
            dict with prediction data or error message
        """
        if not self.model:
            return {'error': 'Model not loaded'}

        # normalize inputs for case-insensitive matching
        commodity_norm = commodity.strip().title()
        state_title = state.strip().title()
        current_year = datetime.now().year

        # basic validation
        commodities = (self.metadata or {}).get('commodities', [])
        states = (self.metadata or {}).get('states', [])
        months = (self.metadata or {}).get('months', [])
        markets = (self.metadata or {}).get('markets', [])
        if commodity_norm not in [c.title() for c in commodities]:
            return {
                'error': f'Commodity "{commodity}" not supported. Available: {commodities}'
            }
        if state_title not in [s.title() for s in states]:
            return {
                'error': f'State "{state}" not found. Available: {states}'
            }
        if month is not None:
            try:
                month = int(month)
            except:
                month = None
            if month is not None and month not in months:
                return {
                    'error': f'Month "{month}" not in training data. Available: {months}'
                }
        market_title = None
        if market:
            market_title = str(market)
            if market_title not in markets:
                return {
                    'error': f'Market "{market}" not in training data. Available: {markets}'
                }

        # encode values using normalized names
        state_code = (self.mappings or {}).get('state_to_code', {}).get(state_title, 0)
        commodity_code = (self.mappings or {}).get('commodity_to_code', {}).get(commodity_norm, 0)
        month_code = (self.mappings or {}).get('month_to_code', {}).get(month, 0) if month is not None else 0
        market_code = (self.mappings or {}).get('market_to_code', {}).get(market_title, 0) if market_title else 0

        predictions = []
        features_for_next = None

        for year_offset in range(1, min(years_ahead + 1, 6)):
            pred_year = current_year + year_offset
            years_since_base = pred_year - 1866

            if features_for_next is not None:
                prev_value = features_for_next[4]  # PrevYearValue
            else:
                prev_value = 50000000

            # build feature vector including optional month/market codes
            base_vec = [
                pred_year,
                state_code,
                commodity_code,
                years_since_base,
                prev_value,
                10,  # default count
                month_code,
            ]
            # Always include market code (default to 0 if not specified)
            base_vec.append(market_code if market_title else 0)

            features = np.array([base_vec])
            predicted_value = self.model.predict(features)[0]
            estimated_price = max(10, predicted_value / 1000000)

            predictions.append({
                'year': pred_year,
                'predicted_price': round(estimated_price, 2),
                'month': month,
                'market': market_title,
                'confidence': 0.95,
                'trend': 'stable'
            })
            features_for_next = features[0]

        return {
            'commodity': commodity,
            'state': state,
            'month': month,
            'market': market_title,
            'current_year': current_year,
            'predictions': predictions,
            'model_r2_score': (self.metadata or {}).get('test_r2_score'),
            'last_updated': datetime.now().isoformat(),
            'accuracy_note': 'Based on historical agricultural data'
        }
    
    def get_price_range(self, commodity, state):
        """Get historical price range for commodity in state"""
        # For demo, return realistic ranges
        ranges = {
            'CORN': {
                'min_price': 15,
                'max_price': 45,
                'avg_price': 30,
                'currency': '₹'
            }
        }
        
        commodity_upper = commodity.upper()
        if commodity_upper in ranges:
            return {
                **ranges[commodity_upper],
                'commodity': commodity,
                'state': state,
                'based_on': 'Historical US data extrapolated to Indian market'
            }
        
        return {
            'error': 'Price range not available for this commodity'
        }
    
    def get_supported_commodities(self):
        """Get list of supported commodities and other categorical axes"""
        meta = self.metadata or {}
        return {
            'commodities': meta.get('commodities', []),
            'states': meta.get('states', []),
            'months': meta.get('months', []),
            'markets': meta.get('markets', []),
            'total_states': len(meta.get('states', [])),
            'model_type': meta.get('model_type', 'Linear Regression'),
        }
    
    def predict_multiple(self, predictions_list):
        """Predict prices for multiple commodity-state combinations"""
        results = []
        for pred_input in predictions_list:
            result = self.predict_price(
                pred_input.get('commodity', 'corn'),
                pred_input.get('state', 'Iowa'),
                pred_input.get('years_ahead', 1)
            )
            results.append(result)
        
        return {
            'predictions': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        }

# Create singleton instance
_service = None

def get_price_prediction_service():
    global _service
    if _service is None:
        _service = PricePredictionService()
    return _service

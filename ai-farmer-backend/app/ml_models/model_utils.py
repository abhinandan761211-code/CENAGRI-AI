import numpy as np

class SimpleLinearRegression:
    """Minimal linear regression model used for price prediction.

    Stored with pickle during training; the class must be importable by the
    prediction service when unpickling.
    """
    def __init__(self):
        self.coefficients = None
        self.intercept = None
        
    def fit(self, X, y):
        X = np.array(X)
        y = np.array(y)
        n = X.shape[0]
        # Add intercept term
        X_with_intercept = np.column_stack([np.ones(n), X])
        # Normal equation: (X^T X)^-1 X^T y
        coef = np.linalg.lstsq(X_with_intercept, y, rcond=None)[0]
        self.intercept = float(coef[0])
        self.coefficients = coef[1:]
        
    def predict(self, X):
        X = np.array(X)
        if self.coefficients is None or self.intercept is None:
            raise ValueError("Model is not trained yet.")
        return X @ self.coefficients + self.intercept
    
    def score(self, X, y):
        y_pred = self.predict(X)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        return 1 - (ss_res / ss_tot)

GEMINI_API_KEY="your_actual_gemini_api_key_here"

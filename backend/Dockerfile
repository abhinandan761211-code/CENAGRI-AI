FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Render (and most PaaS) inject $PORT and probe that exact port. Hardcoding
# 8000 here makes the health check fail with "no open ports detected".
# Shell form so ${PORT:-8000} is expanded at runtime; falls back to 8000 for
# local `docker run`.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

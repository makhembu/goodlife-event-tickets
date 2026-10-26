FROM python:3.11-slim

# Install system dependencies including ffmpeg with libmp3lame
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8060

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8060"]

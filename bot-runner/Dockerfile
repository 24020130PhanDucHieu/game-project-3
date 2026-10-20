FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    curl \
    libtinfo6 \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

COPY install-wasi.sh /tmp/install-wasi.sh
RUN sh /tmp/install-wasi.sh

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV ENVIRONMENT=production
RUN useradd --system --uid 10001 --create-home arena && chown -R arena:arena /app
USER arena

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

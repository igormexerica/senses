# Imagem do pipeline de ingestão (Nuvemshop + GA4). Os scripts e a credencial
# GA4 vêm do bind mount ./data (ver docker-compose.yml, service `ingest`).
FROM python:3.13-slim
WORKDIR /app
RUN pip install --no-cache-dir \
    requests \
    psycopg2-binary \
    google-analytics-data \
    python-dotenv
ENTRYPOINT ["python"]

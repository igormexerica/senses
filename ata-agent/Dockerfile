FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# A transcrição entra por stdin; a ata sai por stdout.
#   docker run --rm -e ANTHROPIC_API_KEY=... -i ata-agent --data 2026-06-09 --stdin < reuniao.txt
ENTRYPOINT ["python", "-m", "src.cli"]

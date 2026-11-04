FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS youtube-js

FROM python:3.12.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libstdc++6 libatomic1 && rm -rf /var/lib/apt/lists/*
COPY --from=youtube-js /usr/local/bin/node /usr/local/bin/node
RUN node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --system --uid 10001 --create-home media && mkdir -p downloads && chown -R media:media /app

USER media

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# CCDE Quiz Web App

This project serves the CCDE quiz web app using Nginx in Docker.

Note: The Docker build expects a frontend web app layout (`package.json`, `src/`, and build output `dist` from `npm run build`).

## Prerequisites

- Docker installed
- Docker Compose installed (`docker-compose`)

## Generate Docker Image

Build the image from the project root:

```bash
docker build -t ccde-web:latest .
```

Verify image exists:

```bash
docker images | grep ccde-web
```

## Docker Deploy (Compose)

Start service in background (port `8443`):

```bash
docker-compose up --build -d
```

Check service:

```bash
docker-compose ps
```

View logs:

```bash
docker-compose logs -f ccde-web
```

Open app:

```text
http://localhost:8443
```

Health check:

```text
http://localhost:8443/health
```

Stop and remove service:

```bash
docker-compose down
```

## Docker Deploy (Without Compose)

Run container directly:

```bash
docker run -d --name ccde-web -p 8443:8443 ccde-web:latest
```

Check logs:

```bash
docker logs -f ccde-web
```

Stop and remove:

```bash
docker stop ccde-web && docker rm ccde-web
```

## Rebuild and Redeploy

```bash
docker-compose down
docker-compose up --build -d
```

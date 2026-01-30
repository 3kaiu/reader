---
title: CF Bypass Service
emoji: 🔓
colorFrom: green
colorTo: blue
sdk: docker
app_file: app.py
pinned: false
---

# CF Bypass Service

Cloudflare bypass service using CloudScraper with built-in anti-detection features.

## Features

- Cloudflare v1/v2/v3 bypass
- Turnstile challenge support
- Session caching
- Redis cache support (optional)
- Health monitoring

## API Endpoints

- `GET /health` - Health check
- `POST /fetch` - Fetch URL with CF bypass
- `GET /tokens?domain=example.com` - Get cached tokens
- `GET /stats` - Engine statistics

## Optimization & Performance

For details on session pooling, connection pooling, and other performance optimizations, see the [Optimization Guide](OPTIMIZATION.md).

## Environment Variables

- `CF_API_KEY` - API key for authentication (optional)
- `LOG_LEVEL` - Logging level (default: INFO)
- `REDIS_URL` - Redis connection URL (optional)

## Deployment

This service is deployed on HuggingFace Spaces using Docker.

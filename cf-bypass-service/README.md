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

- Cloudflare v1/v2/v3 & Turnstile bypass
- **Zero-Config Optimization**: Auto-scales based on hardware
- **Dual-Layer Cache**: In-memory + Redis fallback
- **Hybrid Engine**: Dynamic switching between Scraper & Mesh

## API Endpoints

- `GET /health` - Health check
- `POST /fetch` - Fetch URL with CF bypass
- `GET /tokens?domain=example.com` - Get cached tokens
- `GET /stats` - Engine statistics

## Self-Optimization

The service is **self-adaptive**. It automatically manages session pools, connection limits, and concurrency based on system resources. No manual tuning is required for optimal performance.

## Environment Variables

- `CF_API_KEY` - API key for authentication (optional)
- `LOG_LEVEL` - Logging level (default: INFO)
- `REDIS_URL` - Redis connection URL (optional)

## Deployment

This service is deployed on HuggingFace Spaces using Docker.

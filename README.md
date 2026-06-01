# 🚀 Hooktower

**Webhook-driven container updates for Docker.**

Hooktower is a lightweight alternative to Watchtower.

Instead of polling registries every few minutes, Hooktower listens for webhooks and updates containers immediately after a new image is published. Hooktower is designed around Docker Hub compatible webhooks.

---

## ✨ Features

- ⚡ Event-driven updates
- 🐳 Docker API via Dockerode
- 🔐 Shared-secret webhook endpoint
- 🔑 Private registry support via standard Docker `config.json`
- 🧪 Fast startup validation
- 📦 Docker Hub compatible webhook payloads
- 🪶 Minimal configuration

---

## ❌ What Hooktower does NOT do

- No polling
- No cron jobs
- No UI
- No notifications
- No metrics
- No Compose integration
- No custom registry integrations

---

## ⚙️ Configuration

| Variable | Required | Default |
|----------|----------|----------|
| `WEBHOOK_SECRET` | ✅ | - |
| `DOCKER_HOST` | ❌ | `unix:///var/run/docker.sock` |
| `DOCKER_CONFIG_FILE` | ❌ | `/config.json` |
| `HOST` | ❌ | `0.0.0.0` |
| `PORT` | ❌ | `4665` |

### Example

```env
WEBHOOK_SECRET=abcdefghijklmnopqrstuvwxyz123456
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_CONFIG_FILE=/config.json
PORT=4665
```

---

## 🏃 Local Development

```bash
pnpm install

WEBHOOK_SECRET=abcdefghijklmnopqrstuvwxyz123456 \
pnpm dev
```

### Remote Docker via SSH Tunnel

```bash
ssh -N -L /tmp/home-docker.sock:/var/run/docker.sock user@server
```

```bash
DOCKER_HOST=unix:///tmp/home-docker.sock \
WEBHOOK_SECRET=abcdefghijklmnopqrstuvwxyz123456 \
pnpm dev
```

---

## 🐳 Docker Deployment

```yaml
services:
  hooktower:
    image: ghcr.io/qstyler/hooktower:latest
    ports:
      - "4665:4665"
    environment:
      WEBHOOK_SECRET: your-super-secret-token
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /path/to/config.json:/config.json:ro
```

---

## 🔐 Private Registries

Hooktower supports the standard Docker authentication format.

Create credentials using:

```bash
docker login ghcr.io
```

Then mount:

```yaml
volumes:
  - /path/to/config.json:/config.json:ro
```

Hooktower automatically loads matching credentials during image pulls.

---

## 📬 Webhook

Endpoint:

```http
POST /webhook/:secret
```

### Docker Hub

Hooktower natively supports Docker Hub webhooks.

Configure a webhook in Docker Hub and point it to:

```text
http://your-server:4665/webhook/<secret>
```

Example:

```bash
curl -X POST \
  "http://localhost:4665/webhook/abcdefghijklmnopqrstuvwxyz123456" \
  -H "Content-Type: application/json" \
  -d '{
    "push_data": {
      "tag": "latest"
    },
    "repository": {
      "repo_name": "acme/web-app"
    }
  }'
```

Docker Hub compatible payload:

```json
{
  "push_data": {
    "tag": "latest"
  },
  "repository": {
    "repo_name": "acme/web-app"
  }
}
```

### GitHub Container Registry (GHCR)

GHCR does not provide Docker Hub style webhooks.

To use Hooktower with GHCR, trigger the webhook from your CI/CD pipeline after publishing a new image.

Example GitHub Actions step:

```yaml
- name: Notify Hooktower
  run: |
    curl -X POST \
      "${{ secrets.HOOKTOWER_WEBHOOK_URL }}" \
      -H "Content-Type: application/json" \
      -d '{
        "push_data": {
          "tag": "latest"
        },
        "repository": {
          "repo_name": "ghcr.io/acme/web-app"
        }
      }'
```

Required GitHub secret:

| Secret | Example |
|----------|----------|
| `HOOKTOWER_WEBHOOK_URL` | `https://hooktower.example.com/webhook/abcdefghijklmnopqrstuvwxyz123456` |

As long as the payload matches the Docker Hub compatible format, Hooktower will process it normally.

---

## 🔄 Update Flow

```text
Webhook
  ↓
Validate secret
  ↓
Validate payload
  ↓
Find matching containers
  ↓
Pull image
  ↓
Stop container
  ↓
Remove container
  ↓
Create container
  ↓
Start container
```

---

## 📄 Response

```json
{
  "image": "acme/web-app:latest",
  "matched": 1,
  "actions": [
    {
      "previousContainerId": "abc123",
      "newContainerId": "def456",
      "name": "web-app",
      "previousImage": "acme/web-app:old",
      "newImage": "acme/web-app:latest",
      "status": "recreated"
    }
  ]
}
```

---

## 🩺 Startup Checks

Hooktower fails fast when:

- `WEBHOOK_SECRET` is missing
- `WEBHOOK_SECRET` is shorter than 32 characters
- Docker socket is unavailable
- Docker daemon is unreachable

---

## 📜 License

MIT
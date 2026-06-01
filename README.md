<file name=0 path=/Users/kostia/www/hooktower/README.md># Hooktower

Hooktower is a lightweight webhook-driven alternative to Watchtower.

Instead of polling container registries on a schedule, Hooktower receives a Docker Hub compatible webhook when a new image is published and immediately recreates running containers that use the matching image repository.

## Features

- Fastify HTTP server
- Docker Hub compatible webhook payloads
- Shared-secret webhook URL
- Docker socket integration through Dockerode
- Fail-fast startup checks for configuration and Docker connectivity

Hooktower intentionally does not include polling, cron jobs, UI, notifications, metrics, cleanup, Compose support, application configuration files, registry-specific integrations, or additional authentication methods.

## Configuration

| Environment variable | Required | Description |
| --- | --- | --- |
| `WEBHOOK_SECRET` | yes | Shared secret used in `POST /webhook/:secret`. Must be at least 32 characters. |
| `DOCKER_HOST` | no | Docker host used by Dockerode. Defaults to `unix:///var/run/docker.sock`. |
| `DOCKER_CONFIG_FILE` | no | Docker `config.json` file used for registry authentication. Defaults to `/config.json`. |
| `HOST` | no | Listen host. Defaults to `0.0.0.0`. |
| `PORT` | no | Listen port. Defaults to `4665`. |

Hooktower connects to Docker through the configured `DOCKER_HOST` value. The Docker socket must still be mounted into the container when using a Unix socket.

```env
WEBHOOK_SECRET=abcdefghijklmnopqrstuvwxyz123456
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_CONFIG_FILE=/config.json
```

Default:

```env
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_CONFIG_FILE=/config.json
```

On startup, Hooktower fails fast when `WEBHOOK_SECRET` is missing, `WEBHOOK_SECRET` is shorter than 32 characters, or the Docker daemon is unreachable. If `DOCKER_HOST` points to a Unix socket, Hooktower validates that the socket exists before attempting to connect.

If `DOCKER_CONFIG_FILE` exists, Hooktower validates that it is readable and uses it for registry authentication during image pulls. If the file does not exist, Hooktower continues normally and logs that registry authentication is not available.

Registry authentication uses the standard Docker `config.json` `auths` format. Hooktower does not support custom registry username or password environment variables.

## Run

```sh
pnpm install
WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx pnpm dev
```

## Docker

```yaml
services:
  hooktower:
    image: hooktower
    ports:
      - "4665:4665"
    environment:
      WEBHOOK_SECRET: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /path/to/config.json:/config.json:ro
```

## Advanced Docker

```yaml
services:
  hooktower:
    image: hooktower
    ports:
      - "4665:4665"
    environment:
      WEBHOOK_SECRET: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      DOCKER_CONFIG_FILE: /docker/config.json
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /path/to/config.json:/docker/config.json:ro
```

## Webhook

```sh
curl -X POST http://localhost:4665/webhook/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  -H 'content-type: application/json' \
  -d '{
    "push_data": {
      "tag": "latest"
    },
    "repository": {
      "repo_name": "acme/web-app"
    }
  }'
```

Hooktower will:

1. Validate the secret.
2. Validate the payload.
3. Extract `repository.repo_name` and `push_data.tag`.
4. Find running containers using the matching image repository.
5. Pull the new image.
6. Recreate matching containers with the new image.
7. Return a JSON response describing the performed actions.

## Response

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
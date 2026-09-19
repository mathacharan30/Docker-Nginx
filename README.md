# Docker-Nginx

A small full-stack app (static frontend + Node/Express API + MongoDB) built to learn Docker, Docker Compose, Nginx reverse proxying, and CI/CD deployment to AWS EC2 — from the ground up.

---

## What this project does

A single page where you can **add, edit, and delete items**. Nothing fancy — the point isn't the app, it's everything running underneath it: three containers working together, fronted by Nginx, deployed automatically to a real server every time code is pushed.

---

## Architecture — the big picture

```
                              INTERNET
                                 │
                                 │  http://<EC2-IP>
                                 ▼
                    ┌─────────────────────────┐
                    │   EC2 Instance (Ubuntu)  │
                    │                          │
                    │  ┌────────────────────┐  │
                    │  │   nginx container   │  │◄── only container exposed
                    │  │   (port 80)          │  │     to the internet
                    │  └──────────┬───────────┘  │
                    │             │              │
                    │     ┌───────┴───────┐      │
                    │     │               │      │
                    │     ▼               ▼      │
                    │  static files   /api/* →   │
                    │  (public/)      proxy_pass  │
                    │                     │       │
                    │                     ▼       │
                    │  ┌────────────────────┐    │
                    │  │   app container      │    │  (internal only,
                    │  │   Node + Express     │    │   no exposed port)
                    │  │   (port 3000)         │    │
                    │  └──────────┬───────────┘    │
                    │             │                │
                    │             ▼                │
                    │  ┌────────────────────┐    │
                    │  │   db container        │    │  (internal only,
                    │  │   MongoDB 8.0.11      │    │   no exposed port)
                    │  └──────────┬───────────┘    │
                    │             │                │
                    │             ▼                │
                    │  ┌────────────────────┐    │
                    │  │  named volume         │    │  (data survives
                    │  │  mongo-data           │    │   container restarts)
                    │  └────────────────────┘    │
                    └─────────────────────────┘
```

**The one rule that matters:** only Nginx is reachable from outside. The app and the database only talk to each other and to Nginx, over Docker's private internal network. Nobody on the internet can hit MongoDB or the Node app directly.

---

## Request flow — what happens when you click a button

**Loading the page:**
```
Browser                Nginx                 Filesystem
   │  GET /                │                        │
   │──────────────────────►│                        │
   │                       │  location / →          │
   │                       │  serve from             │
   │                       │  /usr/share/nginx/html  │
   │                       │───────────────────────► │
   │                       │◄─────────────────────── │
   │◄──────────────────────│   index.html            │
```

**Adding an item (the frontend's `fetch` call):**
```
Browser              Nginx                App              MongoDB
   │ POST /api/items    │                    │                  │
   │────────────────────►│                    │                  │
   │                     │ location /api/ →   │                  │
   │                     │ proxy_pass to       │                  │
   │                     │ app:3000            │                  │
   │                     │───────────────────►│                  │
   │                     │                    │ insertOne()      │
   │                     │                    │─────────────────►│
   │                     │                    │◄─────────────────│
   │                     │◄───────────────────│  {message:"Added"}│
   │◄────────────────────│                    │                  │
```

Nginx decides where a request goes purely by looking at the URL path — `/api/...` goes to the app, everything else is a static file.

---

## The three containers

| Container | Image | Exposed to internet? | Job |
|---|---|---|---|
| `nginx` | `nginx` (official) | ✅ port 80 | Reverse proxy — routes `/api/*` to the app, serves everything else as static files |
| `app` | built from `Dockerfile` | ❌ internal only | Express API — the 4 CRUD routes, talks to MongoDB |
| `db` | `mongo:8.0.11` | ❌ internal only | Stores the actual data |

They all sit on one Docker network (created automatically by Compose) and reach each other using their **service name** as a hostname — e.g. the app connects to MongoDB via `mongodb://db:27017`, not an IP address.

---

## The Dockerfile (how the `app` image is built)

```dockerfile
FROM node:18-alpine     # start from an image that already has Node installed
WORKDIR /app             # all following commands run inside /app
COPY package.json .      # copy just this file first...
RUN npm install          # ...so this layer is cached until dependencies change
COPY . .                 # now copy the rest of the source code
CMD ["node", "app.js"]   # what runs when the container starts
```

Copying `package.json` before running `npm install`, then copying everything else after, means Docker only re-runs `npm install` when dependencies actually change — not on every code edit. That's layer caching.

---

## API routes (`app.js`)

| Method | Route | Does |
|---|---|---|
| `GET` | `/api/items` | list all items |
| `POST` | `/api/items` | add a new item |
| `PUT` | `/api/items/:id` | edit an item by its MongoDB `_id` |
| `DELETE` | `/api/items/:id` | delete an item by its `_id` |

The app doesn't crash if MongoDB isn't ready yet — it retries the connection every 3 seconds in a loop (`connectWithRetry()`), and any route hit before the DB connects returns a `503` instead of crashing the whole process.

---

## docker-compose.yml — how it's all wired together

```yaml
services:
  nginx:
    image: nginx
    restart: always
    ports:
      - "80:80"                                        # only port exposed to the host
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - ./public:/usr/share/nginx/html                  # frontend files
    depends_on:
      - app

  app:
    build: .
    restart: always
    environment:
      - PORT=3000
      - MONGO_URL=mongodb://db:27017                    # "db" = service name = hostname
    depends_on:
      db:
        condition: service_healthy                       # wait for Mongo to actually be ready

  db:
    image: mongo:8.0.11                                  # pinned — "latest" broke on EC2's kernel
    restart: always
    volumes:
      - mongo-data:/data/db                              # named volume — survives container deletion
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  mongo-data:
```

Every service has `restart: always` — if the EC2 instance itself reboots, all three containers come back up on their own without anyone touching a keyboard.

---

## Deployment pipeline (CI/CD)

```
 Local machine                GitHub                        EC2 Instance
      │                          │                                │
      │  git push                │                                │
      │─────────────────────────►│                                │
      │                          │  triggers .github/workflows/   │
      │                          │  deploy.yml                    │
      │                          │                                │
      │                          │  SSHs in using secrets:        │
      │                          │  EC2_HOST, EC2_USERNAME,       │
      │                          │  EC2_SSH_KEY                   │
      │                          │───────────────────────────────►│
      │                          │                                │  git pull
      │                          │                                │  docker-compose up -d --build
      │                          │                                │
      │                          │◄───────────────────────────────│
      │                          │   deploy succeeded              │
```

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to EC2
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USERNAME }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd Docker-Nginx
            git pull
            docker-compose up -d --build
```

Every `git push` to `main` automatically rebuilds and redeploys — no manual SSH needed.

**Secrets** (GitHub repo → Settings → Secrets and variables → Actions) — never committed to the repo:
- `EC2_HOST` — the server's Elastic IP (fixed, doesn't change across stop/start)
- `EC2_USERNAME` — `ubuntu`
- `EC2_SSH_KEY` — the private key used to SSH in

---

## Why an Elastic IP

A normal EC2 public IP changes every time the instance is stopped and started. An **Elastic IP** is a static IP permanently attached to the instance — safe to hardcode into GitHub Secrets, since it never changes.

---

## Local development vs production

| | Local | EC2 (production) |
|---|---|---|
| Command | `docker-compose up -d --build` | Same, triggered automatically by GitHub Actions |
| Access | `http://localhost` | `http://<Elastic IP>` |
| Mongo data | wiped freely for testing | persists in a named volume |
| Deploy | manual | `git push` → auto-deploy |

---

## What's deliberately not done (yet)

- **No HTTPS/SSL** — Let's Encrypt requires a real domain name; this project runs on a raw IP.
- **No image registry** (Docker Hub/ECR) — the app image is built directly on the EC2 instance rather than built once and pushed/pulled. Fine for a single small app; a larger project would build once in CI and just pull the finished image on the server.
- **No backups** — if the EC2 instance is terminated (not just stopped), the MongoDB volume goes with it.

---

## Running it yourself

```bash
git clone https://github.com/mathacharan30/Docker-Nginx.git
cd Docker-Nginx
docker-compose up -d --build
```

Then open `http://localhost`.

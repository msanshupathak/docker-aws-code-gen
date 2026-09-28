# Docker AWS Editor

A real-time collaborative code editor — React + Monaco editor frontend synced across users with Yjs CRDTs over Socket.io, served by an Express backend, all packaged into a single Docker image ready for AWS deployment.

## Project Structure

```
├── Frontend/   React + Vite + Monaco Editor + Yjs
├── Backend/    Express + Socket.io + y-socket.io server
└── dockerfile  Multi-stage build: frontend build → served by backend
```

## Run Locally

**Backend:**
```bash
cd Backend
npm install
npm run dev
```

**Frontend:**
```bash
cd Frontend
npm install
npm run dev
```

## Run with Docker

```bash
docker build -t docker-aws-editor .
docker run -p 3000:3000 docker-aws-editor
```

Then open http://localhost:3000 — the Express server serves the built frontend and handles the real-time sync.

## Deploy to AWS

1. Push the image to Amazon ECR:
   ```bash
   aws ecr create-repository --repository-name docker-aws-editor
   docker tag docker-aws-editor:latest <account-id>.dkr.ecr.<region>.amazonaws.com/docker-aws-editor:latest
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/docker-aws-editor:latest
   ```
2. Run it on EC2 or ECS (port 3000), and open the port in your security group.

## How It Works

- Each user joins with a username (`?username=...`).
- Code edits in the Monaco editor sync in real time to every connected user via Yjs CRDTs over Socket.io.
- The sidebar shows all currently connected users.

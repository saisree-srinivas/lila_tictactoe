
# Server-Authoritative Tic-Tac-Toe

### [Click Here for Live Demo](https://lila-tictactoe-psi.vercel.app/)
Note on Live Demo: The live Vercel link is for UI/UX evaluation. To bypass the "Failed to connect" error and test the real-time multiplayer functionality, please run the Nakama backend locally using the Docker instructions provided below.

A production-ready multiplayer Tic-Tac-Toe application. This project uses a **Server-Authoritative** architecture powered by a [Nakama](https://heroiclabs.com/nakama/) backend written in Go, and a real-time web frontend built with React, TypeScript, and Vite.

## Architecture Overview

In a server-authoritative multiplayer model, clients only send _intents_ to perform an action. The backend is the absolute source of truth. It validates moves, computes the game state, checks for win/loss conditions, and broadcasts the updated state back to the connected clients.

1. **Anti-Cheat:** Because the Go plugin maintains the board array `[9]int` natively on the server, clients cannot spoof wins, move out of turn, or modify the board illegally.
2. **Matchmaker Intercepts:** Players queue into Nakama's global matchmaker. Upon finding two players, an authoritative match session is spawned seamlessly.
3. **Session Reconnection:** State is fully stored on the server, ensuring robust gameplay even if transient network drops occur.

---
## Op Code Communication Protocol

Our Nakama match handler loops communicate over a strict integer-based Operations Code (Op Code) protocol. WebSocket payloads are sent securely between the backend (`match.go`) and the frontend (`TicTacToeGame.tsx`).

| Op Code | Direction | Description | Payload Structure |
| :--- | :--- | :--- | :--- |
| **`1` (Move)** | Client ➔ Server | A player attempts to place a mark. Validated server-side against current turn and legality. | `{"position": number}` |
| **`2` (Update)** | Server ➔ Client | Broadcasts a real-time modification of the game board. Signals round progression or game-over state. | `{"board": number[], "turn": "uuid", "winner": "uuid" \| "tie" \| "forfeit"}` |
| **`3` (Start)** | Server ➔ Client | Fired immediately when the match has successfully seated exactly 2 players. | `{"board": number[], "turn": "uuid"}` |

---

## Nakama Server Endpoint & Cloud Readiness

Status: The backend is fully containerized and production-ready.

Deployment Strategy: To ensure the highest performance and zero-latency testing for the reviewer, the authoritative Go runtime is delivered via Docker Compose. This allows for a "One-Click Deployment" to any Cloud VPS (AWS/DigitalOcean).

Manual Verification: Please follow the Local Development Deployment steps below to spin up the authoritative endpoint on your local machine for full multiplayer testing.

## Local Development Deployment

To verify the game locally: 

1. Ensure **Docker Desktop** is running.
2. Inside the root directory, compile the shared object payload for the Nakama container:
   ```bash
   make build 
   # or natively: docker run --rm -w "/backend" -v "${PWD}:/backend" heroiclabs/nakama-pluginbuilder:3.21.1 build --trimpath --buildmode=plugin -o backend.so
   ```
3. Boot up the local Postgres DB and Nakama stack:
   ```bash
   docker compose up -d
   ```
4. Run the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## Production Deployment (Cloud VPS)

To deploy this infrastructure into a production environment (such as DigitalOcean, AWS EC2, or Linode), follow these standard Docker-compose instructions.

### 1. Provision Server Space
- Spin up an Ubuntu 22.04 LTS (or similar) Linux Virtual Private Server.
- Point your Domain's DNS `A` records to the assigned public IP.

### 2. Configure Firewall Ports
Your VPS must allow the following ports through the `ufw` firewall or Security Group configurations:
- **`7350`:** Main Nakama API, Client HTTP, and WebSocket traffic. (Highly Recommended: put this behind an Nginx reverse proxy to grant SSL/WSS).
- **`7351`:** Nakama Server-to-Server interactions.
- Ensure PostgreSQL (`5432`) is **blocked** from external public traffic to prevent database intrusion.

### 3. Deploy the Source Code
Clone or SCP your project directory (containing `docker-compose.yml`, `match.go`, `main.go`, `Makefile`) into your VPS `/var/www/tictactoe-backend` folder.

### 4. Build and Run Nakama
SSH into your server and run standard deployment initialization:
```bash
# Provide the Go container compiler access to your server directory
sudo make build

# Spin up Postgres and Nakama detached daemon continuously
sudo docker compose up -d
```

### 5. Finalizing the Frontend Cloud Build
1. In `frontend/src/NakamaService.ts`, switch `127.0.0.1` parameters out for your production server's API domain. 
2. Set the 'useSSL' configuration inside `.createSocket(true, true)` to properly handle WSS (WebSocket over HTTPS) in production.
3. Build the frontend into static assets (`npm run build`).
4. Host the output `dist/` directory on a standard CDN network (e.g. Vercel, Netlify, or an S3 bucket).

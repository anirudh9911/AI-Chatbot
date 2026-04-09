# Inquiro — AI Research Assistant

Inquiro is a production-grade AI chatbot that combines GPT-4o with real-time web search (Tavily) to answer questions about current events, live data, and general knowledge. Built with a FastAPI backend, Next.js frontend, and deployed on Kubernetes using Kind for local development.

---

## Architecture Overview

```
Browser
  │
  └── localhost:3000  →  Next.js client pod (NodePort)
                              │
                    /api/* requests proxied
                    internally via Route Handler
                              │
                         server-svc:8000  (ClusterIP)
                              │
                        LangGraph state machine
                              │
                    ┌─────────┴──────────┐
                    │                    │
               OpenAI GPT-4o      Tavily Search API
                    │                    │
                    └─────────┬──────────┘
                              │
                       SSE stream → browser
```

All browser traffic goes through **one port (3000)**. The Next.js server proxies `/api/*` requests to the FastAPI server pod internally via Kubernetes ClusterIP DNS — no `kubectl port-forward` needed.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| AI Orchestration | LangGraph (state machine + MemorySaver checkpointing) |
| LLM | OpenAI GPT-4o |
| Web Search | Tavily Search API |
| Database | SQLite via SQLAlchemy (conversation metadata) |
| Containerisation | Docker (multi-stage builds) |
| Orchestration | Kubernetes (Kind for local dev) |
| CI | GitHub Actions (4 parallel jobs) |

---

## Project Structure

```
.
├── server/                     # FastAPI backend
│   ├── app.py                  # Main application — routes, LangGraph graph, SSE stream
│   ├── database.py             # SQLAlchemy models + session management
│   ├── logging_config.py       # JSON-structured logging middleware
│   ├── requirements.txt
│   ├── Dockerfile              # python:3.12-slim, non-root user
│   └── .env.example            # Required env vars template
│
├── client/                     # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── [...path]/
│   │   │   │       └── route.ts  # Catch-all proxy — forwards /api/* to server pod at runtime
│   │   │   └── page.tsx          # Main page — layout, state, SSE event handling
│   │   ├── components/
│   │   │   ├── ConversationSidebar.tsx  # Chat history sidebar with rename/delete
│   │   │   ├── MessageArea.tsx          # Message rendering, syntax highlighting, edit
│   │   │   ├── InputBar.tsx             # Multi-line textarea, Shift+Enter newline
│   │   │   └── Header.tsx              # App header
│   │   └── types/
│   │       └── types.ts        # Shared TypeScript interfaces
│   ├── next.config.ts          # output: 'standalone' for Docker
│   └── Dockerfile              # 3-stage: deps → builder → runner (~100MB image)
│
├── k8s/                        # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml          # Non-secret env vars (incl. INTERNAL_API_URL)
│   ├── pvc.yaml                # 1Gi PVC for SQLite database
│   ├── server-deployment.yaml  # FastAPI (readiness + liveness probes)
│   ├── server-service.yaml     # ClusterIP — internal only
│   ├── client-deployment.yaml  # Next.js client
│   ├── client-service.yaml     # NodePort 30000 → localhost:3000
│   ├── templates/
│   │   └── secret.yaml         # Reference template only — never apply directly
│   ├── setup-secrets.sh        # Creates real K8s secret from server/.env
│   ├── load-images.sh          # Builds + loads Docker images into Kind
│   └── README.md               # Full Kind setup runbook
│
├── .github/
│   └── workflows/
│       └── ci.yml              # 4 parallel jobs: flake8, ESLint, Docker build ×2
│
├── docker-compose.yml          # Local dev without Kubernetes
├── kind-config.yaml            # Kind cluster config (port mapping 30000→3000)
└── README.md
```

---

## Features

### Chat
- **Streaming responses** via Server-Sent Events (SSE) — words appear token by token
- **Intelligent routing** — LangGraph decides whether to answer directly or search the web
- **Web search** — Tavily returns real-time results with titles and URLs shown as source chips
- **Message editing** — hover any sent message, click the pencil icon to edit and regenerate

### Conversation Management
- **Persistent sidebar** — all conversations saved to SQLite, ordered by last activity
- **localStorage sync** — message history restored on browser refresh without server roundtrip
- **Rename** — inline rename with Enter to confirm, Escape to cancel
- **Delete** — removes from server (SQLite) and browser (localStorage)
- **New Chat** — starts a fresh LangGraph thread

### UI
- **Syntax highlighting** — fenced code blocks with language label, copy button, oneDark theme
- **Markdown rendering** — bold, lists, tables, inline code, clickable links
- **Source chips** — clickable title cards showing which pages the AI read
- **Multi-line input** — Shift+Enter for newline, Enter to send, auto-grows up to 5 lines

---

## How It Works

### Request Flow

```
1. Browser loads http://localhost:3000
   → Kind NodePort (30000) → client pod → Next.js serves HTML/JS

2. Browser sends chat message to /api/chat_stream?message=...
   → client pod (Next.js Route Handler at /api/[...path])
   → server-svc:8000 via ClusterIP DNS (pod-to-pod, internal)
   → FastAPI streams SSE tokens back through the same path
   → Browser receives tokens one-by-one → words appear as they stream
```

The browser only ever talks to port 3000. The server pod is never exposed externally.

### LangGraph State Machine

```
User message
     │
  [model node]  ←──────────────────┐
     │                             │
  router                           │
     │                             │
  ┌──┴──┐                          │
  │     │                          │
 END  [tool_node]  (Tavily search) ┘
       │
   search results injected
   back into model context
```

1. **model node** — GPT-4o receives the conversation history + system prompt. Decides to answer directly or call the search tool.
2. **tools_router** — checks if the last AI message contains tool calls. If yes → tool_node. If no → END.
3. **tool_node** — executes Tavily search, returns results as a `ToolMessage`.
4. Back to **model node** — GPT-4o synthesises search results into a final answer.
5. Response streams back token-by-token via SSE.

### System Prompt

Built fresh on every model invocation with:
- Current date and UTC time (so answers about today's events are always accurate)
- Inquiro persona and search tool usage guidelines
- Citation format instruction (use source title as link text, never the word "source")

### Persistence Architecture

| What | Where | Survives server pod restart? |
|---|---|---|
| LLM conversation context | LangGraph `MemorySaver` (in-RAM) | No |
| Conversation metadata (title, timestamps) | SQLite on Kubernetes PVC | Yes |
| Message history for UI | Browser `localStorage` | Yes (browser only) |

**localhost:3000 availability:**

| Event | UI available? | LLM context retained? |
|---|---|---|
| Close terminal | Yes | Yes |
| Laptop sleep | Yes | Yes |
| Reload server image | Yes | No — pod restarted |
| Reload client image | Brief downtime (~10s) | Yes |
| `kind delete cluster` | No | No |
| Laptop restart | No (until Docker starts) | No |

**Production upgrade path:** Replace `MemorySaver` with `AsyncPostgresSaver` from `langgraph-checkpoint-postgres` — 3 lines of code change. The PVC is already sized to accommodate a Postgres pod in the same namespace.

---

## Running Locally

### Option 1: docker-compose (simplest)

```bash
# 1. Create server/.env with your API keys (see server/.env.example)

# 2. Start both services
docker compose up --build

# App available at http://localhost:3000
```

### Option 2: Kubernetes with Kind

Prerequisites: Docker, Kind (`brew install kind`), kubectl (`brew install kubectl`)

```bash
# 1. Create the Kind cluster
kind create cluster --config kind-config.yaml

# 2. Build and load Docker images into Kind
bash k8s/load-images.sh

# 3. Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-service.yaml
kubectl apply -f k8s/client-deployment.yaml
kubectl apply -f k8s/client-service.yaml

# 4. Create secrets from server/.env
bash k8s/setup-secrets.sh

# Verify pods are running
kubectl get pods -n inquiro
# NAME              READY   STATUS    RESTARTS
# client-xxxx       1/1     Running   0
# server-xxxx       1/1     Running   0

# App available at http://localhost:3000 — no port-forward needed
```

**After a laptop restart:** Open Docker Desktop, wait ~15 seconds, then open http://localhost:3000.

Teardown:
```bash
kind delete cluster --name inquiro-cluster
```

---

## Environment Variables

### server/.env (copy from server/.env.example)

```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=sqlite:///./data/inquiro.db
```

### client/.env.local (for local dev without containers)

```env
INTERNAL_API_URL=http://localhost:8000
```

In Kubernetes this is set via `configmap.yaml` (`INTERNAL_API_URL=http://server-svc:8000`).
In docker-compose it is set inline (`INTERNAL_API_URL=http://server:8000`).

---

## CI/CD

GitHub Actions runs 4 parallel jobs on every push:

| Job | Tool | What it checks |
|---|---|---|
| `lint-server` | flake8 (max-line-length=100) | Python code style |
| `lint-client` | ESLint | TypeScript/React code quality |
| `docker-build-server` | Docker | Server image builds without error |
| `docker-build-client` | Docker | Client image builds without error |

---

## Key Design Decisions

### Why does all traffic go through port 3000?
The Next.js server acts as a reverse proxy via a catch-all Route Handler (`/api/[...path]/route.ts`). It reads `INTERNAL_API_URL` at request time and forwards to the server pod via ClusterIP DNS. This is better than `next.config.ts` rewrites (which are baked in at build time and can't read runtime env vars like configmap values).

### Why ClusterIP for the server, not NodePort?
The server handles API keys and business logic — it should not be directly exposed externally. ClusterIP keeps it internal. The Next.js proxy is the only thing that talks to it, pod-to-pod within the cluster. In production, an Ingress controller (nginx, OpenShift Route) on port 3000 handles everything.

### Why SQLite and not PostgreSQL?
Two separate concerns: LangGraph `MemorySaver` owns LLM state; SQLite owns conversation discovery (titles, timestamps). SQLite needs no extra container and is sufficient for single-replica deployments. The `replicas: 1` in the server deployment is intentional — SQLite is single-writer. Scaling horizontally requires migrating to a PostgreSQL checkpointer.

### Why multi-stage Docker build for the client?
Three stages: `deps` (npm ci), `builder` (npm run build), `runner` (standalone output only). The production image has no `node_modules` — ~100MB vs ~400MB. Next.js `output: 'standalone'` copies only the files needed to run.

### Why localStorage for message history?
Conversation metadata (titles) lives in SQLite on the server. But re-fetching all messages from the server on every page load would require storing full message content server-side too. localStorage avoids that complexity while still surviving browser refreshes. It is read in a `useEffect` (not `useState`) to avoid Next.js server/client hydration mismatches.

### OpenShift compatibility
All manifests deploy to OpenShift with one change: replace `client-service.yaml` NodePort with a `Route` object. The Route acts as an Ingress — OpenShift's HAProxy router terminates external traffic and forwards to the ClusterIP service. The Next.js proxy then handles internal routing to the server pod. Everything else (deployments, configmap, secrets, PVC) is identical.

---

## API Reference

All requests from the browser go to `/api/*` which the Next.js Route Handler proxies to the FastAPI server.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check — used by K8s readiness/liveness probes |
| `GET` | `/api/chat_stream?message=...&checkpoint_id=...` | SSE stream for chat responses |
| `GET` | `/api/conversations` | List all conversations (ordered by updated_at desc, limit 50) |
| `GET` | `/api/conversations/{thread_id}` | Get single conversation |
| `PATCH` | `/api/conversations/{thread_id}` | Rename conversation `{"title": "new name"}` |
| `DELETE` | `/api/conversations/{thread_id}` | Delete conversation |

### SSE Event Types

The `/api/chat_stream` endpoint emits these event types:

| Event type | Payload | When |
|---|---|---|
| `checkpoint` | `{checkpoint_id}` | First event for new conversations |
| `content` | `{content}` | Each streamed token from GPT-4o |
| `search_start` | `{query}` | When Tavily search begins |
| `search_results` | `{urls: [{url, title}]}` | When search results arrive |
| `search_error` | `{error}` | If search fails |
| `end` | — | Stream complete |

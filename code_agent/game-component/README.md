# 🚀 Space Fractions - GameComponent

> **Microservice responsible for game logic, user interaction, and game state data ownership.**

Part of the **Space Fractions** interactive learning platform — a web-based tool to improve fraction-solving skills for 6th-grade students.

---

## 📋 Architecture Overview

| Attribute       | Value                                                   |
|-----------------|---------------------------------------------------------|
| **Runtime**     | Node.js 18                                              |
| **Framework**   | Express.js 4                                            |
| **Database**    | PostgreSQL 14 (persistence)                             |
| **Cache**       | Redis 6 (game state caching)                            |
| **Messaging**   | RabbitMQ 3 (event-driven communication)                 |
| **Auth**        | OAuth2 / JWT                                            |
| **Observability**| Prometheus 2                                           |
| **Container**   | Docker 20                                               |
| **Orchestration**| Kubernetes                                             |

### Component Responsibilities

| Component         | Responsibilities                                         |
|-------------------|----------------------------------------------------------|
| **GameComponent** | Game logic, User interaction, Game state data ownership  |
| QuestionComponent | Question management, Data persistence                    |
| UserComponent     | User authentication, Authorization                       |

---

## 📁 Project Structure

```
game-component/
├── api/
│   └── openapi.yaml              # OpenAPI 3.0 specification
├── k8s/
│   ├── configmap.yaml            # Kubernetes ConfigMap
│   ├── hpa.yaml                  # HorizontalPodAutoscaler
│   ├── service.yaml              # ClusterIP + Headless services
│   └── spacefractions-deployment.yaml  # Deployment manifest
├── sql/
│   ├── game_ddl.sql              # Full schema DDL
│   └── migrations/
│       └── 001_initial_schema.sql  # Migration #1
├── src/
│   ├── cache/
│   │   └── redisClient.js        # Redis connection & client
│   ├── config/
│   │   ├── database.js           # PostgreSQL pool & queries
│   │   ├── index.js              # Centralized configuration
│   │   └── migrate.js            # Database migration runner
│   ├── controllers/
│   │   └── gameController.js     # HTTP request handlers
│   ├── messaging/
│   │   └── rabbitmq.js           # RabbitMQ producer/consumer
│   ├── middleware/
│   │   ├── auth.js               # JWT authentication
│   │   ├── errorHandler.js       # Global error handling
│   │   └── validator.js          # Request validation (Joi)
│   ├── models/
│   │   ├── Game.js               # Game entity & DB operations
│   │   └── index.js              # Model exports
│   ├── proto/
│   │   └── internal.proto        # gRPC service definition
│   ├── routes/
│   │   ├── gameRoutes.js         # Game REST endpoints
│   │   └── index.js              # Route aggregator
│   ├── services/
│   │   ├── gameService.js        # Core game business logic
│   │   └── scoringService.js     # Scoring & achievements
│   ├── utils/
│   │   ├── logger.js             # Winston logging
│   │   └── metrics.js            # Prometheus metrics
│   ├── app.js                    # Express application setup
│   └── server.js                 # Entry point & server bootstrap
├── tests/
│   ├── integration/
│   │   └── gameApi.test.js       # Full HTTP integration tests
│   └── unit/
│       ├── gameController.test.js # Controller unit tests
│       ├── gameService.test.js   # Service unit tests
│       └── scoringService.test.js # Scoring unit tests
├── .dockerignore
├── .env.example                  # Environment variable template
├── .gitignore
├── Dockerfile                    # Multi-stage production build
└── package.json                  # Dependencies & scripts
```

---

## 🚦 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL 14+
- Redis 6+
- RabbitMQ 3+

### Installation

```bash
# Clone the repository
cd game-component

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your local configuration
vim .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

| Variable              | Default      | Description                        |
|-----------------------|--------------|------------------------------------|
| `NODE_ENV`            | development  | Environment mode                   |
| `PORT`                | 3001         | HTTP server port                   |
| `HOST`                | 0.0.0.0      | Server bind address                |
| `DB_HOST`             | localhost    | PostgreSQL host                    |
| `DB_PORT`             | 5432         | PostgreSQL port                    |
| `DB_NAME`             | space_fractions | Database name                   |
| `DB_USER`             | postgres     | Database user                      |
| `DB_PASSWORD`         | postgres     | Database password                  |
| `REDIS_HOST`          | localhost    | Redis host                         |
| `REDIS_PORT`          | 6379         | Redis port                         |
| `RABBITMQ_HOST`       | localhost    | RabbitMQ host                      |
| `RABBITMQ_PORT`       | 5672         | RabbitMQ port                      |
| `JWT_SECRET`          | (change me)  | JWT signing secret                 |
| `LOG_LEVEL`           | info         | Logging level                      |

---

## 📡 API Reference

| Method | Endpoint                 | Description                | Auth Required |
|--------|--------------------------|----------------------------|:-------------:|
| POST   | `/api/v1/games`          | Start a new game           | ✅            |
| GET    | `/api/v1/games/active`   | Get active games           | ✅            |
| GET    | `/api/v1/games/recent`   | Get recent games           | ✅            |
| GET    | `/api/v1/games/stats`    | Get user statistics        | ✅            |
| GET    | `/api/v1/games/:id`      | Get game by ID             | ✅            |
| POST   | `/api/v1/games/:id/submit` | Submit an answer         | ✅            |
| PATCH  | `/api/v1/games/:id/state` | Update game state         | ✅            |
| POST   | `/api/v1/games/:id/complete` | Complete a game        | ✅            |
| GET    | `/health`                | Health check               | ❌            |
| GET    | `/metrics`               | Prometheus metrics         | ❌            |

Full OpenAPI specification is available at [`api/openapi.yaml`](api/openapi.yaml).

---

## 🧪 Testing

```bash
# Run all tests with coverage
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Test Coverage

| Category       | Target | Status |
|----------------|:------:|:------:|
| Branches       | 80%    | ✅     |
| Functions      | 80%    | ✅     |
| Lines          | 80%    | ✅     |
| Statements     | 80%    | ✅     |

---

## 🐳 Docker

```bash
# Build the image
docker build -t spacefractions-game:latest .

# Run locally
docker run -p 3001:3001 -p 9090:9090 --env-file .env spacefractions-game:latest
```

### Multi-stage Build

The Dockerfile uses a **multi-stage build**:
1. **Builder stage** — Installs production dependencies
2. **Production stage** — Minimal Alpine image with non-root user

---

## ☸️ Kubernetes Deployment

```bash
# Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# Create secrets (example)
kubectl create secret generic spacefractions-secrets \
  --from-literal=DB_PASSWORD=your-password \
  --from-literal=RABBITMQ_PASSWORD=guest \
  --from-literal=JWT_SECRET=your-secret-key

# Deploy the service
kubectl apply -f k8s/service.yaml

# Deploy the application
kubectl apply -f k8s/spacefractions-deployment.yaml

# Configure autoscaling
kubectl apply -f k8s/hpa.yaml
```

### Scaling Configuration

| Parameter        | Value      |
|------------------|------------|
| Min Replicas     | 3          |
| Max Replicas     | 10         |
| CPU Target       | 70%        |
| Memory Target    | 80%        |
| Scale Up Window  | 60s        |
| Scale Down Window| 300s       |

---

## 📊 Observability

### Health Check

```
GET /health
→ 200 {"status": "UP", "service": "space-fractions-game-component", "timestamp": "..."}
```

### Prometheus Metrics

| Metric                                     | Type      | Description                    |
|--------------------------------------------|-----------|--------------------------------|
| `spacefractions_http_requests_total`       | Counter   | Total HTTP requests            |
| `spacefractions_http_request_duration_seconds` | Histogram | Request durations           |
| `spacefractions_games_started_total`       | Counter   | Games started                  |
| `spacefractions_games_completed_total`     | Counter   | Games completed                |
| `spacefractions_active_games`              | Gauge     | Currently active games         |
| `spacefractions_game_duration_seconds`     | Histogram | Game session durations         |

### SLO / Error Budget

| Metric    | Target     |
|-----------|------------|
| Uptime    | 99.99%     |
| Error Budget | 1%      |
| RTO       | 1 hour     |
| RPO       | 1 hour     |

---

## 🔐 Security

- **Authentication**: OAuth2 / JWT Bearer tokens
- **Headers**: Helmet.js security headers
- **Rate Limiting**: 200 requests per 15 minutes per IP
- **CORS**: Configurable origin whitelist
- **Secrets**: Environment-based with Vault in production
- **Transport**: TLS encryption, Istio service mesh (production)

---

## 📬 Event-Driven Communication (RabbitMQ)

GameComponent publishes events to the `game.events` topic exchange:

| Routing Key          | Payload Description                        |
|----------------------|--------------------------------------------|
| `game.started`       | `{ gameId, userId, timestamp }`           |
| `game.completed`     | `{ gameId, userId, score, duration, ... }`|
| `game.abandoned`     | `{ gameId, userId, timestamp }`           |

---

## 🏗️ Migration Plan

| Step | Description                           |
|:----:|---------------------------------------|
| 1    | Migrate game data to new database     |
| 2    | Update game logic to use new database |
| 3    | Deploy new game component             |

**Tools**: Apache NiFi  
**Backward Compatibility**: 1 year  
**Migration Window**: 1 month  

---

## 📄 License

Proprietary — Space Fractions © 2024

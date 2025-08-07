# ADK Server Architecture

This directory contains the modular ADK server implementation, organized following backend best practices with clear separation of concerns.

## File Structure

```
server/
├── index.ts                       # Main exports for the server module
├── api.ts                         # Legacy export file (for backwards compatibility)
├── adk-server.ts                  # Main server class - orchestrates all components
├── types.ts                       # Shared TypeScript interfaces and types
├── routes.ts                      # Route definitions and setup
├── controllers/                   # Request handlers and business logic
│   ├── index.ts
│   ├── health.controller.ts       # Health check endpoints
│   └── agent.controller.ts        # Agent management endpoints
├── services/                      # Business logic and data access
│   ├── index.ts
│   ├── agent-scanner.service.ts   # Agent file discovery and validation
│   └── agent-management.service.ts # Agent process lifecycle management
├── middleware/                    # Cross-cutting concerns
│   ├── index.ts
│   └── cors.middleware.ts         # CORS configuration
└── handlers/                      # Event handlers (WebSocket functionality)
    ├── index.ts
    └── socket.handler.ts          # WebSocket event handling (used by adk-web frontend)
```

## Architecture Overview

### Controllers (`/controllers`)
Handle HTTP requests and coordinate between services:
- **HealthController**: Simple health check endpoints
- **AgentController**: Agent management operations (start, stop, list, message)

### Services (`/services`)  
Contains the core business logic:
- **AgentScannerService**: Discovers and validates agent files in directories
- **AgentManagementService**: Manages agent process lifecycle, TypeScript compilation, environment variables

### Middleware (`/middleware`)
Cross-cutting concerns applied to requests:
- **corsMiddleware**: CORS configuration for frontend integration

### Handlers (`/handlers`)
Event-driven components:
- **SocketHandler**: WebSocket connection management and real-time communication

### Main Components

#### ADKServer (`adk-server.ts`)
The main server orchestrator:
- Initializes HTTP server and Socket.IO in the correct order
- Sets up dependency injection for services  
- Coordinates all components with proper initialization sequence
- Provides start/stop lifecycle methods
- Configures Socket.IO handlers for real-time communication with adk-web frontend

#### Routes (`routes.ts`)
Defines API structure and wires controllers to endpoints:
- `/health` - Health check
- `/api/agents` - List available agents  
- `/api/agents/running` - List running agents
- `/api/agents/:id/start` - Start an agent
- `/api/agents/:id/stop` - Stop an agent
- `/api/agents/:id/message` - Send message to agent

#### Types (`types.ts`)
Shared TypeScript interfaces:
- `AgentFile` - Agent file metadata
- `AgentProcess` - Running process information  
- `SocketMessage` - WebSocket message format

## Benefits of This Architecture

1. **Clear Separation of Concerns**: Controllers handle requests, services contain business logic
2. **Dependency Injection**: Easy to test and swap implementations
3. **Scalability**: Easy to add new controllers, services, or middleware
4. **Maintainability**: Each component has a single responsibility
5. **Testability**: Components can be unit tested independently
6. **Familiar Structure**: Follows common backend patterns (MVC-like)

## Usage

```typescript
import { ADKServer } from './server';

const server = new ADKServer('/path/to/agents', 3001, 'localhost');
await server.start();
```

For individual components:

```typescript
import { AgentScannerService, AgentManagementService } from './server/services';

const scanner = new AgentScannerService('/path/to/agents');
const agents = await scanner.findAgentFiles();
```

## Adding New Features

### Adding a new controller:
1. Create `new-feature.controller.ts` in `/controllers`
2. Add routes in `/routes.ts`
3. Export from `/controllers/index.ts`

### Adding a new service:
1. Create `new-feature.service.ts` in `/services`  
2. Inject into relevant controllers
3. Export from `/services/index.ts`

### Adding middleware:
1. Create `new.middleware.ts` in `/middleware`
2. Apply in `/routes.ts`
3. Export from `/middleware/index.ts`

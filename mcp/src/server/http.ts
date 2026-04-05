/**
 * HTTP server for the Agentation API.
 * Uses native Node.js http module - no frameworks.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, handleTool, error as toolError } from "./mcp.js";
import {
  createSession,
  getSession,
  getSessionWithAnnotations,
  addAnnotation,
  updateAnnotation,
  getAnnotation,
  deleteAnnotation,
  listSessions,
  getPendingAnnotations,
  addThreadMessage,
  getEventsSince,
} from "./store.js";
import { eventBus } from "./events.js";
import {
  setApiKey,
  hasApiKey,
  getProviderType,
  handleChatMessage,
  clearChatHistory,
} from "./chat.js";
import type { Annotation, AFSEvent, ActionRequest, AgentStatusPayload } from "../types.js";

/**
 * Log to stderr so diagnostic output never corrupts the MCP stdio channel.
 * When `server` runs without --mcp-only, both the HTTP server and MCP stdio
 * server share the same process. stdout is reserved for JSON-RPC messages,
 * so all logging must go to stderr.
 */
function log(message: string): void {
  process.stderr.write(message + "\n");
}

// Cloud API configuration
let cloudApiKey: string | undefined;
const CLOUD_API_URL = "https://agentation-mcp-cloud.vercel.app/api";

/**
 * Set the API key for cloud storage mode.
 * When set, the HTTP server proxies requests to the cloud API.
 */
export function setCloudApiKey(key: string | undefined): void {
  cloudApiKey = key;
}

/**
 * Check if we're in cloud mode (API key is set).
 */
function isCloudMode(): boolean {
  return !!cloudApiKey;
}

// Track active SSE connections for cleanup
const sseConnections = new Set<ServerResponse>();
// Track agent SSE connections separately (for accurate delivery status)
// These are connections from MCP tools (e.g. watch_annotations), not browser toolbars
const agentConnections = new Set<ServerResponse>();

// -----------------------------------------------------------------------------
// MCP HTTP Transport
// -----------------------------------------------------------------------------

// Store transports by session ID for stateful sessions
const mcpTransports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Initialize a new MCP server with HTTP transport for a session.
 */
function createMcpSession(): { server: Server; transport: StreamableHTTPServerTransport } {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  const server = new Server(
    { name: "agentation", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return await handleTool(req.params.name, req.params.arguments);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return toolError(message);
    }
  });

  server.connect(transport);
  return { server, transport };
}

// -----------------------------------------------------------------------------
// Webhook Support
// -----------------------------------------------------------------------------

/**
 * Get configured webhook URLs from environment variables.
 *
 * Supports:
 * - AGENTATION_WEBHOOK_URL: Single webhook URL
 * - AGENTATION_WEBHOOKS: Comma-separated list of webhook URLs
 */
function getWebhookUrls(): string[] {
  const urls: string[] = [];

  // Single webhook URL
  const singleUrl = process.env.AGENTATION_WEBHOOK_URL;
  if (singleUrl) {
    urls.push(singleUrl.trim());
  }

  // Multiple webhook URLs (comma-separated)
  const multipleUrls = process.env.AGENTATION_WEBHOOKS;
  if (multipleUrls) {
    const parsed = multipleUrls
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    urls.push(...parsed);
  }

  return urls;
}

/**
 * Send webhook notification for an action request.
 * Fire-and-forget: doesn't wait for response, logs errors but doesn't throw.
 */
function sendWebhooks(actionRequest: ActionRequest): void {
  const webhookUrls = getWebhookUrls();

  if (webhookUrls.length === 0) {
    return;
  }

  const payload = JSON.stringify(actionRequest);

  for (const url of webhookUrls) {
    // Fire and forget - use .then().catch() instead of await
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Agentation-Webhook/1.0",
      },
      body: payload,
    })
      .then((res) => {
        log(
          `[Webhook] POST ${url} -> ${res.status} ${res.statusText}`
        );
      })
      .catch((err) => {
        console.error(`[Webhook] POST ${url} failed:`, (err as Error).message);
      });
  }

  log(
    `[Webhook] Fired ${webhookUrls.length} webhook(s) for session ${actionRequest.sessionId}`
  );
}

// -----------------------------------------------------------------------------
// Agent Status (ephemeral, in-memory)
// -----------------------------------------------------------------------------

let agentStatus: AgentStatusPayload | null = null;
let agentStatusTimeout: ReturnType<typeof setTimeout> | null = null;

const AGENT_STATUS_TIMEOUT_MS = 30_000; // Auto-clear after 30s of no updates
const AGENT_STOPPED_CLEAR_MS = 1_500; // Clear "finished" status after 1.5s

/**
 * Parse a Claude Code hook JSON payload into an AgentStatusPayload.
 * Accepts both raw hook JSON (with hook_event_name) and simplified payloads.
 */
/**
 * Summarize a Bash command into something meaningful for a designer watching.
 * Returns null if the command isn't worth showing.
 */
function summarizeBashCommand(command: string): string | null {
  const cmd = command.trim();

  // Build commands
  if (/\b(pnpm|npm|yarn|bun)\s+(build|run build)/.test(cmd)) return "Building project";
  if (/\b(pnpm|npm|yarn|bun)\s+(dev|run dev|start)/.test(cmd)) return "Starting dev server";
  if (/\b(pnpm|npm|yarn|bun)\s+install/.test(cmd)) return "Installing dependencies";
  if (/\b(pnpm|npm|yarn|bun)\s+(test|run test)/.test(cmd)) return "Running tests";
  if (/\btsc\b/.test(cmd)) return "Type-checking";

  // Not useful to show — git, curl, grep, ls, etc. are just the agent thinking
  return null;
}

/**
 * Summarize an Agentation MCP tool call for the toolbar.
 */
function summarizeAgentationTool(toolName: string, toolInput: Record<string, unknown> | undefined): string | null {
  const shortName = toolName.replace("mcp__agentation__agentation_", "");
  switch (shortName) {
    case "get_all_pending":
    case "get_pending":
      return "Reviewing annotations";
    case "watch_annotations":
      return "Watching for annotations";
    case "resolve":
      return "Resolving annotation";
    case "reply":
      return "Replying to annotation";
    case "acknowledge":
      return "Acknowledging annotation";
    case "dismiss":
      return "Dismissing annotation";
    case "list_sessions":
    case "get_session":
      return null; // Internal plumbing, not interesting
    default:
      return null;
  }
}

function parseAgentStatusPayload(body: Record<string, unknown>): AgentStatusPayload | null {
  const hookEvent = body.hook_event_name as string | undefined;
  const now = new Date().toISOString();

  if (hookEvent) {
    const toolName = body.tool_name as string | undefined;
    const toolInput = body.tool_input as Record<string, unknown> | undefined;

    switch (hookEvent) {
      case "PostToolUse": {
        // Only surface file edits and meaningful bash commands
        if (toolName === "Edit" || toolName === "Write") {
          const filePath = toolInput?.file_path as string | undefined;
          const fileName = filePath ? filePath.split("/").pop() : "a file";
          return { event: "tool_use", summary: `Editing ${fileName}`, active: true, tool_name: toolName, timestamp: now };
        }
        if (toolName === "Bash") {
          const command = toolInput?.command as string | undefined;
          const summary = command ? summarizeBashCommand(command) : null;
          if (summary) return { event: "tool_use", summary, active: true, tool_name: toolName, timestamp: now };
        }
        // Agentation MCP tools — show annotation activity
        if (toolName?.startsWith("mcp__agentation__")) {
          const summary = summarizeAgentationTool(toolName, toolInput);
          if (summary) return { event: "tool_use", summary, active: true, tool_name: toolName, timestamp: now };
        }
        // Read, Glob, Grep, Agent, etc. — skip, it's just the agent thinking
        return null;
      }
      case "PostToolUseFailure": {
        const errorMsg = body.error as string | undefined;
        const summary = errorMsg
          ? `Error: ${errorMsg.slice(0, 60)}${errorMsg.length > 60 ? "…" : ""}`
          : "Something failed";
        return { event: "error", summary, active: true, tool_name: toolName, timestamp: now };
      }
      case "Stop":
        return { event: "stopped", summary: "Finished", active: false, timestamp: now };
      case "SessionEnd":
        return { event: "stopped", summary: "Session ended", active: false, timestamp: now };
      case "PermissionRequest": {
        // PermissionRequest gives us tool_name + tool_input for richer context
        let summary = "Needs permission";
        if (toolName === "Edit" || toolName === "Write") {
          const filePath = toolInput?.file_path as string | undefined;
          const fileName = filePath ? filePath.split("/").pop() : undefined;
          summary = fileName ? `Needs permission to edit ${fileName}` : "Needs permission to edit";
        } else if (toolName === "Bash") {
          summary = "Needs permission to run command";
        }
        return { event: "notification", summary, active: true, tool_name: toolName, timestamp: now };
      }
      // PreToolUse, SessionStart, Notification — not useful to show
      default:
        return null;
    }
  }

  // Simplified AgentStatusPayload format (direct callers)
  if (body.event && body.summary) {
    return {
      event: body.event as AgentStatusPayload["event"],
      summary: body.summary as string,
      active: body.active !== false,
      tool_name: body.tool_name as string | undefined,
      notification_type: body.notification_type as string | undefined,
      timestamp: (body.timestamp as string) || now,
    };
  }

  return null;
}

/**
 * POST /agent-status
 * Receives Claude Code hook events and broadcasts agent activity via SSE.
 */
const postAgentStatusHandler: RouteHandler = async (req, res) => {
  let body: Record<string, unknown>;
  try {
    body = await parseBody<Record<string, unknown>>(req);
  } catch {
    return sendError(res, 400, "Invalid JSON body");
  }

  const payload = parseAgentStatusPayload(body);
  if (!payload) {
    return sendError(res, 400, "Could not parse agent status from payload");
  }

  // Update in-memory state
  agentStatus = payload;

  // Reset auto-clear timeout
  if (agentStatusTimeout) clearTimeout(agentStatusTimeout);

  if (payload.active) {
    // Auto-clear after 30s if no new updates (handles agent crash)
    agentStatusTimeout = setTimeout(() => {
      agentStatus = null;
      eventBus.emit("agent.stopped", "__global__", {
        event: "stopped",
        summary: "Timed out",
        active: false,
        timestamp: new Date().toISOString(),
      } satisfies AgentStatusPayload);
    }, AGENT_STATUS_TIMEOUT_MS);

    // Broadcast activity
    eventBus.emit("agent.activity", "__global__", payload);
  } else {
    // Agent stopped — broadcast then clear after delay
    eventBus.emit("agent.stopped", "__global__", payload);
    agentStatusTimeout = setTimeout(() => {
      agentStatus = null;
    }, AGENT_STOPPED_CLEAR_MS);
  }

  // Return suppressOutput so it doesn't show in Claude's verbose mode
  sendJson(res, 200, { suppressOutput: true });
};

/**
 * GET /agent-status
 * Returns current agent activity state for toolbar initial load.
 */
const getAgentStatusHandler: RouteHandler = async (_req, res) => {
  if (agentStatus) {
    sendJson(res, 200, agentStatus);
  } else {
    sendJson(res, 200, { active: false });
  }
};

// -----------------------------------------------------------------------------
// Request Helpers
// -----------------------------------------------------------------------------

/**
 * Parse JSON body from request.
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response.
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

/**
 * Send error response.
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Handle CORS preflight.
 */
function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

// -----------------------------------------------------------------------------
// Cloud Proxy
// -----------------------------------------------------------------------------

/**
 * Proxy a request to the cloud API.
 */
async function proxyToCloud(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> {
  const method = req.method || "GET";
  const cloudUrl = `${CLOUD_API_URL}${pathname}`;

  const headers: Record<string, string> = {
    "x-api-key": cloudApiKey!,
  };

  // Forward content-type for requests with body
  if (req.headers["content-type"]) {
    headers["Content-Type"] = req.headers["content-type"];
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  try {
    const cloudRes = await fetch(cloudUrl, {
      method,
      headers,
      body,
    });

    // Handle SSE responses
    if (cloudRes.headers.get("content-type")?.includes("text/event-stream")) {
      res.writeHead(cloudRes.status, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const reader = cloudRes.body?.getReader();
      if (reader) {
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(() => res.end());

        req.on("close", () => {
          reader.cancel();
        });
      }
      return;
    }

    // Handle regular JSON responses
    const data = await cloudRes.text();
    res.writeHead(cloudRes.status, {
      "Content-Type": cloudRes.headers.get("content-type") || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(data);
  } catch (err) {
    console.error("[Cloud Proxy] Error:", err);
    sendError(res, 502, `Cloud proxy error: ${(err as Error).message}`);
  }
}

// -----------------------------------------------------------------------------
// Route Handlers
// -----------------------------------------------------------------------------

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
) => Promise<void>;

/**
 * POST /sessions - Create a new session.
 */
const createSessionHandler: RouteHandler = async (req, res) => {
  try {
    const body = await parseBody<{ url: string; projectId?: string }>(req);

    if (!body.url) {
      return sendError(res, 400, "url is required");
    }

    const session = createSession(body.url, body.projectId);
    sendJson(res, 201, session);
  } catch (err) {
    sendError(res, 400, (err as Error).message);
  }
};

/**
 * GET /sessions - List all sessions.
 */
const listSessionsHandler: RouteHandler = async (_req, res) => {
  const sessions = listSessions();
  sendJson(res, 200, sessions);
};

/**
 * GET /sessions/:id - Get a session with annotations.
 */
const getSessionHandler: RouteHandler = async (_req, res, params) => {
  const session = getSessionWithAnnotations(params.id);

  if (!session) {
    return sendError(res, 404, "Session not found");
  }

  sendJson(res, 200, session);
};

/**
 * POST /sessions/:id/annotations - Add annotation to session.
 */
const addAnnotationHandler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<Omit<Annotation, "id" | "sessionId" | "status" | "createdAt">>(req);

    if (!body.comment || !body.element || !body.elementPath) {
      return sendError(res, 400, "comment, element, and elementPath are required");
    }

    const annotation = addAnnotation(params.id, body);

    if (!annotation) {
      return sendError(res, 404, "Session not found");
    }

    sendJson(res, 201, annotation);
  } catch (err) {
    sendError(res, 400, (err as Error).message);
  }
};

/**
 * PATCH /annotations/:id - Update an annotation.
 */
const updateAnnotationHandler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<Partial<Annotation>>(req);

    // Check if annotation exists
    const existing = getAnnotation(params.id);
    if (!existing) {
      return sendError(res, 404, "Annotation not found");
    }

    const annotation = updateAnnotation(params.id, body);
    sendJson(res, 200, annotation);
  } catch (err) {
    sendError(res, 400, (err as Error).message);
  }
};

/**
 * GET /annotations/:id - Get an annotation.
 */
const getAnnotationHandler: RouteHandler = async (_req, res, params) => {
  const annotation = getAnnotation(params.id);

  if (!annotation) {
    return sendError(res, 404, "Annotation not found");
  }

  sendJson(res, 200, annotation);
};

/**
 * DELETE /annotations/:id - Delete an annotation.
 */
const deleteAnnotationHandler: RouteHandler = async (_req, res, params) => {
  const annotation = deleteAnnotation(params.id);

  if (!annotation) {
    return sendError(res, 404, "Annotation not found");
  }

  sendJson(res, 200, { deleted: true, annotationId: params.id });
};

/**
 * GET /sessions/:id/pending - Get pending annotations for a session.
 */
const getPendingHandler: RouteHandler = async (_req, res, params) => {
  const pending = getPendingAnnotations(params.id);
  sendJson(res, 200, { count: pending.length, annotations: pending });
};

/**
 * GET /pending - Get all pending annotations across all sessions.
 */
const getAllPendingHandler: RouteHandler = async (_req, res) => {
  const sessions = listSessions();
  const allPending = sessions.flatMap((session) => getPendingAnnotations(session.id));
  sendJson(res, 200, { count: allPending.length, annotations: allPending });
};

/**
 * POST /sessions/:id/action - Request agent action on annotations.
 *
 * Emits an action.requested event via SSE with the current annotations
 * and formatted output. The agent can listen for this event to know
 * when the user wants action taken.
 *
 * Also sends webhooks to configured URLs (via AGENTATION_WEBHOOK_URL or
 * AGENTATION_WEBHOOKS environment variables).
 */
const requestActionHandler: RouteHandler = async (req, res, params) => {
  try {
    const sessionId = params.id;
    const body = await parseBody<{ output: string }>(req);

    // Verify session exists
    const session = getSessionWithAnnotations(sessionId);
    if (!session) {
      return sendError(res, 404, "Session not found");
    }

    if (!body.output) {
      return sendError(res, 400, "output is required");
    }

    // Build action request payload
    const actionRequest: ActionRequest = {
      sessionId,
      annotations: session.annotations,
      output: body.output,
      timestamp: new Date().toISOString(),
    };

    // Emit event (will be sent to all SSE subscribers)
    eventBus.emit("action.requested", sessionId, actionRequest);

    // Send webhooks (fire and forget, non-blocking)
    const webhookUrls = getWebhookUrls();
    sendWebhooks(actionRequest);

    // Return delivery info so client knows if anyone received it
    // Only count agent connections (with ?agent=true), not browser toolbar connections
    const agentListeners = agentConnections.size;
    const webhooks = webhookUrls.length;

    sendJson(res, 200, {
      success: true,
      annotationCount: session.annotations.length,
      delivered: {
        sseListeners: agentListeners,
        webhooks: webhooks,
        total: agentListeners + webhooks,
      },
    });
  } catch (err) {
    sendError(res, 400, (err as Error).message);
  }
};

/**
 * POST /annotations/:id/thread - Add a thread message.
 */
const addThreadHandler: RouteHandler = async (req, res, params) => {
  try {
    const body = await parseBody<{ role: "human" | "agent"; content: string }>(req);

    if (!body.role || !body.content) {
      return sendError(res, 400, "role and content are required");
    }

    const annotation = addThreadMessage(params.id, body.role, body.content);

    if (!annotation) {
      return sendError(res, 404, "Annotation not found");
    }

    sendJson(res, 201, annotation);
  } catch (err) {
    sendError(res, 400, (err as Error).message);
  }
};

/**
 * GET /sessions/:id/events - SSE stream of events for a session.
 *
 * Supports reconnection via Last-Event-ID header.
 * Events are streamed in real-time as they occur.
 */
const sseHandler: RouteHandler = async (req, res, params) => {
  const sessionId = params.id;
  const url = new URL(req.url || "/", "http://localhost");
  const isAgent = url.searchParams.get("agent") === "true";

  // Verify session exists
  const session = getSessionWithAnnotations(sessionId);
  if (!session) {
    return sendError(res, 404, "Session not found");
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Track this connection
  sseConnections.add(res);
  if (isAgent) {
    agentConnections.add(res);
  }

  // Send initial comment to establish connection
  res.write(": connected\n\n");

  // Check for Last-Event-ID for replay
  const lastEventId = req.headers["last-event-id"];
  if (lastEventId) {
    const lastSequence = parseInt(lastEventId as string, 10);
    if (!isNaN(lastSequence)) {
      // Replay missed events
      const missedEvents = getEventsSince(sessionId, lastSequence);
      for (const event of missedEvents) {
        sendSSEEvent(res, event);
      }
    }
  }

  // Subscribe to session events
  const unsubscribeSession = eventBus.subscribeToSession(sessionId, (event: AFSEvent) => {
    sendSSEEvent(res, event);
  });

  // Also subscribe to global events (agent activity) via __global__ session
  const unsubscribeGlobal = eventBus.subscribeToSession("__global__", (event: AFSEvent) => {
    sendSSEEvent(res, event);
  });

  // Keep connection alive with periodic comments
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribeSession();
    unsubscribeGlobal();
    sseConnections.delete(res);
    agentConnections.delete(res);
  });
};

/**
 * Send an SSE event to a response stream.
 */
function sendSSEEvent(res: ServerResponse, event: AFSEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`id: ${event.sequence}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * GET /events - Global SSE stream.
 *
 * Optionally filter by domain: GET /events?domain=example.com
 * Without domain, streams ALL events across all sessions.
 * Useful for agents that need to track feedback across page navigations.
 */
const globalSseHandler: RouteHandler = async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const domain = url.searchParams.get("domain");
  const isAgent = url.searchParams.get("agent") === "true";

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Track this connection
  sseConnections.add(res);
  if (isAgent) {
    agentConnections.add(res);
  }

  // Send initial comment to establish connection
  res.write(`: connected${domain ? ` to domain ${domain}` : ""}\n\n`);

  // Send all pending annotations on connect (initial sync for agents)
  if (isAgent) {
    let syncCount = 0;
    const sessions = listSessions();
    for (const session of sessions) {
      try {
        // If domain is specified, filter by it; otherwise include all sessions
        if (domain) {
          const sessionHost = new URL(session.url).host;
          if (sessionHost !== domain) continue;
        }
        const pending = getPendingAnnotations(session.id);
        for (const annotation of pending) {
          // Send as annotation.created events so agents see existing annotations
          // Use sequence 0 for initial sync events (they're historical, not new)
          sendSSEEvent(res, {
            type: "annotation.created",
            sessionId: session.id,
            timestamp: annotation.createdAt || new Date().toISOString(),
            sequence: 0,
            payload: annotation,
          });
          syncCount++;
        }
      } catch {
        // Invalid URL, skip
      }
    }
    // Send a sync.complete event so agents know initial sync is done
    res.write(`event: sync.complete\ndata: ${JSON.stringify({ domain: domain ?? "all", count: syncCount, timestamp: new Date().toISOString() })}\n\n`);
  }

  // Subscribe to all events, optionally filter by domain
  const unsubscribe = eventBus.subscribe((event: AFSEvent) => {
    if (!domain) {
      // No domain filter -- stream all events
      sendSSEEvent(res, event);
      return;
    }
    const session = getSession(event.sessionId);
    if (session) {
      try {
        const sessionHost = new URL(session.url).host;
        if (sessionHost === domain) {
          sendSSEEvent(res, event);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });

  // Keep connection alive with periodic comments
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 30000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    sseConnections.delete(res);
    agentConnections.delete(res);
  });
};

/**
 * Handle MCP protocol requests at /mcp endpoint.
 * Supports POST (requests), GET (SSE stream), and DELETE (session cleanup).
 */
async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method || "GET";
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Add CORS headers to all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  // POST: Handle JSON-RPC requests
  if (method === "POST") {
    let transport: StreamableHTTPServerTransport;

    if (sessionId) {
      // Session ID provided - must exist in our map
      if (!mcpTransports.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found. Please re-initialize." },
          id: null
        }));
        return;
      }
      transport = mcpTransports.get(sessionId)!;
    } else {
      // No session ID - this should be an initialize request, create new session
      const { transport: newTransport } = createMcpSession();
      transport = newTransport;
    }

    try {
      // Read the request body
      const body = await new Promise<string>((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });

      const parsedBody = body ? JSON.parse(body) : undefined;

      // Handle the request through the transport (it writes directly to res)
      await transport.handleRequest(req, res, parsedBody);

      // Store the transport with its session ID after the request is handled (for new sessions)
      const newSessionId = transport.sessionId;
      if (newSessionId && !mcpTransports.has(newSessionId)) {
        mcpTransports.set(newSessionId, transport);
        log(`[MCP HTTP] New session created: ${newSessionId}`);
      }
    } catch (err) {
      console.error("[MCP HTTP] Error handling request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  // GET: SSE stream for notifications
  if (method === "GET") {
    if (!sessionId || !mcpTransports.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid Mcp-Session-Id" }));
      return;
    }

    const transport = mcpTransports.get(sessionId)!;

    try {
      // Handle the SSE request (transport writes directly to res)
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("[MCP HTTP] Error handling SSE:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  // DELETE: Session cleanup
  if (method === "DELETE") {
    if (sessionId && mcpTransports.has(sessionId)) {
      const transport = mcpTransports.get(sessionId)!;
      await transport.close();
      mcpTransports.delete(sessionId);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
    }
    return;
  }

  // Method not allowed
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

// -----------------------------------------------------------------------------
// Chat Handlers
// -----------------------------------------------------------------------------

const setChatApiKeyHandler: RouteHandler = async (req, res) => {
  const body = await parseBody<{ apiKey?: string }>(req);
  if (!body.apiKey) return sendError(res, 400, "apiKey is required");
  try {
    const result = setApiKey(body.apiKey);
    sendJson(res, 200, { success: true, provider: result.provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid API key";
    sendError(res, 400, message);
  }
};

const getChatApiKeyHandler: RouteHandler = async (_req, res) => {
  sendJson(res, 200, {
    configured: hasApiKey(),
    provider: getProviderType(),
  });
};

const chatMessageHandler: RouteHandler = async (req, res) => {
  const body = await parseBody<{ sessionId?: string; message?: string }>(req);
  if (!body.message) return sendError(res, 400, "message is required");
  if (!body.sessionId) return sendError(res, 400, "sessionId is required");
  await handleChatMessage(body.sessionId, body.message, res);
};

const clearChatHistoryHandler: RouteHandler = async (_req, res, params) => {
  clearChatHistory(params.id);
  sendJson(res, 200, { success: true });
};

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

type Route = {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
  paramNames: string[];
};

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/events$/,
    handler: globalSseHandler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/pending$/,
    handler: getAllPendingHandler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/sessions$/,
    handler: listSessionsHandler,
    paramNames: [],
  },
  {
    method: "POST",
    pattern: /^\/sessions$/,
    handler: createSessionHandler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/sessions\/([^/]+)$/,
    handler: getSessionHandler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/sessions\/([^/]+)\/events$/,
    handler: sseHandler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/sessions\/([^/]+)\/pending$/,
    handler: getPendingHandler,
    paramNames: ["id"],
  },
  {
    method: "POST",
    pattern: /^\/sessions\/([^/]+)\/action$/,
    handler: requestActionHandler,
    paramNames: ["id"],
  },
  {
    method: "POST",
    pattern: /^\/sessions\/([^/]+)\/annotations$/,
    handler: addAnnotationHandler,
    paramNames: ["id"],
  },
  {
    method: "PATCH",
    pattern: /^\/annotations\/([^/]+)$/,
    handler: updateAnnotationHandler,
    paramNames: ["id"],
  },
  {
    method: "GET",
    pattern: /^\/annotations\/([^/]+)$/,
    handler: getAnnotationHandler,
    paramNames: ["id"],
  },
  {
    method: "DELETE",
    pattern: /^\/annotations\/([^/]+)$/,
    handler: deleteAnnotationHandler,
    paramNames: ["id"],
  },
  {
    method: "POST",
    pattern: /^\/annotations\/([^/]+)\/thread$/,
    handler: addThreadHandler,
    paramNames: ["id"],
  },
  // Chat routes
  {
    method: "POST",
    pattern: /^\/chat\/api-key$/,
    handler: setChatApiKeyHandler,
    paramNames: [],
  },
  {
    method: "GET",
    pattern: /^\/chat\/api-key$/,
    handler: getChatApiKeyHandler,
    paramNames: [],
  },
  {
    method: "POST",
    pattern: /^\/chat\/message$/,
    handler: chatMessageHandler,
    paramNames: [],
  },
  {
    method: "DELETE",
    pattern: /^\/chat\/history\/([^/]+)$/,
    handler: clearChatHistoryHandler,
    paramNames: ["id"],
  },
];

/**
 * Match a request to a route.
 */
function matchRoute(
  method: string,
  pathname: string
): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = pathname.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { handler: route.handler, params };
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------

// Track whether the HTTP server started successfully
let httpServerUp = false;
let httpServerError: string | null = null;

export function getHttpServerStatus(): { up: boolean; error: string | null } {
  return { up: httpServerUp, error: httpServerError };
}

/**
 * Create and start the HTTP server.
 * @param port - Port to listen on
 * @param apiKey - Optional API key for cloud storage mode
 */
export function startHttpServer(port: number, apiKey?: string): void {
  // Set cloud mode if API key provided
  if (apiKey) {
    setCloudApiKey(apiKey);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);
    const pathname = url.pathname;
    const method = req.method || "GET";

    // Log all requests for debugging
    if (method !== "OPTIONS" && pathname !== "/health") {
      log(`[HTTP] ${method} ${pathname}`);
    }

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return handleCors(res);
    }

    // Health check (always local)
    if (pathname === "/health" && method === "GET") {
      return sendJson(res, 200, { status: "ok", mode: isCloudMode() ? "cloud" : "local" });
    }

    // Status endpoint (always local)
    if (pathname === "/status" && method === "GET") {
      const webhookUrls = getWebhookUrls();
      return sendJson(res, 200, {
        mode: isCloudMode() ? "cloud" : "local",
        webhooksConfigured: webhookUrls.length > 0,
        webhookCount: webhookUrls.length,
        activeListeners: sseConnections.size,
        agentListeners: agentConnections.size,
      });
    }

    // Agent status endpoints (always local - ephemeral in-memory state)
    if (pathname === "/agent-status") {
      if (method === "POST") return postAgentStatusHandler(req, res, {});
      if (method === "GET") return getAgentStatusHandler(req, res, {});
    }

    // MCP protocol endpoint (always local - allows Claude Code to connect)
    if (pathname === "/mcp") {
      return handleMcp(req, res);
    }

    // Cloud mode: proxy all other requests to cloud API
    if (isCloudMode()) {
      return proxyToCloud(req, res, pathname + url.search);
    }

    // Local mode: use local store
    const match = matchRoute(method, pathname);
    if (!match) {
      return sendError(res, 404, "Not found");
    }

    try {
      await match.handler(req, res, match.params);
    } catch (err) {
      console.error("Request error:", err);
      sendError(res, 500, "Internal server error");
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log(`[HTTP] Port ${port} already in use — checking if existing server is agentation...`);
      // Check if the existing server is an agentation instance we can reuse
      fetch(`http://localhost:${port}/health`)
        .then((res) => res.json())
        .then((data: unknown) => {
          const health = data as Record<string, unknown>;
          if (health?.status === "ok") {
            httpServerUp = true;
            log(`[HTTP] Found existing agentation server on port ${port} — reusing it`);
          } else {
            httpServerError = `Port ${port} is in use by another application. Run: lsof -i :${port} to find it.`;
            log(`[HTTP] Port ${port} is in use by a non-agentation process`);
          }
        })
        .catch(() => {
          httpServerError = `Port ${port} is in use and not responding. Run: lsof -i :${port} to find it.`;
          log(`[HTTP] Port ${port} is in use and not responding to health check`);
        });
    } else {
      httpServerError = err.message;
      log(`[HTTP] Server error: ${err.message}`);
    }
  });

  server.listen(port, () => {
    httpServerUp = true;
    if (isCloudMode()) {
      log(`[HTTP] Agentation server listening on http://localhost:${port} (cloud mode)`);
    } else {
      log(`[HTTP] Agentation server listening on http://localhost:${port}`);
    }
  });
}

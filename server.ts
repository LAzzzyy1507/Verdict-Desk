import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { PersistentVaultStore, RateLimiter } from "./server/vaultStore";
import { sendVerificationCodeEmail } from "./server/emailService";

dotenv.config();

const app = express();
const PORT = 3000;

// Configure trust proxy for Google Cloud Run (single hop reverse proxy)
// Cloud Run sits directly behind Google's frontend proxy. Setting 'trust proxy', 1
// allows Express to securely derive req.ip and req.ips from the verified last hop
// without allowing clients to spoof their IP by prepending arbitrary X-Forwarded-For headers.
app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));

// Persistent vault and session store backed by Firestore
const vaultStore = new PersistentVaultStore();

// Rate Limiters to prevent quota exhaustion
const researchLimiter = new RateLimiter(20, 5); // 20 requests per 5 min
const recheckLimiter = new RateLimiter(20, 5);  // 20 requests per 5 min
const promptLabLimiter = new RateLimiter(30, 5); // 30 requests per 5 min
const authLimiter = new RateLimiter(10, 5);      // 10 auth attempts per 5 min

// Helper to extract client IP safely using Express's validated proxy chain
function getClientIp(req: express.Request): string {
  // req.ip uses the trusted proxy configuration (app.set('trust proxy', 1))
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

// Authentication Middleware: Enforces valid session token
async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required. Please provide a valid Bearer session token.",
    });
  }

  const token = authHeader.substring(7).trim();
  const sessionInfo = await vaultStore.getSession(token);

  if (!sessionInfo.valid || !sessionInfo.session) {
    return res.status(401).json({
      error: "Session expired or invalid. Please sign in again.",
    });
  }

  (req as any).session = sessionInfo.session;
  (req as any).user = sessionInfo.user;
  next();
}

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set in environment.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Authentication Endpoints
app.post("/api/auth/request-code", async (req, res) => {
  const ip = getClientIp(req);
  const rate = authLimiter.check(`req_code_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${rate.resetSec} seconds.`,
    });
  }

  const { email, name } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  const { code, expiresAt } = await vaultStore.createVerificationCode(email, name);

  // Send real email via Resend
  const emailResult = await sendVerificationCodeEmail(email, code, name);

  // In production, NEVER return the verification code in the API response.
  // In development, devCode is provided only when explicitly in non-production.
  const isDev = process.env.NODE_ENV !== "production";

  const responsePayload: Record<string, any> = {
    success: true,
    message: emailResult.sent
      ? `Verification code sent to ${email}. Please check your inbox.`
      : `Verification code generated. Please check your email inbox.`,
    emailDelivery: {
      provider: emailResult.provider,
      sent: emailResult.sent,
    },
    expiresAt: new Date(expiresAt).toISOString(),
  };

  if (isDev) {
    // Local development convenience only - never exposed in production
    responsePayload.devCode = code;
  }

  return res.json(responsePayload);
});

app.post("/api/auth/verify-code", async (req, res) => {
  const ip = getClientIp(req);
  const rate = authLimiter.check(`verify_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Too many verification attempts. Please wait ${rate.resetSec} seconds.`,
    });
  }

  const { email, code, name } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: "Email and verification code are required." });
  }

  const result = await vaultStore.verifyCode(email, code, name);
  if (!result.success || !result.token) {
    return res.status(400).json({ error: result.error || "Failed to verify code." });
  }

  return res.json({
    success: true,
    token: result.token,
    user: result.user,
  });
});

app.post("/api/auth/logout", authenticate, async (req, res) => {
  const currentSession = (req as any).session;
  await vaultStore.revokeSession(currentSession.token);
  return res.json({ success: true, message: "Session signed out and token revoked." });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  return res.json({
    success: true,
    user: (req as any).user,
    session: {
      expiresAt: (req as any).session.expiresAt,
    },
  });
});

// Cloud Sync endpoints: SECURED by Bearer Session Token & User Ownership Check
app.get("/api/sync/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;
  const currentSession = (req as any).session;

  // Strict ownership check: prevent cross-account impersonation
  if (currentSession.userId !== userId) {
    return res.status(403).json({
      error: "Forbidden: You do not have permission to access another user's decision vault.",
    });
  }

  const decisions = await vaultStore.getDecisions(userId);
  return res.json({ success: true, decisions, syncedAt: new Date().toISOString() });
});

app.post("/api/sync/:userId", authenticate, async (req, res) => {
  const { userId } = req.params;
  const currentSession = (req as any).session;

  // Strict ownership check: prevent overwriting another user's vault
  if (currentSession.userId !== userId) {
    return res.status(403).json({
      error: "Forbidden: You do not have permission to modify another user's decision vault.",
    });
  }

  const { decisions } = req.body;
  if (Array.isArray(decisions)) {
    await vaultStore.saveDecisions(userId, decisions);
    return res.json({ success: true, count: decisions.length, syncedAt: new Date().toISOString() });
  }
  return res.status(400).json({ error: "Invalid decisions payload. Array required." });
});

// Helper to clean JSON string from LLM response
function extractJSON(text: string): any {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        console.error("JSON parse regex fallback failed:", innerErr);
      }
    }
    throw new Error("Failed to parse JSON from model output");
  }
}

// Decision Research API (Live Search-Grounded)
app.post("/api/verdict/research", async (req, res) => {
  const ip = getClientIp(req);
  const rate = researchLimiter.check(`research_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Research rate limit exceeded. Please wait ${rate.resetSec} seconds before submitting a new query.`,
    });
  }

  try {
    const { question, constraints, category = "other", followUpContext, previousVerdict } = req.body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "A decision question is required." });
    }

    const ai = getAI();
    const systemPrompt = `You are Verdict Desk, an elite, highly decisive intelligence briefing analyst for high-stakes decisions.
Your task is to conduct real-world research using Google Search, strip away marketing fluff, reduce the options to only the factors that actually matter for this decision, and deliver:
1. EXACTLY ONE CLEAR VERDICT. A single definitive recommended option with confidence level ("High", "Medium", or "Low") and 2–3 crisp sentences of decisive reasoning. Stiff mandate: DO NOT HEDGE. NO "it depends on what you value", "both have pros and cons", or "it comes down to personal preference". Make the executive call based on the provided constraints and current objective data.
2. COMPARISON VIEW: Compare each candidate option (2 to 4 options). Strip each option strictly to 2-4 critical deciding factors (e.g. Total Cost of Ownership, True Battery Life under Load, Median Compensation in City, Workload/Drop-off Rate). Mark the single winner.
3. REFERENCE POINTS: 2 to 5 standalone benchmark facts relevant to the decision (e.g., standard industry salary band, average resale depreciation, typical graduation rate, market retail baseline). These MUST read as objective market context, NOT as arguments for one option.
4. UNCERTAINTY FLAGS: Anything genuinely unresolved or unverified from the search (e.g. regional tariff variance, unconfirmed release dates, conflicting employer bonus reports, pending accreditation). NEVER guess or gloss over gaps; flag them explicitly.
5. CATEGORY: Classify into "shopping", "career", "academic", or "other".

OUTPUT FORMAT: Return STRICT valid JSON only without commentary.
Schema:
{
  "title": string,
  "category": "shopping" | "career" | "academic" | "other",
  "verdict": {
    "recommendedOption": string,
    "confidence": "High" | "Medium" | "Low",
    "reasoning": string (2-3 crisp sentences, decisive, zero hedging)
  },
  "options": [
    {
      "name": string,
      "isWinner": boolean,
      "statusBadge": string (e.g. "Optimal Value", "Overpriced for Spec", "Highest Risk-Adjusted ROI"),
      "keyFactors": [
        {
          "factor": string,
          "value": string,
          "sentiment": "positive" | "neutral" | "negative"
        }
      ]
    }
  ],
  "referencePoints": [
    {
      "label": string,
      "metric": string,
      "context": string,
      "sourceHint": string
    }
  ],
  "uncertainties": [
    {
      "title": string,
      "detail": string,
      "severity": "high" | "medium" | "low"
    }
  ]
}`;

    const userPromptContent = `Decision Question: "${question}"
Optional Constraints: ${constraints ? JSON.stringify(constraints) : "None provided"}
${followUpContext ? `Follow-up constraint / Adjustment: "${followUpContext}"\nPrevious Decision Context: ${JSON.stringify(previousVerdict || {})}` : ""}

Search current web information for prices, verified specs, salary data, or benchmarks. Output strict JSON matching the schema.`;

    let response;
    let webSources: { title: string; url: string }[] = [];

    if (process.env.GEMINI_API_KEY) {
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: userPromptContent,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      // Extract Grounding Chunks
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        webSources = chunks
          .map((c: any) => {
            if (c.web?.uri) {
              return {
                title: c.web.title || new URL(c.web.uri).hostname,
                url: c.web.uri,
              };
            }
            return null;
          })
          .filter(Boolean) as { title: string; url: string }[];
      }
    } else {
      // Fallback if API key is not yet set
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const rawText = response.text || "";
    const parsedData = extractJSON(rawText);

    // Build complete record
    const resultRecord = {
      id: "vd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      question,
      constraints: constraints || "",
      category: parsedData.category || category,
      title: parsedData.title || question,
      verdict: parsedData.verdict,
      options: parsedData.options || [],
      referencePoints: parsedData.referencePoints || [],
      uncertainties: parsedData.uncertainties || [],
      webSources: webSources.slice(0, 6),
      timestamp: new Date().toISOString(),
      trackedForAlerts: false,
      followUps: followUpContext
        ? [
            {
              adjustment: followUpContext,
              timestamp: new Date().toISOString(),
            },
          ]
        : [],
    };

    return res.json({ success: true, decision: resultRecord });
  } catch (error: any) {
    console.error("Research endpoint error:", error);
    return res.status(500).json({
      error: error.message || "Failed to complete decision research.",
      details: error.toString(),
    });
  }
});

// Streaming Decision Research API for Real-Time Stage Tracking (Server-Sent Events)
app.post("/api/verdict/research-stream", async (req, res) => {
  const ip = getClientIp(req);
  const rate = researchLimiter.check(`research_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Research rate limit exceeded. Please wait ${rate.resetSec} seconds before starting new research.`,
    });
  }

  const { question, constraints, category = "other", followUpContext, previousVerdict } = req.body;
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A decision question is required." });
  }

  // Setup Server-Sent Events headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent("progress", { stage: "Connecting to live Google Search grounding engine...", step: 1, totalSteps: 4 });

    const ai = getAI();
    sendEvent("progress", { stage: "Scanning verified prices, salary indices & market data...", step: 2, totalSteps: 4 });

    const systemPrompt = `You are Verdict Desk, an elite, highly decisive intelligence briefing analyst for high-stakes decisions.
Your task is to conduct real-world research using Google Search, strip away marketing fluff, reduce the options to only the factors that actually matter for this decision, and deliver:
1. EXACTLY ONE CLEAR VERDICT. A single definitive recommended option with confidence level ("High", "Medium", or "Low") and 2–3 crisp sentences of decisive reasoning. Stiff mandate: DO NOT HEDGE. NO "it depends on what you value", "both have pros and cons", or "it comes down to personal preference". Make the executive call based on the provided constraints and current objective data.
2. COMPARISON VIEW: Compare each candidate option (2 to 4 options). Strip each option strictly to 2-4 critical deciding factors (e.g. Total Cost of Ownership, True Battery Life under Load, Median Compensation in City, Workload/Drop-off Rate). Mark the single winner.
3. REFERENCE POINTS: 2 to 5 standalone benchmark facts relevant to the decision (e.g., standard industry salary band, average resale depreciation, typical graduation rate, market retail baseline). These MUST read as objective market context, NOT as arguments for one option.
4. UNCERTAINTY FLAGS: Anything genuinely unresolved or unverified from the search (e.g. regional tariff variance, unconfirmed release dates, conflicting employer bonus reports, pending accreditation). NEVER guess or gloss over gaps; flag them explicitly.
5. CATEGORY: Classify into "shopping", "career", "academic", or "other".

OUTPUT FORMAT: Return STRICT valid JSON only without commentary.
Schema:
{
  "title": string,
  "category": "shopping" | "career" | "academic" | "other",
  "verdict": {
    "recommendedOption": string,
    "confidence": "High" | "Medium" | "Low",
    "reasoning": string (2-3 crisp sentences, decisive, zero hedging)
  },
  "options": [
    {
      "name": string,
      "isWinner": boolean,
      "statusBadge": string (e.g. "Optimal Value", "Overpriced for Spec", "Highest Risk-Adjusted ROI"),
      "keyFactors": [
        {
          "factor": string,
          "value": string,
          "sentiment": "positive" | "neutral" | "negative"
        }
      ]
    }
  ],
  "referencePoints": [
    {
      "label": string,
      "metric": string,
      "context": string,
      "sourceHint": string
    }
  ],
  "uncertainties": [
    {
      "title": string,
      "detail": string,
      "severity": "high" | "medium" | "low"
    }
  ]
}`;

    const userPromptContent = `Decision Question: "${question}"
Optional Constraints: ${constraints ? JSON.stringify(constraints) : "None provided"}
${followUpContext ? `Follow-up constraint / Adjustment: "${followUpContext}"\nPrevious Decision Context: ${JSON.stringify(previousVerdict || {})}` : ""}

Search current web information for prices, verified specs, salary data, or benchmarks. Output strict JSON matching the schema.`;

    let response;
    let webSources: { title: string; url: string }[] = [];

    if (process.env.GEMINI_API_KEY) {
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: userPromptContent,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ googleSearch: {} }],
        },
      });

      sendEvent("progress", { stage: "Extracting grounding citations & stripping marketing noise...", step: 3, totalSteps: 4 });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        webSources = chunks
          .map((c: any) => {
            if (c.web?.uri) {
              return {
                title: c.web.title || new URL(c.web.uri).hostname,
                url: c.web.uri,
              };
            }
            return null;
          })
          .filter(Boolean) as { title: string; url: string }[];
      }
    } else {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    sendEvent("progress", { stage: "Formulating single clear verdict & reference benchmarks...", step: 4, totalSteps: 4 });

    const rawText = response.text || "";
    const parsedData = extractJSON(rawText);

    const resultRecord = {
      id: "vd_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      question,
      constraints: constraints || "",
      category: parsedData.category || category,
      title: parsedData.title || question,
      verdict: parsedData.verdict,
      options: parsedData.options || [],
      referencePoints: parsedData.referencePoints || [],
      uncertainties: parsedData.uncertainties || [],
      webSources: webSources.slice(0, 6),
      timestamp: new Date().toISOString(),
      trackedForAlerts: false,
      followUps: followUpContext
        ? [
            {
              adjustment: followUpContext,
              timestamp: new Date().toISOString(),
            },
          ]
        : [],
    };

    sendEvent("complete", { decision: resultRecord });
    res.end();
  } catch (error: any) {
    console.error("Streaming research endpoint error:", error);
    sendEvent("error", { error: error.message || "Failed to complete decision research." });
    res.end();
  }
});

// Re-check Decision API
app.post("/api/verdict/recheck", async (req, res) => {
  const ip = getClientIp(req);
  const rate = recheckLimiter.check(`recheck_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Re-check rate limit exceeded. Please wait ${rate.resetSec} seconds before re-checking decisions.`,
    });
  }

  try {
    const { decision } = req.body;
    if (!decision || !decision.question) {
      return res.status(400).json({ error: "Missing original decision to re-check." });
    }

    const ai = getAI();
    const systemPrompt = `You are Verdict Desk performing a live RE-CHECK on a previously saved decision to detect if material real-world conditions have shifted (e.g. price drops, new models, refreshed salary benchmarks, updated deadlines, availability).
Compare previous findings with the latest real-time web search results.
Return strict valid JSON with the updated verdict briefing AND a "deltaSummary" noting what changed or confirming stability.

Schema:
{
  "deltaSummary": string (1-2 sentences on what materially changed, e.g. "Price dropped $150 on Option A; warranty terms updated", or "Conditions remain stable with no material price or specification changes."),
  "hasMaterialChange": boolean,
  "verdict": {
    "recommendedOption": string,
    "confidence": "High" | "Medium" | "Low",
    "reasoning": string
  },
  "options": [
    {
      "name": string,
      "isWinner": boolean,
      "statusBadge": string,
      "keyFactors": [
        {
          "factor": string,
          "value": string,
          "sentiment": "positive" | "neutral" | "negative"
        }
      ]
    }
  ],
  "referencePoints": [
    {
      "label": string,
      "metric": string,
      "context": string,
      "sourceHint": string
    }
  ],
  "uncertainties": [
    {
      "title": string,
      "detail": string,
      "severity": "high" | "medium" | "low"
    }
  ]
}`;

    const recheckPrompt = `Original Decision: "${decision.question}"
Constraints: "${decision.constraints || "None"}"
Previous Verdict Recommendation: "${decision.verdict?.recommendedOption}" (${decision.verdict?.reasoning})
Previous Reference Points: ${JSON.stringify(decision.referencePoints || [])}

Perform a fresh web search to verify if numbers, prices, terms, or availability changed right now. Output strict JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: recheckPrompt,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let webSources: { title: string; url: string }[] = [];
    if (Array.isArray(chunks)) {
      webSources = chunks
        .map((c: any) => (c.web?.uri ? { title: c.web.title || new URL(c.web.uri).hostname, url: c.web.uri } : null))
        .filter(Boolean) as { title: string; url: string }[];
    }

    const parsed = extractJSON(response.text || "");

    const updatedDecision = {
      ...decision,
      verdict: parsed.verdict || decision.verdict,
      options: parsed.options || decision.options,
      referencePoints: parsed.referencePoints || decision.referencePoints,
      uncertainties: parsed.uncertainties || decision.uncertainties,
      webSources: webSources.length > 0 ? webSources.slice(0, 6) : decision.webSources,
      lastRecheck: {
        timestamp: new Date().toISOString(),
        deltaSummary: parsed.deltaSummary || "Re-checked against live web data.",
        hasMaterialChange: Boolean(parsed.hasMaterialChange),
      },
    };

    return res.json({ success: true, decision: updatedDecision, delta: parsed.deltaSummary });
  } catch (error: any) {
    console.error("Re-check endpoint error:", error);
    return res.status(500).json({ error: error.message || "Failed to re-check decision." });
  }
});

// Prompt Lab API (Generates 3 tailored variants with explanatory rationale)
app.post("/api/prompt-lab", async (req, res) => {
  const ip = getClientIp(req);
  const rate = promptLabLimiter.check(`prompt_lab_${ip}`);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.resetSec);
    return res.status(429).json({
      error: `Prompt Lab rate limit exceeded. Please wait ${rate.resetSec} seconds.`,
    });
  }

  try {
    const { requestText } = req.body;
    if (!requestText || !requestText.trim()) {
      return res.status(400).json({ error: "Prompt request text is required." });
    }

    const ai = getAI();
    const systemInstruction = `You are the Prompt Lab engine inside Verdict Desk.
Given one plain-language user query or decision request, generate THREE tailored prompt variants optimized for different modern LLM architectures:
1. "reasoning": Phrased for a reasoning-style / chain-of-thought model (e.g. OpenAI o1/o3, Claude 3.7 Thinking, Gemini Thinking). Emphasizes step-by-step constraint hierarchies, trade-off trees, stress-testing edge cases, and explicit trade-off weighing.
2. "chat": Phrased for a conversational chat-tuned model (e.g. Claude Sonnet, ChatGPT 4o). Emphasizes structured executive briefing, clear headings, bulleted actionable summaries, and asking one critical follow-up question.
3. "search_grounded": Phrased for a search-grounded browsing model (e.g. Perplexity, Gemini with Google Search). Emphasizes specific factual anchors, date parameters, live pricing/availability queries, domain filtering, and explicit source citation requirements.

For EACH variant, provide:
- "targetType": "Reasoning Model" | "Chat Model" | "Search-Grounded Model"
- "prompt": The exact ready-to-paste prompt text
- "whyNote": A concise one-line note on WHY this variant is phrased this way (what changes across model architectures).

Output strict JSON only:
{
  "originalRequest": string,
  "variants": [
    {
      "id": "reasoning",
      "targetType": "Reasoning Model",
      "subtitle": "Chain-of-thought, trade-off tree, constraint hierarchy",
      "prompt": string,
      "whyNote": string
    },
    {
      "id": "chat",
      "targetType": "Chat Model",
      "subtitle": "Structured briefing, clean typography, executive clarity",
      "prompt": string,
      "whyNote": string
    },
    {
      "id": "search_grounded",
      "targetType": "Search-Grounded Model",
      "subtitle": "Factual anchors, price checks, live citation demands",
      "prompt": string,
      "whyNote": string
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `Request: "${requestText.trim()}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const parsed = extractJSON(response.text || "");
    return res.json({ success: true, lab: parsed });
  } catch (error: any) {
    console.error("Prompt Lab error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate prompt variants." });
  }
});

// Vite & Static Asset Handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Verdict Desk server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

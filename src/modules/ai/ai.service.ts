import { prisma } from "../../lib/prisma.js";
import { listFeaturedTutorsService } from "../tutor/tutor.service.js";

/** Canonical OpenAI-compatible host per MiniMax docs; override with MINIMAX_API_BASE_URL if needed. */
const MINIMAX_ORIGIN = (process.env.MINIMAX_API_BASE_URL ?? "https://api.minimax.io").replace(
  /\/$/,
  "",
);
const MINIMAX_CHAT_URL = `${MINIMAX_ORIGIN}/v1/chat/completions`;

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function stripMiniMaxThinkingBlock(text: string): string {
  // MiniMax M2.x prefixes the reply with <think>…</think>. Take everything after the last closing tag.
  let s = decodeBasicHtmlEntities(text).replace(/\r\n/g, "\n").normalize("NFKC");
  const closeRe = /<\/think>/gi;
  const hits = [...s.matchAll(closeRe)];
  if (hits.length > 0) {
    const last = hits.at(-1)!;
    s = s.slice((last.index ?? 0) + last[0].length).trim();
  }
  for (let i = 0; i < 8; i++) {
    const n = s
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*/gi, "");
    if (n === s) break;
    s = n;
  }
  s = s
    .split("\n")
    .filter((ln) => !/^\s*<\/?think>/i.test(ln))
    .join("\n");
  return s.trim();
}

/** Plain-text chat: turn "- **Label** → path" into "• Label — path" and drop markdown **…**. */
function formatAssistantReplyForChat(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    const arrow = line.match(
      /^\s*[-*]\s*\*\*(.+?)\*\*\s*(?:→|->|\u2192)\s*(.+)$/u,
    );
    if (arrow?.[1] != null && arrow[2] != null) {
      out.push(`• ${arrow[1].trim()} — ${arrow[2].trim()}`);
      continue;
    }
    const plainArrow = line.match(/^\s*[-*]\s+(.+?)\s*(?:→|->|\u2192)\s*(.+)$/u);
    if (plainArrow?.[1] != null && plainArrow[2] != null && !plainArrow[1].includes("**")) {
      out.push(`• ${plainArrow[1].trim()} — ${plainArrow[2].trim()}`);
      continue;
    }
    out.push(line.replace(/\*\*(.+?)\*\*/g, "$1"));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeChoiceContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const o = part as Record<string, unknown>;
          const typ = typeof o.type === "string" ? o.type.toLowerCase() : "";
          if (typ === "reasoning" || typ === "thinking") return "";
          if (typeof o.text === "string") return o.text;
          if (typeof o.content === "string") return o.content;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function usageHelpIntent(userText: string): boolean {
  const t = userText.toLowerCase();
  return (
    /how\s+(can|do)\s+(i|we)\s+use/.test(t) ||
    /what\s+can\s+you\s+do/.test(t) ||
    /who\s+are\s+you/.test(t) ||
    /how\s+do\s+i\s+use\s+you/.test(t)
  );
}

function mindNestUsageHelpText(): string {
  return [
    "You can ask short questions about MindNest in your own words.",
    "Try: how booking and payment work, where to browse coaches (/coaches), member bookings (/dashboard/bookings), or coach availability (/coach/availability).",
    "I answer in brief, actionable steps—no account access beyond what you already see in the app.",
  ].join(" ");
}

function assistantVisibleTextFallback(userText: string): string {
  if (usageHelpIntent(userText)) return mindNestUsageHelpText();
  return [
    "I didn’t get a usable answer from the model that time.",
    FAQ_SNIPPETS[0],
    FAQ_SNIPPETS[1],
    "Try asking one specific thing (for example: “How do I book a coach?”).",
  ].join(" ");
}

/** Token Plan (incl. Starter) text quota is M2.7; legacy `MiniMax-Text-01` is not supported (2061). */
function resolveMiniMaxChatModel(env?: string): string {
  const raw = env?.trim();
  if (!raw) return "MiniMax-M2.7";
  if (/text-01/i.test(raw)) return "MiniMax-M2.7";
  return raw;
}

const FAQ_SNIPPETS = [
  "MindNest AI connects members with vetted coaches for one-on-one sessions.",
  "Browse Coaches to filter by category, hourly rate, and rating.",
  "After booking, complete payment when prompted and join your session from Bookings.",
  "Coaches manage availability under Coach → Availability in the dashboard.",
];

export async function searchSuggestionsService(q: string): Promise<string[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];

  const [subjects, coaches] = await Promise.all([
    prisma.subject.findMany({
      where: { name: { contains: term, mode: "insensitive" } },
      take: 6,
      select: { name: true },
    }),
    prisma.user.findMany({
      where: {
        role: "COACH",
        name: { contains: term, mode: "insensitive" },
      },
      take: 6,
      select: { name: true },
    }),
  ]);

  const out = new Set<string>();
  for (const s of subjects) out.add(s.name);
  for (const c of coaches) out.add(c.name);
  return [...out].slice(0, 10);
}

export async function coachRecommendationsService(userId?: string): Promise<
  { userId: string; headline: string; rating: string | null }[]
> {
  if (userId) {
    const recent = await prisma.booking.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        tutorProfile: {
          select: {
            userId: true,
            headline: true,
            rating: true,
            categories: { select: { id: true }, take: 1 },
          },
        },
      },
    });
    const categoryIds = [
      ...new Set(
        recent
          .map((b) => b.tutorProfile.categories[0]?.id)
          .filter((x): x is string => !!x),
      ),
    ];
    if (categoryIds.length > 0) {
      const profiles = await prisma.tutorProfile.findMany({
        where: {
          categories: { some: { id: { in: categoryIds } } },
          userId: { not: userId },
        },
        take: 8,
        orderBy: { rating: "desc" },
        select: {
          userId: true,
          headline: true,
          rating: true,
        },
      });
      if (profiles.length > 0) {
        return profiles.map((p) => ({
          userId: p.userId,
          headline: p.headline,
          rating: p.rating?.toString() ?? null,
        }));
      }
    }
  }

  const featured = await listFeaturedTutorsService(8);
  return featured.map((t) => ({
    userId: t.userId,
    headline: t.headline,
    rating: t.rating?.toString() ?? null,
  }));
}

export async function assistantChatService(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
): Promise<string> {
  const key = process.env.MINIMAX_API_KEY?.trim();
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content?.trim() ?? "";

  if (!key) {
    if (usageHelpIntent(userText)) return mindNestUsageHelpText();
    const lower = userText.toLowerCase();
    if (lower.includes("book") || lower.includes("session")) {
      return `${FAQ_SNIPPETS[2]} ${FAQ_SNIPPETS[0]}`;
    }
    if (lower.includes("coach") || lower.includes("tutor")) {
      return `${FAQ_SNIPPETS[1]} ${FAQ_SNIPPETS[3]}`;
    }
    return `${FAQ_SNIPPETS[0]} ${FAQ_SNIPPETS[1]}`;
  }

  const system =
    "You are MindNest AI, a concise, friendly assistant for a premium coaching marketplace. Answer in under 120 words. Never include XML, angle-bracket tags, or internal reasoning markers in the text the user will read. Use plain lines only: greet briefly, then use lines starting with the bullet character • (not hyphen lists), then the label, an em dash —, then the path (e.g. • Book a coach — /coaches). Do not use markdown ** or hyphen-plus-bold lists. Paths: /coaches, /dashboard/bookings, /coach/availability.";

  const model = resolveMiniMaxChatModel(process.env.MINIMAX_MODEL);

  const res = await fetch(MINIMAX_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages].slice(-12),
      max_completion_tokens: 350,
      temperature: 0.5,
    }),
  });

  const rawBody = await res.text();

  if (!res.ok) {
    console.error("MiniMax HTTP", res.status, rawBody.slice(0, 800));
    return "I'm having trouble reaching the AI service. Try again shortly, or browse Coaches from the main menu.";
  }

  let data: {
    choices?: { message?: { content?: unknown } }[];
    base_resp?: { status_code?: number; status_msg?: string };
  };
  try {
    data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
  } catch {
    console.error("MiniMax: invalid JSON body", rawBody.slice(0, 500));
    return "I'm having trouble reaching the AI service. Try again shortly, or browse Coaches from the main menu.";
  }

  const code = data.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    console.error("MiniMax base_resp:", data.base_resp);
    return "I'm having trouble reaching the AI service. Try again shortly, or browse Coaches from the main menu.";
  }

  const rawContent = normalizeChoiceContent(data.choices?.[0]?.message?.content).trim();
  const text = formatAssistantReplyForChat(stripMiniMaxThinkingBlock(rawContent));
  if (text.length > 0) return text;

  if (rawContent.length > 0) {
    console.warn("MiniMax: empty visible text after strip; raw sample:", rawContent.slice(0, 280));
  } else {
    console.warn("MiniMax: empty message.content; body sample:", rawBody.slice(0, 400));
  }
  return assistantVisibleTextFallback(userText);
}
// Server-only: sorts a reply into one of the brief's categories with Lovable AI.
import { createOpenAI } from "@ai-sdk/openai";
import { jsonSchema, NoObjectGeneratedError, Output, streamText } from "ai";
import { isReplyCategory, REPLY_CATEGORY_VALUES, type ReplyCategory } from "./replies";

const MODEL = "openai/gpt-6-astra";

export class AiUnavailableError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const INSTRUCTIONS = `You sort replies to cold outreach emails sent by DECILE Media (a media/marketing agency).
Pick exactly one category for the prospect's reply:
- interested: positive, wants to know more or continue the conversation
- meeting_request: proposes or agrees to a call/meeting/time slot, or says they are available
- need_more_info: asks questions, wants details, pricing, a deck or case studies before deciding
- follow_up_later: not now, asks to reconnect later or names a later time
- not_interested: declines, no need, already has a vendor
- out_of_office: automatic away / vacation / leave reply
- unsubscribe: asks to stop emailing or to be removed
- bounce: says the address is wrong, the person has left, or delivery failed
- other: anything else (forwarded to a colleague, unclear, unrelated)
Also write a one-sentence summary (under 20 words) of what they said, in plain English.`;

const schema = jsonSchema<{ category: string; summary: string }>({
  type: "object",
  properties: {
    category: { type: "string", enum: REPLY_CATEGORY_VALUES },
    summary: { type: "string" },
  },
  required: ["category", "summary"],
  additionalProperties: false,
});

function parseLoose(text: string | undefined): { category: ReplyCategory; summary: string } | null {
  try {
    const o = JSON.parse(text ?? "") as { category?: unknown; summary?: unknown };
    if (isReplyCategory(o.category)) return { category: o.category, summary: String(o.summary ?? "").slice(0, 240) };
  } catch {
    /* fall through */
  }
  return null;
}

export async function classifyReply(input: {
  subject: string;
  reply: string;
  originalSubject?: string | null | undefined;
}): Promise<{ category: ReplyCategory; summary: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiUnavailableError("AI key is missing on the server.", 401);
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Our email subject: ${input.originalSubject ?? "(unknown)"}\nReply subject: ${input.subject}\n\nReply:\n${input.reply.slice(0, 3000) || "(empty)"}`,
      },
    ],
    output: Output.object({ schema }),
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
        strictJsonSchema: true,
      },
    },
  });
  try {
    const out = await result.output;
    if (isReplyCategory(out.category)) return { category: out.category, summary: String(out.summary ?? "").slice(0, 240) };
    return { category: "other", summary: String(out.summary ?? "").slice(0, 240) };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      return parseLoose(e.text) ?? { category: "other", summary: "Couldn't sort this reply automatically." };
    }
    const status = Number((e as { statusCode?: number }).statusCode ?? 0);
    const body = String((e as { responseBody?: string }).responseBody ?? (e as Error).message ?? e);
    throw new AiUnavailableError(`AI sorting failed [${status}]: ${body.slice(0, 300)}`, status);
  }
}

// Minimal OpenAI client over the REST API (chat completions with JSON schema output, audio
// transcription and image generation). Kept dependency-free on purpose: only three endpoints are used.
import { readFile } from "node:fs/promises";
import { env } from "../config/env.js";

const BASE_URL = "https://api.openai.com/v1";
const TIMEOUT_MS = 45_000;
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const IMAGE_MODEL = "gpt-image-1-mini"; // cheapest image model; plenty for campaign creatives
const IMAGE_TIMEOUT_MS = 120_000; // image generation is slower than text

export const isOpenAiConfigured = () => Boolean(env.OPENAI_API_KEY);

export class OpenAiError extends Error {}

async function call(path: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenAiError(`OpenAI ${path} failed with ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Message = { role: "system" | "user"; content: string | ContentPart[] };

/** Chat completion whose reply is forced to match a JSON schema. */
export async function chatJson<T>(messages: Message[], schemaName: string, schema: object, opts: { timeoutMs?: number; maxTokens?: number; model?: string } = {}): Promise<T> {
  const data = await call(
    "/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? env.OPENAI_MODEL,
        messages,
        temperature: 0.4,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
      }),
    },
    opts.timeoutMs,
  );
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new OpenAiError("OpenAI returned no content.");
  return JSON.parse(content) as T;
}

export async function transcribe(filePath: string, filename: string, mimetype: string) {
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", new Blob([await readFile(filePath)], { type: mimetype }), filename);
  const data = await call("/audio/transcriptions", { method: "POST", body: form });
  return String(data?.text ?? "").trim();
}

/** Generates one image and returns it as base64 PNG. */
export async function generateImage(prompt: string, size: "1536x1024" | "1024x1024") {
  const data = await call(
    "/images/generations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size, quality: "medium", n: 1 }),
    },
    IMAGE_TIMEOUT_MS,
  );
  const b64 = data?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new OpenAiError("OpenAI returned no image.");
  return b64;
}

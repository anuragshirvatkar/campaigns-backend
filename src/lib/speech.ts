// Sam's voice: text → MP3. ElevenLabs when an API key is configured, otherwise OpenAI speech.
// Generated clips are kept in memory for a few minutes under an unguessable id, so the app's audio
// player can stream them from a plain URL (no auth header needed, nothing written to disk).
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const TIMEOUT_MS = 10_000;
const STYLED_TIMEOUT_MS = 12_000;
const CLIP_TTL_MS = 10 * 60_000;
const MAX_CLIPS = 300;

// How Sam sounds (OpenAI speech takes style instructions)
const VOICE_STYLE =
  "You are Sam, a friendly, upbeat young guide in a mobile app. Speak naturally and warmly, at a relaxed but lively pace, like a helpful friend. Keep it light.";

export class SpeechError extends Error {}

export const voiceProvider = () => (env.ELEVEN_LABS_API_KEY ? "elevenlabs" : env.OPENAI_API_KEY ? "openai" : null);

async function elevenLabs(text: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVEN_LABS_VOICE_ID}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVEN_LABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_flash_v2_5", // lowest latency
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new SpeechError(`ElevenLabs failed with ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

async function openAi(text: string, fast = false) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      fast
        ? { model: "tts-1", voice: env.OPENAI_TTS_VOICE, input: text, response_format: "mp3" }
        : { model: OPENAI_TTS_MODEL, voice: env.OPENAI_TTS_VOICE, input: text, instructions: VOICE_STYLE, response_format: "mp3" },
    ),
    signal: AbortSignal.timeout(fast ? TIMEOUT_MS : STYLED_TIMEOUT_MS),
  });
  if (!res.ok) throw new SpeechError(`OpenAI speech failed with ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Speaks `text` with Sam's voice. ElevenLabs first when configured; OpenAI as the fallback. */
export async function synthesize(text: string) {
  if (env.ELEVEN_LABS_API_KEY) {
    try {
      // A stalled request is retried once, so Sam keeps his own voice instead of switching to OpenAI's
      return await elevenLabs(text).catch(() => elevenLabs(text));
    } catch (err) {
      if (!env.OPENAI_API_KEY) throw err;
      console.error("ElevenLabs speech failed, using OpenAI:", err);
    }
  }
  if (!env.OPENAI_API_KEY) throw new SpeechError("No voice provider is configured.");
  // tts-1 answers in a second or two every time; the styled model is nicer but often stalls for 10+ s,
  // which kills a conversation. Styled is only the fallback.
  return openAi(text, true).catch((err) => {
    console.error("Fast speech failed, trying the styled voice:", err);
    return openAi(text);
  });
}

// ─── Short-lived clip store ───────────────────────────────────────────────────

const clips = new Map<string, { audio: Buffer; expires: number }>();
// The same line (tour, common replies) is spoken once and reused
const byText = new Map<string, string>();

function sweep() {
  const now = Date.now();
  for (const [id, c] of clips) if (c.expires < now) clips.delete(id);
  for (const [text, id] of byText) if (!clips.has(id)) byText.delete(text);
  while (clips.size > MAX_CLIPS) {
    const oldest = clips.keys().next().value as string;
    clips.delete(oldest);
  }
}

/** Synthesizes (or reuses) a clip and returns its id. */
export async function speakToClip(text: string) {
  sweep();
  const cached = byText.get(text);
  if (cached && clips.has(cached)) {
    clips.get(cached)!.expires = Date.now() + CLIP_TTL_MS;
    return cached;
  }
  const audio = await synthesize(text);
  const id = randomBytes(16).toString("hex");
  clips.set(id, { audio, expires: Date.now() + CLIP_TTL_MS });
  byText.set(text, id);
  return id;
}

export function getClip(id: string) {
  const c = clips.get(id);
  return c && c.expires > Date.now() ? c.audio : null;
}

export const MAX_CHARS = 2000;

export type InputCheck =
  | { ok: true; message: string }
  | { ok: false; reason: "empty" | "too_long"; error: string };

/** Runs in the browser and again on the server. Rejected input never reaches the LLM. */
export function validateInput(raw: unknown): InputCheck {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) {
    return { ok: false, reason: "empty", error: "Paste a message first — the box is empty." };
  }
  if (message.length > MAX_CHARS) {
    return {
      ok: false,
      reason: "too_long",
      error: `That message is ${message.length.toLocaleString("en-IN")} characters. Please paste at most ${MAX_CHARS.toLocaleString("en-IN")} — usually the first part of a long message is enough.`,
    };
  }
  return { ok: true, message };
}

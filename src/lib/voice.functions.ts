import { createServerFn } from "@tanstack/react-start";

export type VoiceCount = { name: string; qty: number; matched: boolean };

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const transcribeStockTake = createServerFn({ method: "POST" })
  .inputValidator((input: { audio: string; mime: string; flavours: string[] }) => {
    if (!input?.audio) throw new Error("No audio provided");
    return input;
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Voice transcription is not configured");

    const bytes = base64ToBytes(data.audio);
    const ext = data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: data.mime }), `stocktake.${ext}`);
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append(
      "prompt",
      `A gelato stock take. Expect quantities followed by flavour names, e.g. "one strawberry, three cookie dough". Possible flavours: ${data.flavours.slice(0, 200).join(", ")}`,
    );

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Too many requests — try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error("Could not transcribe the recording");
    }
    const json = (await res.json()) as { text?: string };
    const text = (json.text ?? "").trim();
    if (!text) return { text: "", items: [] as VoiceCount[] };

    const chat = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You convert a spoken gelato stock take into structured counts. Match each spoken flavour to the closest name in the provided flavour list (allow plurals, mishearings and partial names). If nothing matches well, return the spoken words as the name and matched=false. Quantities are tray counts; words like 'one', 'a', 'couple' mean 1, 2. Never invent flavours that were not spoken.",
          },
          {
            role: "user",
            content: `Flavour list:\n${data.flavours.join("\n")}\n\nTranscript:\n${text}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "record_counts",
              description: "Return the stock take counts",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        qty: { type: "number" },
                        matched: { type: "boolean" },
                      },
                      required: ["name", "qty", "matched"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "record_counts" } },
      }),
    });
    if (!chat.ok) return { text, items: [] as VoiceCount[] };
    const cj = (await chat.json()) as {
      choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    };
    const args = cj.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let items: VoiceCount[] = [];
    try {
      const parsed = JSON.parse(args ?? "{}") as { items?: VoiceCount[] };
      items = (parsed.items ?? []).filter((i) => i && typeof i.name === "string");
    } catch {
      items = [];
    }
    return { text, items };
  });

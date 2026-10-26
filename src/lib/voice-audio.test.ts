import { describe, expect, test } from "bun:test";
import { encodeWav, prepareVoiceAudio } from "./voice-audio";

describe("stocktake recordings", () => {
  test("checkpoints contain a complete WAV header and every captured sample", async () => {
    const blob = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 0.5])], 16000);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    expect(new TextDecoder().decode(buffer.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(buffer.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(48, true)).toBe(-32768);
  });

  test("long takes preserve the final samples across independently decodable segments", async () => {
    const samples = new Float32Array(16000 * 181);
    samples[samples.length - 1] = 1;
    const parts = await prepareVoiceAudio(encodeWav([samples], 16000));
    expect(parts.length).toBe(2);
    const sizes = await Promise.all(parts.map(async (part) => {
      const buffer = await part.arrayBuffer();
      const view = new DataView(buffer);
      expect(view.getUint32(40, true)).toBe(buffer.byteLength - 44);
      return buffer.byteLength - 44;
    }));
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(samples.length * 2);
    const tail = await parts[1]?.arrayBuffer();
    expect(tail).toBeDefined();
    if (!tail) throw new Error("Missing tail");
    expect(new DataView(tail).getInt16(tail.byteLength - 2, true)).toBe(32767);
  });

  test("empty recordings do not reach transcription", async () => {
    await expect(prepareVoiceAudio(encodeWav([], 16000))).rejects.toThrow("too short");
  });
});
import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, prepareVoiceAudio } from "./voice-audio";

describe("stocktake recordings", () => {
  test("checkpoints contain a complete WAV header and every captured sample", async () => {
    const blob = encodeWav([new Float32Array([0, 1]), new Float32Array([-1, 0.5])], 16000);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    assert.equal(new TextDecoder().decode(buffer.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(buffer.slice(8, 12)), "WAVE");
    assert.equal(view.getUint32(4, true), buffer.byteLength - 8);
    assert.equal(view.getUint32(40, true), 8);
    assert.equal(view.getInt16(48, true), -32768);
  });

  test("long takes preserve the final samples across independently decodable segments", async () => {
    const samples = new Float32Array(16000 * 181);
    samples[samples.length - 1] = 1;
    const parts = await prepareVoiceAudio(encodeWav([samples], 16000));
    assert.equal(parts.length, 2);
    const sizes = await Promise.all(parts.map(async (part) => {
      const buffer = await part.arrayBuffer();
      const view = new DataView(buffer);
      assert.equal(view.getUint32(40, true), buffer.byteLength - 44);
      return buffer.byteLength - 44;
    }));
    assert.equal(sizes.reduce((a, b) => a + b, 0), samples.length * 2);
    const tail = await parts[1]?.arrayBuffer();
    if (!tail) throw new Error("Missing tail");
    assert.equal(new DataView(tail).getInt16(tail.byteLength - 2, true), 32767);
  });

  test("empty recordings do not reach transcription", async () => {
    await assert.rejects(prepareVoiceAudio(encodeWav([], 16000)), /too short/);
  });
});
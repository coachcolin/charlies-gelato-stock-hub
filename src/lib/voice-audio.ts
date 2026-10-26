// Complete PCM WAV files remain decodable after a checkpoint or interrupted take.
export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

function audioContext() {
  const AudioContextClass = window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("Voice recording isn't supported in this browser.");
  return new AudioContextClass({ sampleRate: 16000 });
}

export type WavRecorder = { stop: () => Blob; dispose: () => void };

export async function startWavRecording(options: {
  onCheckpoint: (blob: Blob) => void;
  onLevels: (levels: number[]) => void;
  onInterrupted: () => void;
}): Promise<WavRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording isn't available. Open the app in Safari or Chrome.");
  }
  // Resume from the button gesture, before permission/wake-lock awaits on Safari.
  const context = audioContext();
  let stream: MediaStream | undefined;
  let processor: ScriptProcessorNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const chunks: Float32Array[] = [];
  const snapshot = () => encodeWav(chunks, context.sampleRate);
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    if (interval) clearInterval(interval);
    document.removeEventListener("visibilitychange", hidden);
    window.removeEventListener("pagehide", interrupt);
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => {});
  };
  const interrupt = () => { if (!stopped) options.onInterrupted(); };
  const hidden = () => { if (document.visibilityState === "hidden") interrupt(); };
  try {
    const resumed = context.resume();
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await resumed;
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      chunks.push(samples);
      const levels = Array.from({ length: 16 }, (_, i) => {
        const start = Math.floor(i * samples.length / 16);
        const end = Math.floor((i + 1) * samples.length / 16);
        let peak = 0;
        for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j] ?? 0));
        return Math.min(255, peak * 900);
      });
      options.onLevels(levels);
      // The output stays silent; the microphone is never played through speakers.
    };
    source.connect(processor);
    processor.connect(context.destination);
    interval = setInterval(() => {
      if (chunks.length) options.onCheckpoint(snapshot());
    }, 2000);
    stream.getAudioTracks().forEach((track) => track.addEventListener("ended", interrupt));
    context.addEventListener("statechange", () => {
      if (context.state === "suspended") interrupt();
    });
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", interrupt);
    return {
      stop: () => { const blob = snapshot(); dispose(); return blob; },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

// Older saved MediaRecorder takes can often be recovered by decoding locally.
export async function prepareVoiceAudio(blob: Blob): Promise<Blob[]> {
  let wav = blob;
  const bytes = await blob.arrayBuffer();
  const header = new TextDecoder().decode(bytes.slice(0, 12));
  if (!header.startsWith("RIFF") || !header.endsWith("WAVE")) {
    const context = audioContext();
    try {
      const audio = await context.decodeAudioData(bytes);
      const mono = new Float32Array(audio.length);
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const samples = audio.getChannelData(channel);
        for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (samples[i] ?? 0) / audio.numberOfChannels;
      }
      wav = encodeWav([mono], audio.sampleRate);
    } catch {
      throw new Error("This saved recording couldn't be read. You can still listen to it below; please record a new take.");
    } finally {
      void context.close().catch(() => {});
    }
  }
  const buffer = await wav.arrayBuffer();
  if (buffer.byteLength < 2048) throw new Error("The recording was too short. Please record your counts again.");
  const view = new DataView(buffer);
  const rate = view.getUint32(24, true);
  const blockSize = view.getUint16(32, true);
  // Bound each upload without dropping the tail of a long stocktake.
  const segmentBytes = rate * blockSize * 180;
  if (!segmentBytes) throw new Error("The recording couldn't be read. Please record again.");
  const parts: Blob[] = [];
  for (let offset = 44; offset < buffer.byteLength; offset += segmentBytes) {
    const data = buffer.slice(offset, Math.min(offset + segmentBytes, buffer.byteLength));
    const head = buffer.slice(0, 44);
    const segment = new DataView(head);
    segment.setUint32(4, 36 + data.byteLength, true);
    segment.setUint32(40, data.byteLength, true);
    parts.push(new Blob([head, data], { type: "audio/wav" }));
  }
  return parts;
}
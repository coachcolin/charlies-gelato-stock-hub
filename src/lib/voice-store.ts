// Tiny IndexedDB store for in-progress voice recordings, so a stock take
// survives the phone screen turning off or the page being reloaded.

const DB_NAME = "charlies-voice";
const STORE = "recordings";

export type SavedRecording = {
  blob: Blob;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ blob, savedAt: Date.now() } satisfies SavedRecording, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Storage unavailable (private browsing etc.) — recording still works, just not saved.
  }
}

export async function loadRecording(key: string): Promise<SavedRecording | null> {
  try {
    const db = await openDb();
    const result = await new Promise<SavedRecording | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as SavedRecording | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result?.blob?.size ? result : null;
  } catch {
    return null;
  }
}

export async function clearRecording(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

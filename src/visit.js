// Small, versioned local progress store. No account or network is needed;
// browsers that refuse storage keep the same behaviour for this session.
const STORAGE_KEY = 'atlas-museum:visit:v1';
const VERSION = 1;
const MAX_COORDINATE = 1000;

function browserStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function validatedPose(pose) {
  if (!pose || typeof pose !== 'object') return null;
  const { x, z, yaw, pitch } = pose;
  if (![x, z, yaw, pitch].every(Number.isFinite)
    || Math.abs(x) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE
    || Math.abs(yaw) > 1e6 || Math.abs(pitch) > 1.42) return null;
  // Keep saved turns small even after a long visit. The caller checks collisions
  // against the current building before restoring this position.
  const wrappedYaw = ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return { x, z, yaw: wrappedYaw, pitch };
}

/** Ordered, self-paced route plus local progress. Storage may be null or a
 * localStorage-compatible object, which is useful in private browsing/tests. */
export function createVisit(artworks, storage = browserStorage()) {
  const works = artworks.filter((art, index, all) => art && typeof art.id === 'string'
    && art.id.length > 0 && all.findIndex(candidate => candidate?.id === art.id) === index);
  const validIds = new Set(works.map(art => art.id));
  const visited = new Set();
  let guided = false, index = -1, pose = null, audioEnabled = false;
  let writableStorage = storage;

  // Treat invalid, incompatible, or oversized data as a fresh visit. Never
  // trust saved JSON to supply collection data or an arbitrary camera object.
  let raw;
  try { raw = storage?.getItem(STORAGE_KEY); } catch { writableStorage = null; }
  try {
    if (typeof raw === 'string' && raw.length < 64_000) {
      const saved = JSON.parse(raw);
      if (saved && saved.version === VERSION) {
        if (Array.isArray(saved.visited)) {
          for (const id of saved.visited) if (validIds.has(id)) visited.add(id);
        }
        pose = validatedPose(saved.pose);
        audioEnabled = saved.audioEnabled === true;
      }
    }
  } catch { /* Malformed data is replaced on the next successful save. */ }

  function persist() {
    if (!writableStorage) return;
    try {
      writableStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        visited: [...visited].filter(id => validIds.has(id)),
        pose,
        audioEnabled,
      }));
    } catch { writableStorage = null; }
  }

  const current = () => guided && index >= 0 ? works[index] || null : null;
  return {
    visited,
    get guided() { return guided; },
    get current() { return current(); },
    start() {
      if (!works.length) return null;
      index = works.findIndex(art => !visited.has(art.id));
      if (index < 0) index = 0;
      guided = true;
      return current();
    },
    stop() { guided = false; index = -1; },
    next() {
      if (!guided) return null;
      if (++index >= works.length) { guided = false; index = -1; }
      return current();
    },
    previous() {
      if (!guided) return null;
      index = Math.max(0, index - 1);
      return current();
    },
    markSeen(id) {
      if (!validIds.has(id)) return false;
      if (!visited.has(id)) { visited.add(id); persist(); }
      return true;
    },
    savePose(nextPose) {
      const valid = validatedPose(nextPose);
      if (!valid) return false;
      pose = valid;
      persist();
      return true;
    },
    get savedPose() { return pose ? { ...pose } : null; },
    reset() {
      visited.clear(); pose = null; guided = false; index = -1;
      persist();
    },
    get audioEnabled() { return audioEnabled; },
    setAudioEnabled(enabled) { audioEnabled = enabled === true; persist(); },
  };
}

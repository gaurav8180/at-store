const SAVED_KEY = 'ss_saved';

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state stays in memory */
  }
}

let savedIds = read(SAVED_KEY).filter((id) => typeof id === 'string');
const savedListeners = new Set();

const notify = (set, value) => set.forEach((fn) => fn(value));

export const saved = {
  has: (id) => savedIds.includes(id),
  count: () => savedIds.length,
  toggle(id) {
    savedIds = savedIds.includes(id) ? savedIds.filter((x) => x !== id) : [...savedIds, id];
    write(SAVED_KEY, savedIds);
    notify(savedListeners, savedIds);
  },
  subscribe(fn) {
    savedListeners.add(fn);
    return () => savedListeners.delete(fn);
  },
};

window.addEventListener('storage', (e) => {
  if (e.key === SAVED_KEY) {
    savedIds = read(SAVED_KEY).filter((id) => typeof id === 'string');
    notify(savedListeners, savedIds);
  }
});

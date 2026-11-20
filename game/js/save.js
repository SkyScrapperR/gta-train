// Save/load to localStorage under a versioned key. Settings are stored separately so they persist across games.
export const SAVE_KEY = 'selarabay.save.v1';
export const SETTINGS_KEY = 'selarabay.settings.v1';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

export class SaveSystem {
  exists() { return !!store.get(SAVE_KEY); }
  write(data) { return store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: data.clock, ...data })); }
  read() { const s = store.get(SAVE_KEY); if (!s) return null; try { const d = JSON.parse(s); return d.version === 1 ? d : null; } catch (e) { return null; } }
  clear() { store.del(SAVE_KEY); }
  readSettings() { try { return JSON.parse(store.get(SETTINGS_KEY) || 'null'); } catch (e) { return null; } }
  writeSettings(s) { store.set(SETTINGS_KEY, JSON.stringify(s)); }
}

// Snapshot of everything a save needs.
export function captureGame(game) {
  const p = game.player;
  const v = p.state === 'driving' ? p.vehicle : null;
  return {
    money: game.money,
    missions: game.missions.serialize(),
    weapons: game.weapons.serialize(),
    health: p.health, armor: p.armor,
    pos: v ? [v.x, v.z] : [p.x, p.z],
    tags: game.world.props.tagList.filter((t) => t.collected).map((t) => t.id),
    stats: { ...game.stats },
    clock: game.clock,
    settings: { ...game.settings },
  };
}

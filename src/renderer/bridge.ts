import { deserialize, serialize } from '../game/save'
import type { GameState } from '../game/types'

/** Exactly what electron/preload.ts puts on the window. */
export interface SproutBridge {
  readSave(): Promise<string | null>
  writeSave(json: string): Promise<void>
  clearSave(): Promise<void>
}

declare global {
  interface Window {
    sprout?: SproutBridge
  }
}

/** Where a plain browser (`npm run dev` without Electron) keeps the save. */
const STORAGE_KEY = 'sprout-hollow.save'

function host(): SproutBridge | null {
  if (typeof window === 'undefined') return null
  return window.sprout ?? null
}

function readLocal(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeLocal(json: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, json)
  } catch {
    // Private mode or a full quota. Losing the save beats crashing the frame loop.
  }
}

function clearLocal(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored, or storage is unavailable. Either way there is nothing left to do.
  }
}

export async function loadSave(): Promise<GameState | null> {
  const bridge = host()
  let json: string | null = null
  if (bridge) {
    try {
      json = await bridge.readSave()
    } catch {
      json = null
    }
  } else if (typeof window !== 'undefined') {
    json = readLocal()
  }
  return json === null ? null : deserialize(json)
}

export async function saveGame(state: GameState): Promise<void> {
  const json = serialize(state)
  const bridge = host()
  if (bridge) {
    try {
      await bridge.writeSave(json)
    } catch {
      // The main process already swallows filesystem errors; a rejection here means
      // the channel itself is gone, and there is nowhere better to put the bytes.
    }
    return
  }
  if (typeof window !== 'undefined') writeLocal(json)
}

export async function clearSave(): Promise<void> {
  const bridge = host()
  if (bridge) {
    try {
      await bridge.clearSave()
    } catch {
      // As above: nothing useful the renderer can do about a dead channel.
    }
    return
  }
  if (typeof window !== 'undefined') clearLocal()
}

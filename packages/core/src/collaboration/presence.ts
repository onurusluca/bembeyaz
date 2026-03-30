import { createId } from '../utils/id.js'

/** Remote or local user overlay for cursors / avatars (wire to Supabase Presence or Broadcast). */
export interface PresencePeer {
  userId: string
  /** CSS color for cursor / ring */
  color: string
  name?: string
  cursorWorld?: { x: number; y: number }
}

/** Mutable presence registry; engine holds one instance. */
export class PresenceStore {
  private localUserId: string
  private readonly peers = new Map<string, PresencePeer>()

  constructor(localUserId?: string) {
    this.localUserId = localUserId ?? createId()
  }

  getLocalUserId(): string {
    return this.localUserId
  }

  /** Re-point local identity (e.g. after auth); keeps prior local entry merged by userId change only if you also migrate — caller should re-patch. */
  setLocalUserId(userId: string): void {
    const prev = this.localUserId
    if (prev === userId) return
    const data = this.peers.get(prev)
    this.peers.delete(prev)
    this.localUserId = userId
    if (data) {
      this.peers.set(userId, { ...data, userId })
    }
  }

  /** Merge into the local peer and store. */
  patchLocal(patch: Partial<Omit<PresencePeer, 'userId'>>): PresencePeer {
    const cur = this.peers.get(this.localUserId)
    const next: PresencePeer = {
      color: cur?.color ?? '#64748b',
      ...cur,
      ...patch,
      userId: this.localUserId,
    }
    this.peers.set(this.localUserId, next)
    return next
  }

  /** Apply a remote payload; `null` removes the peer. */
  applyRemote(userId: string, patch: Partial<PresencePeer> | null): void {
    if (patch === null) {
      this.peers.delete(userId)
      return
    }
    const cur = this.peers.get(userId)
    const next: PresencePeer = {
      color: cur?.color ?? '#94a3b8',
      ...cur,
      ...patch,
      userId,
    }
    this.peers.set(userId, next)
  }

  getSnapshot(): ReadonlyMap<string, PresencePeer> {
    return new Map(this.peers)
  }
}

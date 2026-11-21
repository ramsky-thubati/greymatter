import { EventEmitter } from 'node:events'

export class ProjectEvents {
  private readonly emitter = new EventEmitter().setMaxListeners(0)

  emit(projectId: number): void {
    this.emitter.emit(String(projectId))
  }

  subscribe(projectId: number, fn: () => void): () => void {
    const key = String(projectId)
    this.emitter.on(key, fn)
    return () => {
      this.emitter.off(key, fn)
    }
  }
}

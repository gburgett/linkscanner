import { EventEmitter } from 'events'

function onceAsync(this: EventEmitter, event: string | symbol): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    let resolved = false
    this.once(event, (...args: any[]) => {
      if (!resolved) {
        resolved = true
        resolve(args)
      }
    })

    if (event != 'error') {
      this.once('error', (err) => {
        if (!resolved) {
          resolved = true
          reject(err)
        }
      })
    }
  })
}

declare module 'events' {
  interface EventEmitter {
    /**
     * Returns a promise that resolves the next time the emitter emits the given
     * event.  The promise is rejected if the emitter emits 'error'.
     */
    onceAsync(event: string | symbol): Promise<any[]>
  }
}

EventEmitter.prototype.onceAsync = onceAsync

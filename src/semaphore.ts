import { EventEmitter } from 'events'

interface SemaphoreConfig {
  maxInflight: number
}

interface Task<T> {
  resolve: (value?: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
  action: () => Promise<T>
  state: 'queued' | 'running' | 'released'
}

export class Semaphore extends EventEmitter {
  public config: Readonly<SemaphoreConfig>

  private inflight = 0
  private queueSize = 0
  private queue: Array<Task<any>> = []

  constructor(config?: SemaphoreConfig) {
    super()

    this.config = Object.assign({
      maxInflight: 4,
    }, config)
  }

  public stats(): Readonly<{ inflight: number, queueSize: number }> {
    return {
      inflight: this.inflight,
      queueSize: this.queueSize,
    }
  }

  public isEmpty(): boolean {
    return this.inflight <= 0 && this.queue.length == 0
  }

  public lock<T>(action: () => Promise<T>): Promise<T> {
    let task: Task<T> | null = null
    const promise = new Promise<T>((resolve, reject) => {
      task = {
        resolve, reject,
        action,
        state: 'queued',
      }
    })

    if (this.inflight == 0 || this.inflight < this.config.maxInflight) {
      this.inflight++
      // yield the execution queue before running the next request
      setTimeout(() => this._runTask(task!), 0)
    } else {
      this.queue.push(task!)
      this.queueSize = this.queue.length
    }

    return promise
  }

  private _release() {
    const task = this.queue.shift()
    if (task) {
      this.queueSize = this.queue.length
      // yield the execution queue before running the next request
      setTimeout(() => this._runTask(task), 0)
    } else {
      this.inflight--
      if (this.isEmpty()) {
        this.emit('empty')
      } else if (this.inflight < 0) {
        throw new Error(`Invalid state! negative inflight requests`)
      }
    }
  }

  private async _runTask(task: Task<any>) {
    try {
      task.state = 'running'
      const result = await task.action()
      task.resolve(result)
    } catch (e) {
      task.reject(e)
    } finally {
      task.state = 'released'
      this._release()
    }
  }
}

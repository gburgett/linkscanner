import { EventEmitter } from 'events'

interface SemaphoreConfig {
  maxInflight: number
}

interface Task<T> {
  resolve: (value?: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
  action: Action<T>
  state: 'queued' | 'running' | 'released'
}

export type Action<T> = (() => Promise<T>) | ((cb: TaskCB<T>) => void)
export type TaskCB<T> = (err: Error | null, result: T) => void

/**
 * A Semaphore which queues up tasks to be executed once prior tasks are complete.
 * Number of concurrent inflight tasks is configurable at initialization.
 */
export class Semaphore extends EventEmitter {
  public config: Readonly<SemaphoreConfig>

  private inflight = 0
  private queueSize = 0
  private queue: Array<Task<any>> = []

  constructor(config?: SemaphoreConfig) {
    super()

    this.config = Object.assign({
      maxInflight: 1,
    }, config)
  }

  /**
   * Gets a snapshot of the current state of the semaphore.
   * @returns the current number of inflight requests, and the current queue size.
   */
  public stats(): Readonly<{ inflight: number, queueSize: number }> {
    return {
      inflight: this.inflight,
      queueSize: this.queueSize,
    }
  }

  /**
   * Checks if the semaphore is currently empty.  You can poll this or wait for
   * the 'empty' event to be raised.
   */
  public isEmpty(): boolean {
    return this.inflight <= 0 && this.queue.length == 0
  }

  /**
   * Locks the semaphore, running or enqueuing the given task.  The semaphore is
   * not unlocked until the task completes.  The task should perform the minimum
   * required work and then return a value.  For example, connecting to a remote
   * API and returning the response body for further processing.
   *
   * The task can either be an async function returning a promise, or a function
   * that accepts a callback as the first parameter.
   *
   * @param action An action to be run when the number of inflight tasks is below the limit.
   * @returns A promise that completes when the action completes, returning the result
   *  of the action.
   */
  public lock<T>(action: Action<T>): Promise<T> {
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

  private async _runTask<T>(task: Task<T>) {
    try {
      task.state = 'running'

      let taskPromise: Promise<T> | void | undefined
      const cbPromise = new Promise<T>((resolve, reject) => {
        taskPromise = task.action((err, result) => {
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        })
      })

      const promise = taskPromise && typeof taskPromise == 'object' && 'then' in taskPromise ?
        taskPromise :
        cbPromise

      task.resolve(await promise)
    } catch (e) {
      task.reject(e)
    } finally {
      task.state = 'released'
      this._release()
    }
  }
}

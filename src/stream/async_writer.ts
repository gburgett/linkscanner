import { Duplex, Writable } from 'stream'

interface InternalAsyncState {
  _asyncWrtiableState: {
    draining: boolean
    drainPromise: Promise<void> | null,
  } | undefined
}

function writeAsync(this: Writable & InternalAsyncState, chunk: any, encoding?: string): Promise<void> {
  if (this._asyncWrtiableState === undefined) {
    this._asyncWrtiableState = {
      draining: true,
      drainPromise: null,
    }
  }

  return new Promise<void>((resolve, reject) => {
    if (this._asyncWrtiableState!.draining) {
      console.log('write', chunk)
      this._asyncWrtiableState!.draining = this.write(chunk, encoding, (err: any) => {
        console.log('write complete', chunk, err)
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    } else {
      if (!this._asyncWrtiableState!.drainPromise) {
        this._asyncWrtiableState!.drainPromise = new Promise<void>((dpResolve) => {
          console.log('waiting on drain', chunk)
          this.once('drain', () => {
            this._asyncWrtiableState!.drainPromise = null
            this._asyncWrtiableState!.draining = true
            console.log('drain', chunk, this)
            dpResolve()
          })
        })
      }

      // await recursive
      this._asyncWrtiableState!.drainPromise!.then(
        () =>
          this.writeAsync(chunk, encoding)
            .then(resolve)
            .catch(reject),
        (err) => reject(err),
      )
    }
  })
}

declare module 'stream' {
  interface Writable {
    writeAsync(chunk: any, encoding?: string): Promise<void>
  }

  interface Duplex {
    writeAsync(chunk: any, encoding?: string): Promise<void>
  }
}
Writable.prototype.writeAsync = writeAsync
Duplex.prototype.writeAsync = writeAsync

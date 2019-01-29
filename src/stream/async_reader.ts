import { Duplex, Readable } from 'stream'

interface InternalAsyncState {
  _asyncReadableState: {
    readablePromise: Promise<void> | null,
  } | undefined
}

function readAsync(this: Readable & InternalAsyncState, size?: number): Promise<any> {
  if (this._asyncReadableState === undefined) {
    this._asyncReadableState = {
      readablePromise: null,
    }
  }

  return new Promise<any>((resolve, reject) => {
    if (this.readable) {
      try {
        resolve(this.read(size))
      } catch (e) {
        reject(e)
      }
    } else {
      if (!this._asyncReadableState!.readablePromise) {
        this._asyncReadableState!.readablePromise = new Promise<void>((rpResolve, rpErr) => {
          const resolved = false
          this.once('readable', () => {
            if (resolved) { return }
            this._asyncReadableState!.readablePromise = null
            rpResolve()
          })
          this.once('error', (err) => {
            if (resolved) { return }
            this._asyncReadableState!.readablePromise = null
            rpErr(err)
          })
        })
      }

      // await recursive
      this._asyncReadableState!.readablePromise!.then(
        () =>
          this.readAsync(size)
            .then(resolve)
            .catch(reject),
        (err) => reject(err),
      )
    }
  })
}

declare module 'stream' {
  interface Readable {
    /**
     * Reads a chunk from the current write stream, returning a promise that completes
     * when the chunk has actually been read.
     *
     * This function respects the 'readable' event of the stream.  If the stream is currently
     * waiting for data, the function will queue the read until the readable event is fired.
     */
    readAsync(size?: number): Promise<any>
  }

  interface Duplex {
    /**
     * Reads a chunk from the current write stream, returning a promise that completes
     * when the chunk has actually been read.
     *
     * This function respects the 'readable' event of the stream.  If the stream is currently
     * waiting for data, the function will queue the read until the readable event is fired.
     */
    readAsync(size?: number): Promise<any>
  }
}
Readable.prototype.readAsync = readAsync
Duplex.prototype.readAsync = readAsync

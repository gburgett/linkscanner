import { Transform } from 'async-toolbox/stream'
import * as stream from 'stream'
import { URL } from 'universal-url'
import { Chunk } from './model'

export { URL } from 'universal-url'

export function parseUrl(url: string, base?: string): URL {
  return new URL(url, base)
}

export function isURL(object: any): object is URL {
  return object instanceof URL
}

export function parseUrls(): stream.Transform {
  return new stream.Transform({
    objectMode: true,
    transform(strChunk: any, encoding, done) {
      if (typeof strChunk == 'string') {
        try {
          // skip whitespace lines
          if (/\S/.test(strChunk)) {
            this.push(parseUrl(strChunk))
          }
        } catch (ex) {
          done(new Error(`Unable to parse URL '${strChunk}'\n\t${ex}`))
          return
        }
      } else if (isURL(strChunk)) {
        this.push(strChunk)
      } else {
        done(new Error(`Unknown object (not a string or URL): ${strChunk}`))
        return
      }

      done()
    },
  })
}

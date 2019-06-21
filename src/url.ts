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

export function parseUrls(): Transform<string, URL> {
  return new stream.Transform({
    objectMode: true,
    transform(strChunk, encoding, done) {
      try {
        // skip whitespace lines
        if (/\S/.test(strChunk)) {
          this.push(parseUrl(strChunk))
        }
        done()
      } catch (ex) {
        done(new Error(`Unable to parse URL '${strChunk}'\n\t${ex}`))
      }
    },
  })
}

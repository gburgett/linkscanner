import { Transform } from 'async-toolbox/stream'
import * as stream from 'stream'
import { URL } from 'universal-url'

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
    transform(chunk, encoding, done) {
      try {
        this.push(parseUrl(chunk))
        done()
      } catch (ex) {
        done(ex)
      }
    },
  })
}

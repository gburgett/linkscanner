
import { JSONPath } from 'jsonpath-plus'
import { ParserOptions } from '.'
import { defaultLogger } from '../logger'
import { URL } from '../url'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

const defaultIncludes = [
  '$..links',
  '$.._links',
  '$..link',
  '$.._link',
]

export class JsonParser {
  public static readonly regexp = /^\s*((((ftp|http|https):)?\/\/)|\/)[^ "<{}]+\s*$/igm

  private readonly _options: ParserOptions
  private readonly _seen = new Set<string>()

  constructor(options?: Options<ParserOptions>) {
    this._options = assign(
      {
        logger: defaultLogger,
        include: [],
      },
      options,
    )

    if (this._options.include.includes('all')) {
      this._options.include = ['$..*']
    } else {
      this._options.include =
        this._options.include.concat(...defaultIncludes)
    }
  }

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const baseUrl = response.url || request.url

    for (const potentialLink of this.traverse(await response.json())) {
      if (potentialLink.match(JsonParser.regexp)) {
        this._tryEmit(potentialLink, baseUrl, push)
      }
    }
  }

  private _tryEmit(match: string, base: string, push: (result: URL) => void) {
    let url: URL
    try {
      url = parseUrl(match, base)
    } catch (err) {
      this._options.logger.debug(`bad href: '${match}'`)
      return
    }

    if (!this._seen.has(url.toString())) {
      this._seen.add(url.toString())
      push(url)
    }
  }

  private* traverse(json: any): Iterable<string> {
    for (const path of this._options.include) {
      for (const obj of JSONPath({ path, json })) {
        // directly selected strings
        if (typeof obj == 'string') {
          yield obj

          // arrays
        } else if (typeof obj[Symbol.iterator] === 'function') {
          for (const val of obj) {
            if (typeof val == 'string') {
              yield val
            }
          }

          // objects
        } else if (typeof obj == 'object') {
          for (const key of Object.keys(obj)) {
            // eslint-disable-next-line no-prototype-builtins
            if (!obj.hasOwnProperty(key)) { continue }
            if (typeof obj[key] != 'string') { continue }

            yield obj[key]
          }
        }
      }
    }
  }
}

/**
 * https://stackoverflow.com/questions/722668/traverse-all-the-nodes-of-a-json-object-tree-with-javascript
 */
function* traverse(o: any, path: string[] = []): Iterable<{ key: string, value: string, path: string[]}> {
  for (const i of Object.keys(o)) {
    const itemPath = path.concat(i)
    yield {key: i, value: o[i], path: itemPath }
    if (o[i] !== null && typeof(o[i]) == 'object') {
      // going one step down in the object tree!!
      yield* traverse(o[i], itemPath)
    }
  }
}

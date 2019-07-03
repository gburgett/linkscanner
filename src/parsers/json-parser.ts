
import { ParserOptions } from '.'
import { defaultLogger } from '../logger'
import { URL } from '../url'
import { parseUrl } from '../url'
import { assign, Options } from '../util'

export class JsonParser {
  public static readonly regexp = /^\s*((((ftp|http|https):)?\/\/)|\/)[^ "<\{\}]+\s*$/igm

  private readonly _options: ParserOptions

  constructor(options?: Options<ParserOptions>) {
    this._options = assign(
      {
        logger: defaultLogger,
        include: [],
      },
      options,
    )
  }

  public async parse(response: Response, request: Request, push: (result: URL) => void): Promise<void> {
    const baseUrl = response.url || request.url

    for (const { value } of traverse(await response.json())) {
      // do something here with each key and value
      if (typeof value == 'string') {
        if (value.match(JsonParser.regexp)) {
          this._tryEmit(value, baseUrl, push)
        } else {
          console.log(`no match '${value}'`, JsonParser.regexp)
        }
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
    push(url)
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

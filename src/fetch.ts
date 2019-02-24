import { ParallelTransform, ParallelTransformOptions } from 'async-toolbox/stream'
import fetch from 'node-fetch'
import { EOF, isEOF } from './reentry'
import { URL } from './url'

export interface FetchOptions extends ParallelTransformOptions {
  objectMode?: true

  hostnames: Set<string>

  acceptMimeTypes?: string[]
}

export class Fetch extends ParallelTransform {
  private _acceptMimeType: string

  constructor(private readonly options: FetchOptions) {
    super(Object.assign({},
      options,
      {
      objectMode: true,
    }))

    this._acceptMimeType = options.acceptMimeTypes ?
      options.acceptMimeTypes.join(', ') :
      'text/html, application/json'
  }

  public async _transformAsync(url: URL | EOF): Promise<void> {
    if (isEOF(url)) {
      this.push(url)
      return
    }

    const method = this.options.hostnames.has(url.hostname) ?
      'GET' :
      'HEAD'

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: this._acceptMimeType,
      },
      redirect: 'follow',
    })

    this.push({
      url,
      method,
      response,
    })
  }
}

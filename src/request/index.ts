import { Request, RequestAPI, RequestCallback, Response } from 'request'
import * as requestLib from 'request'

interface AsyncRequestAPI<TReq extends Request, TOptions, TRequiredUriUrl> {
  get: (url: string) => Promise<Response>
  post: (url: string, options: TOptions) => Promise<Response>
}

/** Makes the request API use promises. */
export function AsyncRequest(): AsyncRequestAPI<Request, requestLib.CoreOptions, requestLib.RequiredUriUrl>

export function AsyncRequest<TReq extends Request, TOptions, TRequiredUriUrl>(
  request: RequestAPI<TReq, TOptions, TRequiredUriUrl>,
): AsyncRequestAPI<TReq, TOptions, TRequiredUriUrl>

export function AsyncRequest<TReq extends Request, TOptions, TRequiredUriUrl>(
  request: RequestAPI<TReq, TOptions, TRequiredUriUrl> = (requestLib as any),
): AsyncRequestAPI<TReq, TOptions, TRequiredUriUrl> {

  // tslint:disable-next-line:only-arrow-functions
  const extendedLib = function(uri: string, options?: TOptions) {
    return request(uri, options)
  }
  return Object.assign(extendedLib, {
    get: (url: string) => p((c) => request.get(url, c)),
    post: (url: string, options: TOptions) => p((c) => request.post(url, options, c)),
  })

  function p(req: (cb: RequestCallback) => Request): Promise<Response> {
    return new Promise((resolve, reject) => {
      req((err, resp, body) => {
        if (err) {
          reject(err)
          return
        }

        if (resp.statusCode == 302) {
          request.get(resp.headers.location!, (err2, resp2) => {
            if (err2) {
              reject(err2)
              return
            }

            resolve(resp2)
          })
        } else {
          resolve(resp)
        }
      })
    })
  }
}

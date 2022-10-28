import { wait } from 'async-toolbox'
import { collect } from 'async-toolbox/stream'

import fetchMock from 'fetch-mock'

import { FetchInterfaceWrapper } from './fetch_interface'
import { Fetcher, FetchOptions } from './fetcher'
import { Chunk, ErrorResult, Result, SuccessResult } from './model'
import { parseUrl } from './url'

// tslint:disable:no-unused-expression

describe('Fetcher', () => {
  let options: Partial<FetchOptions>
  let fetchMockSandbox: fetchMock.FetchMockSandbox
  beforeEach(() => {
    fetchMock.reset()
    fetchMockSandbox = fetchMock.sandbox()
    options = {
      fetch: {
        fetch: fetchMockSandbox,
        Request: fetchMock.config.Request!,
      },
    }
  })

  const instance = (additionalOptions?: Partial<FetchOptions>) =>
    new Fetcher({
      ...options,
      ...additionalOptions,
      logger: console,
    })

  it.skip('gets a result from a page', async function() {
    this.timeout(10000)
    const uut = new Fetcher({
      // note: intentionally not setting a mock fetcher.  This is a true integration test.
    })

    // act
    await uut.writeAsync({ url: parseUrl('https://github.com/gburgett/linkscanner') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as ErrorResult).error).toBeFalsy()
    expect(result[0].type).toEqual('success')
    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('github.com')
    expect(result[0].url.toString()).toEqual('https://github.com/gburgett/linkscanner')
  })

  it('performs a HEAD request when the node is a leaf', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect((result[0] as SuccessResult).method).toEqual('HEAD')

    const call = fetchMockSandbox.lastCall(/other\.com/)!
    expect(call[1]!.method).toEqual('HEAD')
  })

  it('performs a GET request when the node is a leaf and forceGet is true', async () => {
    const uut = instance({ forceGet: true })

    fetchMockSandbox.getOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect((result[0] as SuccessResult).method).toEqual('GET')

    const call = fetchMockSandbox.lastCall(/other\.com/)!
    expect(call[1]!.method).toEqual('GET')
  })

  it('retries as a GET when the HEAD response is 405', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 405)
    fetchMockSandbox.getOnce('http://other.com', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].type).toEqual('success')
    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('other.com')
    expect(result[0].url.toString()).toEqual('http://other.com/')

    const calls = fetchMockSandbox.calls(/other\.com/)!
    expect(calls[0][1]!.method).toEqual('HEAD')
    expect(calls[1][1]!.method).toEqual('GET')
  })

  it('does not parse body when a leaf 405 is retried as a GET', async () => {
    const uut = instance()

    fetchMockSandbox.headOnce('http://other.com', 405)
    fetchMockSandbox.getOnce('http://other.com', {
      status: 200,
      headers: {
        'content-type': 'text/html',
      },
      body: '<a href="http://www.google.com"></a>',
    })

    const emitted: URL[] = []
    uut.on('url', (url) => emitted.push(url))

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    await collect(uut)

    expect(emitted.length).toEqual(0)
  })

  it('follows redirects', async () => {
    const uut = instance({
      followRedirects: true,
    })

    fetchMockSandbox.headOnce('http://other.com', {
      status:  307,
      headers: {
        Location: 'http://www.other.com',
      },
    })

    fetchMockSandbox.headOnce('http://www.other.com/', 200)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as ErrorResult).error).toBeFalsy()
    expect((result[0] as SuccessResult).status).toEqual(307)
    expect(result[0].host).toEqual('other.com')
    expect(result[0].url.toString()).toEqual('http://other.com/')
    expect(result[0].leaf).toBeFalsy()

    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('www.other.com')
    expect(result[1].url.toString()).toEqual('http://www.other.com/')
    expect(result[1].parent).toEqual(result[0])
  })

  it('pushes an error result when fetch throws', async () => {
    const uut = instance()

    fetchMockSandbox.getOnce('http://other.com', () => { throw new Error(`test error!`) })

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    const r0 = result[0] as ErrorResult
    expect(r0.status).toBeFalsy()
    expect(r0.reason).toEqual('error')
    expect(r0.host).toEqual('other.com')
    expect(r0.url.toString()).toEqual('http://other.com/')
  })

  it('pushes a timeout result', async () => {
    const uut = instance({
      fetch: new FetchInterfaceWrapper(options.fetch!, {
        timeout: 10,
      }),
    })

    fetchMockSandbox.getOnce('http://other.com', async () => {
      await wait(100)
      return 200
    })

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    const r0 = result[0] as ErrorResult
    expect(r0.status).toBeFalsy()
    expect(r0.reason).toEqual('timeout')
    expect(r0.host).toEqual('other.com')
    expect(r0.url.toString()).toEqual('http://other.com/')
  })

  it('detects an infinite redirect', async () => {
    const uut = instance({
      followRedirects: true,
    })

    fetchMockSandbox.headOnce('http://other.com/1', {
      status:  302,
      headers: {
        Location: 'http://other.com/2',
      },
    })

    fetchMockSandbox.headOnce('http://other.com/2', {
      status:  301,
      headers: {
        Location: 'http://other.com/1',
      },
    })

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com/1'), leaf: true })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as ErrorResult).error).toBeFalsy()
    expect((result[0] as SuccessResult).status).toEqual(302)
    expect(result[0].host).toEqual('other.com')
    expect(result[0].url.toString()).toEqual('http://other.com/1')
    expect(result[0].leaf).toBeFalsy()

    expect((result[1] as ErrorResult).reason).toEqual('redirect-loop')
    expect(result[1].host).toEqual('other.com')
    expect(result[1].url.toString()).toEqual('http://other.com/2')
    expect(result[1].parent).toEqual(result[0])
  })

  it('does not attempt to scan a media item', async () => {
    const uut = instance()

    const resp = new Response('', {
      status: 200,
      statusText: 'ok',
      headers: {
        'content-type': 'video/avi',
      },
    })
    Object.assign(resp, {
      json: () => { throw new Error(`attempted to read json!`) },
      text: () => { throw new Error(`attempted to read text!`) },
      blob: () => { throw new Error(`attempted to read blob!`) },
    })
    fetchMockSandbox.getOnce('http://other.com/some-video', resp)

    // act
    await uut.writeAsync({ url: parseUrl('http://other.com/some-video') })
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect(result[0].type).toEqual('success')
    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('other.com')
    expect(result[0].url.toString()).toEqual('http://other.com/some-video')
  })

  it('sets referrer header', async () => {
    // referer header only works in node... not sure why
    if ((global as any).window) {
      return
    }

    const uut = instance({ forceGet: true })

    fetchMockSandbox.getOnce('http://other.com', 200)

    // act
    await uut.writeAsync({
      url: parseUrl('http://other.com'),
      parent: {
        url: parseUrl('http://parent-url.com'),
        host: 'parent-url.com',
        method: 'GET',
      },
    } as Chunk)
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect((result[0] as SuccessResult).method).toEqual('GET')

    const call = fetchMockSandbox.lastCall(/other\.com/)!
    const headers = call[1]!.headers as any
    expect(headers.Referer).toEqual(['http://parent-url.com/'])
  })

  it('does not set referrer when downgrading from HTTPS', async () => {
    const uut = instance({ forceGet: true })

    fetchMockSandbox.getOnce('http://other.com', 200)

    // act
    await uut.writeAsync({
      url: parseUrl('http://other.com'),
      parent: {
        url: parseUrl('https://parent-https-url.com'),
        host: 'parent-url.com',
        method: 'GET',
      },
    } as Chunk)
    await uut.endAsync()
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect((result[0] as SuccessResult).method).toEqual('GET')

    const call = fetchMockSandbox.lastCall(/other\.com/)!
    const headers = call[1]!.headers as any
    expect(headers.Referer).toBeFalsy()

  })
})

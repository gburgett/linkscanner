import { onceAsync } from 'async-toolbox/events'
import { collect, toReadable } from 'async-toolbox/stream'

import fetchMock from 'fetch-mock'


import { BuildPipeline, BuildPipelineOptions } from './build_pipeline'
import { Result, SuccessResult } from './model'
import { Options } from './util'

// tslint:disable: no-unused-expression

describe('BuildPipeline', () => {
  let options: Options<BuildPipelineOptions>
  let fetchMockSandbox: fetchMock.FetchMockSandbox
  beforeEach(() => {
    fetchMock.reset()
    fetchMockSandbox = fetchMock.sandbox()
    options = {
      fetch: {
        fetch: fetchMockSandbox,
        Request: fetchMock.config.Request!,
      },
      logger: console,
    }

    fetchMockSandbox.getOnce('http://test.com/robots.txt', 404)
    fetchMockSandbox.getOnce('http://other.com/robots.txt', `
User-agent: *
Crawl-delay: 1
Disallow: /disallowed/*.php
Allow: *`)
  })

  it('fetches a single URL', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body></body></html>`,
      })

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, options)

    // act
    const result: Result[] = await collect(uut)

    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].host).toEqual('test.com')
    expect(result[0].url.toString()).toEqual('http://test.com/testpage')
  })

  it('recurses into other URLs found on page', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, options)

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(2)
    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('other.com')
    expect(result[1].url.toString()).toEqual('http://other.com/')
    expect(result[1].parent!.url.toString()).toEqual('http://test.com/testpage')
  })

  it('deep recurses for same host', async () => {
    fetchMockSandbox.get('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="./relative/link">Relative Page</a></body></html>`,
      })
    fetchMockSandbox.getOnce('http://test.com/testpage/relative/link',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: true,
    })

    const urls = [] as any[]
    uut.on('url', (u) => urls.push(u))

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(3)
    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('test.com')
    expect(result[1].url.toString()).toEqual('http://test.com/testpage/relative/link')
    expect(result[1].parent!.url.toString()).toEqual('http://test.com/testpage/')

    expect((result[2] as SuccessResult).status).toEqual(200)
    expect(result[2].host).toEqual('other.com')
    expect(result[2].url.toString()).toEqual('http://other.com/')
    expect(result[2].parent!.url.toString()).toEqual('http://test.com/testpage/relative/link')

    expect(urls[0].url.toString()).toEqual('http://test.com/testpage/')
    expect(urls[1].url.toString()).toEqual('http://test.com/testpage/relative/link')
    expect(urls[2].url.toString()).toEqual('http://other.com/')
    expect(urls.length).toEqual(3)
  })

  it('does not deep recurse when recursive: false', async () => {
    fetchMockSandbox.get('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="./relative/link">Relative Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://test.com/testpage/relative/link',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: false,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(2)
    expect(result[0].url.toString()).toEqual('http://test.com/testpage/')
    expect(result[1].url.toString()).toEqual('http://test.com/testpage/relative/link')
  })

  it('Heads same-host URLs on recursive page when recursive: 2', async () => {
    fetchMockSandbox.get('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="./relative/link">Relative Page</a></body></html>`,
      })
    fetchMockSandbox.getOnce('http://test.com/testpage/relative/link',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://test.com/testpage2">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://test.com/testpage2', 200)

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: 2,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(3)
    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('test.com')
    expect(result[1].url.toString()).toEqual('http://test.com/testpage/relative/link')
    expect(result[1].parent!.url.toString()).toEqual('http://test.com/testpage/')

    expect((result[2] as SuccessResult).status).toEqual(200)
    expect(result[2].host).toEqual('test.com')
    expect(result[2].url.toString()).toEqual('http://test.com/testpage2')
    expect(result[2].parent!.url.toString()).toEqual('http://test.com/testpage/relative/link')
  })

  it('Heads same-host URLs found on page when recursive: 1', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://test.com/testpage2">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://test.com/testpage2', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: 1,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(2)
    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('test.com')
    expect(result[1].url.toString()).toEqual('http://test.com/testpage2')
    expect(result[1].parent!.url.toString()).toEqual('http://test.com/testpage')
  })

  it('Heads same-host images and PDFs found on page', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body>
          <a href="http://test.com/testpdf.pdf">some pdf</a>
          <a href="http://test.com/testimg.png">some image</a>
        </body></html>`,
      })
    fetchMockSandbox.headOnce('http://test.com/testpdf.pdf', 200)
    fetchMockSandbox.headOnce('http://test.com/testimg.png', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: true,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(3)

    expect((result[1] as SuccessResult).status).toEqual(200)
    expect(result[1].host).toEqual('test.com')
    expect(result[1].url.toString()).toEqual('http://test.com/testpdf.pdf')
    expect(result[1].parent!.url.toString()).toEqual('http://test.com/testpage')

    expect((result[2] as SuccessResult).status).toEqual(200)
    expect(result[2].host).toEqual('test.com')
    expect(result[2].url.toString()).toEqual('http://test.com/testimg.png')
    expect(result[2].parent!.url.toString()).toEqual('http://test.com/testpage')
  })

  it('does not simple recurse when recursive: 0 and forceGet', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: 0,
      forceGet: true,
    })

    const urls = [] as any[]
    uut.on('url', (u) => urls.push(u))

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(1)
    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].url.toString()).toEqual('http://test.com/testpage')

    expect(urls[0].url.toString()).toEqual('http://test.com/testpage')
    expect(urls.length).toEqual(1)
  })

  it('HEADs a source URL when recursive: 0', async () => {
    fetchMockSandbox.head('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
      })

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: 0,
    })

    const urls = [] as any[]
    uut.on('url', (u) => urls.push(u))

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(1)
    expect((result[0] as SuccessResult).status).toEqual(200)
    expect(result[0].url.toString()).toEqual('http://test.com/testpage')

    expect(urls[0].url.toString()).toEqual('http://test.com/testpage')
    expect(urls.length).toEqual(1)
  })

  it('skips disallowed URLs', async () => {
    fetchMockSandbox.get('http://test.com/testpage/',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com/disallowed/index.php">Relative Page</a></body></html>`,
      })

    const source = toReadable(['http://test.com/testpage/'])

    const uut = BuildPipeline(source, {
      ...options,
      recursive: false,
    })

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(2)
    expect(result[0].url.toString()).toEqual('http://test.com/testpage/')
    expect(result[1].url.toString()).toEqual('http://other.com/disallowed/index.php')
    expect(result[1].type).toEqual('skip')
  })

  it('emits URL events on resulting stream', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, options)

    // act
    const urls: any[] = []
    uut.on('url', (value) => {
      urls.push(value)
    })

    // attach to data so that the stream flows
    uut.on('data', () => {return})
    await onceAsync(uut, 'end')

    expect(urls.length).toEqual(2)
    expect(urls[0].url.toString()).toEqual('http://test.com/testpage')
    expect(urls[1].url.toString()).toEqual('http://other.com/')
  })

  it('emits fetch events on resulting stream', async () => {
    fetchMockSandbox.get('http://test.com/testpage',
      {
        status: 200,
        headers: {
          'content-type': 'text/html; charset: utf-8',
        },
        body: `<html><body><a href="http://other.com">Other Page</a></body></html>`,
      })
    fetchMockSandbox.headOnce('http://other.com', 200)

    const source = toReadable(['http://test.com/testpage'])

    const uut = BuildPipeline(source, options)

    // act
    const urls: any[] = []
    uut.on('fetch', (value) => {
      urls.push(value)
    })

    // attach to data so that the stream flows
    uut.on('data', () => {return})
    await onceAsync(uut, 'end')

    expect(urls.length).toEqual(2)
    expect(urls[0].url.toString()).toEqual('http://test.com/testpage')
    expect(urls[1].url.toString()).toEqual('http://other.com/')
  })

  it('forwards errors to the results stream', async () => {
    const source = toReadable(['some invalid URL'])

    const uut = BuildPipeline(source, options)

    // act
    const errors: any[] = []
    uut.on('error', (e) => {
      errors.push(e)
    })

    // attach to data so that the stream flows
    uut.on('data', () => {return})
    let err: Error
    try {
      await onceAsync(uut, 'end')
      throw new Error('Should not successfully end')
    } catch (ex) {
      err = ex
    }

    const expectedMsg = 'Unable to parse URL \'some invalid URL\''
    expect(err).toBeTruthy()
    expect(err.message).toContain(expectedMsg)

    expect(errors.length).toEqual(1)
    expect(errors[0].message).toContain(expectedMsg)
  })

  it('doesnt scan HTML when --only=json', async () => {
    fetchMockSandbox.get('http://test.com/testapi.json',
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
        body: `{ "link": "/testpage.htm" }`,
      })
    fetchMockSandbox.headOnce('http://test.com/testpage.htm', 200)

    const source = toReadable(['http://test.com/testapi.json'])

    const uut = BuildPipeline(source, options)

    // act
    const result: Result[] = await collect(uut)

    expect(result.length).toEqual(2)
    expect(result[0].url.toString()).toEqual('http://test.com/testapi.json')
    expect(result[1].url.toString()).toEqual('http://test.com/testpage.htm')
    expect((result[1] as SuccessResult).method).toEqual('HEAD')
  })
})

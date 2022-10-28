
import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SkippedResult, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { JsonFormatter } from './json'

// tslint:disable: max-line-length

describe('Json formatter', () => {
  it('prints a json line', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new JsonFormatter({
      logger: logger as unknown as Logger,
    })
    const result: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
      headers: {},
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(JSON.parse(messages[0])).toEqual({
      responseCode: 200,
      responseCodeEffective: 200,
      url: 'http://test.com/#',
      urlEffective: 'http://test.com/#',
      parentUrl: undefined,
      host: 'test.com',
      hostEffective: 'test.com',
      numRedirects: 0,
      timeTotal: 123,
      httpMethod: 'GET',
      contentType: 'text/html'
    })
    expect(messages.length).toEqual(1)
  })

  it('merges several redirects', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new JsonFormatter({
      logger: logger as unknown as Logger,
    })
    const top: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [parseUrl('http://test.com/r1')],
      headers: {},
    }

    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: top, method: 'GET', contentType: '', host: 'test.com', links: [], headers: {} },
    ]
    redirects.push({ type: 'success', status: 302, ms: 1, url: parseUrl('http://test.com/r2'), parent: redirects[0], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})
    redirects.push({ type: 'success', status: 307, ms: 1, url: parseUrl('http://test.com/r3'), parent: redirects[1], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})

    const final: SuccessResult = {
      type: 'success',
      status: 204,
      method: 'GET',
      url: parseUrl('http://test.com/final'),
      parent: redirects[2],
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      leaf: true,
      links: [],
      headers: {},
    }

    // act
    instance.write(top)
    redirects.forEach((r) => instance.write(r))
    instance.write(final)
    await instance.endAsync()

    // assert
    // tslint:disable-next-line: max-line-length
    expect(JSON.parse(messages[0])).toEqual({
      responseCode: 200,
      responseCodeEffective: 200,
      url: 'http://test.com/#',
      urlEffective: 'http://test.com/#',
      host: 'test.com',
      hostEffective: 'test.com',
      numRedirects: 0,
      timeTotal: 123,
      httpMethod: 'GET',
      contentType: 'text/html'
    })
    expect(JSON.parse(messages[1])).toEqual({
      responseCode: 301,
      responseCodeEffective: 204,
      url: 'http://test.com/r1',
      urlEffective: 'http://test.com/final',
      parentUrl: 'http://test.com/#',
      host: 'test.com',
      hostEffective: 'test.com',
      numRedirects: 3,
      timeTotal: 126,
      httpMethod: 'GET',
      contentType: 'text/html'
    })
    expect(messages.length).toEqual(2)
  })

  it('ignores skip results', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new JsonFormatter({
      logger: logger as unknown as Logger,
    })
    const result: SkippedResult = {
      type: 'skip',
      url: parseUrl('http://test.com/#'),
      host: 'test.com',
      leaf: true,
      reason: 'external',
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages.length).toEqual(0)
  })

  it('writes error results', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new JsonFormatter({
      logger: logger as unknown as Logger,
    })
    const result: ErrorResult = {
      type: 'error',
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      host: 'test.com',
      leaf: true,
      error: new Error('Test Error!'),
      status: undefined,
      reason: 'error',
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(JSON.parse(messages[0])).toEqual({
      responseCode: undefined,
      responseCodeEffective: undefined,
      url: 'http://test.com/#',
      urlEffective: 'http://test.com/#',
      host: 'test.com',
      hostEffective: 'test.com',
      numRedirects: 0,
      timeTotal: undefined,
      httpMethod: 'GET',
      errorReason: 'error',
      errorMessage: 'Test Error!'
    })
    expect(messages.length).toEqual(1)
  })

  it('does not orphan redirects where we already hit the destination', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new JsonFormatter({
      logger: logger as unknown as Logger,
    })
    const page: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/some-page'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
      headers: {},
    }

    // tslint:disable: max-line-length
    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: undefined, method: 'GET', contentType: '', host: 'test.com', links: [],
        headers: {Location: 'http://test.com/some-page'} },
    ]
    instance.write(page) // we've already written this hit once

    // act
    redirects.forEach((r) => instance.write(r))
    await instance.endAsync()


    expect(JSON.parse(messages[1])).toEqual({
      responseCode: 301,
      responseCodeEffective: 200,
      url: 'http://test.com/r1',
      urlEffective: 'http://test.com/some-page',
      parentUrl: 'http://test.com/r1',
      host: 'test.com',
      hostEffective: 'test.com',
      numRedirects: 1,
      timeTotal: 124,
      httpMethod: 'GET',
      contentType: 'text/html'
    })
    expect(messages.length).toEqual(2)
  })
})

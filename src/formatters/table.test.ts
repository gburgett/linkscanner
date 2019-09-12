import { expect } from 'chai'
import {} from 'mocha'

import { } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { TableFormatter } from './table'

// tslint:disable: max-line-length

describe('TableFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
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
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(2)
    expect(messages[0]).to.eq('status\tmethod\turl                                                                             \tcontentType     \t  ms\tparent                                                                          \terror')
    expect(messages[1]).to.deep.eq(`200   \tGET   \t${'http://test.com/#'.padEnd(80)}\ttext/html       \t 123\t                                                                                \t     `)
  })

  it('pads appropriately for error results', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
      logger: logger as unknown as Logger,
    })

    const r0: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
    }
    const result: ErrorResult = {
      type: 'error',
      error: new Error('test'),
      reason: 'error',
      status: undefined,
      method: 'GET',
      url: parseUrl('http://test.com/2'),
      parent: r0,
      host: 'test.com',
      leaf: true,
    }

    // act
    instance.write(result)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(2)
    expect(messages[1]).to.deep.eq(`      \tGET   \t${'http://test.com/2'.padEnd(80)}\t                \t    ` +
      `\thttp://test.com/#                                                               \tError: test`)
  })

  it('logs verbose output to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
      logger: logger as unknown as Logger,
      verbose: true,
    })

    // act
    const r0: SuccessResult = {
      type: 'success',
      status: 200,
      method: 'GET',
      url: parseUrl('http://test.com/#'),
      contentType: 'text/html',
      host: 'test.com',
      ms: 123,
      links: [],
    }
    instance.write(r0)

    instance.write({
      type: 'error',
      error: new Error('test'),
      reason: 'error',
      status: undefined,
      method: 'GET',
      url: parseUrl('http://test.com/2'),
      parent: r0,
      host: 'test.com',
      ms: 456,
      leaf: true,
    } as ErrorResult)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(3)
    // tslint:disable: max-line-length
    expect(messages[0]).to.eq('status\tmethod\turl                                                                             \tcontentType     \t  ms\tparent                                                                          \terror')
    expect(messages[1]).to.eq('200   \tGET   \thttp://test.com/#                                                               \ttext/html       \t 123\t                                                                                \t     ')
    expect(messages[2]).to.eq('      \tGET   \thttp://test.com/2                                                               \t                \t 456\thttp://test.com/#                                                               \tError: test')
  })

  it('merges several redirects', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new TableFormatter({
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
    }

    // tslint:disable: max-line-length
    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: top, method: 'GET', contentType: '', host: 'test.com', links: [] },
    ]
    redirects.push({ type: 'success', status: 302, ms: 1, url: parseUrl('http://test.com/r2'), parent: redirects[0], method: 'GET', contentType: '', host: 'test.com', links: []})
    redirects.push({ type: 'success', status: 307, ms: 1, url: parseUrl('http://test.com/r3'), parent: redirects[1], method: 'GET', contentType: '', host: 'test.com', links: []})
    // tslint:disable: max-line-length

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
    }

    // act
    instance.write(top)
    redirects.forEach((r) => instance.write(r))
    instance.write(final)
    await instance.endAsync()

    // assert
    expect(messages.length).to.eq(3)
    // tslint:disable-next-line: max-line-length
    expect(messages[1]).to.deep.eq(`200   \tGET   \t${'http://test.com/#'.padEnd(80)}\ttext/html       \t 123\t                                                                                \t     `)
    expect(messages[2]).to.deep.eq(`204   \tGET   \t${'http://test.com/r1'.padEnd(80)}\ttext/html       \t 126\thttp://test.com/#                                                               \t     `)
  })
})

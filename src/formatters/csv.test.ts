
import { endAsync } from 'async-toolbox/stream'
import { Logger } from '../logger'
import { ErrorResult, Result, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { CsvFormatter } from './csv'

// tslint:disable: max-line-length

describe('CsvFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new CsvFormatter({
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
    await endAsync(instance)

    // assert
    expect(messages.length).toEqual(2)
    expect(messages[0]).toEqual('status,method,url,contentType,ms,parent,error')
    expect(messages[1]).toEqual('200,GET,http://test.com/#,text/html,123,,')
  })


  it('merges several redirects', async () => {
    const messages: string[] = []
    const logger = { log: (msg: string) => messages.push(msg) }

    const instance = new CsvFormatter({
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

    // tslint:disable: max-line-length
    const redirects: SuccessResult[] = [
      { type: 'success', status: 301, ms: 1, url: parseUrl('http://test.com/r1'), parent: top, method: 'GET', contentType: '', host: 'test.com', links: [], headers: {} },
    ]
    redirects.push({ type: 'success', status: 302, ms: 1, url: parseUrl('http://test.com/r2'), parent: redirects[0], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})
    redirects.push({ type: 'success', status: 307, ms: 1, url: parseUrl('http://test.com/r3'), parent: redirects[1], method: 'GET', contentType: '', host: 'test.com', links: [], headers: {}})
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
      headers: {},
    }

    // act
    instance.write(top)
    redirects.forEach((r) => instance.write(r))
    instance.write(final)
    await endAsync(instance)

    // assert
    expect(messages.length).toEqual(3)
    expect(messages[2]).toEqual('204,GET,http://test.com/r1,text/html,126,http://test.com/#,')
  })
})

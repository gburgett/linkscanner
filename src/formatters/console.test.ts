import {} from 'async-toolbox/events'
import { expect } from 'chai'
import {} from 'mocha'

import { ErrorResult, Result, SkippedResult, SuccessResult } from '../model'
import { parseUrl } from '../url'
import { ConsoleFormatter } from './console'

describe('ConsoleFormatter', () => {
  it('logs the result to the console', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const successResult: SuccessResult = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      host: 'www.test.com',
      status: 200,
      ms: 123,
      contentType: 'text/html',
      links: [parseUrl('http://www.test.com/asdf')],
      headers: {},
    }
    instance.write(successResult)

    const skippedResult: SkippedResult = {
      url: parseUrl('http://www.test.com/asdf'),
      type: 'skip',
      reason: 'disallowed',
      leaf: true,
      host: 'www.test.com',
      parent: successResult,
    }
    instance.write(skippedResult)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(1)
    expect(messages[0]).to.include('200')
    expect(messages[0]).to.include('GET')
    expect(messages[0]).to.include('http://www.test.com')
    expect(messages[0]).to.include('1 links found')
    expect(messages[0]).to.include('1 not checked')
    expect(messages[0]).to.not.include('0 broken')
  })

  it('logs error summary at end', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const notFoundResult: SuccessResult = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com/notfound'),
      host: 'www.test.com',
      status: 404,
      ms: 123,
      links: [parseUrl('http://www.test.com/asdf')],
      contentType: '',
      headers: {},
    }
    instance.write(notFoundResult)

    const errorResult: ErrorResult = {
      url: parseUrl('http://www.test.com/asdf'),
      type: 'error',
      reason: 'error',
      status: undefined,
      leaf: true,
      host: 'www.test.com',
      error: new Error('test'),
      method: 'GET',
      parent: {
        url: parseUrl('http://www.test.com/good'),
        links: [parseUrl('http://www.test.com/asdf')],
        host: 'www.test.com',
        contentType: 'text/html',
        method: 'GET',
        ms: 123,
        status: 200,
        type: 'success',
        headers: {},
      },
    }
    instance.write(errorResult)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(5)
    expect(messages[2]).to.include('The following URLs are broken')
    expect(messages[3]).to.include('http://www.test.com/notfound')
    expect(messages[4]).to.include('http://www.test.com/asdf')
    expect(messages[4]).to.include('found on http://www.test.com/good')
  })

  it('does not log leaf nodes', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const parent: Result = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      host: 'www.test.com',
      contentType: 'text/html',
      status: 200,
      ms: 123,
      links: [parseUrl('http://www.test2.com')],
      headers: {},
    }

    instance.write(parent)

    instance.write({
      type: 'success',
      leaf: true,
      parent,
      method: 'HEAD',
      url: parseUrl('http://www.test2.com'),
      contentType: 'text/html',
      host: 'www.test.com',
      status: 500,
      ms: 123,
      links: [],
      headers: {},
    } as SuccessResult)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(3)
    expect(messages[0]).to.include('200')
    expect(messages[0]).to.include('GET')
    expect(messages[0]).to.include('http://www.test.com')
    expect(messages[0]).to.include('1 links found')
    expect(messages[0]).to.include('1 broken')
  })

  it('logs recursive nodes', async () => {
    const messages: string[] = []
    const instance = new ConsoleFormatter({
      logger: {
        ...console,
        log: (msg: string) => messages.push(msg),
      } as any,
    })

    const parent: Result = {
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test.com'),
      contentType: 'text/html',
      host: 'www.test.com',
      status: 200,
      ms: 123,
      links: [parseUrl('http://www.test2.com')],
      headers: {},
    }
    const child1: Result = {
      parent,
      type: 'success',
      method: 'GET',
      url: parseUrl('http://www.test2.com'),
      contentType: 'text/html',
      host: 'www.test2.com',
      status: 201,
      ms: 123,
      links: [parseUrl('http://www.test3.com')],
      headers: {},
    }
    const child2: Result = {
      type: 'success',
      leaf: true,
      parent: child1,
      method: 'HEAD',
      url: parseUrl('http://www.test3.com'),
      contentType: 'text/html',
      host: 'www.test3.com',
      status: 500,
      ms: 123,
      links: [],
      headers: {},
    }

    instance.write(parent)
    instance.write(child1)
    instance.write(child2)
    instance.end()

    await instance.onceAsync('finish')

    expect(messages.length).to.eq(4)
    expect(messages[1]).to.include('201')
    expect(messages[1]).to.include('GET')
    expect(messages[1]).to.include('http://www.test2.com')
    expect(messages[1]).to.include('1 links found')
    expect(messages[1]).to.include('1 broken')
  })
})

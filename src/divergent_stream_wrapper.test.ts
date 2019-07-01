import { expect } from 'chai'
import { } from 'mocha'

import { wait, waitUntil } from 'async-toolbox'
import {  ParallelTransform } from 'async-toolbox/stream'
import { DivergentStreamWrapper } from './divergent_stream_wrapper'
import { Chunk } from './model'
import { EOF } from './reentry'
import { parseUrl } from './url'

// tslint:disable:no-unused-expression

describe('DivergentStreamWrapper', () => {

  context('multiple streams', () => {
    it('waits for all streams to drain on an EOF', async () => {
      const streams: { [hash: string]: Array<(result?: any) => void> } = {}

      const collected = [] as any[]
      const instance = new DivergentStreamWrapper({
        objectMode: true,
        hashChunk: (chunk: Chunk) => {
          return chunk.url.hostname
        },
        createStream: (hash) => {
          return new ParallelTransform({
            objectMode: true,
            highWaterMark: 1,
            maxParallelChunks: 2,
            async transformAsync(chunk, encoding) {
              streams[hash] = streams[hash] || []
              const result = await new Promise<any>((resolve) =>
                streams[hash].push(resolve),
              )
              if (result) {
                this.push(result)
              }
            },
          })
        },
      })
      instance.on('data', (data) => collected.push(data))

      // two different streams
      instance.write({ url: parseUrl('http://test.com') } as Chunk)
      instance.write({ url: parseUrl('http://test2.com') } as Chunk)
      await waitUntil(() => Object.keys(streams).length == 2)

      // act - write an EOF
      const theEOF = new EOF(2)
      instance.write(theEOF)

      // first stream finishes it's fetch
      streams['test.com'][0]('result1')

      // the stream wrapper should hold the EOF because the other stream isn't done
      await wait(10)
      expect(collected).to.deep.eq(['result1'])

      // second stream finishes it's fetch
      streams['test2.com'][0]('result2')
      await wait(10)

      // now the stream wrapper should send the EOF
      expect(collected).to.deep.eq(['result1', 'result2', theEOF])
    })

    it('can recreate the streams after an EOF', async () => {
      const streams: { [hash: string]: Array<(result?: any) => void> } = {}

      const collected = [] as any[]
      const instance = new DivergentStreamWrapper({
        objectMode: true,
        hashChunk: (chunk: Chunk) => {
          return chunk.url.hostname
        },
        createStream: (hash) => {
          return new ParallelTransform({
            objectMode: true,
            highWaterMark: 1,
            maxParallelChunks: 2,
            async transformAsync(chunk, encoding) {
              streams[hash] = streams[hash] || []
              const result = await new Promise<any>((resolve) =>
                streams[hash].push(resolve),
              )
              if (result) {
                this.push(result)
              }
            },
          })
        },
      })
      instance.on('data', (data) => collected.push(data))

      // two different streams
      instance.write({ url: parseUrl('http://test.com') } as Chunk)
      instance.write({ url: parseUrl('http://test2.com') } as Chunk)
      await waitUntil(() => Object.keys(streams).length == 2)

      // write an EOF
      const theEOF = new EOF(2)
      instance.write(theEOF)
      // flush the streams
      streams['test.com'][0]('result1')
      streams['test2.com'][0]('result2')
      await wait(10)

      // write again
      instance.write({ url: parseUrl('http://test.com/url3') } as Chunk)
      instance.write({ url: parseUrl('http://test2.com/url4') } as Chunk)
      await waitUntil(() => Object.keys(streams).length == 2)
      await wait(10)
      streams['test.com'][1]('result3')
      streams['test2.com'][1]('result4')
      await wait(10)
      expect(collected).to.deep.eq(['result1', 'result2', theEOF, 'result3', 'result4'])
    })
  })
})

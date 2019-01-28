import test from 'ava'

import { Writable } from 'stream'
import './async_writer'

// tslint:disable:no-unused-expression

test('writes chunks to the stream', async (t) => {
  const chunks = [] as string[]
  const stream = new Writable({
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      setTimeout(() => cb(), 1)
      return true
    },
  })

  await stream.writeAsync('1')
  await stream.writeAsync('2')
  await stream.writeAsync('3')

  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2', '3'])
})

test('rejects the promise if write sends an error', async (t) => {
  const stream = new Writable({
    write: (chunk, encoding, cb) => {
      setTimeout(() => cb(new Error('test err')), 1)
      return true
    },
  })

  let caught: any
  try {
    await stream.writeAsync('1')
  } catch (e) {
    // expected
    caught = e
  }

  t.truthy(caught)
})

test('waits for the drain event if draining', async (t) => {
  const chunks = [] as string[]
  const callbacks = [] as Array<(error?: Error) => void>
  const stream = new Writable({
    highWaterMark: 0,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      callbacks.push(cb)
      return false
    },
  })

  stream.writeAsync('1')
  const p2 = stream.writeAsync('2')
  let p2done = false
  let p2err: any = null
  p2.then(() => p2done = true, (err) => p2err = err)

  await wait(1)

  t.deepEqual(chunks.map((c) => c.toString()), ['1'])
  t.false(p2done)
  t.falsy(p2err)
})

test('recursively writes the chunk after drain event', async (t) => {
  const chunks = [] as string[]
  const callbacks = [] as Array<(error?: Error) => void>
  const stream = new Writable({
    highWaterMark: 0,
    write: (chunk, encoding, cb) => {
      chunks.push(chunk as string)
      callbacks.push(cb)
      return false
    },
  })

  const p1 = stream.writeAsync('1')
  const p2 = stream.writeAsync('2')
  const p3 = stream.writeAsync('3')
  let p3done = false
  let p3err: any = null
  p3.then(() => p3done = true, (err) => p3err = err)

  // finish write '1'
  callbacks.shift()()
  await p1
  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2'])

  // finish write '2'
  callbacks.shift()()
  await p2

  t.false(p3done)
  t.falsy(p3err)

  // finish write '3'
  callbacks.shift()()
  await p3

  t.deepEqual(chunks.map((c) => c.toString()), ['1', '2', '3'])
})

function wait(ms = 1): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

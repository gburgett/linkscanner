import test from 'ava'

import { toReadable } from '.'
import { wait } from '..'
import '../events'
import { ParallelWritable } from './parallel_writable'

test('pipes from readable', async (t) => {
  const chunks: string[] = []

  const source = toReadable(upTo(1000))

  const instance = new ParallelWritable({
    objectMode: true,
    maxParallelChunks: 10,
    writeAsync: async (chunk, encoding) => {
      await wait(Math.random() * 10)
      chunks.push(chunk)
    },
  })

  const p = instance.onceAsync('finish')
  source.pipe(instance)
  await p

  t.deepEqual(chunks.length, 1000)
  // should be written out of order since we are awaiting a random number of seconds
  t.notDeepEqual(chunks, upTo(1000))
})

function upTo(n: number): string[] {
  const res: string[] = []
  for (let i = 0; i < n; i++) {
    res.push(i.toString())
  }
  return res
}

import test from 'ava'
import {wait} from '../.'
import SequentialAsyncList from './sequential-async-list'

test('flatMap returns a SequentialAsyncList', (t) => {
  const subject = SequentialAsyncList.lift([1])

  const result = subject.flatMap(async (x) => x + 1)

  t.true(result instanceof SequentialAsyncList)
})

test('flatMap executes each promise in sequence', async (t) => {
  const sequence = [] as number[]
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const subject = SequentialAsyncList.lift(values)

  const before = Date.now()
  const result = subject.flatMap(async (x) => {
    await wait(10 - x)
    sequence.push(x)
    return x * 10
  }).flatMap(async (x2) => {
    await wait(100 - x2)
    sequence.push(x2)
  })

  await result
  const after = Date.now()

  t.deepEqual(sequence, [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
  ])
  t.true(after - before > 605) // 100 + 90 + 80 + ...
})

test('can flatMap to an array', async (t) => {
    const values = [0, 1, 2]
    const subject = SequentialAsyncList.lift(values)
    const result = subject.flatMap(async (x) => {
      return upTo(x)
    })

    t.deepEqual(await result, [
      0,
      0, 1,
      0, 1, 2,
    ])
  })

test('can flatMap to an array of promises of arrays', async (t) => {
    const values = [1, 2, 3]
    const subject = SequentialAsyncList.lift(values)
    const result = subject.flatMap((x) => {
      return upTo(x).map(async (x2) => (
        upTo(x2)
      ))
    })

    t.deepEqual(await result, [
      0,
      0, 1,
      0,
      0, 1,
      0, 1, 2,
      0,
      0, 1,
      0, 1, 2,
      0, 1, 2, 3,
    ])
  })

test('reduce reduces in sequence', async (t) => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const subject = SequentialAsyncList.lift(values)

  const result = await subject.reduce(async (current, x) => {
    await wait(10 - x)
    return `${current}-${x}`
  }, '|')

  t.true(result == '|-0-1-2-3-4-5-6-7-8-9')
})

test('all gets all results', async (t) => {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const subject = SequentialAsyncList.lift(values)

  const result = await subject.map((x) => x * 2)
  t.deepEqual(result, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18])
})

function upTo(n: number): number[] {
  const arr = [] as number[]
  for (let i = 0; i <= n; i++) {
    arr.push(i)
  }
  return arr
}

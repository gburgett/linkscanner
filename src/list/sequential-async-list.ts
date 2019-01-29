
type NotPromise<T> = Exclude<T, Promise<any>>
type BindResult<U> = Array<Promise<U[]>> | Array<Promise<U>> | Promise<U[]> | Promise<U>

/**
 * A Monadic representation of a list of promises, exposing functions to
 * do computations over the promises.  The key feature of this monad is that
 * the computations are run in-sequence and not in parallel, like you would
 * get with Promise.all(arr.map(async () => {}))
 */
export default class SequentialAsyncList<T> implements Promise<T[]> {
  /**
   * The constructor for a SequentialAsyncList.
   *
   * "Lifts" a set of items into the monadic space, so that they can be transformed.
   */
  public static lift<T>(items: T[] | Promise<T[]>) {
    if (Array.isArray(items)) {
      return new SequentialAsyncList<T>(Promise.resolve(items))
    }
    return new SequentialAsyncList<T>(items)
  }

  public readonly [Symbol.toStringTag]: string

  private constructor(private promises: Promise<T[]>) { }

  /**
   * Transform each item in the sequential list using an async function
   *
   * The function is only invoked after the promise from the previous function completes.
   */
  // monad bind
  public flatMap<U>(fn: (item: T, index?: number) => BindResult<U>): SequentialAsyncList<U> {
    return new SequentialAsyncList<U>(
      this._bind(fn),
    )
  }

  /**
   * Transform each item in the sequential list using an async function
   *
   * The function is only invoked after the previous promise in sequence completes.
   */
  public map<U>(fn: (item: T, index?: number) => U & NotPromise<U>): SequentialAsyncList<U> {
    return new SequentialAsyncList<U>(
      this._bind((item, idx) => Promise.resolve(fn(item, idx))),
    )
  }

  /**
   * Do something for each promise in sequence.  Returns a promise that can be awaited
   * to get the result.
   */
  public async forEach(fn: (item: T, index?: number) => Promise<any>): Promise<void> {
    await this._bind(fn)
  }

  /**
   * Reduce each item in the sequence.
   */
  public async reduce<U>(fn: (aggregate: U, current: T, index?: number) => Promise<U>, initial: U): Promise<U> {
    let aggregate = initial
    await this._bind(async (item, index) => (
      aggregate = await fn(aggregate, item, index)
    ))
    return aggregate
  }

  /**
   * Equivalent to Promise.all.then
   */
  public async then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
    return this.promises.then(onfulfilled, onrejected)
  }

  /**
   * Equivalent to Promise.all.catch
   */
  public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null)
    : Promise<T[] | TResult> {
      return this.promises.catch(onrejected)
  }

  /**
   * Monadic Bind function
   *
   * Applies the transform function after all promises from prior transformations have finished.
   */
  protected async _bind<U>(
    fn: (item: T, index?: number) => BindResult<U>,
    ): Promise<U[]> {

    const arr = (await this.promises)
    const result = [] as U[]
    for (let i = 0; i < arr.length; i++) {
      const output = fn(arr[i], i)
      // await all the resulting transformations before executing the next one
      if (Array.isArray(output)) {
        for (const v of output) {
          push(result, await v)
        }
      } else {
        push(result, await output)
      }
    }
    return result
  }
}

function push<U>(arr: U[], val: U | U[]) {
  if (Array.isArray(val)) {
    arr.push(...val)
  } else {
    arr.push(val)
  }
}

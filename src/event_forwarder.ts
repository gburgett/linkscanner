import { EventEmitter } from 'events'

import { Options } from './util'

// tslint:disable: array-type
type EventForwarderOptions = {
  /** Ignore these events */
  ignore: readonly (string | symbol)[],
} | {
  /** Only allow these events */
  only: readonly (string | symbol)[],
}
// tslint:enable: array-type

// tslint:disable-next-line: variable-name
export const StreamEvents: readonly string[] = ['data', 'error', 'end', 'unpipe', 'drain', 'close', 'finish']

export class EventForwarder {
  private readonly _eventNames = new Set<string | symbol>()
  private readonly _fromEmitters = new Set<EventEmitter>()
  private readonly _toEmitters = new Set<EventEmitter>()

  private readonly _options: {
    ignore?: Set<string | symbol>
    only?: Set<string | symbol>,
  }

  constructor(args?: Options<EventForwarderOptions>) {
    this._options = {}
    if (args) {
      if ('ignore' in args) {
        this._options.ignore = new Set(args.ignore)
      } else if ('only' in args) {
        this._options.only = new Set(args.only)
      }
    }
  }

  public to(emitter: EventEmitter): this {
    if (this._toEmitters.has(emitter)) {
      return this
    }
    this._toEmitters.add(emitter)

    const addMethods = [
      'addListener',
      'on',
      'once',
      'removeListener',
      'prependListener',
      'prependOnceListener',
    ] as const

    addMethods.forEach((methodName) => {
      const oldMethod = emitter[methodName]
      const self = this
      emitter[methodName] = function(event: string | symbol, listener: (...args: any[]) => void) {
        const ignore = self._options.ignore && self._options.ignore.has(event)
        const include = !self._options.only || self._options.only.has(event)
        if (include && !ignore) {
          // keep track of events that are being listened to on toEmitters
          if (!self._eventNames.has(event)) {
            self._registerEvent(event)
          }
        }

        return oldMethod.call(this, event, listener)
      }
    })
    return this
  }

  public from(emitter: EventEmitter): this {
    if (this._fromEmitters.has(emitter)) {
      return this
    }
    this._fromEmitters.add(emitter)

    this._eventNames.forEach((event) => {
      emitter.on(event, (...args) => {
        this._toEmitters.forEach((to) => {
          to.emit(event, ...args)
        })
      })
    })
    return this
  }

  private _registerEvent(event: string | symbol) {
    if (this._eventNames.has(event)) {
      return
    }
    this._eventNames.add(event)

    this._fromEmitters.forEach((from) => {
      from.on(event, (...args) => {
        this._toEmitters.forEach((to) => {
          to.emit(event, ...args)
        })
      })
    })
  }
}

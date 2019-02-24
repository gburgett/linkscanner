import {toReadable} from 'async-toolbox/stream'
import { Args } from '.'

export function loadSource(args: Args) {
  return toReadable([...args.source])
}

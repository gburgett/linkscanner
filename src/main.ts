import yargs from 'yargs'

import Run from '.'
import { debugLogger, defaultLogger } from './logger'

const argv = yargs
  .option('followRedirects', {
    alias: 'L',
    boolean: true,
  })
  .option('debug', {
    boolean: true,
    alias: 'd',
  })
  .option('verbose', {
    boolean: true,
    alias: 'v',
  })
  .option('recursive', {
    boolean: true,
    alias: 'r',
  })
  .option('exclude-external', {
    boolean: true,
    alias: 'e',
  })
  .option('formatter', {
    alias: 'f',
    choices: ['table'] as const,
  })
  .option('include', {
    alias: 'i',
    array: true,
    type: 'string',
    choices: ['a', 'link', 'img', 'script', 'form', 'iframe', 'all'],
  }).argv

const defaults = {
  logger: argv.debug ? debugLogger : defaultLogger,
}

Run({
  ...defaults,
  source: argv._,
  ...argv,
})
  .then(
    () => {
      defaults.logger.debug('done')
      process.exit(0)
    },
    (ex: any) => {
      // tslint:disable-next-line:no-console
      console.error(ex)
      process.exit(1)
    },
  )

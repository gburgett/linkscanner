import yargs, { boolean, describe } from 'yargs'

import chalk from 'chalk'
import Linkscanner, { runDefaults } from '.'
import { debugLogger, defaultLogger } from './logger'
import { assign } from './util'

const source: string[] = []
const argv = yargs
  .command('$0', 'Scans a web page for broken links')
  .example('$0 http://google.com', 'parses a[href] elements from google.com and checks all linked URLs')
  .option('followRedirects', {
    alias: 'L',
    description: 'Follow 301 & 302 redirects to their destination and report that result',
    boolean: true,
  })
  .option('debug', {
    boolean: true,
    description: 'Print additional debug logging to stderr',
    alias: 'd',
  })
  .option('verbose', {
    boolean: true,
    description: 'Print more information in the output results (formatter dependent)',
    alias: 'v',
  })
  .option('compact', {
    boolean: true,
    description: 'Print less information in the output results (formatter dependent)',
    alias: 'c',
  })
  .option('no-progress', {
    boolean: true,
    description: 'Do not display a progress bar',
    alias: 'P',
  })
  .option('progress', {
    boolean: true,
    description: 'display a progress bar',
    alias: 'p',
  })
  .option('total', {
    type: 'number',
    description: 'Give the progress bar a hint of approx how many URLs we will scan',
  })
  .option('ignore-robots-file', {
    boolean: true,
    description: 'Causes linkscanner to not respect robots file rules like disallow or crawl delay',
  })
  .option('recursive', {
    description: 'Recursively crawl all links on the same host',
    alias: 'r',
    coerce: (arg: any): boolean | number => {
      if (typeof arg == 'boolean') {
        return arg
      }
      if (typeof arg == 'number') {
        return arg
      }
      const num = parseInt(arg as string, 10)
      if (isNaN(num)) {
        // it's most likely a non-option argument, ex.
        // linkscanner -r https://www.google.com
        source.push(arg)
        return true
      }
      return num
    },
  })
  .option('XGET', {
    boolean: true,
    description: 'Always use a GET request when normally would use a HEAD',
  })
  .option('user-agent', {
    description: 'A user-agent string to be used when sending requests',
    type: 'string',
  })
  .option('max-concurrency', {
    description: 'The maximum number of simultaneous requests going out from your computer',
    type: 'number',
  })
  .option('timeout', {
    description: 'The maximum time to wait (in seconds) for a response before writing a timeout to the results',
    default: 10,
    type: 'number'
  })
  .option('headers', {
    alias: 'H',
    type: 'array',
  })
  .option('formatter', {
    alias: ['f', 'format'],
    description: 'Set the output formatter or format string.  \n' +
        'Options: console (default), table, json, csv, \n' +
        'or format string like "url: %{url_effective}"',
    type: 'string',
  })
  .option('skip-leaves', {
    boolean: true,
    description: 'Do not issue a HEAD request to leaf urls, simply print them (implies show-skipped)',
  })
  .option('exclude-external', {
    boolean: true,
    description: 'Do not test links that point to other hosts',
    alias: 'e',
  })
  .option('show-skipped', {
    description: 'Display skipped results in the formatted output',
    type: 'boolean',
    boolean: true,
  })
  .option('include', {
    alias: 'i',
    array: true,
    type: 'string',
    description: 'CSS Selector for which HTML elements to inspect.  \n' +
      'Examples: "a", "link[rel=\\"canonical\\"]", "img", "script", "form", "iframe", "all"',
  })
  .option('only', {
    array: true,
    type: 'string',
    description: 'A content type (or list of content types) to parse.  ' +
      'All other content types will not be scanned for links.',
  }).argv

const options = assign({},
  runDefaults,
  argv && ({
    progress: runDefaults.progress && !argv.debug,
    logger: argv.debug ? debugLogger : defaultLogger,
    forceGet: argv.XGET,
  }),
  argv)

if (options['skip-leaves'] && options['show-skipped'] == undefined) {
  options['show-skipped'] = options.showSkipped = true
}

// The timeout method in FetchInterfaceWrapper expects milliseconds
if (options.timeout) {
  options.timeout = options.timeout * 1000
}

let builder = Linkscanner.build(options)
  .addFormatter(options.formatter)

if (options.progress) {
  // Attach a progress bar
  builder = builder.progress({
    debug: argv.debug,
    total: argv.total,
  })
}
const logger = builder._options.logger
const linkscanner = builder.get()

let interrupted = false
process.on('SIGTSTP', () => {
  logger.debug('SIGTSTP')
  if (interrupted) {
    logger.error(chalk`{yellow Linkscanner resumed at ${new Date().toLocaleString()}}`)
    linkscanner.unsuspend()
    interrupted = false
    return
  }
  interrupted = true
  linkscanner.suspend()

  if (builder._progress) {
    builder._progress.clear()
  }

  logger.error(
    chalk`{yellow Linkscanner paused at ${new Date().toLocaleString()}}
  Press Ctrl-Z to resume, or Ctrl-Q to quit.
`)
})

linkscanner.run([...source, ...argv._.map(String)])
  .then(
    () => {
      logger.debug('exit')
      process.exit(0)
    },
    (ex: any) => {
      // tslint:disable-next-line:no-console
      logger.error(ex)
      process.exit(1)
    },
  )

let keepAliveTimeout: NodeJS.Timeout | undefined
keepAlive()
/**
 * This keeps the process running even when we're paused - since we're waiting
 * on a signal, all callbacks in the queue have executed.  In reality we have
 * an entire chain of callbacks waiting on the promise deep inside
 * FetchInterfaceWrapper.resume()
 */
function keepAlive() {
  if (builder._progress) {
    builder._progress.render()
  }

  if (keepAliveTimeout) { clearTimeout(keepAliveTimeout) }
  keepAliveTimeout = setTimeout(keepAlive, 1000)
}

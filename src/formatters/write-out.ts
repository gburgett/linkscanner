
import { defaultLogger, Logger } from '../logger'
import { assign, Options } from '../util'
import { JsonFormatter, JsonFormatterRow } from './json'

export interface WriteOutFormatterOptions {
  logger: Logger
  formatter: string
  showSkipped?: boolean
}

export class WriteOutFormatter extends JsonFormatter {

  public static readonly templateRegexp = /[$%]\{(?<key>[^}]*)\}/g
  protected readonly options: WriteOutFormatterOptions

  constructor(options?: Options<WriteOutFormatterOptions>) {
    super(options)

    const formatter = options && options.formatter
    if (!formatter) {
      throw new Error(`No format string given to WriteOutFormatter!`)
    }

    this.options = assign(
      { logger: defaultLogger },
      options,
      { formatter },
    )

    this.validateTemplate()
  }

  protected print(row: JsonFormatterRow) {
    this.options.logger.log(this.template(row))
  }

  private template(row: JsonFormatterRow) {
    const { formatter } = this.options

    const templateVariables: TemplateVariables = {
      ...row,
      response_code: row.responseCode,
      response_code_effective: row.responseCodeEffective,
      url: row.url,
      url_effective: row.urlEffective,
      parentUrl: row.parentUrl,
      parent_url: row.parentUrl,
      num_redirects: row.numRedirects,
      time_total: row.timeTotal,
      http_method: row.httpMethod,
      content_type: row.contentType,
      error_reason: row.errorReason,
      error_message: row.errorMessage
    }

    return formatter.replace(WriteOutFormatter.templateRegexp, (_, g) => {
      const value = templateVariables[g as keyof TemplateVariables]
      if (value === undefined || value === null) {
        return ''
      }
      return value.toString()
    })
  }

  private validateTemplate() {
    const {logger, formatter} = this.options
    let matchedOne = false
    let matches: RegExpExecArray | null
    // eslint-disable-next-line no-cond-assign
    while (matches = WriteOutFormatter.templateRegexp.exec(formatter)) {
      matchedOne = true
      if (matches.groups &&
          !templateKeys.includes(matches.groups.key as keyof TemplateVariables)) {
        logger.error(`Warning: Unknown write-out key '${matches[0]}'\n\tmust be one of ${templateKeys}`)
      }
    }
    if (!matchedOne) {
      logger.error(`Warning: write-out format contains no template variables`)
    }
  }
}

interface TemplateVariables extends JsonFormatterRow {
  response_code?: number,
  response_code_effective?: number,
  url: string,
  url_effective: string,
  parent_url?: string,
  num_redirects: number,
  time_total?: number,
  http_method?: string,
  content_type?: string
  error_reason?: string,
  error_message?: string
}

const templateKeys: Array<keyof TemplateVariables> = [
  'contentType',
  'content_type',
  'errorMessage',
  'error_message',
  'errorReason',
  'error_reason',
  'httpMethod',
  'http_method',
  'numRedirects',
  'num_redirects',
  'parentUrl',
  'parent_url',
  'responseCode',
  'response_code',
  'responseCodeEffective',
  'response_code_effective',
  'timeTotal',
  'time_total',
  'url',
  'urlEffective',
  'url_effective',
]

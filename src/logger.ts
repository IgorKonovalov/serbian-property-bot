type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

function formatMessage(
  level: LogLevel,
  module: string,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString()
  const ctx = context ? ' ' + JSON.stringify(context) : ''
  return `${timestamp} ${level.toUpperCase()} [${module}] ${message}${ctx}`
}

export interface Logger {
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

export function createLogger(module: string): Logger {
  return {
    info(message: string, context?: LogContext): void {
      console.log(formatMessage('info', module, message, context))
    },
    warn(message: string, context?: LogContext): void {
      console.warn(formatMessage('warn', module, message, context))
    },
    error(message: string, context?: LogContext): void {
      console.error(formatMessage('error', module, message, context))
    },
  }
}

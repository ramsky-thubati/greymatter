export type DomainErrorCode = 'not_found' | 'conflict' | 'invalid'

export class DomainError extends Error {
  code: DomainErrorCode
  details?: unknown

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.details = details
  }
}

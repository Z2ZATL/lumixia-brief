export function sanitizeTelemetryText(value: string): string {
  return value
    .replace(/[?#].*$/, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':id')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /\b(code|state|token|access[_-]?token|refresh[_-]?token|authorization|totp|otp|secret)=\S+/gi,
      '$1=[redacted]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]');
}

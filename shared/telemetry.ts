export function sanitizeTelemetryText(value: string): string {
  return value
    .replace(/[?#].*$/, '')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '/:id')
    .replace(/\b(code|state|token)=\S+/gi, '$1=[redacted]');
}

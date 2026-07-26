/** Remove credentials that MCLC includes in its full launch-arguments debug line. */
export function sanitizeMclcDebug(message: string): string {
  return message.replace(/(--accessToken\s+)\S+/g, '$1[redacted]')
}

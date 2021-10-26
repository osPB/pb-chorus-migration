/*
  Custom error definitions
*/
export class SilentError extends Error {
  constructor(message, ...rest) {
    super(`(Silent) ${message}`, ...rest);
  }
}

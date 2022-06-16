class CRSNotSupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "CRSNotSupportedError";
  }
}

export { CRSNotSupportedError };
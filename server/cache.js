export class MemoryCache {
  #value = null;
  #expiresAt = 0;

  get() {
    if (!this.#value) {
      return null;
    }

    return {
      value: this.#value,
      isFresh: Date.now() < this.#expiresAt
    };
  }

  set(value, ttlMs) {
    this.#value = value;
    this.#expiresAt = Date.now() + ttlMs;
    return value;
  }
}

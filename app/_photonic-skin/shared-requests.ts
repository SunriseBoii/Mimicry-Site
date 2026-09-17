interface Pending<T> {
  controller: AbortController;
  promise: Promise<T>;
  users: number;
  settled: boolean;
}

/** A click and speculative prewarm share work, but not each other's aborts. */
export class SharedRequests<T> {
  private readonly pending = new Map<string, Pending<T>>();

  run(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    let request = this.pending.get(key);
    if (!request) {
      const controller = new AbortController();
      request = { controller, users: 0, settled: false, promise: Promise.resolve().then(() => load(controller.signal)) };
      this.pending.set(key, request);
      const current = request;
      const settled = () => {
        current.settled = true;
        if (this.pending.get(key) === current) this.pending.delete(key);
      };
      current.promise.then(settled, settled);
    }
    const current = request;
    current.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", abort);
        current.users--;
        if (!current.users && !current.settled) {
          if (this.pending.get(key) === current) this.pending.delete(key);
          current.controller.abort();
        }
        return true;
      };
      const abort = () => { if (release()) reject(new DOMException("Aborted", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(value => { if (release()) resolve(value); }, error => { if (release()) reject(error); });
    });
  }
}

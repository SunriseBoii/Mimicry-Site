/** Latest-selection-wins gate for Video sandbox buffer loads. */

export function createLoadGate() {
  let latest = 0;
  return {
    next() {
      latest += 1;
      return latest;
    },
    isCurrent(id: number) {
      return id === latest;
    },
    get latest() {
      return latest;
    },
  };
}

export type SandboxLoadStatus = "idle" | "loading" | "ready" | "error";

export function loadingLabel(name: string) {
  return `Загружается ${name}…`;
}

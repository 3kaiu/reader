let toastCount = 0

export function genToastId() {
  toastCount = (toastCount + 1) % Number.MAX_SAFE_INTEGER
  return `toast-${toastCount}`
}

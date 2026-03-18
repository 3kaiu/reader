const encoder = new TextEncoder()
const decoder = new TextDecoder()

function normalizeBinaryPayload(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) {
    return payload
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload)
  }

  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
  }

  throw new Error('Unsupported binary payload')
}

export function encode(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

export function decode(payload: unknown): unknown {
  const binary = normalizeBinaryPayload(payload)
  return JSON.parse(decoder.decode(binary))
}

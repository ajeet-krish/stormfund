import type { TransactionRow, TransactionValueField, ValueField } from './types'

/**
 * Checksums for provenance verification (the honesty anchor of the
 * verification story), byte for byte identical to scripts/pipeline_lib.py:
 *
 * 1. Pair every provenance row id with its value in integer cents. The value
 *    column is announced by the aggregation text suffix "checksum value =
 *    <field>" (amountCents for transaction entities, balanceCents for the
 *    balance series and the debt horizon, monthlyIncomeCents for player
 *    entities).
 * 2. Sort the pairs ascending by row id (plain code point order; row ids are
 *    ASCII, see provenanceCheckSum for the ordering note).
 * 3. Join the "{rowId}:{valueCents}" lines with a single LF character.
 * 4. SHA256 the UTF-8 bytes and return the lowercase hex digest.
 *
 * The SHA256 implementation below is dependency free and runs identically in
 * Node (vitest) and in the browser.
 */

const CHECKSUM_VALUE_SUFFIX = 'checksum value = '

/** Read the value column announced by make_provenance (mirrors pipeline_lib). */
export function valueFieldFromAgg(agg: string): ValueField {
  const index = agg.lastIndexOf(CHECKSUM_VALUE_SUFFIX)
  const field = index < 0 ? '' : agg.slice(index + CHECKSUM_VALUE_SUFFIX.length)
  if (field !== 'amountCents' && field !== 'balanceCents' && field !== 'monthlyIncomeCents') {
    throw new Error(
      `agg must announce its checksum value as "${CHECKSUM_VALUE_SUFFIX}amountCents", "${CHECKSUM_VALUE_SUFFIX}balanceCents", or "${CHECKSUM_VALUE_SUFFIX}monthlyIncomeCents"`,
    )
  }
  return field
}

/** FNV-1a 32 bit hash of a string (used only for deterministic layout seeding). */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0
}

/** SHA256 hex digest of a UTF-8 string (lowercase, 64 hex digits). */
export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message)
  // Pad: 0x80 marker, zeros, then the 64 bit big-endian message length.
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  const view = new DataView(buffer.buffer)
  const bitLength = bytes.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 4294967296))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4)
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] ?? 0
      const w2 = w[i - 2] ?? 0
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0
      w[i] = (Number(w[i - 16] ?? 0) + s0 + Number(w[i - 7] ?? 0) + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const temp2 = (s0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
}

/**
 * Canonical provenance checksum: SHA256 over LF joined "{rowId}:{valueCents}"
 * lines sorted ascending by row id (mirrors pipeline_lib.checksum).
 *
 * ASCII row id assumption: the comparison below orders by UTF-16 code unit
 * while Python sorts by Unicode code point. The two agree for ASCII row ids
 * (TAN-000001, employee numbers), which is everything the pipeline emits; a
 * non ASCII row id would need an explicit code point comparison to stay byte
 * for byte identical.
 */
export function provenanceCheckSum(
  pairs: Iterable<{ rowId: string; valueCents: number }>,
): string {
  const lines = [...pairs]
    .sort((left, right) => (left.rowId < right.rowId ? -1 : left.rowId > right.rowId ? 1 : 0))
    .map((pair) => `${pair.rowId}:${pair.valueCents}`)
  return sha256Hex(lines.join('\n'))
}

/**
 * Checksum over resolved rows for one transaction value column
 * (default amountCents). Player value columns (monthlyIncomeCents) verify
 * through provenanceCheckSum directly.
 */
export function computeCheckSum(
  rows: readonly TransactionRow[],
  field: TransactionValueField = 'amountCents',
): string {
  return provenanceCheckSum(
    rows.map((row) => ({ rowId: row.id, valueCents: row[field] })),
  )
}

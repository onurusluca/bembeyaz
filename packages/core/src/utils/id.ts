const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'
const ID_LENGTH = 21

/** ~128 bits of randomness, URL-safe, no deps */
export function createId(): string {
  let id = ''
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(ID_LENGTH)
    cryptoObj.getRandomValues(bytes)
    for (let i = 0; i < ID_LENGTH; i++) {
      id += ALPHABET[bytes[i]! % ALPHABET.length]
    }
    return id
  }
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return id
}

/**
 * The district name join for the cartogram (Phase E5 map). districts.csv
 * and the map geometry come from two different publishers: the CSV spells
 * names in plain ASCII with Czech administrative prefixes intact, while
 * the geoBoundaries outlines ship proper diacritics and, for the nine
 * city and direction units, English wording. One normalizer turns both
 * sides into the same key, so the cartogram can shade an outline from a
 * CSV row without a hand maintained crosswalk table and without any
 * network at runtime.
 *
 * The rules, in order: strip combining marks, lowercase, collapse every
 * run of punctuation to a single space, drop leading capital prefixes
 * (only while tokens remain to drop, so Plzen mesto keeps its mesto),
 * and finally read a lone n as the word nad. The alias table maps the
 * nine English spellings onto the Czech wording the CSV uses.
 */

/** Leading tokens the Czech capital and city prefixes decompose to. */
const CAPITAL_PREFIXES: ReadonlySet<string> = new Set(['hl', 'hlavni', 'mesto', 'm'])

/**
 * geoBoundaries ships English names for the nine units the CSV spells in
 * Czech, keyed by the normalized English form.
 */
const ENGLISH_ALIASES: Readonly<Record<string, string>> = {
  prague: 'praha',
  'prague east': 'praha vychod',
  'prague west': 'praha zapad',
  'plzen city': 'plzen mesto',
  'plzen north': 'plzen sever',
  'plzen south': 'plzen jih',
  'brno city': 'brno mesto',
  'brno country': 'brno venkov',
  'ostrava city': 'ostrava mesto',
}

/** One district name reduced to its comparison key. */
export function normalizeDistrictName(name: string): string {
  const plain = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const tokens = plain.split(/[^a-z0-9]+/).filter((token) => token.length > 0)

  let start = 0
  while (start < tokens.length - 1 && CAPITAL_PREFIXES.has(tokens[start] ?? '')) {
    start += 1
  }

  return tokens
    .slice(start)
    .map((token) => (token === 'n' ? 'nad' : token))
    .join(' ')
}

/** The join key: the normalized name, then the English alias table. */
export function districtKey(name: string): string {
  const key = normalizeDistrictName(name)
  return ENGLISH_ALIASES[key] ?? key
}

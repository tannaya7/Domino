const TEST_PATH = /(^|\/)(test|tests|__tests__|spec)(\/|$)/i
const TEST_FILENAME = /\.(test|spec)\.[jt]sx?$/i
const API_PATH = /(^|\/)(api|routes|controllers|endpoints)(\/|$)/i
const CONFIG_PATH = /(^|\/)config(\/|$)/i
const CONFIG_FILENAME = /config/i
const UTIL_PATH = /(^|\/)(utils?|helpers?)(\/|$)/i
const UTIL_FILENAME = /(util|helper)/i
const COMPONENT_PATH = /(^|\/)components?(\/|$)/i

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*\.[jt]sx?$/.test(name)
}

/** Infers a reasonable node "type" for a parsed repo file, so the graph renders with distinct colors. */
export function inferFileType(path: string): string {
  const name = basename(path)

  if (TEST_PATH.test(path) || TEST_FILENAME.test(name)) return 'test'
  if ((path.endsWith('.tsx') || path.endsWith('.jsx')) && (isPascalCase(name) || COMPONENT_PATH.test(path))) {
    return 'component'
  }
  if (API_PATH.test(path)) return 'api'
  if (CONFIG_PATH.test(path) || CONFIG_FILENAME.test(name)) return 'config'
  if (UTIL_PATH.test(path) || UTIL_FILENAME.test(name)) return 'util'

  return 'file'
}

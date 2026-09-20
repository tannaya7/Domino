// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteScenario, loadSavedScenarios, saveScenario } from './scenarioStorage'

const repoUrl = 'https://github.com/o/r'
const selection = { substrates: ['aws'], vendors: ['stripe'], hours: 4 }

beforeEach(() => localStorage.clear())

describe('saveScenario / loadSavedScenarios', () => {
  it('saves and loads a named scenario, namespaced per repo', () => {
    saveScenario(repoUrl, 'Payments outage', selection)
    const loaded = loadSavedScenarios(repoUrl)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toEqual(expect.objectContaining({ name: 'Payments outage', selection }))
    expect(loadSavedScenarios('https://github.com/other/repo')).toEqual([])
  })

  it('keeps at most 5 scenarios, dropping the oldest', () => {
    for (let i = 0; i < 6; i++) {
      saveScenario(repoUrl, `Scenario ${i}`, selection)
    }
    const loaded = loadSavedScenarios(repoUrl)
    expect(loaded).toHaveLength(5)
    expect(loaded.map((s) => s.name)).not.toContain('Scenario 0')
    expect(loaded.map((s) => s.name)).toContain('Scenario 5')
  })

  it('returns [] instead of throwing on corrupt stored JSON', () => {
    localStorage.setItem('blast-radius:scenarios:v1:https://github.com/o/r', '{not valid json')
    expect(loadSavedScenarios(repoUrl)).toEqual([])
  })

  it('drops entries with an unexpected shape rather than throwing', () => {
    localStorage.setItem(
      'blast-radius:scenarios:v1:https://github.com/o/r',
      JSON.stringify([{ id: '1', name: 'ok', selection, savedAt: '2026-01-01' }, { id: '2', name: 'bad' }]),
    )
    expect(loadSavedScenarios(repoUrl)).toEqual([expect.objectContaining({ name: 'ok' })])
  })
})

describe('deleteScenario', () => {
  it('removes only the named scenario', () => {
    saveScenario(repoUrl, 'Keep me', selection)
    const [{ id }] = saveScenario(repoUrl, 'Delete me', selection).filter((s) => s.name === 'Delete me')
    const remaining = deleteScenario(repoUrl, id)
    expect(remaining.map((s) => s.name)).toEqual(['Keep me'])
  })
})

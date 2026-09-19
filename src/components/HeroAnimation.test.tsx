// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HeroAnimation from './HeroAnimation'

afterEach(() => cleanup())

describe('HeroAnimation', () => {
  it('renders exactly 12 dots', () => {
    const { container } = render(<HeroAnimation />)
    expect(container.querySelectorAll('circle')).toHaveLength(12)
  })

  it('marks exactly one cluster (4 dots) as the outage cluster', () => {
    const { container } = render(<HeroAnimation />)
    expect(container.querySelectorAll('circle.hero-dot--outage')).toHaveLength(4)
  })

  it('is purely decorative — hidden from assistive tech', () => {
    const { container } = render(<HeroAnimation />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('gives every dot a final resting position via CSS custom properties, not just a start point', () => {
    const { container } = render(<HeroAnimation />)
    const dots = container.querySelectorAll('circle')
    dots.forEach((dot) => {
      expect(dot.getAttribute('style')).toMatch(/--tx:/)
      expect(dot.getAttribute('style')).toMatch(/--ty:/)
    })
  })
})

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KB_VERSION, VENDOR_KB } from '../data/vendors.generated'
import KbFooter from './KbFooter'

describe('KbFooter', () => {
  it('shows the real KB version and vendor count, never a hardcoded placeholder', () => {
    render(<KbFooter />)
    const vendorCount = Object.keys(VENDOR_KB).length
    expect(screen.getByText(new RegExp(`${vendorCount} vendors`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(KB_VERSION))).toBeInTheDocument()
  })
})

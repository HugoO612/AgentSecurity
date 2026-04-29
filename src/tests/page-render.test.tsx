import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusPage } from '../app/pages/StatusPage'
import { ModalHost } from '../components/ModalHost'
import {
  createInitialSnapshot,
  createInstalledSnapshot,
} from '../domain/mock-data'
import { TestProviders } from './helpers'

describe('page rendering', () => {
  it('shows the isolated environment promise on the status page', () => {
    render(
      <TestProviders
        route="/status"
        snapshot={createInstalledSnapshot(createInitialSnapshot())}
      >
        <StatusPage />
      </TestProviders>,
    )

    expect(screen.getAllByText('本机隔离 Linux 环境').length).toBeGreaterThan(0)
    expect(screen.getByText(/当前 OpenClaw 运行在隔离环境中/)).toBeInTheDocument()
  })

  it('renders rebuild confirmation consequence copy', () => {
    render(
      <TestProviders
        route="/status"
        snapshot={createInstalledSnapshot(createInitialSnapshot())}
        modal="rebuild_confirm"
      >
        <ModalHost />
      </TestProviders>,
    )

    expect(screen.getByText('重建隔离运行环境？')).toBeInTheDocument()
    expect(
      screen.getByText(/该环境中的临时内容可能丢失/),
    ).toBeInTheDocument()
  })
})

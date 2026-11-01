/** System picker: cards for each source system. Click a system → select its files. */
import { useState } from 'react'
import { Button, Tile, Tag, InlineNotification } from '@reiq/ui/carbon'
import { SOURCE_SYSTEMS } from '../../../lib/datasources.config'
import { PlatformLogo } from './PlatformLogo'

interface ChipProps { children: React.ReactNode }
function Chip({ children }: ChipProps) {
  return <span className="chip">{children}</span>
}

export function SystemPicker({ onClose, onSelectSystem }: { onClose: () => void; onSelectSystem: (key: string) => void }) {
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="stack-03">
      <div className="row-between">
        <div className="card-heading">
          <span className="card-title-sm">Choose a platform</span>
          <p className="footnote">Pick the source system, then select which of its files to link.</p>
        </div>
        <Button kind="ghost" size="md" onClick={onClose}>Back</Button>
      </div>
      {error && <InlineNotification kind="error" title="Error" subtitle={error} hideCloseButton onClose={() => setError(null)} />}

      <div className="grid g3">
        {SOURCE_SYSTEMS.map((system) => (
          <Tile key={system.key} className="card system-card" role="button" tabIndex={0}
            onClick={() => onSelectSystem(system.key)}
            onKeyDown={(e) => e.key === 'Enter' && onSelectSystem(system.key)}>
            <div className="stack-03">
              <div className="row-between">
                <PlatformLogo system={system.key as any} size="md" />
                <Tag type="blue" size="sm">{system.files.length} file{system.files.length > 1 ? 's' : ''}</Tag>
              </div>
              <span className="card-title-sm">{system.name}</span>
              <p className="footnote">{system.description}</p>
              <div className="row-03">
                {system.files.map((f) => (
                  <Chip key={f}>{f}</Chip>
                ))}
              </div>
            </div>
          </Tile>
        ))}
      </div>
    </div>
  )
}

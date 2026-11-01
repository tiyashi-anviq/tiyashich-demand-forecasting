import { useMemo, useState } from 'react'
import { Button, Tile } from '@reiq/ui/carbon'

type ConnectorType = 'Database' | 'File'
type Connector = { name: string; type: ConnectorType; description: string; mark: string; action: 'sap' | 'oracle' | 'salesforce' | 'excel' }

const CONNECTORS: Connector[] = [
  { name: 'SAP', type: 'Database', description: 'Link sales and inventory planning data', mark: 'SAP', action: 'sap' },
  { name: 'Oracle', type: 'Database', description: 'Link enterprise planning and operations data', mark: 'ORA', action: 'oracle' },
  { name: 'Salesforce', type: 'Database', description: 'Link customer, account and planning data', mark: 'SF', action: 'salesforce' },
  { name: 'Excel', type: 'File', description: 'Choose a demo workbook for data analysis', mark: 'XLSX', action: 'excel' },
]

const TYPES = ['All types', 'Database', 'File']

export function SystemPicker({ onClose, onSelectSystem }: { onClose: () => void; onSelectSystem: (key: string) => void }) {
  const [type, setType] = useState('All types')
  const [search, setSearch] = useState('')
  const connectors = useMemo(() => CONNECTORS.filter((connector) =>
    (type === 'All types' || connector.type === type)
    && `${connector.name} ${connector.description}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [search, type])

  return (
    <div className="connector-catalog stack-05">
      <div className="connector-catalog-header">
        <div>
          <Button kind="ghost" size="sm" onClick={onClose}>‹</Button>
          <h2>Link Datasource</h2>
          <p>Choose a connector to connect more data</p>
        </div>
      </div>

      <div className="connector-tools">
        <label className="connector-type">
          <span className="sr-only">Filter connector type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((item) => <option key={item} value={item}>{item === 'All types' ? 'Type' : item}</option>)}
          </select>
        </label>
        <label className="connector-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search connectors</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search connectors..." />
        </label>
      </div>

      {(['Database', 'File'] as const).map((category) => {
        const items = connectors.filter((connector) => connector.type === category)
        if (!items.length) return null
        return (
          <section className="connector-section" key={category} aria-label={`${category} connectors`}>
            <h3>{category}</h3>
            <div className="connector-grid">
              {items.map((connector) => (
                <Tile key={connector.name} className="connector-card connector-card-enabled">
                  <button type="button" onClick={() => onSelectSystem(connector.action)}>
                    <span className={`connector-mark connector-mark-${connector.type.toLowerCase()}`} aria-hidden="true">{connector.mark}</span>
                    <strong>{connector.name}</strong>
                    <span className="connector-description">{connector.description}</span>
                  </button>
                </Tile>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

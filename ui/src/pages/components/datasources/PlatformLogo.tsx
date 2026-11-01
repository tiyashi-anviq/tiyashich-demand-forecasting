/** Platform logo: renders the platform logo with a monogram fallback tile.
 *  UI chrome uses the handbook's --reiq-* tokens; logo marks stay true to
 *  vendor brand colours (they are trademarks, not app UI).
 */

type SystemKey = 'sap-sd' | 'sap-mm' | 'sap-ibp' | 'sap-mdg' | 'nielseniq' | 'sap-ariba'

interface PlatformLogoProps {
  system: SystemKey
  size?: 'sm' | 'md' | 'lg'
}

function SAPMark({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 28, md: 36, lg: 44 }[size]
  return (
    <div className="platform-logo-sap" style={{
      width: dims, height: dims, background: 'var(--reiq-interactive-01)', borderRadius: '0.375rem',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#FFFFFF', fontWeight: 'var(--reiq-weight-semibold)', fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
        letterSpacing: 'var(--reiq-letter-spacing-caps)' }}>SAP</span>
    </div>
  )
}

// NielsenIQ logo mark: handbook link green
function NIQMark({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 28, md: 36, lg: 44 }[size]
  return (
    <div className="platform-logo-niq" style={{
      width: dims, height: dims, background: 'var(--reiq-link-01)', borderRadius: 'var(--reiq-radius-round)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#FFFFFF', fontWeight: 'var(--reiq-weight-semibold)', fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
        letterSpacing: 'var(--reiq-letter-spacing-caps)' }}>NIQ</span>
    </div>
  )
}

export function PlatformLogo({ system, size = 'md' }: PlatformLogoProps) {
  const isSAP = ['sap-sd', 'sap-mm', 'sap-ibp', 'sap-mdg', 'sap-ariba'].includes(system)

  return (
    <div className="platform-logo-wrapper" style={{
      display: 'inline-flex', alignItems: 'center',
    }}>
      {isSAP ? <SAPMark size={size} /> : <NIQMark size={size} />}
    </div>
  )
}

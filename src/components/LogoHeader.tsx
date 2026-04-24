// ── RESPONSIVE LOGO HEADER COMPONENT ──
// Use on ALL pages - LOGO HAS TRANSPARENT BG, ADAPTS TO ANY PAGE COLOR
// Copy to: src/components/LogoHeader.tsx

interface LogoHeaderProps {
    subtitle?: string // e.g., "Owner Panel", "Student Home", "Staff Portal"
    textColor?: string // Logo text color: default '#f97316' (orange), or '#ffffff' on dark bg
    borderColor?: string // Optional bottom border, default transparent
    actions?: React.ReactNode // Optional buttons/icons on right
  }
  
  export function LogoHeader({
    subtitle,
    textColor = '#f97316',
    borderColor = 'transparent',
    actions,
  }: LogoHeaderProps) {
    return (
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${borderColor}`,
          position: 'sticky',
          top: 0,
          zIndex: 30,
          // NO background color here - inherits from page
        }}
      >
        {/* LEFT: Logo + Text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {/* Logo Image (transparent bg, adapts to page) */}
          <img
            src="/logo.png"
            alt="SnappyOrder"
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'contain',
              flexShrink: 0,
            }}
          />
  
          {/* Text: App Name + Subtitle */}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontWeight: 900,
                fontSize: '1.1rem',
                color: textColor,
                lineHeight: 1.2,
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              SnappyOrder
            </p>
            {subtitle && (
              <p
                style={{
                  color: textColor === '#ffffff' ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                  fontSize: '0.7rem',
                  margin: 0,
                  marginTop: 2,
                  lineHeight: 1,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
  
        {/* RIGHT: Action Buttons */}
        {actions && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
    )
  }
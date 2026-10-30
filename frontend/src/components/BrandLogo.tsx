import './brand-logo.css'

// The brand lockup (3b4 Terms): the mark, then the name.
export function BrandLogo() {
  return (
    <>
      <span className="brand-logo" aria-hidden="true">
        <svg viewBox="30 31 51.2 39">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M34 31 H76 a5.2 5.2 0 0 1 0 10.4 H67 V66 a4 4 0 0 1 -4 4 H34 a4 4 0 0 1 -4 -4 V35 a4 4 0 0 1 4 -4 Z M40 41.4 H57 V59.6 H40 Z"
          />
        </svg>
      </span>
      <span className="brand-logo-name">Pointing Poker</span>
    </>
  )
}

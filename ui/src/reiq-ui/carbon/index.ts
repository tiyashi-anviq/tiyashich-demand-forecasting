// Single import boundary for Carbon - app code imports from '@reiq/ui/carbon', not
// '@carbon/react' directly, so a component swap later touches one file.
export * from '@carbon/react'
// Carbon's own TabList is replaced by the wrapper: a local named export wins over `export *`, so every
// `import { TabList } from '@reiq/ui/carbon'` gets contained tabs.
export { TabList } from './TabList'
// Shipped by Carbon but not yet re-exported from its package index (it is what HeaderGlobalAction's
// own badge uses internally). Imported by path here so apps still have one boundary.
// Pin: still no public or unstable__ export as of @carbon/react 1.116.0; recheck on each upgrade.
export { BadgeIndicator } from '@carbon/react/es/components/BadgeIndicator'

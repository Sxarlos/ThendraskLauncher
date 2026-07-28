import { RESTRICTED_CATALOGS_ENABLED } from '../shared/features'

export const RESTRICTED_CATALOG_DISABLED = 'RESTRICTED_CATALOG_DISABLED' as const

export class RestrictedCatalogDisabledError extends Error {
  readonly code = RESTRICTED_CATALOG_DISABLED

  constructor() {
    super(RESTRICTED_CATALOG_DISABLED)
    this.name = 'RestrictedCatalogDisabledError'
  }
}

export function assertRestrictedCatalogsEnabled(): void {
  if (!RESTRICTED_CATALOGS_ENABLED) throw new RestrictedCatalogDisabledError()
}

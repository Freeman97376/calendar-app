export interface CatalogProvenance {
  headCommit: string
  worktreeHash: string
}

export interface CatalogCheckOptions {
  projectRoot?: string
  skipProvenance?: boolean
}

export interface GitHeadState {
  headCommit: string
  isClean: boolean
}

export function checkTestCatalog(options?: CatalogCheckOptions): {
  provenance?: CatalogProvenance
  suiteCount: number
}

export function computeCatalogProvenance(projectRoot?: string): CatalogProvenance

export function validateCatalogMappings(catalog: unknown, goose: unknown): void

export function validateJsonSchema(
  value: unknown,
  schema: unknown,
  rootSchema?: unknown,
  location?: string,
  errors?: string[],
): string[]

export function validateSnapshotHead(snapshotHead: string, gitState: GitHeadState): void

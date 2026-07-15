import type { FixtureScale } from "./contracts.ts"
import { canonicalRepresentativeStatements } from "./query-plan.ts"

export const representativeTestStatements = (fixture: FixtureScale = "normal") =>
  canonicalRepresentativeStatements(fixture)

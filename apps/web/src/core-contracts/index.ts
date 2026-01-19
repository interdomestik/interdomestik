/**
 * Common Result type for all Core interactions.
 * Helps standardize success/failure handling without throwing.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message?: string; error?: unknown };

/**
 * Common Decision type for Landing pages.
 * Supports simple rendering or conditional redirection.
 */
export type LandingDecisionDTO = { kind: 'render' } | { kind: 'redirect'; destination: string };

/**
 * Standard Navigation Item DTO.
 * Used for building dynamic menus/dashboards in cores.
 */
export interface WorkspaceNavCardDTO {
  id: string;
  title: string;
  headline: string;
  description: string;
  actionText: string;
  href?: string;
  iconRequest: string; // string identifier for icon map in UI
  disabled?: boolean;
  testId?: string;
}

export interface WorkspaceNavDTO {
  pageTitle: string;
  pageSubtitle: string;
  cards: WorkspaceNavCardDTO[];
}

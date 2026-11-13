/**
 * Shared column template for the queue header and rows. Between `md` and `xl` (e.g. 1024 px with
 * the sidebar open) six equal columns left the member column too narrow for a normal email, so
 * the row reflows into two lines of three columns; from `xl` the member column keeps a minimum
 * width while every column can still shrink, so the row never overflows.
 */
export const SUPPORT_HANDOFF_QUEUE_GRID =
  'grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(11rem,1.2fr)_repeat(4,minmax(0,1fr))]';

// The classes the bulk screens share, so the grid and the review look like one thing (task 0084). One DOM serves every width: from the `md` breakpoint a table, below it each row
// is a stacked card whose cells carry their own visible label (the label is hidden from a screen reader because the control has its own accessible name, "First name, row 3").
export const REGION =
  "overflow-x-auto rounded-xl md:border md:border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const TABLE = "w-full text-sm";
export const THEAD = "hidden md:table-header-group";
export const TH = "px-2 py-2 text-left text-xs font-semibold tracking-wide text-fg-2 uppercase whitespace-nowrap bg-surface-2";
export const TBODY = "block md:table-row-group";
export const TR =
  "mb-3 block rounded-xl border border-line bg-surface p-3 md:mb-0 md:table-row md:rounded-none md:border-0 md:border-b md:border-line md:p-0";
export const TD = "block py-1 md:table-cell md:px-2 md:py-1.5 md:align-top";
export const PHONE_LABEL = "mb-1 block text-xs font-semibold text-fg-2 md:hidden";
export const CONTROL =
  "min-h-11 w-full rounded-lg border bg-field px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus-visible:ring-2";
export const OK_BORDER = "border-line hover:border-line-strong focus-visible:border-ring focus-visible:ring-ring/30";
export const BAD_BORDER = "border-danger-icon/60 focus-visible:border-danger-icon focus-visible:ring-danger-icon/30";

# 0124: how often a fee line is charged

- **Status:** In Progress: built and tested, migration `20261122110000_fee_recurrence` is the maintainer's to run in production after the prod merge.

Asked 2026-11-20: one flat fee for everyone in a branch; "what if we want the fees to be continuous until we decide to change the amount"; "what if a fee is per session in a branch and per term in another and we plan to retain the fee for the coming sessions".

## Decisions
1. `FeeStructure.recurrence`: `THIS_TERM` (default, today's behaviour, has a period), `EVERY_TERM` (charged in every term of every session, no period), `EVERY_SESSION` ("once a year", no period). A database CHECK keeps it honest: a line has a period exactly when it is `THIS_TERM`; every existing line is `THIS_TERM` with its period, so nothing changes until someone picks another value.
2. A recurring line is ONE row. "Until we decide to change the amount" means: edit the amount on that row; invoices already issued keep the amount they were issued at (they snapshot it), later ones use the new amount. Nothing is copied into new terms or sessions, so there is nothing to forget.
3. "Once a year": when generating a term's invoices, a pupil who already has that line on another invoice of the same session is not charged it again; a pupil who joined later has it on their first invoice. A pupil's Fee lines view marks it "carried".
4. A flat fee for a whole branch is a recurring line with no class group and no audience. Branches differ because fee lines belong to a branch: one branch can have the line as `EVERY_SESSION`, another as `EVERY_TERM` or per term.
5. Opt-outs and handovers are per pupil and line, so for a recurring line they carry across terms (the opt-out stays until it is removed).
6. The term's fee list, invoice generation and the bulk "already exists" check include the recurring lines.

## Fees file
New optional column "How often" (Every term, Once a year; blank = this term only). Period empty with How often filled makes a recurring line; both or neither is a problem on the row, with the reason. The same recurring line twice is refused.

## Checked
API spec `fee-recurrence.spec.ts` (create, list per term, generation, once-a-year carry, opt-out, file), unit specs for the file columns, the neighbouring fee, finance and bulk specs, desktop and phone.

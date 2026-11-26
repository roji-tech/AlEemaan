# 0131: Make default for assessment schemes

- **Status:** Done: built; API and browser specs pass. No migration.

The maintainer (2026-11-26): "under assessment schemes, how do I actually select the one to be used?" Marks use the class's own scheme, then its result template's, then the branch default; the list had no way to choose the default except archiving the current one.

## Decisions
1. `POST /assessment-schemes/[id]/make-default`: a swap under the scheme lock. The branch has exactly one live default (`classGroupId` null, not `hosted`; the database index holds it), so the old default is set `hosted` (a scheme only a result template can name) and the chosen one becomes the default, in one transaction. Nothing is archived or deleted; results keep the scheme they were entered with. Audited with the previous default.
2. Refused in words: archived, made for one class, school-wide or a teacher's (a level row; the school-wide scheme is copied into a branch with "Use the school-wide scheme"), replaced by a newer version. Repeating is safe.
3. Screen: the default carries a "Default" pill; every other live branch-level scheme has "Make default", which opens a confirmation that names the scheme that stops being the default and says results already entered are untouched. A scheme that is hosted is described as "Not the branch default (a result template or the school-wide level uses it)".

## Not done
A per-class view of which scheme each class actually uses (own, template, or default).

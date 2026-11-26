/// "0 admins · 0 members" / "1 admin · 2 members": a branch's people, as the Branches page shows them (task 0130). `members` is everyone with an active membership, administrators included.
export function peopleLabel(admins: number, members: number): string {
  return `${admins} ${admins === 1 ? "admin" : "admins"} · ${members} ${members === 1 ? "member" : "members"}`;
}

/// "No members yet" / "1 member" / "12 members" — one wording for every place a branch's size shows.
export function memberLabel(count: number): string {
  if (count <= 0) return "No members yet";
  return count === 1 ? "1 member" : `${count} members`;
}

/// "No members yet" / "1 member" / "12 members" — one wording for every place a branch's size shows.
export function memberLabel(count: number): string {
  if (count <= 0) return "No members yet";
  return count === 1 ? "1 member" : `${count} members`;
}

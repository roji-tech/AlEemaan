import { redirect } from "next/navigation";

// The address a person would try for the sessions (it was a 404): the Sessions tab of Academics (task 0093).
export default function SessionsRedirect() {
  redirect("/academics?section=sessions");
}

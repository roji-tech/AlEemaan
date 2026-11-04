import { Alert } from "@/components/ui/Alert";
import { prettyDay } from "@/components/standing/model";

/// What a suspension or an expulsion means for this sign-in, in plain words (task 0045). It never says why: the reason stays with the school.
export function PortalStandingNotice({
  standing,
  until,
  firstName,
  actor,
}: {
  standing: "ACTIVE" | "SUSPENDED" | "EXPELLED" | undefined;
  until: string | null | undefined;
  firstName: string;
  actor: string;
}) {
  if (standing !== "SUSPENDED" && standing !== "EXPELLED") return null;
  const pupil = actor === "PUPIL";
  const text =
    standing === "SUSPENDED"
      ? pupil
        ? `You are suspended${until ? ` until ${prettyDay(until)}` : ""}. You can still read your results and notes, but you can't hand in work, take quizzes or practise until it ends. Please speak to the school if you have questions.`
        : `${firstName} is suspended${until ? ` until ${prettyDay(until)}` : ""}. They can't hand in work, take quizzes or practise until it ends. Everything else here works as usual.`
      : `${firstName} is no longer a pupil of the school. You can still see the invoices here, so that anything owed can be settled.`;
  return (
    <div className="mb-6">
      <Alert variant="warning">{text}</Alert>
    </div>
  );
}

import { prisma } from "@/lib/db";
import { maskName } from "./completion-rules";
import { toIsoDate } from "./rules";

// Programs, slice P5: what the PUBLIC may learn from a certificate's code (task 0043, section 12.3). The same page that checks a report card finds it. It says whether the certificate is genuine
// or has been withdrawn, which program, when it was completed, and the person as first name and last initial only (a child may be on it) - never marks, a phone number, a guardian or a
// reason for a withdrawal. A code that does not exist gets the same answer as any wrong code.

export type CertificateCheck = {
  kind: "CERTIFICATE";
  genuine: true;
  withdrawn: boolean;
  school: string;
  program: string;
  title: string;
  person: string;
  completedOn: string;
  issuedOn: string;
  serialNo: string;
};

export async function verifyCertificate(token: string): Promise<CertificateCheck | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const c = await prisma.programCertificate.findUnique({
    where: { verifyToken: token },
    select: {
      status: true,
      schoolName: true,
      programName: true,
      title: true,
      personName: true,
      completedOn: true,
      issuedOn: true,
      serialNo: true,
    },
  });
  if (!c) return null;
  return {
    kind: "CERTIFICATE",
    genuine: true,
    withdrawn: c.status === "REVOKED",
    school: c.schoolName,
    program: c.programName,
    title: c.title,
    person: maskName(c.personName),
    completedOn: toIsoDate(c.completedOn),
    issuedOn: toIsoDate(c.issuedOn),
    serialNo: c.serialNo,
  };
}

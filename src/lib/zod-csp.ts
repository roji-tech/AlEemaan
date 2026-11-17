import { z } from "zod";

// The pages' Content-Security-Policy forbids `eval`. zod 4 builds a fast parser with `new Function` and probes for it when the FIRST object schema is built; the browser reports that
// caught probe as a CSP violation (found by task 0084, the first code to run zod in the browser). `jitless` skips the probe and the fast parser: a little slower, which does not matter
// for at most 1,000 rows. Browser only: the server has no such policy and keeps its fast parser. A file that builds schemas the browser also runs imports this FIRST.
if (typeof window !== "undefined") z.config({ jitless: true });

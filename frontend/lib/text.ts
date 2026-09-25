import { z } from "zod";

// C0/C1 controls (NUL, tab, newline, ESC, ...), the bidi-override/isolate controls, and the
// Unicode line/paragraph separators: each can garble a printed mailing label or, for the bidi
// controls, spoof the text an admin reads in a confirm dialog. \p{Cf} is NOT blocked wholesale —
// ZWNJ/ZWJ (U+200C/200D) are legitimate in Persian and Indic names and addresses.
const FORBIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;
export const noControlOrBidi = (s: string) => !FORBIDDEN_CHARS.test(s);
export const CONTROL_OR_BIDI_MESSAGE = "contains a disallowed control or bidi character";

const msg = (label: string | undefined, text: string) => (label ? `${label}: ${text}` : undefined);

export const line = (max: number, label?: string) =>
  z.string().trim()
    .min(1, msg(label, "required"))
    .max(max, msg(label, `at most ${max} characters`))
    .refine(noControlOrBidi, label ? `${label}: contains a character we can't accept` : CONTROL_OR_BIDI_MESSAGE);

export const optLine = (max: number, label?: string) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return v == null ? undefined : v;
      const trimmed = v.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string()
      .max(max, msg(label, `at most ${max} characters`))
      .refine(noControlOrBidi, label ? `${label}: contains a character we can't accept` : CONTROL_OR_BIDI_MESSAGE)
      .optional()
  );


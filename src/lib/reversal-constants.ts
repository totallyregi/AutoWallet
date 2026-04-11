/** Charge voided because reversal email was parsed first (same bank ref). */
export const VOIDED_BY_PRIOR_REVERSAL_SUBSTRING =
  "Reversed (matched prior reversal email)";

/** Charge voided because reversal email was parsed after (existing matcher). */
export const VOIDED_BY_SUBSEQUENT_REVERSAL_SUBSTRING =
  "Reversed (matched email reversal)";

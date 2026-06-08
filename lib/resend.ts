import { Resend } from "resend";

let client: Resend | null = null;

/**
 * Lazily construct the Resend client. The SDK throws if instantiated without a
 * key, so we only build it at request time once the key is present.
 */
export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

// From must be on a Resend-verified domain (fyht4.com).
export const CONTACT_FROM =
  process.env.CONTACT_FROM_EMAIL ?? "VA Corp <noreply@fyht4.com>";

// Where contact form submissions are delivered.
export const CONTACT_TO =
  process.env.CONTACT_TO_EMAIL ?? "teamvcorp@thevacorp.com";

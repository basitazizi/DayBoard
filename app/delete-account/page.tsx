import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { CONTACT_EMAIL, SITE_HOST } from "@/lib/site";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your DayBoard account and the data in it."
};

/**
 * Public page (no sign-in needed) that Google Play links to from the Data safety form.
 * It must name the app, give the steps, and say what is deleted and what is kept.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-bold tracking-[-0.01em]">{title}</h2>
      <div className="grid gap-3 leading-relaxed text-ink-2 [&_li]:ml-5 [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <main className="min-h-dvh bg-bg px-5 py-10 text-ink">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="mb-10 inline-flex items-center gap-2.5 text-lg font-bold tracking-[-0.02em]">
          <LogoMark size={32} />
          DayBoard
        </Link>
        <h1 className="text-3xl font-bold tracking-[-0.02em]">Delete your DayBoard account</h1>
        <p className="mt-6 leading-relaxed text-ink-2">
          You can delete your DayBoard account, and everything in it, at any time. This works the same on the website and in the DayBoard Android app.
        </p>

        <Section title="Delete it yourself">
          <ol className="grid list-decimal gap-2">
            <li>
              Open DayBoard and sign in (
              <Link href="/login" className="font-semibold text-ink underline">
                {SITE_HOST}/login
              </Link>
              ).
            </li>
            <li>
              Go to <strong>Settings → Profile</strong>.
            </li>
            <li>
              Tap <strong>Delete account</strong> and confirm.
            </li>
          </ol>
          <p>Your account is deleted straight away. Before you do this, you can download a copy of your data from Settings → General → Backup.</p>
        </Section>

        <Section title="Can't sign in? Ask us">
          <p>
            Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20DayBoard%20account`} className="font-semibold text-ink underline">
              {CONTACT_EMAIL}
            </a>{" "}
            from the email address you signed up with, with the subject &ldquo;Delete my DayBoard account&rdquo;. We will delete the account within 30 days and reply to confirm.
          </p>
        </Section>

        <Section title="What is deleted">
          <ul className="grid list-disc gap-2">
            <li>Your account: email address, password and display name.</li>
            <li>Everything you added: tasks, calendar events, classes, assignments, exams, grades, habits, notes and focus sessions.</li>
            <li>Your settings and profile, including your avatar photo.</li>
          </ul>
        </Section>

        <Section title="What is kept">
          <p>Nothing. DayBoard does not keep any of your data after your account is deleted.</p>
          <p>If you used DayBoard without an account, your data only lives in your browser. Clear it by uninstalling the app or clearing the site&apos;s data in your browser.</p>
        </Section>

        <p className="mt-10 text-sm text-ink-3">
          See also the{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}

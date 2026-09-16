import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl space-y-16 px-6 py-20">
      <section className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your AI coding tool goes off the rails after prompt 20. We keep it on track.
        </h1>
        <p className="text-lg text-zinc-600">
          A prompt queue that always knows your project&apos;s real state — so your AI tool stops rewriting
          finished files, duplicating functions, and building things nobody asked for.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link href="/sign-up">
            <Button>Get started free</Button>
          </Link>
          <Link href="/demo">
            <Button variant="outline">Try the demo — no sign-up</Button>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The problem</h2>
        <p className="text-zinc-600">
          You start strong with Cursor or Claude Code. Then context bloats. The agent rewrites a file that
          already worked, invents a duplicate of a function you already have, or quietly adds a feature you
          never asked for. There&apos;s no single source of truth for what you&apos;re actually building — so
          nothing catches the drift until you notice it yourself.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What SpecForge does</h2>
        <p className="text-zinc-600">
          Answer a short set of questions and SpecForge turns your rough idea into a structured spec, breaks
          it into tasks, and hands your AI coding tool exactly the context each task needs — the stack, the
          files it&apos;s allowed to touch, the acceptance criteria. Nothing else. Paste back your code and it
          tells you where reality has drifted from the plan.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Built for solo builders</h2>
        <p className="text-zinc-600">
          For people shipping a side project or a small product on their own — not a formal engineering
          background, just someone who wants their AI tool to stay useful past prompt 20.
        </p>
      </section>

      <section className="space-y-3 rounded border bg-zinc-50 p-4 text-sm text-zinc-600">
        <p>
          We don&apos;t guarantee your code is correct — without access to your repo, we can&apos;t promise
          that. What we do is keep your AI tool pointed at the right target.
        </p>
      </section>
    </div>
  );
}

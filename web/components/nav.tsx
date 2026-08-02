import { Logo } from "./logo";

export function Nav({ variant = "marketing" }: { variant?: "marketing" | "app" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center justify-between px-6">
        <a href={variant === "app" ? "/app" : "/"} aria-label="ScribeAI home">
          <Logo />
        </a>
        {variant === "marketing" && (
          <>
            <nav className="hidden items-center gap-8 text-[13.5px] text-mute md:flex">
              <a href="#how" className="transition-colors hover:text-ink">
                How it works
              </a>
              <a href="#why" className="transition-colors hover:text-ink">
                Why psychiatry
              </a>
              <a href="#pricing" className="transition-colors hover:text-ink">
                Early access
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <a
                href="/app"
                className="btn-ghost hidden h-9 items-center rounded-md px-3 text-[13.5px] font-medium text-ink/80 hover:text-ink sm:inline-flex"
              >
                Sign in
              </a>
              <a
                href="/app"
                className="btn-primary inline-flex h-9 items-center rounded-md px-3.5 text-[13.5px] font-medium shadow-softer"
              >
                Try it free
              </a>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

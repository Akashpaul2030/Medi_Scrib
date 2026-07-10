import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-line/80 bg-paper">
      <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden text-[12.5px] text-mute sm:inline">
            © 2026 ScribeAI, Inc.
          </span>
        </div>
        <div className="flex items-center gap-7 text-[13px] text-mute">
          <span>In design-partner beta — sample notes only, no PHI.</span>
          <a
            href="mailto:akashpaul2030@gmail.com"
            className="transition-colors hover:text-ink"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

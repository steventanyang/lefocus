import { DesktopPlayground } from "@/components/playground/DesktopPlayground";

const DEFAULT_MACOS_DMG_URL =
  "https://github.com/steventanyang/lefocus/releases/latest/download/pomodoro_aarch64.dmg";

const macosDmgUrl =
  process.env.NEXT_PUBLIC_MACOS_DMG_URL ?? DEFAULT_MACOS_DMG_URL;

const GITHUB_REPO_URL = "https://github.com/steventanyang/lefocus";

const DEFAULT_LAUNCH_VIDEO_URL =
  "https://sgnujyiofakjhcy5.public.blob.vercel-storage.com/lefocus.mp4";

const launchVideoUrl =
  process.env.NEXT_PUBLIC_LEFOCUS_LAUNCH_VIDEO_URL ?? DEFAULT_LAUNCH_VIDEO_URL;

function AppleMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2.09.79-3.3.82-1.22.06-2.09-1.17-2.95-2.4-1.95-2.73-3.35-7.72-1.41-11.1 1.03-1.69 2.72-2.77 4.6-2.79 1.24-.02 2.4.84 3.16.84s2.37-1.1 3.99-.93c.68.02 2.6.27 3.83 1.98-.09.06-2.28 1.33-2.25 3.97.02 3.15 2.76 4.2 2.79 4.24-.1.4-.5 1.37-1.07 2.7zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function LaunchVideo() {
  return (
    <div className="w-full max-w-md border border-black md:hidden">
      <video
        src={launchVideoUrl}
        autoPlay
        muted
        loop
        playsInline
        className="block w-full"
        aria-label="Pomodoro product video"
      />
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-white max-md:justify-center max-md:gap-0 max-md:px-4 max-md:py-6 md:px-8 md:py-16">
      <div className="my-6 hidden flex-wrap items-center justify-center gap-3 md:flex md:shrink-0">
        <a
          id="macos-download-btn"
          href={macosDmgUrl}
          className="inline-flex h-11 items-center justify-center gap-2.5 border border-black bg-black px-4 text-base font-medium tracking-tight text-white transition-colors hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
          rel="noopener noreferrer"
          aria-label="Download Pomodoro for macOS (Apple silicon)"
        >
          <AppleMark />
          Download
        </a>
        <a
          href={GITHUB_REPO_URL}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-black bg-white text-black transition-colors hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          rel="noopener noreferrer"
          target="_blank"
          aria-label="Pomodoro on GitHub"
        >
          <GitHubMark className="h-5 w-5" />
        </a>
      </div>
      <div className="hidden w-full min-h-0 flex-1 flex-col md:flex">
        <div className="min-h-0 flex-1" aria-hidden />
        <DesktopPlayground />
        <div className="min-h-0 flex-1" aria-hidden />
      </div>
      <LaunchVideo />
    </main>
  );
}

"use client";

import { shouldOfferMacDownload } from "@/lib/device";
import { useClientReady } from "@/lib/useClientReady";

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

const btnBase =
  "inline-flex h-11 items-center justify-center border border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white";

type DownloadBarProps = {
  macosDmgUrl: string;
  githubRepoUrl: string;
};

export function DownloadBar({ macosDmgUrl, githubRepoUrl }: DownloadBarProps) {
  const clientReady = useClientReady();
  const offerMacDmg = clientReady && shouldOfferMacDownload();

  const downloadBtnIcon =
    "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 gap-2.5 px-4 text-base font-medium tracking-tight";

  return (
    <div className="my-6 flex shrink-0 flex-wrap items-center justify-center gap-3">
      {!clientReady ? (
        <div className="h-11 min-w-[120px]" aria-hidden />
      ) : offerMacDmg ? (
        <a
          id="macos-download-btn"
          href={macosDmgUrl}
          className={`${btnBase} ${downloadBtnIcon} bg-black text-white transition-colors hover:bg-white hover:text-black`}
          rel="noopener noreferrer"
          aria-label="Download LeFocus for macOS (Apple silicon)"
        >
          <AppleMark />
          Download
        </a>
      ) : (
        <button
          type="button"
          disabled
          className={`${btnBase} ${downloadBtnIcon} cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-500`}
          aria-label="Download for macOS. Open this page on a Mac to download."
          title="Open this page on a Mac to download the app."
        >
          <AppleMark />
          Download
        </button>
      )}
      <a
        href={githubRepoUrl}
        className={`${btnBase} h-11 w-11 shrink-0 bg-white text-black transition-colors hover:bg-black hover:text-white`}
        rel="noopener noreferrer"
        target="_blank"
        aria-label="LeFocus on GitHub"
      >
        <GitHubMark className="h-5 w-5" />
      </a>
    </div>
  );
}

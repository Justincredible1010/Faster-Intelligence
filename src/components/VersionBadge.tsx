import React from 'react';

declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;

export function versionLabel(commit: string, buildDate: string): string {
  return `v ${commit || 'unknown'} · built ${buildDate || 'unknown'}`;
}

export const VersionBadge: React.FC = () => {
  const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev';
  const buildDate = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : 'dev';
  return (
    <span
      data-testid="version-badge"
      title="Git commit and build date of the code this app is running"
      className="font-mono text-[10px] text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"
    >
      {versionLabel(commit, buildDate)}
    </span>
  );
};

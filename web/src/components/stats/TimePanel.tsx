import React from 'react';

interface Props {
  totalDurationMs: number;
}

export default function TimePanel({ totalDurationMs }: Props) {
  if (totalDurationMs <= 0) return null;

  const seconds = Math.floor(totalDurationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const display = hours > 0
    ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
    : minutes > 0
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;

  return (
    <div className="stage-card p-4">
      <h3 className="text-sm font-semibold text-white mb-2">Total Duration</h3>
      <div className="text-2xl font-bold font-mono gradient-text">{display}</div>
    </div>
  );
}

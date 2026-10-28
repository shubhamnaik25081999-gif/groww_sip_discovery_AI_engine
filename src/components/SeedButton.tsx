'use client';

import { useTransition } from 'react';
import { seedBenchmarkDatasetAction } from '@/app/actions';

export function SeedButton({ hasData }: { hasData: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleSeed = () => {
    if (hasData) {
      const confirmed = window.confirm(
        'This will populate the Fellowship Benchmark Set (20 authentic records, golden labels, failure cases, and opportunities). Continue?'
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const res = await seedBenchmarkDatasetAction();
      if (!res.success) {
        alert('Failed to load benchmark dataset: ' + (res as any).error);
      }
    });
  };

  return (
    <button
      onClick={handleSeed}
      disabled={isPending}
      className={hasData ? 'btn btn-secondary' : 'btn btn-primary'}
      style={{ fontSize: '13px' }}
    >
      {isPending ? '⏳ Loading Benchmark Set...' : '🌱 Load Benchmark Dataset (20 Records)'}
    </button>
  );
}

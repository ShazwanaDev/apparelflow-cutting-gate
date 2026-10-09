'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client/api';

export function StartSewingButton({ orderId, orderNo }: { orderId: number; orderNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        loading={busy}
        icon={<Shirt aria-hidden className="size-4" />}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await api(`/api/sewing/${orderId}/start`, { method: 'POST' });
          setBusy(false);
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          toast.success(`${orderNo} is on the sewing line`);
          router.refresh();
        }}
      >
        Start sewing assembly
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-shortage">
          {error}
        </p>
      )}
    </div>
  );
}

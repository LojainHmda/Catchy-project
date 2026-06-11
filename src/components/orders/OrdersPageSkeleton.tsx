import React from 'react';

const OrdersPageSkeleton = () => (
  <div className="space-y-4" aria-hidden>
    {[0, 1, 2].map((i) => (
      <div key={i} className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-6 w-28 rounded bg-gray-100" />
            <div className="h-3 w-40 rounded bg-gray-100" />
          </div>
          <div className="flex -space-x-2">
            <div className="size-9 rounded-lg bg-gray-100 ring-2 ring-white" />
            <div className="size-9 rounded-lg bg-gray-100 ring-2 ring-white" />
            <div className="size-9 rounded-lg bg-gray-100 ring-2 ring-white" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default OrdersPageSkeleton;

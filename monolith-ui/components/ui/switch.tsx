'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 items-center rounded-lg border outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-emerald-500/35 data-[state=checked]:bg-emerald-500/18 data-[state=checked]:shadow-[inset_0_0_0_1px_rgba(16,185,129,0.08)] data-[state=unchecked]:border-red-500/28 data-[state=unchecked]:bg-red-500/14 data-[state=unchecked]:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.06)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          'pointer-events-none block size-5 rounded-md border border-border/70 bg-zinc-100 ring-0 shadow-sm transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:bg-zinc-100'
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

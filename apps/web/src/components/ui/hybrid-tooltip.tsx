// source: https://github.com/shadcn-ui/ui/issues/2402#issuecomment-1930895113
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

import type { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import type { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type HybridTooltipProps = TooltipPrimitive.Root.Props &
  PopoverPrimitive.Root.Props

type HybridTooltipTriggerProps = TooltipPrimitive.Trigger.Props &
  PopoverPrimitive.Trigger.Props

type HybridTooltipContentProps = TooltipPrimitive.Popup.Props &
  PopoverPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props & PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >

const TouchContext = createContext<boolean | undefined>(undefined)
const useTouch = () => useContext(TouchContext)

export const TouchProvider = (props: PropsWithChildren) => {
  const [isTouch, setTouch] = useState<boolean>()

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  return <TouchContext.Provider value={isTouch} {...props} />
}

export const HybridTooltip = (props: HybridTooltipProps) => {
  const isTouch = useTouch()

  return isTouch ? <Popover {...props} /> : <Tooltip {...props} />
}

export const HybridTooltipTrigger = (props: HybridTooltipTriggerProps) => {
  const isTouch = useTouch()

  return isTouch ? (
    <PopoverTrigger {...props} />
  ) : (
    <TooltipTrigger delay={0} {...props} />
  )
}

export const HybridTooltipContent = (props: HybridTooltipContentProps) => {
  const { className, ...rest } = props
  const isTouch = useTouch()

  return isTouch ? (
    <PopoverContent {...rest} className={cn('w-fit', className)} />
  ) : (
    <TooltipContent {...rest} className={className} />
  )
}

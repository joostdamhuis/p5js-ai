import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-[10px] h-9 px-2.5 text-[13px] font-normal outline-none transition-colors [&_svg]:text-muted-foreground focus:bg-[rgb(var(--ink)/0.1)] focus:text-foreground focus:[&_svg]:text-foreground data-[state=open]:bg-[rgb(var(--ink)/0.1)] data-[state=open]:[&_svg]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto -mr-0.5 h-3.5 w-3.5" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, sideOffset = 6, ...props }, ref) => {
  // Aligned with its parent menu's far edge: bottom edges level for menus that
  // open upward (from the bottom bar), top edges level for menus that open
  // downward. Radix only aligns to the trigger's top, so measure once rendered
  // and offset from there. If it doesn't fit, it stops 12px from the screen edge.
  const [alignOffset, setAlignOffset] = React.useState(0)
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
    if (!node) return
    const trigger = node.id ? document.querySelector(`[aria-controls="${node.id}"]`) : null
    const parent = trigger?.closest('[role="menu"]')
    if (!trigger || !parent) return
    const triggerTop = trigger.getBoundingClientRect().top
    const box = parent.getBoundingClientRect()
    const opensUp = box.top + box.height / 2 > window.innerHeight / 2
    setAlignOffset(opensUp ? box.bottom - node.offsetHeight - triggerTop : box.top - triggerTop)
  }, [ref])

  return (
    // Portaled: inside the parent menu it was clipped by the parent's rounded,
    // overflow-hidden box and its blur. Near an edge it shifts back inside,
    // keeping a margin (dock menus reserve the dock).
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={measure}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-[14px] border border-[rgb(var(--ink)/0.1)] bg-[var(--chrome)] p-1 text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
})
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-[14px] border border-[rgb(var(--ink)/0.1)] bg-[var(--chrome)] p-1 text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-[10px] h-9 px-2.5 text-[13px] font-normal outline-none transition-colors [&_svg]:text-muted-foreground focus:bg-[rgb(var(--ink)/0.1)] focus:text-foreground focus:[&_svg]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-[10px] h-9 px-2.5 text-[13px] font-normal outline-none transition-colors [&_svg]:text-muted-foreground focus:bg-[rgb(var(--ink)/0.1)] focus:text-foreground focus:[&_svg]:text-foreground pr-8 data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute right-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 !text-foreground" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-[10px] h-9 px-2.5 text-[13px] font-normal outline-none transition-colors [&_svg]:text-muted-foreground focus:bg-[rgb(var(--ink)/0.1)] focus:text-foreground focus:[&_svg]:text-foreground pr-8 data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <span className="absolute right-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 !text-foreground" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2.5 pt-2 pb-1 text-[12px] font-medium text-muted-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("mx-2.5 my-1 h-px bg-[rgb(var(--ink)/0.08)]", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} 
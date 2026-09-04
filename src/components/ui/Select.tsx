'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    size?: 'sm' | 'md';
    variant?: 'light' | 'dark';
  }
>(({ className = '', children, size = 'md', variant = 'light', ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={`figma-select-trigger ${size === 'sm' ? 'figma-select-trigger-sm' : ''} ${
      variant === 'dark' ? 'figma-select-trigger-dark' : ''
    } ${className}`}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="figma-select-chevron" size={13} strokeWidth={2.2} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={`figma-select-scroll-btn ${className}`}
    {...props}
  >
    <ChevronUp size={13} />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

export const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={`figma-select-scroll-btn ${className}`}
    {...props}
  >
    <ChevronDown size={13} />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    variant?: 'light' | 'dark';
  }
>(({ className = '', children, position = 'popper', variant = 'light', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={`figma-select-content ${
        variant === 'dark' ? 'figma-select-content-dark' : ''
      } ${className}`}
      position={position}
      sideOffset={4}
      style={{
        minWidth: 'var(--radix-select-trigger-width)',
        width: 'max-content',
        maxWidth: 'var(--radix-select-content-available-width)',
        ...props.style,
      }}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className="figma-select-viewport"
        style={{
          width: '100%',
          minWidth: 'var(--radix-select-trigger-width)',
        }}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={`figma-select-label ${className}`}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`figma-select-item ${className}`}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={`figma-select-separator ${className}`}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

/**
 * Convenient all-in-one Dropdown component matching shadcn & Figma tokens.
 * Drop-in replacement for native <select>.
 */
export interface SimpleSelectOption {
  value: string;
  label: React.ReactNode;
}

export interface SimpleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md';
  variant?: 'light' | 'dark';
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  title?: string;
}

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  size = 'md',
  variant = 'light',
  className = '',
  contentClassName = '',
  disabled = false,
  title,
}: SimpleSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size={size} variant={variant} className={className} title={title}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent variant={variant} className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

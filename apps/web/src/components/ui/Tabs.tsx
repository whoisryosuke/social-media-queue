import { Tabs as ArkTabs } from '@ark-ui/react'
import type { ReactNode } from 'react'
import { css } from '../../../styled-system/css'

export interface TabItem {
  value: string
  label: string
  disabled?: boolean
}

interface AppTabsProps {
  items: TabItem[]
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children?: ReactNode
}

const listStyle = css({
  display: 'flex',
  gap: '1',
  borderBottomWidth: '1px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'gray.6',
})

const triggerStyle = css({
  px: '3',
  py: '2',
  fontSize: '3',
  fontWeight: 'medium',
  color: 'gray.10',
  borderBottomWidth: '2px',
  borderBottomStyle: 'solid',
  borderBottomColor: 'transparent',
  cursor: 'pointer',
  _hover: { color: 'gray.12' },
  _disabled: { color: 'gray.8', cursor: 'not-allowed' },
  "&[aria-selected='true']": { color: 'gray.12', borderBottomColor: 'gray.12' },
})

export function AppTabs({ items, defaultValue, value, onValueChange, children }: AppTabsProps): JSX.Element {
  return (
    <ArkTabs.Root
      defaultValue={defaultValue ?? items[0]?.value}
      value={value}
      onValueChange={(details) => onValueChange?.(details.value)}
    >
      <ArkTabs.List className={listStyle}>
        {items.map((item) => (
          <ArkTabs.Trigger key={item.value} value={item.value} disabled={item.disabled} className={triggerStyle}>
            {item.label}
          </ArkTabs.Trigger>
        ))}
      </ArkTabs.List>
      {children}
    </ArkTabs.Root>
  )
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }): JSX.Element {
  return <ArkTabs.Content value={value}>{children}</ArkTabs.Content>
}

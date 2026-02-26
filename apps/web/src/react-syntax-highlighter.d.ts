declare module 'react-syntax-highlighter' {
  import type { CSSProperties, ComponentType } from 'react'

  type SyntaxHighlighterProps = {
    language?: string
    style?: Record<string, unknown>
    customStyle?: CSSProperties
    wrapLongLines?: boolean
    children?: string
  }

  export const Prism: ComponentType<SyntaxHighlighterProps>
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism' {
  export const oneDark: Record<string, unknown>
}

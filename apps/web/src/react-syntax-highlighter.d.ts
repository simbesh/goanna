declare module 'react-syntax-highlighter/dist/esm/prism-light' {
  import type { CSSProperties, ComponentType } from 'react'

  type SyntaxHighlighterProps = {
    language?: string
    style?: Record<string, unknown>
    customStyle?: CSSProperties
    wrapLongLines?: boolean
    children?: string
  }

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps> & {
    registerLanguage: (name: string, language: unknown) => void
  }
  export default SyntaxHighlighter
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-dark' {
  const oneDark: Record<string, unknown>
  export default oneDark
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
  const json: unknown
  export default json
}

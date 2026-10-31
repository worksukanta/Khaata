/**
 * CSS module type declaration.
 * Allows TypeScript to accept `import './assets/index.css'` without error.
 */
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

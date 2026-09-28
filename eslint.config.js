import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The hooks rules are the point: a hook called conditionally breaks React at runtime, not at build.
export default tseslint.config(
  { ignores: ['frontend/dist/', 'frontend/src/protocol/generated/'] },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    ...reactHooks.configs.flat.recommended
  }
)

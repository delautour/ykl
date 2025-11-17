import * as t from './lexer.ts'

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining<T = any> extends CustomMatchers<T> {}

}

interface CustomMatchers<R extends unknown> {
    toContainTokens: (...expected: Array< t.Token["type"] | Partial<t.Token>>) => R

}
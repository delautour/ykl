import { expect } from "vitest"
import * as t from "./lexer.ts"

export function toContainTokens(received: t.Token[], ...expected: Array<string | Partial<t.Token>>) {
    
    let i = 0
    let k = 0
    while (i < received.length) {
        let inc = 1
        let j = i
        for (k = 0; k < expected.length; k++) {

            const rT = received[j + k]
            const eT = expected[k]
            const match = tokensMatch(rT, eT)          
    
         
            if (match) {
                if (k === expected.length - 1) {
                    return {
                        pass: true,
                        message: () => `Expected tokens not to contain sequence: ${this.utils.printExpected(expected)}, but it did.`,
                        actual: received,
                        expected: expected
                    }
                }
            }else{
                break    
            }
        }
        i += inc
    }

    
    return {
        pass: false,
        message: () => `Expected to contain sequence: ${this.utils.printDiffOrStringify(received, expected)} but it did not.`,
        actual: received,
        expected: expected
    }
}


function tokensMatch(received: t.Token, expected: any): boolean {
    return (typeof expected === "string" ? 
        received.type === expected : 
        expect.objectContaining(expected).asymmetricMatch(received))
}
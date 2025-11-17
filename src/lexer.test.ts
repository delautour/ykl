import { describe, it, expect, test } from "vitest"
import { getTokens } from "./lexer"

import * as t from "./lexer"


test("Lexer: Empty input", () => {
    const input = ``
    const tokens = getTokens(input)
    expect(tokens).toEqual([{ type: "EOF" }])
})

test("Lexer: Single Atom", () => {
    const input = `hello`
    const tokens = getTokens(input)
    expect(tokens).toEqual([{ type: "Atom", str: "hello", trailingWs: "" }, { type: "EOF" }])
})

test("Lexer: Atom with trailing whitespace", () => {
    const input = `hello   `
    const tokens = getTokens(input)
    expect(tokens).toEqual([{ type: "Atom", str: "hello", trailingWs: "   " }, { type: "EOF" }])
})

describe("Lexer: Assignment", () => {
    describe("LiteralAssignment", () => {
        test("String Literal", () => {
            const input = `key: "value"`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens (
                "Assignment",
                { type: "LiteralString", str: "value" },
                "EOF"
            )
        })

        test("Empty Array", () => {
            const input = `key: []`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens (
                "Assignment",
                "EmptyList",
                "EOF"
            )
        })

        test ("Empty Object", () => {
            const input = `key: {}`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens (
                "Assignment",
                "EmptyObject",
                "EOF"
            )
        })

        test("Two Words", () => {
            const input = `key: hello world`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens (
                { type: "Atom", str: "key" },
                "Assignment",
                { type: "LiteralString", str: "hello world" },
                "EOF"
            )
        })

        test("One word", () => {
            const input = `key: hello`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens (
                { type: "Atom", str: "key" },
                "Assignment",
                { type: "LiteralString", str: "hello" },
                "EOF"
            )
        })

        test("Newline and Indentation", () => {
            const input = `
key:
    bob
    `
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(  
                    "Assignment",
                    "Indent",
                    "Atom",
                    "Newline"
                    
            )
        })
    })

    describe("Outdent", () => {
        test("Before Expression", () => {

            const input = `
key:
    nestedKey: nestedValue
anotherKey: anotherValue
`
            const tokens = getTokens(input)
   
            expect(tokens).toContainTokens(
                "LiteralString",
                "Outdent",
                "Atom"
            )
        })

        test("Before EOF", () => {

            const input = `
key:
    nestedKey: nestedValue
    `
            const tokens = getTokens(input)
            expect(tokens).toContainTokens("Outdent", "EOF")
        })
    })
})


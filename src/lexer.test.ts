import { describe, it, expect, test } from "vitest"
import { getTokens } from "./lexer.ts"

describe("Lexer", () => {
    test("Empty source", () => {
        const input = ``
        const tokens = getTokens(input)
        expect(tokens).toContainTokens({ type: "EOF" })
    })

    test("Section Start", () => {
        const input = `
---
title: My Document
---
`
        const tokens = getTokens(input)
        expect(tokens).toContainTokens(
            "SectionStart"
        )
    })

    test("Single Symbol", () => {
        const input = `hello`
        const tokens = getTokens(input)
        expect(tokens).toContainTokens(
            { type: "Symbol", str: "hello" },
            "EOF"
        )
    })

    test("Function definition", () => {
        const input = `
fn:= arg ->
  arg`
        const tokens = getTokens(input)
        expect(tokens).toContainTokens(
            "Symbol",
            "Fn",
            "Indent"
        )
    })


    test("Accessor", () => {
        const input = `key:subkey`
        const tokens = getTokens(input)
        expect(tokens).toContainTokens(
            { type: "Symbol", str: "key" },
            "Accessor",
            { type: "Symbol", str: "subkey" },
            "EOF"
        )
    })

    describe("Comments", () => {
        test("Single line", () => {
            const input = `# This is a comment`
            const tokens = getTokens(input)
            expect(tokens).not.toContainTokens(
                "Comment",
            )
        })

        test("Inline", () => {
            const input = `key: value # This is a comment`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(
                "String",
                "EOF"
            )
        })
    })

    describe("Assignment", () => {
        describe("Simple", () => {
            test("Empty Array", () => {
                const input = `key: []`
                const tokens = getTokens(input)
                expect(tokens).toContainTokens(
                    "Assignment",
                    "EmptyList",
                    "EOF"
                )
            })

            test("Empty Object", () => {
                const input = `key: {}`
                const tokens = getTokens(input)
                expect(tokens).toContainTokens(
                    "Assignment",
                    "EmptyObject",
                    "EOF"
                )
            })

            describe("Numbers", () => {
                test("Integer", () => {
                    const input = `key: 1234`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "Number", num: 1234 },
                    )
                })

                test("Negative Int", () => {
                    const input = `key: -56`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "Number", num: -56 },
                    )
                })

                test("Decimal", () => {
                    const input = `key: 3.14159`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "Number", num: 3.14159 },
                    )
                })
            })

            describe("Booleans", () => {
                test("true", () => {
                    const input = `key: true`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "Bool", bool: true },
                    )
                })
                test("True", () => {
                    const input = `key: True`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "Bool", bool: true },
                    )
                })

                test("false", () => {
                    const input = `key: false`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "Bool", bool: false },
                    )
                })
                test("False", () => {
                    const input = `key: False`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "Bool", bool: false },
                    )
                })
            })

            describe("Strings", () => {
                test("Quoted", () => {
                    const input = `key: "value"`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        "Assignment",
                        { type: "String", str: "value" },
                    )
                })


                test("Two Words", () => {
                    const input = `key: hello world`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "Symbol", str: "key" },
                        "Assignment",
                        { type: "String", str: "hello world" },
                    )
                })

                test("One word", () => {
                    const input = `key: hello`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "Symbol", str: "key" },
                        "Assignment",
                        { type: "String", str: "hello" },
                    )
                })

                test("Trailing whitespace", () => {
                    const input = `key: hello   `
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "String", str: "hello" },
                    )
                })

                test("Inline comment", () => {
                    const input = `key: hello # this is a comment`
                    const tokens = getTokens(input)
                    expect(tokens).toContainTokens(
                        { type: "String", str: "hello" },
                    )
                })
            })

            test("Block", () => {
                const input = `
key:
    bob
    `
                const tokens = getTokens(input)
                expect(tokens).toContainTokens(
                    "Assignment",
                    "Indent",
                    { type: "Symbol", str: "bob" },
                    "Newline"
                )
            })
        })

        describe("Resolved", () => {
            test("Single symbol", () => {
                const input = `key:= value`
                const tokens = getTokens(input)
                expect(tokens).toContainTokens(
                    "Assignment",
                    { type: "Symbol", str: "value" },
                )
            })

            test("Multiple symbols", () => {
                const input = `key:= value1 value2`
                const tokens = getTokens(input)
                expect(tokens).toContainTokens(
                    "Assignment",
                    { type: "Symbol", str: "value1" },
                    { type: "Symbol", str: "value2" },
                )
            })
        })
    })

    describe("Indent", () => {
        test("After Assignment", () => {
            const input = `
key:
    nestedKey: nestedValue
`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(
                "Assignment",
                "Indent",
            )
        })

        test ("After hyphen", () => {
            const input = `
- item1
- item2
`
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(
                "Indent",
                { type: "Symbol", str: "item1" },
            )
            expect(tokens).toContainTokens(
                "Indent",
                { type: "Symbol", str: "item2" }
            )
        })

        
        test("Single hyphen in assignment", () => {
            const input = `
key:
- item1`           
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(
                "Assignment",
                "Indent",
                "Indent",
                { type: "Symbol", str: "item1" },
                "Outdent",
                "Outdent"
            )
        })

        test("Subkeys", () => {
            const input = `
key:
  subkey:
    - item1: bar
      foo: bar
    - item2`           
            const tokens = getTokens(input)
            expect(tokens).toContainTokens(
                "Indent",
                { type: "Symbol", str: "item1" },
            )
            expect(tokens).toContainTokens(
                "Indent",
                { type: "Symbol", str: "item2" }
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
                "String",
                "Outdent",
                "Symbol"
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

    describe("Operators", () => {
        test("Lift", () => {
            const tokens = getTokens(`^value`)
            expect(tokens).toContainTokens(
                "Lift",
                { type: "Symbol", str: "value" },
                
            )
        })

        test("Pipeline", () => {
            const tokens = getTokens(`lhs | rhs`)
            expect(tokens).toContainTokens(
                { type: "Symbol", str: "lhs" },
                "Pipeline",
                { type: "Symbol", str: "rhs" },
            )
        })

        test("Hard merge", () => {
            const tokens = getTokens(`lhs + rhs`)
            expect(tokens).toContainTokens(
                { type: "Symbol", str: "lhs" },
                "HardMerge",
                { type: "Symbol", str: "rhs" },
            )
        })

        test("Soft merge", () => {
            const tokens = getTokens(`lhs +? rhs`)
            expect(tokens).toContainTokens(
                { type: "Symbol", str: "lhs" },
                "SoftMerge",
                { type: "Symbol", str: "rhs" },
            )
        })

        test("Pattern match", () => {
            const tokens = getTokens(`lhs ? rhs`)
            expect(tokens).toContainTokens(
                { type: "Symbol", str: "lhs" },
                "PatternMatch",
                { type: "Symbol", str: "rhs" },
            )
        })
    })
})


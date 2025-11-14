
import * as e from "./expression.ts"

const INDENT = '  '

export default function render(ast: e.Expression, indentLevel: number = 0): string {

    switch (ast.type) {
        case "Block":
            return renderBlock(ast as e.BlockExpression, indentLevel)
        case "Assignment":
            return renderAssignment(ast as e.AssignmentExpression, indentLevel)
        case "String":
            return  `'${ast.str}'`
        case "Number":
            return ast.value.toString()
        case "EmptyObject":
            return "{}"
        case "EmptyList":
            return "[]"
        default: 
        return assertUnreachable(ast)   

    }
}

function renderBlock(block: e.BlockExpression, indentLevel: number): string {
    return block.sections.reduce((acc, section, i) => {
        if (i > 0) {
            acc += INDENT.repeat(indentLevel) + '---\n'
        }
        return acc + renderSection(section, indentLevel)
    }, '')
}
function renderSection(section: e.Expression[], indentLevel: number) {
    const indent = INDENT.repeat(indentLevel)
    return section.reduce((acc, expr) => {
        if (expr.type === "Assignment") {
            return `${acc}` + renderAssignment(expr as e.AssignmentExpression, indentLevel)

        }
        if (expr.type === "Block") {
            return `${acc}` + indent + renderBlock(expr, indentLevel + 1)
        }
        return acc

    }, '')
}

function renderAssignment(assignment: e.AssignmentExpression, indentLevel: number): string {
    const indent = INDENT.repeat(indentLevel)
    if (assignment.expr.type === "Block") {
        return `${indent}${assignment.key}:` + '\n' + renderBlock(assignment.expr, indentLevel + 1)
    }
    return `${indent}${assignment.key}: ${render(assignment.expr, indentLevel)}\n`
}

function assertUnreachable(_: never): never {
    throw new Error("Didn't expect to get here");
}
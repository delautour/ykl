import { program } from "commander"
import { Stream } from "./stream.ts"

import { join } from "node:path"
import * as fs from "node:fs"

import * as l from "./lexer.ts"
import * as e from "./expression.ts"

import astToFn from "./ast_to_fn.ts"

function compile(srcPath: string) {
  const ast = parse(srcPath)

  const fn = astToFn(ast)

  const res = fn({})
  console.log(JSON.stringify(res, null, 2))
}

function parse(source: string) {
  const stat = fs.statSync(source)

  if (stat.isDirectory()) {
    return parseDir(source)
  }

  if (stat.isFile()) {
    return parseFile(source)
  }
}

function parseDir(dirPath: string) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
  .filter(entry => entry.isFile())
  .reduce((expr, entry) => {
    if (!entry.isFile()) return expr
    const entryPath = join(dirPath, entry.name)
    return e.Merge(expr, e.Lift(parseFile(entryPath)))
  }, e.Vector([]))
}

function parseFile(filePath: string) {
  const fileContent = fs.readFileSync(filePath, "utf-8")
  const tokens: l.Token[] = l.getTokens(fileContent)
  return e.BuildAst(new Stream(tokens))
}

program
  .argument("<source>")
  .option('-o, --output <string>')
  .action(compile)

program.parse()
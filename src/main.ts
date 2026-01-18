import { program } from "commander"
import { Stream } from "./stream.ts"

import { join } from "node:path"
import * as fs from "node:fs"

import * as l from "./lexer.ts"
import * as e from "./expression.ts"
import * as ts from "./type_system.ts"

import astToFn from "./ast_to_fn.ts"
import * as YAML from "yaml"
import { Map } from "immutable"

function compile(srcPath: string) {
  const ast = parse(srcPath)

  const dataType = e.getDataType(Map(), ast)
  const typeErrors = [...e.typeCheck(ast, new ts.VectorType([new ts.KubenetesResourceType()]))]
  console.log(typeErrors)
  console.log("----------------")

  const fn = astToFn(ast)

  const res = fn({})
  console.log(YAML.stringify(res, null, { aliasDuplicateObjects: false }))
}

function parse(source: string) {
  const stat = fs.statSync(source)

  if (stat.isDirectory()) {
    return   parseDir(source)
  }

  if (stat.isFile()) {
    return parseFile(source)
  }
}

function parseDir(dirPath: string) {
  const vec = e.Vector([])
  vec.typeConstraint = new ts.VectorType([new ts.KubenetesResourceType()])

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .reduce((expr, entry) => {
      if (!entry.isFile()) return expr
      const entryPath = join(dirPath, entry.name)
      return e.Merge(expr, e.Lift(parseFile(entryPath)))
    }, vec)
}

function parseFile(filePath: string) {
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) {
    const fileContent = fs.readFileSync(filePath, "utf-8")
    const data = YAML.parseAllDocuments(fileContent)
    const content = data.map(doc => doc.toJS()).map(r => e.Scalar(r, new ts.KubenetesResourceType()))

    const ast = e.Vector(content)
    return ast
  }

  const fileContent = fs.readFileSync(filePath, "utf-8")
  const tokens: l.Token[] = l.getTokens(fileContent)
  const ast = e.BuildAst(new Stream(tokens))
  ast.typeConstraint = new ts.VectorType()
  return ast
}

program
  .argument("<source>")
  .option('-o, --output <string>')
  .action(compile)

program.parse()

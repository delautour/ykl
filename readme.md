# YKL - Yet another Kubernetes Language

## Rational

Kubernetes configuration is growingly complex as the number of resources, and in some cases dependencies between them increases. 

The standard way to represent this configuration is through YAML files, to the point where engieers will refer to this configuration as YAMLs. The view is so ubiquitos that even backend engineers refer to these as YAMLs and platform engineers refer to themselves as YAML engineers; which harks to the observation that even with several years of experince engineers don't intute that they are with [structs](https://gobyexample.com/structs), but rather view YAML serilazation of that data as the artifact they are working with.

This has given rise to Helm, which rather than maniupulate data structure directly, relyies on string templating for maniuplation, which is tedious, and [error prone] (https://helm.sh/docs/chart_template_guide/function_list/#indent).

While Kubernetes resourecs themselves are strongly typed, the majority of toolchains do not validate this. There are other projects that aim to solve this.

There are some projects that tackle aspects of these problems (KCL, CUE, Jsonnet) they don't present what I consider to be an elegant soulition. 

## Design goals

- Be familiar to engineers who write YAML day-in-day-out
  - NOT be a superset of YAML
- Focus on manipulation of nested structs
- Have a clean intutive syntax over highly explicit

## Pripiples

- Immutable / Pass by value
- Collections first

## Basics

### Source

YKL supports compilation from both files, and folders.

- Files or folders can be used as input script


- Values can be provided that are accesible to scripts as globals

### Configuration

- Configuration is loaded from the `_config.<ext>` files.

- 

### Modules

## Typing

All results output are expected to be objects that follow the Kubernetes Stanza, that is they include `apiVersion` and `kind` keys. 

```
apiVersion: <...>
kind: <...>
```

## Termonology
In YKL we refer to objects being `yielded` from functions rather than returned.

## Primitives

Unit
: This is the value that represents *nothing*. It's impact depends on operator it is passed to, but the effect is typically to perform no change to the other value.

Struct
: A unique set of named values. Keys must be strings

String
: A string `"The quick brown fox jumped over the lazy dog"`

Number
: A number `3.142`

Bool
: `true` / `false`


### Cardinalites

Unit
: This is the cardinality of `nothing`.

Scalar
: A single instance of a primitve

Vector
: One or more instances of (different) primitives.

## Syntax

### Blocks and Sections

A block is the fundamental scope which YKL operates within. Blocks start with indentation, and `SOF` (Start of file); and end outdents or `EOF`. Blocks can look alot like YAML documents, but they are not equal. 

Blocks contain one or more *sections*. Sections are split by `---` in the same way a YAML file can contain multiple documnets. It is important to note that the content before the first `---` is treated as front-matter and is *not* considered a section.

All blocks are functions (we will describe how to specify arguments later), however due to syntax, they often indisigushible from constants / object literals. 

Sections contain 1 or more expressions (Sections with no expressions are an error) of which we can categorise into two categories: Assignment and evaluated. Assignment expressions add key/properties to the internal state of the section, and can be referenced by future expressions. Any expressions will be evaluated and yielded from the section. If only assignment expressions are used within a section, then the assigned properties are returned as a struct. Properties which are prefixed with `_` are excluded.

The results of all sections are concatinated together to form the result. If the length of the result is `0`, then `Unit` is returned, for length `1` a `Scalar` is returned and otherwise a `Vector` is returned.

### Front-matter

Syntax in front-matter is the same as any other block, however the behaivour is altered. Any assignments made will available as block locals, but *will not* be yielded from the block.

### End-matter

End matter can be used to apply a final transformation to elements yielded from the block. This is a shorthand applying a pipeline operator to the entire block

### How does `-` work**

`-` can be used as the first character in a line to signal indent/outdent behaviour, the indent level will be set to the column of the first non white space character following it, and the following content parsed as a block.

```
<SOF>
#This is the file block

#This is front-matter
_name: Bob
---
#This is the first section
- foo: bar # This is a nested block
  meep: mop
- # Nested blocks can contain sections !!!
  frontmatter: yes I am!
  ---
  # This is the first section of the nested block
  5
---
# And this is the last section of the block
true
...
# This is end matter
<EOF>
```
The resulting of this file will be a vector containing a struct, number, and bool
```yaml
---
foo: bar
meep: mop
---
5
---
true
```
While this might be a bit complex to grok, it comes together to form a powerful syntax that looks like YAML

```yaml
---
apiVersion: ykl/v1
kind: NumberList
spec:
  numbers:
  - 1
  - 2
  - 3
---
apiVersion: ykl/v1
kind: BoolList
spec:
  bools:
  - true
  - false
...
```


Gramar:
```ebnf
BLOCK_EXPR = (ASSIGNMENT, EXPR*) 
SECTIONS = EXPR* | (EXPR*, (SECTION_START EXPR*)+)
BLOCK = INDENT | SOF, SECTIONS, OUTDENT | EOF
```

### Assignment
Assigment works like YAML

`<symbol>: <string|number|bool>`

```yaml
apiVersion: v1
```

to resolve values use `:=`; by doing so tell YKL that the right hand side should be evaluated rather than treated as a string as per normal yaml rules

```yaml
_name: my-app
_appLabels:
  k8s.io/app:= name
---
apiVersion: v1
kind: Deployment
metadata:
  name:= _name
  labels:= _appLables
---
apiVersion: v1
metadata:
  name:= _name
spec:
  selector:
    matchLables:= _appLabels
```

### Operators

>[!TODO]
>decide if this is all cases, or to force consistency we only allow in certain cicumstances; or delegate to out of process tool like linter for styles.

Operators can be either infix, or prefix. They are treated as prefix when they immedatily follow another operator, otherwise if they follow a symbol, they are treated as infix. Infix operators have higher precidence than prefix. This allows the combining operator `+` to be used in two ways.

```
+ 5 6
5 + 6
```

The intent behind this is to allow natural partial application for use with pipelining, which cannot be achived with infix operators alone. For example:

```yaml
_double: * 2
seq: 0..3 | _double
# seq: [0, 2, 4]
```

#### $

`$` on it's own represents the *current* object; which is context dependent. Within a block it is the set of assigned properties at the time it is used, for example:

```yaml
apiVersion: v1
kind: Example

$ #  { "apiVersion": "v1", "kind": "Example" }

spec: {} # Not included in the properties returned by previous `$`
```

Within a pipeline it represents the current value within the iteration.

```
[1, 2, 3] | 10 + $  # [11, 12, 13]
```

##### Backtracking

>[!TODO]
>Verify if needed before implementation

`$<int>` will backtrack up the context stack by the specified number of steps. `$0` is equivelant to `$`

##### Variable capture

`$<symbol>` can be used to create function that receives a single argument that will be avaiable to nested expressions under the alias `$<symbol>`.

```
f:= $metadata
      apiVersion: v1
      kind: Something
      metadata:= $metadata

f name: Bob
  namespace: default
```

The primary use is for pipelining where it is prefered to be more expliciti than to use `$` individually

```
items | $item
  foo: $item:foo + 10
  bar: $item:bar
```

### Pipelining

The pipeline operator `|` operator takes two arguments a (transposer)[https://medium.com/javascript-scene/transducers-efficient-data-processing-pipelines-in-javascript-7985330fe73d] function, and an enumeration target.

Enumeration behaviour:

Unit
: Unit

Scalar
: Treated as collection of one object, and the scalar is passed to the transpose function exactly once.

Vector
: Each item in the vector is passed to the transpose function in order

In this example we pipeline using the `+` (combinining) operator as the transpose function

```
labels:= | +
  - _defaultLabels
  - resource.k8s/specific: bob
```


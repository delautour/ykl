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
- Have a clean syntax
- Explicit
  - Side effects / state should not be required for static configuration


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



## Syntax


### Operators


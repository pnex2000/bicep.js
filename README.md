bicep.js
========

ARM assembler interpreter in JavaScript

What?
=====

Write ARM assembler and it will be interpreted -- results are shown as register and memory contents.
No directives needed (or currently allowed.. ); just write plain ASM.

Still very much work in progress: error reporting is minimal, pc is not modeled correctly etc.
Instructions supported are adds, subtracts, bitwise ops, moves, compares, B, LDR and STR. Constraints
on instructions are not checked. So you are free to cotribute, but don't expect the current version to
be an accurate simulation :)






bicep.js
========

ARM assembler interpreter in JavaScript

What?
=====

Write ARM assembler and it will be interpreted -- results are shown as register and memory contents.
No directives needed (or currently allowed.. ); just write plain ASM.

Still very much work in progress: error reporting is minimal, pc is not modeled correctly etc.
Instructions supported are adds, subtracts, bitwise ops, moves, compares, B, LDR and STR. All conditionals
work and inline shifts (not rotates) work. Constraints
on instructions are not checked. So you are free to cotribute, but don't expect the current version to
be an accurate simulation :)

Why?
====

Ever just wanted to try out something in a REPL? Now it can be done in ARM assembly!

It all started with the intent to understand ARM assembler better, to try out how well JavaScript suits this 
sort of application and to have an easy way to try some things in assembler rather than firing up a full system
vm.

Did JS work out for this? It can be done, it's not really painful, but there are better languages out
there for this sort of work. Somewhat surprisingly, not having printf was the main thing leading to ugly code.


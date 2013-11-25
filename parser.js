/*
The MIT License (MIT)

Copyright (c) 2013 Oskar Ojala

See LICENSE for details
*/

"use strict";

function throwDecodeEx(msg) {
  throw {
    name: 'DecodeError',
    message: msg
  }
}

function readProgram(vm, program) {
  function removeComments(line) {
    return line.indexOf(';') !== -1 ? line.slice(0, line.indexOf(';')) : line
  }
  function trim(line) {
    return line.trim()
  }
  function removeEmptyLines(line) {
    return line.length > 0
  }
  var lines = program.replace(/\r/g, '').split("\n").map(removeComments).map(trim).filter(removeEmptyLines)

  var instrs = lines.map(function (line, idx) { return parseLine(line, idx) })
  return {ops: instrs, labels: calculateLabels(instrs)}
}

function calculateLabels(instrs) {
  var labels = {}
  for (var i = 0; i < instrs.length; i++) {
    if (instrs[i].label)
      labels[instrs[i].label] = i
  }
  return labels
}

function parseLine(line, lineNumber) {
  var tokens = tokenize(line, lineNumber)
  return decodeOp(tokens, lineNumber)
}

function tokenize(line, lineNumber) {
  function orReducer(memo, val) {
    return memo + '|' + val
  }
  var labelRE = '[A-Za-z0-9]+'
  var labelDecRE = '(?:(' + labelRE + ')\\s+)?'
  var allInstrs = listAllOps().reduce(orReducer)
  var allConds = Object.keys(condCodes).reduce(orReducer)
  var instrRE = '(' + allInstrs + ')(' + allConds + ')?(S)?' // FIXME reverse S and cond
  //var immediateRE = '#\\d+'
  
  var nameRE = '[^,\\s]+'
  var op3RE = '[A-Za-z]{3}'
  var registerRE = '[rR]\\d\\d?'
  var asmLineRE = new RegExp(labelDecRE + instrRE + '\\s+(' + nameRE + ')\\s*(.*)$')

  //var flexOp2RE = '(#\\d+|' + registerRE + '|' + registerRE + '), (' + op3RE + '(?: (?:' + registerRE + '|#\\d+))?)'
  //var asmArgsRE = new RegExp('(?:,\\s*(' + nameRE +'))?(?:, ' + flexOp2RE + ')?')
  
  var out = asmLineRE.exec(line)
  if (!out)
    throwDecodeEx("Invalid instruction format '"+ line +"', line " + lineNumber);
  var srcArgs = out[6].split(/[, ]+/).filter(function (s) { return s.length > 0 })
  out[6] = srcArgs
  return out
}

function decodeOp(tokens, lineNumber) {
  function hasShift() {
    var shiftsRE = new RegExp(Object.keys(shiftOps).reduce(function (memo, val) { return memo + '|' + val }))
    return function(srcs) {
      for (var i=0; i < srcs.length; ++i) {
        if (shiftsRE.test(srcs[i]))
          return i
      }
      return -1
    }
  }
  // The result of the shift operation is used as Operand2 in the instruction, but Rm itself is not altered.
  // http://infocenter.arm.com/help/index.jsp?topic=/com.arm.doc.dui0204j/Cihbeage.html
  function decodeSources(srcs) {
    var ishift = hasShift()(srcs)
    if (ishift != -1) {
      var sf = shiftOps[srcs[ishift]]
      var sourceUpdater = function(argResolver) { return sf(undefined, [argResolver(srcs[ishift-1]), argResolver(srcs[ishift+1])]) }
      var plainRegs = srcs.slice(0, ishift-1)
      plainRegs.push(sourceUpdater)
      return plainRegs
    }
    return srcs
  }
  
  // TODO validate
  // TODO addr of instr
  var label = tokens[1]
  var op = tokens[2]
  var condCode = tokens[3]
  var updateApsr = tokens[4] === 'S' ? apsrUpdateMode(op) : undefined
  var target = tokens[5]
  var sources = decodeSources(tokens[6])
  var op = makeOp(lineNumber, label, op, target, sources, condCode, updateApsr, execForOp(op))
  
  return op
}

// TODO binary numbers
var condCodes = {'AL': '1110', 'NV': '1111',
                 'EQ': '0000', 'NE': '0001',
                 'CS': '0010', 'HS': '0010', 'CC': '0011', 'LO': '0011',
                 'MI': '0100', 'PL': '0101',
                 'VS': '0110', 'VC': '0111',
                 'HI': '1000', 'LS': '1001',
                 'GE': '1010', 'LT': '1011', 'GT': '1100', 'LE': '1101'}

var arithmeticOps = {'ADD': function (vm, s) { return s[0] + s[1] },
                     'ADC': function (vm, s) { return s[0] + s[1] + vm.getCpsrC()},
                     'SUB': function (vm, s) { return s[0] - s[1] },
                     'SBC': function (vm, s) { return s[0] - s[1] + vm.getCpsrC() - 1},
                     'RSB': function (vm, s) { return s[1] - s[0] },
                     'RSC': function (vm, s) { return s[1] - s[0] + vm.getCpsrC() - 1}}

var bitwiseOps = {'AND': function (vm, s) { return s[0] & s[1] },
                  'EOR': function (vm, s) { return s[0] ^ s[1] },
                  'ORR': function (vm, s) { return s[0] | s[1] },
                  'BIC': function (vm, s) { return s[0] & ~s[1] }}

var moveOps = {'MOV': function (vm, s) { return s[0] },
               'MVN': function (vm, s) { return ~s[0] }}

var comparisonOps = {'CMP': function (vm, s) { vm.updateApsr(s[0] - s[1], 'SUB') },
                     'CMN': function (vm, s) { vm.updateApsr(s[0] + s[1], 'ADD') },
                     'TST': function (vm, s) { vm.updateApsr(s[0] & s[1], 'SHIFT') },
                     'TEQ': function (vm, s) { vm.updateApsr(s[0] ^ s[1], 'SHIFT') }}

// immediates are not supported, result cannot be first source, p.55
var multiplies = ['MUL', 'MLA']

var shiftOps = {'LSL': function (vm, s) { return s[0] << s[1] },
                'LSR': function (vm, s) { return s[0] >>> s[1] },
                'ASR': function (vm, s) { return s[0] >> s[1] },
                'ROR': function (vm, s) { return 0; }, // TODO
                'RRX': function (vm, s) { return 0; }} // TODO

// TODO ADR, LDRB
var loadStoreOps = {'LDR': function (vm, s) { return vm.readMem32(s[0]) },
                    'STR': function (vm, s) { vm.writeMem32(s[1], s[0]) }}

// one operand
var branchOps = ['B']

function listAllOps() {
    return branchOps.concat(Object.keys(arithmeticOps),
                            Object.keys(bitwiseOps),
                            Object.keys(moveOps),
                            Object.keys(comparisonOps),
                            Object.keys(loadStoreOps))
}

function apsrUpdateMode(op) {
    switch(op) {
    case 'ADD':
    case 'ADC':
    case 'CMN':
        return 'ADD'
    case 'CMP':
    case 'SUB':
    case 'SBC':
    case 'RSB':
    case 'RSC':
        return 'SUB'
    case 'AND':
    case 'ORR':
    case 'EOR':
    case 'BIC':
    case 'MOV':
    case 'MVN':
        return 'SHIFT'
    default:
        return 'OTHER'
    }
}

function execForOp(instr) {
  function makeRegUpdater(func) {
    return function(vm, op) {
      vm.updateReg(op.target, func(vm, op.resolveArgs(vm)), op.updateApsr)
    }
  }
  function makeComp(func) {
    return function(vm, op) {
      func(vm, op.targetlessArgs(vm))
    }  
  }
  function makeStore(func) {
    return function(vm, op) {
      func(vm, op.targetlessArgs(vm))
    }  
  }
  switch (instr) {
  case 'ADD':
  case 'ADC':
  case 'SUB':
  case 'SBC':
  case 'RSB':
  case 'RSC':
    return makeRegUpdater(arithmeticOps[instr])
  case 'LSL':
  case 'LSR':
  case 'ASR':
    return makeRegUpdater(shiftOps[instr])
  case 'MOV':
    return makeRegUpdater(moveOps[instr])
  case 'CMP':
  case 'CMN':
  case 'TST':
  case 'TEQ':
      return makeComp(comparisonOps[instr])
  case 'LDR':
      return makeRegUpdater(loadStoreOps[instr])
  case 'STR':
      return makeStore(loadStoreOps[instr])
  case 'B':
    return function(vm, op) {
      return op.target
    }
  }
}

function makeOp(addr, label, instr, target, sources, condCode, updateApsr, execF) {
  var opcode = 0
  return {opcode: opcode,
          addr: addr,
          label: label,
          instr: instr,
          target: target,
          sources: sources,
          condCode: condCode,
          updateApsr: updateApsr,
          
          getArgValue: function(vm) {
            return function(arg) {
              arg = arg.toUpperCase()
              if (arg.charAt(0) === 'R') {
                return vm.readReg(arg)
              } else if (arg.charAt(0) === '#') {
                var numAsStr = arg.slice(1)
                return arg.slice(1,3) == '0X' ? parseInt(numAsStr, 16) : parseInt(numAsStr, 10)
              } else if (arg.charAt(0) === '[') { // TODO make the arg a function
                return vm.readReg(arg.slice(1,3))
              } else {
                throwDecodeEx("Invalid argument '"+ arg +"', address " + addr);
              }
            }
          },
          
          argResolve: function(vm) {
            var that = this
            return function(arg) {
              if (typeof arg === 'function') {
                return arg(that.getArgValue(vm))
              } else {
                return that.getArgValue(vm)(arg)
              }
            }
          },
          
          resolveArgs: function(vm) {
            var as = this.sources.map(this.argResolve(vm))
            return as
          },

          targetlessArgs: function(vm) {
            var sources = [this.target].concat(this.sources)
            var as = sources.map(this.argResolve(vm))
            return as
          },
          
          exec: function (vm) { return execF(vm, this) }
        }
}

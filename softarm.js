/*
The MIT License (MIT)

Copyright (c) 2013 Oskar Ojala

See LICENSE for details
*/

"use strict";

var arrayOfSize = function(size) {
  var a = new Array(size)
  for (var i=0; i < a.length; ++i)
    a[i] = 0;
  return a
}

var vmConfiguration = {
  memSizeWords: 256,
  physMemOffset: 0x20000000,
  dataOffset: 0x0
}

function createVm(vmconf) {
  return {
    regFile: {
      R0: 0,
      R1: 0,
      R2: 0,
      R3: 0,
      R4: 0,
      R5: 0,
      R6: 0,
      R7: 0,
      R8: 0,
      R9: 0,
      R10: 0,
      R11: 0,
      R12: 0,
      R13: 0,
      R14: 0,
      R15: 0,
      cpsr: 0
    },

    memory: arrayOfSize(vmconf.memSizeWords),
    
    reset: function() {
      var name;
      for (name in this.regFile) {
        if (typeof(this.regFile[name]) !== 'function') {
          this.regFile[name] = 0
        }
      }
      for (var i=0; i < this.memory.length; ++i)
          this.memory[i] = 0;
    },
    
    condTruthy: function (condCode) {
      switch (condCode) {
        case 'AL': return true
        case 'EQ': return this.getCpsrZ() === 1
        case 'NE': return this.getCpsrZ() === 0
        case 'CS':
        case 'HS': return this.getCpsrC() === 1
        case 'CC':
        case 'LO': return this.getCpsrC() === 0
        case 'MI': return this.getCpsrN() === 1
        case 'PL': return this.getCpsrN() === 0
        case 'VS': return this.getCpsrV() === 1
        case 'VC': return this.getCpsrV() === 0

        case 'HI': return this.getCpsrC() === 1 && this.getCpsrZ() === 0
        case 'LS': return this.getCpsrC() === 0 || this.getCpsrZ() === 1

        case 'GE': return this.getCpsrN() === this.getCpsrV()
        case 'LT': return this.getCpsrN() !== this.getCpsrV()
        case 'GT': return this.getCpsrZ() === 0 && this.getCpsrN() === this.getCpsrV()
        case 'LE': return this.getCpsrZ() === 1 || this.getCpsrN() !== this.getCpsrV()
      }
    },
    
    executeOps: function(program) {
      var ops = program.ops, labels = program.labels
      var i = 0, bt = undefined
      while (i < ops.length) {
        if (ops[i].condCode === undefined || this.condTruthy(ops[i].condCode)) {
          bt = ops[i].exec(this)
        }
        if (bt !== undefined) {
          i = labels[bt]
          bt = undefined
        } else {
          i++
        }
      }
    },

    executeSingle: function(program) {
      var ops = program.ops, labels = program.labels
      var i = 0, bt = undefined
      var that = this
      return function() {
        if (i >= ops.length)
          return
        if (ops[i].condCode === undefined || that.condTruthy(ops[i].condCode)) {
          bt = ops[i].exec(that)
        }
        if (bt !== undefined) {
          i = labels[bt]
          bt = undefined
        } else {
          i++
        }
      }
    },

    validMemAddress: function(addr) {
      if (addr & 0x3)
        throw {
            name: 'AddressingException',
            message: 'Address ' + addr + ' is not word aligned!'
        }
      var offsetWords = (addr - vmconf.physMemOffset)>>2
      if (offsetWords < 0 || offsetWords > vmconf.memSizeWords)
        throw {
            name: 'AddressingException',
            message: 'Address ' + addr + ' is outside mapped memory!'
        }
      return offsetWords
    },
    readMem32: function(addr) {
      var offsetWords = this.validMemAddress(addr)
      return this.memory[offsetWords]
    },
    writeMem32: function(addr, word) {
      var offsetWords = this.validMemAddress(addr)
      this.memory[offsetWords] = word
    },
    getMemCopy: function() {
      return this.memory.slice(0)
    },
    
    readReg: function(reg) {
      return this.regFile[reg]
    },
    // Negative, Zero, Carry, oVerflow
    getCpsrN: function() {
      return (this.regFile.cpsr >> 31) & 1;
    },
    getCpsrZ: function() {
      return (this.regFile.cpsr >> 30) & 1;
    },
    getCpsrC: function() {
      return (this.regFile.cpsr >> 29) & 1;
    },
    getCpsrV: function() {
      return (this.regFile.cpsr >> 28) & 1;
    },
    
    updateApsr: function(val, opType) {
      // clear condition codes
      this.regFile.cpsr &= 0x0fffffff
      // N=negative
      this.regFile.cpsr |= val < 0 ? 0x80000000: 0
      // Z=zero
      this.regFile.cpsr |= val === 0 ? 0x40000000: 0
      // C=carry
      switch (opType) {
      case 'ADD':
        this.regFile.cpsr |= val > 0xffffffff ? 0x20000000: 0
        break
      case 'SUB':
        this.regFile.cpsr |= val >= 0 ? 0x20000000: 0
        break
      case 'SHIFT':
        // TODO
        break
      default:
        // do nothing
        break
      }
      // V=overflow
      switch (opType) {
      case 'ADD':
      case 'SUB':
        this.regFile.cpsr |= val > 0x7fffffff || val < -2147483648 ? 0x10000000: 0
        break
      default:
        // do nothing
        break
      }
      // This makes JS interpret the value as unsigned for display purposes
      this.regFile.cpsr >>>= 0
    },

    updateReg: function(reg, value, updateCond) {
      reg = reg.toUpperCase()
      if (reg === 'PC')
        reg = 'R15'
      if (this.regFile.hasOwnProperty(reg)) {
        this.regFile[reg] = value & 0xffffffff
        if (updateCond)
          this.updateApsr(value, updateCond)
        updateRegDisplay(reg, value)
      } else {
        throw {
            name: 'StateModificationException',
            message: 'Register ' + reg + ' does not exist!'
        }
      }
    }
  }
}

var updateRegDisplay = function(reg, value) {
  var regLc = reg.toLowerCase()
  document.getElementById(regLc + 'row').className = 'highlight'
  document.getElementById(regLc + 'val').textContent = value
}

var displayRegs = function (vm) {
  function displayR(reg, value) {
    document.getElementById(reg + 'val').textContent = value
  }
  for (var i=0; i < 16; ++i) {
    displayR('r' + i, vm.readReg('R' + i))
  }
  displayR('cpsr', '0x' + vm.readReg('cpsr').toString(16))
}

var clearRegHighlights = function() {
  for (var i=0; i < 16; ++i) {
    document.getElementById('r' + i + 'row').className = ''
  }
  document.getElementById('cpsrrow').className = ''
}

var drawMemtable = function() {
  var start = 0x20000000
  var end = start + 1024
  var wordsPerRow = 8
  var memView = document.getElementById('memtable')
  for (var i = start; i < end; i += wordsPerRow << 2) {
    var tr = document.createElement('tr')
    memView.appendChild(tr)
    var td = document.createElement('td')
    tr.appendChild(td)
    td.appendChild(document.createTextNode(i.toString(16)))
    for (var j=i; j < i+(wordsPerRow << 2); j+=4) {
      var td = document.createElement('td')
      tr.appendChild(td)
      td.appendChild(document.createTextNode('0'))
    }
  }
}

var updateMemtable = function(memValues) {
  var memView = document.getElementById('memtable')
  for (var i = 1; i < memView.children.length; i++) {
    var tr = memView.children[i]
    var wordsPerRow = tr.children.length - 1
    for (var j = 1; j < tr.children.length; j++) {
      tr.children[j].childNodes[0].data = memValues[(i-1) * wordsPerRow + (j-1)]
    }
  }
}

function resetVmAndGUI(vm) {
    vm.reset()
    displayRegs(vm)
    clearRegHighlights()
    updateMemtable(vm.getMemCopy())
    clearLogs()
    window.vmIsReset = true
}

function runProgram(vm) {
  return function() {
    resetVmAndGUI(vm)
    try {
      var program = readProgram(vm, document.getElementById('program').value)
      vm.executeOps(program)
    } catch (e) {
      //console.log('EXCEPTION: ' + e.name + '\nReason: ' + e.message + '\n')
      updateLog('EXCEPTION: ' + e.name + '\nReason: ' + e.message + '\n')
    }
    displayRegs(vm);
    updateMemtable(vm.getMemCopy())
    window.vmIsReset = true
  }
}

function resetState(vm) {
  return function() {
    resetVmAndGUI(vm)
  }
}

function stepProgram(vm) {
  var stepF
  return function() {
    if (vmIsReset) {
      resetVmAndGUI(vm)
      var program = readProgram(vm, document.getElementById('program').value)
      stepF = vm.executeSingle(program)
      stepF()
      updateMemtable(vm.getMemCopy())
      window.vmIsReset = false
    } else {
      stepF()
      updateMemtable(vm.getMemCopy())
    }
  }
}

function updateLog(msg) {
  document.getElementById('log').textContent += msg
}

function clearLogs() {
  document.getElementById('log').textContent = ''
}

function domLoaded() {
  document.removeEventListener( "DOMContentLoaded", domLoaded, false)
  var vm = createVm(vmConfiguration)
  displayRegs(vm)
  drawMemtable()
  document.getElementById('runButton').onclick = runProgram(vm)
  document.getElementById('resetButton').onclick = resetState(vm)
  document.getElementById('stepButton').onclick = stepProgram(vm)
  window.vmIsReset = true
}

document.addEventListener( "DOMContentLoaded", domLoaded, false)

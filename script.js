const OPCODES = {
  LDA: 0b0000,
  ADD: 0b0001,
  SUB: 0b0010,
  OUT: 0b1110,
  HLT: 0b1111
};

const memory = new Array(16).fill(0);
const state = {
  pc: 0,
  mar: 0,
  ir: 0,
  accumulator: 0,
  bRegister: 0,
  output: 0,
  bus: null,
  cycles: 0,
  codeLength: 0,
  loaded: false,
  started: false,
  halted: false
};

const messageElement = document.querySelector("#ui-message");
const machineStateElement = document.querySelector("#machine-state");
const cycleCountElement = document.querySelector("#cycle-count");
const busValueElement = document.querySelector("#w-bus-value");
const ledDisplay = document.querySelector("#led-display");
const outputBinaryElement = document.querySelector("#output-binary");
const programInput = document.querySelector("#program-input");

function formatHex(value) {
  return `${value.toString(16).toUpperCase().padStart(2, "0")}H`;
}

function showMessage(message, isError = false) {
  messageElement.textContent = message;
  messageElement.dataset.state = isError ? "error" : "normal";
}

function parseHex(text, lineNumber, description, maximum) {
  let token = text.trim().toUpperCase();
  if (token.endsWith("H")) token = token.slice(0, -1);
  if (token.startsWith("0X")) token = token.slice(2);

  if (!/^[0-9A-F]{1,2}$/.test(token)) {
    throw new Error(`Line ${lineNumber}: ${description} must be a hexadecimal value.`);
  }

  const value = Number.parseInt(token, 16);
  if (value > maximum) {
    throw new Error(`Line ${lineNumber}: ${description} must be between 00H and ${formatHex(maximum)}.`);
  }
  return value;
}

function parseProgram(source) {
  const instructions = [];
  const dataEntries = [];

  source.split(/\r?\n/).forEach((originalLine, index) => {
    const lineNumber = index + 1;
    const line = originalLine.replace(/[;#].*$/, "").trim().toUpperCase();
    if (!line) return;

    if (line.includes(":")) {
      const parts = line.split(":");
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        throw new Error(`Line ${lineNumber}: data must use the format address: byte, such as 0E: 05.`);
      }
      const address = parseHex(parts[0], lineNumber, "Data address", 0x0F);
      const value = parseHex(parts[1], lineNumber, "Data byte", 0xFF);
      if (dataEntries.some((entry) => entry.address === address)) {
        throw new Error(`Line ${lineNumber}: address ${formatHex(address)} is listed more than once.`);
      }
      dataEntries.push({ address, value, lineNumber });
      return;
    }

    const fields = line.split(/\s+/);
    const mnemonic = fields[0];
    if (!Object.prototype.hasOwnProperty.call(OPCODES, mnemonic)) {
      throw new Error(`Line ${lineNumber}: unknown instruction "${mnemonic}".`);
    }

    const needsAddress = mnemonic === "LDA" || mnemonic === "ADD" || mnemonic === "SUB";
    if (needsAddress && fields.length !== 2) {
      throw new Error(`Line ${lineNumber}: ${mnemonic} needs one memory address (0H to FH).`);
    }
    if (!needsAddress && fields.length !== 1) {
      throw new Error(`Line ${lineNumber}: ${mnemonic} does not take an operand.`);
    }
    const operand = needsAddress ? parseHex(fields[1], lineNumber, "Instruction address", 0x0F) : 0;
    instructions.push({ opcode: OPCODES[mnemonic], operand, mnemonic, lineNumber });
  });

  if (instructions.length === 0) {
    throw new Error("Enter at least one instruction before loading the program.");
  }
  if (instructions.length > memory.length) {
    throw new Error("A program can contain at most 16 instructions.");
  }

  const conflictingData = dataEntries.find((entry) => entry.address < instructions.length);
  if (conflictingData) {
    throw new Error(`Line ${conflictingData.lineNumber}: data at ${formatHex(conflictingData.address)} overlaps an instruction.`);
  }

  return { instructions, dataEntries };
}

function updateDisplays() {
  document.querySelector('[data-register="pc"]').textContent = `${state.pc.toString(16).toUpperCase()}H`;
  document.querySelector('[data-register="mar"]').textContent = `${state.mar.toString(16).toUpperCase()}H`;
  document.querySelector('[data-register="ir"]').textContent =
    `${state.ir.toString(2).padStart(8, "0").slice(0, 4)} ${state.ir.toString(2).padStart(8, "0").slice(4)}`;
  document.querySelector('[data-register="accumulator"]').textContent = formatHex(state.accumulator);
  document.querySelector('[data-register="bRegister"]').textContent = formatHex(state.bRegister);
  document.querySelector('[data-register="output"]').textContent = formatHex(state.output);

  document.querySelectorAll("[data-memory-value]").forEach((cell) => {
    cell.textContent = memory[Number(cell.dataset.memoryValue)].toString(16).toUpperCase().padStart(2, "0");
  });

  busValueElement.textContent = state.bus === null ? "—" : formatHex(state.bus);
  cycleCountElement.textContent = state.cycles.toString().padStart(2, "0");
  machineStateElement.textContent = state.halted ? "Halted" : state.started ? "Running" : state.loaded ? "Loaded" : "Ready";

  const bits = state.output.toString(2).padStart(8, "0");
  ledDisplay.setAttribute("aria-label", `Eight output LEDs showing ${bits}`);
  outputBinaryElement.textContent = bits;
  ledDisplay.querySelectorAll(".led-bit").forEach((bitElement, index) => {
    const isOn = bits[index] === "1";
    bitElement.querySelector(".led").classList.toggle("is-on", isOn);
    bitElement.querySelector("span:last-child").textContent = bits[index];
  });
}

function resetCpu() {
  state.pc = 0;
  state.mar = 0;
  state.ir = 0;
  state.accumulator = 0;
  state.bRegister = 0;
  state.output = 0;
  state.bus = null;
  state.cycles = 0;
  state.started = false;
  state.halted = false;
}

function loadProgram() {
  try {
    const parsed = parseProgram(programInput.value);
    memory.fill(0);

    parsed.instructions.forEach((instruction, address) => {
      memory[address] = (instruction.opcode << 4) | instruction.operand;
    });
    parsed.dataEntries.forEach(({ address, value }) => {
      memory[address] = value;
    });

    resetCpu();
    state.codeLength = parsed.instructions.length;
    state.loaded = true;
    updateDisplays();
    showMessage(`Loaded ${parsed.instructions.length} instruction(s) and ${parsed.dataEntries.length} data value(s).`);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function executeInstruction() {
  if (!state.loaded) {
    showMessage("Load a valid program before stepping or running.", true);
    return false;
  }
  if (state.halted) {
    showMessage("The processor is halted. Reset or load another program to continue.");
    return false;
  }
  if (state.pc >= state.codeLength || state.cycles >= memory.length) {
    state.halted = true;
    updateDisplays();
    showMessage("Reached the end of the entered instructions.");
    return false;
  }

  // Fetch: MAR selects the instruction, IR receives it, then the 4-bit PC advances.
  state.mar = state.pc;
  state.ir = memory[state.mar];
  state.bus = state.ir;
  state.pc = (state.pc + 1) & 0x0F;
  state.started = true;

  const opcode = (state.ir >> 4) & 0x0F;
  const operand = state.ir & 0x0F;
  state.cycles += 1;

  switch (opcode) {
    case OPCODES.LDA:
      state.mar = operand;
      state.accumulator = memory[state.mar];
      state.bus = state.accumulator;
      break;
    case OPCODES.ADD: {
      state.mar = operand;
      state.bRegister = memory[state.mar];
      // The accumulator keeps only the low 8 bits, just like an 8-bit register.
      state.accumulator = (state.accumulator + state.bRegister) & 0xFF;
      state.bus = state.accumulator;
      break;
    }
    case OPCODES.SUB: {
      state.mar = operand;
      state.bRegister = memory[state.mar];
      // A - B is A + two's-complement(B), reduced to 8 bits.
      const twosComplementB = ((~state.bRegister) + 1) & 0xFF;
      state.accumulator = (state.accumulator + twosComplementB) & 0xFF;
      state.bus = state.accumulator;
      break;
    }
    case OPCODES.OUT:
      state.output = state.accumulator;
      state.bus = state.output;
      break;
    case OPCODES.HLT:
      state.halted = true;
      break;
    default:
      state.halted = true;
      updateDisplays();
      showMessage(`Invalid opcode ${opcode.toString(2).padStart(4, "0")} at ${formatHex(state.mar)}.`, true);
      return false;
  }

  updateDisplays();
  if (state.halted) {
    showMessage(`HLT executed after ${state.cycles} instruction(s).`);
  } else {
    showMessage(`${state.cycles}: ${Object.keys(OPCODES).find((name) => OPCODES[name] === opcode)} executed.`);
  }
  return true;
}

function runProgram() {
  if (!state.loaded) {
    showMessage("Load a valid program before stepping or running.", true);
    return;
  }
  let executed = 0;
  while (!state.halted && state.pc < state.codeLength && executed < memory.length) {
    if (!executeInstruction()) break;
    executed += 1;
  }
  if (!state.halted && state.pc >= state.codeLength) {
    state.halted = true;
    updateDisplays();
    showMessage("Reached the end of the entered instructions.");
  } else if (!state.halted && executed >= memory.length) {
    state.halted = true;
    updateDisplays();
    showMessage("Stopped after one 16-address memory pass because no HLT was reached.");
  }
}

function resetMachine() {
  memory.fill(0);
  resetCpu();
  state.codeLength = 0;
  state.loaded = false;
  updateDisplays();
  showMessage("Machine reset. Load a program to begin.");
}

document.querySelector('[data-action="Load Program"]').addEventListener("click", loadProgram);
document.querySelector('[data-action="Step"]').addEventListener("click", executeInstruction);
document.querySelector('[data-action="Run"]').addEventListener("click", runProgram);
document.querySelector('[data-action="Reset"]').addEventListener("click", resetMachine);

updateDisplays();

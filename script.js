const OPCODES = { LDA: 0b0000, ADD: 0b0001, SUB: 0b0010, OUT: 0b1110, HLT: 0b1111 };
const NAMES = Object.fromEntries(Object.entries(OPCODES).map(([n, o]) => [o, n]));

const REGISTERS = [
  { key: "pc", label: "Program Counter", abbr: "PC", bits: 4, note: "Next address", kind: "addr" },
  { key: "mar", label: "Memory Address", abbr: "MAR", bits: 4, note: "Selected address", kind: "addr" },
  { key: "ir", label: "Instruction", abbr: "IR", bits: 8, note: "Current instruction", kind: "addr" },
  { key: "accumulator", label: "Accumulator", abbr: "A", bits: 8, note: "Working value", kind: "data" },
  { key: "bRegister", label: "B-Register", abbr: "B", bits: 8, note: "Temporary value", kind: "data" },
  { key: "output", label: "Output Register", abbr: "OUT", bits: 8, note: "Output value", kind: "out" }
];

const memory = new Array(16).fill(0);
const state = {
  pc: 0, mar: 0, ir: 0, accumulator: 0, bRegister: 0, output: 0,
  bus: null, busSource: "Idle", active: [], cycles: 0, codeLength: 0,
  loaded: false, started: false, halted: false
};
const previous = {};

const $ = (selector) => document.querySelector(selector);
const messageElement = $("#ui-message");
const machineStateElement = $("#machine-state");
const cycleCountElement = $("#cycle-count");
const busValueElement = $("#w-bus-value");
const busElement = $("#bus");
const busSourceElement = $("#bus-source");
const ledDisplay = $("#led-display");
const outputBinaryElement = $("#output-binary");
const outputDecimalElement = $("#output-decimal");
const programInput = $("#program-input");
const statusDot = $("#status-dot");
const statusText = $("#status-text");

const hex = (value, digits = 2) => value.toString(16).toUpperCase().padStart(digits, "0");
const formatHex = (value) => `${hex(value)}H`;
const binary = (value, bits) => value.toString(2).padStart(bits, "0");

/* ---------- Build static UI ---------- */

$("#register-grid").innerHTML = REGISTERS.map((r) => `
  <article class="register-card" data-kind="${r.kind}" data-reg="${r.key}">
    <div class="reg-head"><span>${r.label}</span><abbr title="${r.label}">${r.abbr}</abbr></div>
    <strong class="reg-hex"></strong>
    <div class="reg-bin" aria-hidden="true"></div>
    <small>${r.note}</small>
  </article>`).join("");

$("#memory-grid").innerHTML = memory.map((_, i) => `
  <div class="mem-cell" data-mem="${i}">
    <span class="addr">${hex(i, 1)}H</span>
    <span class="val"><span class="hexv">00</span><small class="mnemonic"></small></span>
    <span class="tags"></span>
  </div>`).join("");

busElement.innerHTML = [7, 6, 5, 4, 3, 2, 1, 0].map((b) => `<div class="bus-line"><i></i><span>${b}</span></div>`).join("");
ledDisplay.innerHTML = [7, 6, 5, 4, 3, 2, 1, 0].map((b) => `
  <div class="led-bit"><span class="led" aria-hidden="true"></span><span class="bit">0</span><span>${1 << b}</span></div>`).join("");

/* ---------- Parsing (unchanged behaviour) ---------- */
function showMessage(message, isError = false) {
  messageElement.textContent = message;
  messageElement.dataset.state = isError ? "error" : "normal";
}

function parseHex(text, lineNumber, description, maximum) {
  let token = text.trim().toUpperCase();
  if (token.endsWith("H")) token = token.slice(0, -1);
  if (token.startsWith("0X")) token = token.slice(2);
  if (!/^[0-9A-F]{1,2}$/.test(token)) throw new Error(`Line ${lineNumber}: ${description} must be a hexadecimal value.`);
  const value = Number.parseInt(token, 16);
  if (value > maximum) throw new Error(`Line ${lineNumber}: ${description} must be between 00H and ${formatHex(maximum)}.`);
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
    if (!Object.prototype.hasOwnProperty.call(OPCODES, mnemonic)) throw new Error(`Line ${lineNumber}: unknown instruction "${mnemonic}".`);
    const needsAddress = mnemonic === "LDA" || mnemonic === "ADD" || mnemonic === "SUB";
    if (needsAddress && fields.length !== 2) throw new Error(`Line ${lineNumber}: ${mnemonic} needs one memory address (0H to FH).`);
    if (!needsAddress && fields.length !== 1) throw new Error(`Line ${lineNumber}: ${mnemonic} does not take an operand.`);
    const operand = needsAddress ? parseHex(fields[1], lineNumber, "Instruction address", 0x0F) : 0;
    instructions.push({ opcode: OPCODES[mnemonic], operand, mnemonic, lineNumber });
  });

  if (instructions.length === 0) throw new Error("Enter at least one instruction before loading the program.");
  if (instructions.length > memory.length) throw new Error("A program can contain at most 16 instructions.");
  const conflict = dataEntries.find((entry) => entry.address < instructions.length);
  if (conflict) throw new Error(`Line ${conflict.lineNumber}: data at ${formatHex(conflict.address)} overlaps an instruction.`);
  return { instructions, dataEntries };
}

/* ---------- Rendering ---------- */
function bitsMarkup(value, bits) {
  return binary(value, bits).split("").map((b, i) =>
    `${bits === 8 && i === 4 ? '<span class="gap"></span>' : ""}<span class="${b === "1" ? "on" : ""}">${b}</span>`).join("");
}

function updateDisplays() {
  REGISTERS.forEach(({ key, bits }) => {
    const card = document.querySelector(`[data-reg="${key}"]`);
    const value = state[key];
    card.querySelector(".reg-hex").textContent = bits === 4 ? `${hex(value, 1)}H` : formatHex(value);
    card.querySelector(".reg-bin").innerHTML = bitsMarkup(value, bits);
    if (previous[key] !== undefined && previous[key] !== value) {
      card.classList.remove("is-changed");
      void card.offsetWidth; // restart animation
      card.classList.add("is-changed");
    }
    previous[key] = value;
  });

  document.querySelectorAll("[data-mem]").forEach((cell) => {
    const address = Number(cell.dataset.mem);
    const value = memory[address];
    const isCode = state.loaded && address < state.codeLength;
    cell.querySelector(".hexv").textContent = hex(value);
    cell.querySelector(".mnemonic").textContent = isCode
      ? `${NAMES[value >> 4] ?? "?"}${["LDA", "ADD", "SUB"].includes(NAMES[value >> 4]) ? " " + hex(value & 15, 1) : ""}` : "";
    const isPc = state.loaded && !state.halted && address === state.pc;
    const isMar = state.started && address === state.mar;
    cell.classList.toggle("is-pc", isPc);
    cell.classList.toggle("is-mar", isMar);
    cell.querySelector(".tags").innerHTML = (isPc ? '<span class="chip chip-pc">PC</span>' : "") + (isMar ? '<span class="chip chip-mar">MAR</span>' : "");
  });

  const busBits = state.bus === null ? "00000000" : binary(state.bus, 8);
  busElement.querySelectorAll(".bus-line").forEach((line, i) => line.classList.toggle("on", busBits[i] === "1"));
  busElement.setAttribute("aria-label", state.bus === null ? "W-Bus idle" : `W-Bus carrying ${busBits}`);
  busValueElement.textContent = state.bus === null ? "\u2014" : `${formatHex(state.bus)} (${busBits})`;
  busSourceElement.textContent = state.busSource;

  document.querySelectorAll("[data-node]").forEach((node) => node.classList.toggle("is-active", state.active.includes(node.dataset.node)));

  const label = state.halted ? "Halted" : state.started ? "Running" : state.loaded ? "Loaded" : "Ready";
  cycleCountElement.textContent = state.cycles.toString().padStart(2, "0");
  machineStateElement.textContent = label;
  statusText.textContent = label === "Ready" ? "Simulator ready" : `Simulator ${label.toLowerCase()}`;
  statusDot.className = `status-dot${state.halted ? " is-halted" : state.started ? " is-running" : ""}`;

  const bits = binary(state.output, 8);
  ledDisplay.setAttribute("aria-label", `Eight output LEDs showing ${bits}`);
  outputBinaryElement.textContent = bits;
  outputDecimalElement.textContent = state.output;
  ledDisplay.querySelectorAll(".led-bit").forEach((el, i) => {
    el.querySelector(".led").classList.toggle("is-on", bits[i] === "1");
    const bit = el.querySelector(".bit");
    bit.textContent = bits[i];
    bit.classList.toggle("on", bits[i] === "1");
  });
}

/* ---------- Machine ---------- */
function resetCpu() {
  Object.assign(state, { pc: 0, mar: 0, ir: 0, accumulator: 0, bRegister: 0, output: 0, bus: null, busSource: "Idle", active: [], cycles: 0, started: false, halted: false });
}

function loadProgram() {
  try {
    const parsed = parseProgram(programInput.value);
    memory.fill(0);
    parsed.instructions.forEach((ins, address) => { memory[address] = (ins.opcode << 4) | ins.operand; });
    parsed.dataEntries.forEach(({ address, value }) => { memory[address] = value; });
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
  if (!state.loaded) { showMessage("Load a valid program before stepping or running.", true); return false; }
  if (state.halted) { showMessage("The processor is halted. Reset or load another program to continue."); return false; }
  if (state.pc >= state.codeLength || state.cycles >= memory.length) {
    state.halted = true; state.active = []; state.busSource = "Idle";
    updateDisplays();
    showMessage("Reached the end of the entered instructions.");
    return false;
  }

  // Fetch: MAR selects the instruction, IR receives it, then the 4-bit PC advances.
  state.mar = state.pc;
  state.ir = memory[state.mar];
  state.bus = state.ir;
  state.busSource = "Memory \u2192 IR (fetch)";
  state.active = ["pc", "mar", "memory", "ir"];
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
      state.busSource = "Memory \u2192 A";
      state.active = ["ir", "mar", "memory", "accumulator"];
      break;
    case OPCODES.ADD:
      state.mar = operand;
      state.bRegister = memory[state.mar];
      state.accumulator = (state.accumulator + state.bRegister) & 0xFF;
      state.bus = state.accumulator;
      state.busSource = "ALU \u2192 A (A + B)";
      state.active = ["ir", "mar", "memory", "b", "alu", "accumulator"];
      break;
    case OPCODES.SUB: {
      state.mar = operand;
      state.bRegister = memory[state.mar];
      const twosComplementB = ((~state.bRegister) + 1) & 0xFF; // A - B = A + two's complement of B
      state.accumulator = (state.accumulator + twosComplementB) & 0xFF;
      state.bus = state.accumulator;
      state.busSource = "ALU \u2192 A (A \u2212 B)";
      state.active = ["ir", "mar", "memory", "b", "alu", "accumulator"];
      break;
    }
    case OPCODES.OUT:
      state.output = state.accumulator;
      state.bus = state.output;
      state.busSource = "A \u2192 Output";
      state.active = ["accumulator", "output"];
      break;
    case OPCODES.HLT:
      state.halted = true;
      state.busSource = "Halted";
      state.active = ["control"];
      break;
    default:
      state.halted = true;
      state.active = [];
      updateDisplays();
      showMessage(`Invalid opcode ${binary(opcode, 4)} at ${formatHex(state.mar)}.`, true);
      return false;
  }

  updateDisplays();
  showMessage(state.halted ? `HLT executed after ${state.cycles} instruction(s).` : `${state.cycles}: ${NAMES[opcode]} executed.`);
  return true;
}

function runProgram() {
  if (!state.loaded) { showMessage("Load a valid program before stepping or running.", true); return; }
  let executed = 0;
  while (!state.halted && state.pc < state.codeLength && executed < memory.length) {
    if (!executeInstruction()) break;
    executed += 1;
  }
  if (!state.halted && state.pc >= state.codeLength) {
    state.halted = true; updateDisplays();
    showMessage("Reached the end of the entered instructions.");
  } else if (!state.halted && executed >= memory.length) {
    state.halted = true; updateDisplays();
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

$('[data-action="Load Program"]').addEventListener("click", loadProgram);
$('[data-action="Step"]').addEventListener("click", executeInstruction);
$('[data-action="Run"]').addEventListener("click", runProgram);
$('[data-action="Reset"]').addEventListener("click", resetMachine);

updateDisplays();
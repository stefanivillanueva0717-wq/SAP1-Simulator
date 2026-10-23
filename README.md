# SAP-1 Simulator

## Project Description

SAP-1 Simulator is a browser-based learning project that demonstrates a small set of basic computer architecture ideas. It is built with HTML, CSS, and JavaScript.

Enter a program and its data in the page, load it into the 16-address memory, then execute instructions one at a time or run the program until it halts.

## Features

- Six displayed registers: Program Counter (PC), Memory Address Register (MAR), Instruction Register (IR), Accumulator, B-Register, and Output Register.
- 16 memory locations, addressed from `0H` to `FH`, with one 8-bit value per address.
- A simplified SAP-1 block diagram and a W-Bus value display.
- Eight output LEDs that reflect the Output Register in binary.
- Load Program, Step, Run, and Reset controls.
- User-entered instructions and hexadecimal data values.
- Clear input errors for unknown instructions, invalid addresses or values, duplicate data addresses, and code/data overlap.
- Responsive dark-blue dashboard interface.

## Technologies Used

- HTML for the page structure.
- CSS for the dashboard styling and responsive layout.
- JavaScript for program parsing, RAM, registers, and instruction execution.

No frameworks or external libraries are required.

## How to Run the Project in VS Code

1. Open the project folder in VS Code.
2. Open `index.html`.
3. Use **File → Open in Browser** if that option is available, or open the project folder in File Explorer and double-click `index.html`.
4. Enter a program in the **Program & Data** text area.
5. Select **Load Program**, then use **Step** or **Run**.

The project uses local files and can be opened directly in a modern browser; a development server is not required.

## Supported Instructions

These instructions are implemented in `script.js`:

| Instruction | Opcode | Behavior |
|---|---|---|
| `LDA address` | `0000` | Loads the byte at the given memory address into the Accumulator. |
| `ADD address` | `0001` | Adds the byte at the given address to the Accumulator. |
| `SUB address` | `0010` | Subtracts the byte at the given address from the Accumulator using two's complement. |
| `OUT` | `1110` | Copies the Accumulator into the Output Register and updates the LEDs. |
| `HLT` | `1111` | Halts program execution. |

The address is the four-bit instruction operand. Each instruction is entered on its own line. Addresses and data are entered in hexadecimal; an optional `H` suffix or `0x` prefix is accepted. Blank lines and `;` or `#` comments are ignored.

Data entries use this format:

```text
address: byte
```

For example, `0E: 05` stores the byte `05H` at address `0EH`. Instructions are placed in memory starting at `0H` in the order entered. Data cannot be placed at an address already occupied by one of those instructions.

## Sample Programs and Expected Outputs

Enter each program, select **Load Program**, then select **Run**. Values are hexadecimal.

### Addition

```text
LDA 0E
ADD 0F
OUT
HLT

0E: 05
0F: 03
```

Expected result: Accumulator and Output Register show `08H`; the LEDs show `00001000`.

### Subtraction

```text
LDA 0E
SUB 0F
OUT
HLT

0E: 09
0F: 04
```

Expected result: Accumulator and Output Register show `05H`; the LEDs show `00000101`.

### Subtraction below zero

```text
LDA 0E
SUB 0F
OUT
HLT

0E: 03
0F: 05
```

Expected result: the 8-bit Accumulator and Output Register show `FEH` (`11111110`). The simulator stores the result modulo 256; it does not display a separate negative sign.

## Group Members

1. Member 1: ____________________
2. Member 2: ____________________
3. Member 3: ____________________
4. Member 4: ____________________
5. Member 5: ____________________

## Limitations

- Only `LDA`, `ADD`, `SUB`, `OUT`, and `HLT` are supported. There are no jump, store, or input instructions.
- **Step** executes one complete instruction, including fetch, decode, and execute; it does not expose individual internal clock phases.
- **Run** executes immediately, without animation or timed clock cycles.
- Arithmetic keeps the low eight bits of the result. There is no carry, overflow, or signed-number flag display.
- The 4-bit-addressed memory has 16 locations, and program instructions must be entered in sequence starting at `0H`. Data must use addresses that are not occupied by instructions.
- The W-Bus display shows the current bus value for an instruction; it is a simplified visualization, not a full signal-level hardware model.

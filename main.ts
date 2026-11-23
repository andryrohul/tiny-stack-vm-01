import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

const inDir = process.argv[2] || "/input";
const outDir = process.argv[3] || "/output";

// Immediate length per opcode, and which opcodes exist.
const immLen = new Uint8Array(256);
immLen[1] = 1; immLen[2] = 4;
immLen[48] = 2; immLen[49] = 2; immLen[50] = 2; immLen[51] = 2;
const valid = new Uint8Array(256);
for (const o of [0,1,2,3,4,5,6,7,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,48,49,50,51,52,64,65,80,81,82,83]) valid[o] = 1;

function run(prog: Uint8Array, inp: Uint8Array): { out: Uint8Array; exit: number } {
  const st = new Int32Array(256);
  const cs = new Int32Array(64);
  const mem = new Int32Array(256);
  const out = new Uint8Array(65536);
  let pc = 0, sp = 0, csp = 0, ip = 0, steps = 0, outLen = 0, exit = 0;
  for (;;) {
    if (steps >= 1000000) { exit = 10; break; }
    if (pc < 0 || pc >= prog.length) { exit = 9; break; }
    const op = prog[pc];
    if (!valid[op]) { exit = 5; break; }
    const n = immLen[op];
    if (pc + 1 + n > prog.length) { exit = 9; break; }
    steps++;
    let a = 0, b = 0;
    switch (op) {
      case 0: return { out: out.subarray(0, outLen), exit: 0 };
      case 1:
        if (sp >= 256) { exit = 3; break; }
        a = prog[pc + 1]; st[sp++] = a >= 128 ? a - 256 : a; pc += 2; continue;
      case 2:
        if (sp >= 256) { exit = 3; break; }
        st[sp++] = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24);
        pc += 5; continue;
      case 3: if (sp < 1) { exit = 2; break; } sp--; pc++; continue;
      case 4:
        if (sp < 1) { exit = 2; break; }
        if (sp >= 256) { exit = 3; break; }
        st[sp] = st[sp - 1]; sp++; pc++; continue;
      case 5:
        if (sp < 2) { exit = 2; break; }
        a = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = a; pc++; continue;
      case 6:
        if (sp < 2) { exit = 2; break; }
        if (sp >= 256) { exit = 3; break; }
        st[sp] = st[sp - 2]; sp++; pc++; continue;
      case 7:
        if (sp < 3) { exit = 2; break; }
        a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; pc++; continue;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30:
      case 32: case 33: case 34:
        if (sp < 2) { exit = 2; break; }
        b = st[--sp]; a = st[sp - 1];
        if (op === 16) st[sp - 1] = (a + b) | 0;
        else if (op === 17) st[sp - 1] = (a - b) | 0;
        else if (op === 18) st[sp - 1] = Math.imul(a, b);
        else if (op === 19) {
          if (b === 0) { exit = 4; break; }
          st[sp - 1] = (a === -2147483648 && b === -1) ? -2147483648 : (a / b) | 0;
        } else if (op === 20) {
          if (b === 0) { exit = 4; break; }
          st[sp - 1] = a % b;
        } else if (op === 21) {
          if (b === 0) { exit = 4; break; }
          st[sp - 1] = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 22) {
          if (b === 0) { exit = 4; break; }
          st[sp - 1] = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 24) st[sp - 1] = a & b;
        else if (op === 25) st[sp - 1] = a | b;
        else if (op === 26) st[sp - 1] = a ^ b;
        else if (op === 28) st[sp - 1] = (a << (b & 31)) | 0;
        else if (op === 29) st[sp - 1] = a >> (b & 31);
        else if (op === 30) st[sp - 1] = (a >>> (b & 31)) | 0;
        else if (op === 32) st[sp - 1] = a === b ? 1 : 0;
        else if (op === 33) st[sp - 1] = a < b ? 1 : 0;
        else st[sp - 1] = (a >>> 0) < (b >>> 0) ? 1 : 0;
        if (exit === 4) break;
        pc++; continue;
      case 23: case 27:
        if (sp < 1) { exit = 2; break; }
        st[sp - 1] = op === 23 ? (-st[sp - 1]) | 0 : ~st[sp - 1];
        pc++; continue;
      case 48: {
        const off = prog[pc + 1] | (prog[pc + 2] << 8);
        pc = pc + 3 + (off >= 32768 ? off - 65536 : off); continue;
      }
      case 49: case 50: {
        if (sp < 1) { exit = 2; break; }
        a = st[--sp];
        const off = prog[pc + 1] | (prog[pc + 2] << 8);
        const d = off >= 32768 ? off - 65536 : off;
        pc = ((op === 49 && a === 0) || (op === 50 && a !== 0)) ? pc + 3 + d : pc + 3;
        continue;
      }
      case 51:
        if (csp >= 64) { exit = 7; break; }
        cs[csp++] = pc + 3;
        pc = prog[pc + 1] | (prog[pc + 2] << 8); continue;
      case 52:
        if (csp === 0) { exit = 8; break; }
        pc = cs[--csp]; continue;
      case 64:
        if (sp < 1) { exit = 2; break; }
        a = st[sp - 1];
        if (a < 0 || a > 255) { exit = 6; break; }
        st[sp - 1] = mem[a]; pc++; continue;
      case 65:
        if (sp < 2) { exit = 2; break; }
        a = st[--sp]; b = st[--sp];
        if (a < 0 || a > 255) { exit = 6; break; }
        mem[a] = b; pc++; continue;
      case 80: {
        if (sp < 1) { exit = 2; break; }
        const s = String(st[--sp]);
        if (outLen + s.length > 65536) { exit = 11; break; }
        for (let i = 0; i < s.length; i++) out[outLen++] = s.charCodeAt(i);
        pc++; continue;
      }
      case 81:
        if (sp < 1) { exit = 2; break; }
        if (outLen + 1 > 65536) { exit = 11; break; }
        out[outLen++] = st[--sp] & 255; pc++; continue;
      case 82:
        if (sp >= 256) { exit = 3; break; }
        st[sp++] = ip < inp.length ? inp[ip++] : -1; pc++; continue;
      case 83:
        if (sp < 1) { exit = 2; break; }
        return { out: out.subarray(0, outLen), exit: st[--sp] & 255 };
    }
    break;
  }
  return { out: out.subarray(0, outLen), exit };
}

for (const id of readdirSync(inDir).sort()) {
  let prog: Buffer, inp: Buffer;
  try {
    prog = readFileSync(inDir + "/" + id + "/program.bin");
    inp = readFileSync(inDir + "/" + id + "/input.bin");
  } catch { continue; }
  const r = run(prog, inp);
  mkdirSync(outDir + "/" + id, { recursive: true });
  writeFileSync(outDir + "/" + id + "/stdout.bin", r.out);
  writeFileSync(outDir + "/" + id + "/exit.txt", String(r.exit) + "\n");
}

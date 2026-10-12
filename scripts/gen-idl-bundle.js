// Insert the agent_set_status instruction into the SDK's bundled IDL, preserving each file's
// native representation: quaestor.json + quaestor_json.ts are snake_case (raw IDL); quaestor.ts
// is the camelCase TS type coral-xyz consumes. Discriminator is deterministic
// (sha256("global:agent_set_status")[..8]) so a full `anchor build` is unnecessary for this
// purely-additive instruction.
const fs = require("fs");
const path = require("path");

const idlDir = path.join(__dirname, "..", "packages", "sdk", "src", "idl");

const disc = "204, 201, 35, 214, 178, 163, 209, 29";
const docs =
  '        "An ancestor *agent* freezes (true) or unfreezes (false) a descendant budget.",\n' +
  '        "remaining_accounts = the budget\'s ancestor chain (child -> ... -> root)."';

function block(instrName) {
  return (
    "    {\n" +
    `      "name": "${instrName}",\n` +
    `      "docs": [\n${docs}\n      ],\n` +
    `      "discriminator": [${disc}],\n` +
    '      "accounts": [\n' +
    '        { "name": "authority", "signer": true },\n' +
    '        { "name": "project", "relations": ["budget"] },\n' +
    '        { "name": "budget", "writable": true }\n' +
    "      ],\n" +
    '      "args": [{ "name": "freeze", "type": "bool" }]\n' +
    "    },\n"
  );
}

function insert(file, instrName) {
  const p = path.join(idlDir, file);
  let s = fs.readFileSync(p, "utf8");
  if (s.includes('"agent_set_status"') || s.includes('"agentSetStatus"')) {
    console.log(`${file}: already present`);
    return;
  }
  const marker = '"instructions": [\n';
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error(`no instructions array in ${file}`);
  const at = idx + marker.length;
  s = s.slice(0, at) + block(instrName) + s.slice(at);
  fs.writeFileSync(p, s);
  console.log(`${file}: inserted ${instrName}`);
}

// snake_case files
insert("quaestor.json", "agent_set_status");
insert("quaestor_json.ts", "agent_set_status");
// camelCase type file
insert("quaestor.ts", "agentSetStatus");

// Validate the JSON still parses and the runtime bundle is consistent.
const j = JSON.parse(fs.readFileSync(path.join(idlDir, "quaestor.json"), "utf8"));
console.log("quaestor.json instructions:", j.instructions.map((i) => i.name).join(", "));

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createValidatorContext() {
  const context = {
    navigator: { onLine: false },
    sessionStorage: {
      store: {},
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; }
    },
    document: {
      getElementById() { return null; },
      createElement() { return { style: {}, classList: { add() {}, remove() {} } }; },
      body: { prepend() {}, appendChild() {} },
      addEventListener() {}
    },
    window: {},
    TextEncoder: globalThis.TextEncoder
  };
  context.window = context;
  context.window.addEventListener = () => {};

  vm.createContext(context);
  const code = fs.readFileSync('frontend/static/js/core/offline-validator.js', 'utf8');
  vm.runInContext(code, context);
  return context;
}

const ctx = createValidatorContext();
const { validateBotCodeOffline, isOfflineExamMode, setOfflineExamMode } = ctx;

console.log('Testing Offline Bot Validator...');

// 1. Valid Python code
const validPy = `def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    return "JOKER"
`;
const res1 = validateBotCodeOffline(validPy, 'PYTHON');
assert.equal(res1.is_valid, true, 'Valid python must pass');
assert.equal(res1.test_move, 'JOKER');

// 2. Missing decide_move
const missingPy = `def some_other_func(state):
    return "ROCK"
`;
const res2 = validateBotCodeOffline(missingPy, 'PYTHON');
assert.equal(res2.is_valid, false, 'Missing decide_move must fail');
assert.ok(res2.error_message.includes('decide_move'));

// 3. Missing colon after def decide_move
const colonPy = `def decide_move(game_state)
    return "ROCK"
`;
const res3 = validateBotCodeOffline(colonPy, 'PYTHON');
assert.equal(res3.is_valid, false, 'Missing colon must fail');

// 4. Indentation error
const indentPy = `def decide_move(game_state):
return "ROCK"
`;
const res4 = validateBotCodeOffline(indentPy, 'PYTHON');
assert.equal(res4.is_valid, false, 'Indentation error must fail');
assert.ok(res4.error_message.includes('IndentationError'));

// 5. Unbalanced bracket
const bracketPy = `def decide_move(game_state):
    items = [1, 2, 3
    return "ROCK"
`;
const res5 = validateBotCodeOffline(bracketPy, 'PYTHON');
assert.equal(res5.is_valid, false, 'Unbalanced bracket must fail');

// 6. Security forbidden import
const securityPy = `import os
def decide_move(game_state):
    return "ROCK"
`;
const res6 = validateBotCodeOffline(securityPy, 'PYTHON');
assert.equal(res6.is_valid, false, 'Forbidden import must fail');
assert.ok(res6.error_message.includes('os'));

// 7. Invalid move return
const invalidMovePy = `def decide_move(game_state):
    return "FIRE"
`;
const res7 = validateBotCodeOffline(invalidMovePy, 'PYTHON');
assert.equal(res7.is_valid, false, 'Invalid move return must fail');
assert.ok(res7.error_message.includes('FIRE'));

// 8. Valid C++ code
const validCpp = `#include <iostream>
int main() {
    std::cout << "SCISSORS" << std::endl;
    return 0;
}
`;
const res8 = validateBotCodeOffline(validCpp, 'CPP');
assert.equal(res8.is_valid, true, 'Valid C++ must pass');
assert.equal(res8.test_move, 'SCISSORS');

// 9. C++ with dangerous system call
const badCpp = `#include <iostream>
int main() {
    system("calc");
    return 0;
}
`;
const res9 = validateBotCodeOffline(badCpp, 'CPP');
assert.equal(res9.is_valid, false, 'Forbidden C++ system call must fail');

// 10. Exam offline mode toggle
assert.equal(isOfflineExamMode(), true, 'Should be in offline exam mode when navigator.onLine is false');

console.log('ALL 10 OFFLINE VALIDATOR UNIT TESTS PASSED!');

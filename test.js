#!/usr/bin/env node

/**
 * Test script for claude-reporter-setup
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Test 1: Check package.json
test('package.json exists', () => {
  const pkg = require('./package.json');
  if (!pkg.name) throw new Error('Missing name');
  if (!pkg.version) throw new Error('Missing version');
  if (!pkg.bin) throw new Error('Missing bin');
});

// Test 2: Check bin script
test('bin/setup.js exists', () => {
  const binPath = path.join(__dirname, 'bin', 'setup.js');
  if (!fs.existsSync(binPath)) {
    throw new Error('bin/setup.js not found');
  }
});

// Test 3: Check dependencies
test('Dependencies declared', () => {
  const pkg = require('./package.json');
  const deps = pkg.dependencies || {};
  const required = ['chalk', 'inquirer', 'ora'];
  
  required.forEach(dep => {
    if (!deps[dep]) {
      throw new Error(`Missing dependency: ${dep}`);
    }
  });
});

// Test 4: Check README
test('README.md exists', () => {
  const readme = path.join(__dirname, 'README.md');
  if (!fs.existsSync(readme)) {
    throw new Error('README.md not found');
  }
  
  const content = fs.readFileSync(readme, 'utf-8');
  if (content.length < 100) {
    throw new Error('README too short');
  }
});

// Test 5: Check LICENSE
test('LICENSE exists', () => {
  const license = path.join(__dirname, 'LICENSE');
  if (!fs.existsSync(license)) {
    throw new Error('LICENSE not found');
  }
});

// Summary
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

console.log('✅ All tests passed!\n');

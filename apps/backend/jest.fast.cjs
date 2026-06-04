const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  reporters: ['default'],
  coverageThreshold: undefined,
  collectCoverage: false,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json', isolatedModules: true, diagnostics: false }],
  },
};

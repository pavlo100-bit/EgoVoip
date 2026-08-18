module.exports = {
  preset: 'react-native',
  // server/ has its own test runner (node:test via `npm test` in server/) —
  // it isn't a Jest suite and was never meant to be picked up here.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/server/'],
};
